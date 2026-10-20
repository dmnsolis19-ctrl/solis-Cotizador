import { env } from "cloudflare:workers";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings, billingDocuments, clients, quotes, syncReceipts, workOrders } from "@/db/schema";
import { authorizationResponse, requirePermission, sha256 } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit";
import { accountingCsv, accountingText, invoiceRecipientSchema, type AccountingPacket } from "@/lib/accounting";
import { companyFormValues } from "@/lib/company-settings";
import { emailConfigured, sendApplicationEmail } from "@/lib/email-service";
import { buildAccountingRequestPdf } from "@/lib/pdf-documents";
import { reserveDocumentSequence } from "@/lib/sequences";
import { businessYear } from "@/lib/dates";
import { isValidChileRut, normalizeChileRut } from "@/lib/clients";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("prepare"), publicId: z.string().uuid(), billingDocumentPublicId: z.string().uuid(), recipient: invoiceRecipientSchema, accountantEmail: z.string().email().max(254), notes: z.string().trim().max(2000).default("") }),
  z.object({ action: z.literal("send"), publicId: z.string().uuid() }),
  z.object({ action: z.literal("record"), publicId: z.string().uuid(), folio: z.string().regex(/^[1-9]\d{0,9}$/), issueDate: z.string().date() }),
  z.object({ action: z.literal("cancel"), publicId: z.string().uuid(), reason: z.string().trim().min(5).max(500) }),
]);
const accountingScope = (owner: string) => and(eq(syncReceipts.ownerEmail, owner), eq(syncReceipts.operationType, "accounting.request"));

export async function GET(request: Request) {
  try {
    const session = await requirePermission("billing.read");
    const id = z.string().uuid().parse(new URL(request.url).searchParams.get("billingDocumentPublicId"));
    const db = getDb();
    const [billing] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.publicId, id))).limit(1);
    if (!billing) return Response.json({ error: "El cobro no existe." }, { status: 404 });
    const [[settings], [quote], receipts] = await Promise.all([
      db.select().from(appSettings).where(eq(appSettings.ownerEmail, session.ownerEmail)).limit(1),
      db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, billing.quotePublicId))).limit(1),
      db.select().from(syncReceipts).where(and(accountingScope(session.ownerEmail), sql`json_extract(${syncReceipts.resultJson}, '$.billingDocumentPublicId') = ${id}`)).orderBy(desc(syncReceipts.createdAt)).limit(30),
    ]);
    const [client] = quote?.clientPublicId ? await db.select().from(clients).where(and(eq(clients.ownerEmail, session.ownerEmail), eq(clients.publicId, quote.clientPublicId))).limit(1) : [];
    const company = companyFormValues(JSON.parse(settings?.companyJson || "{}"));
    const extra = JSON.parse(client?.payloadJson || "{}");
    return Response.json({ history: receipts.map((receipt) => JSON.parse(receipt.resultJson) as AccountingPacket), configured: emailConfigured(), accountantEmail: company.accountant_email,
      recipient: { name: client?.name || billing.clientName, taxId: client?.taxId || "", businessActivity: extra.businessActivity || "", address: client?.address || "", commune: extra.commune || "", city: extra.city || "", email: client?.email || "" }, canManage: session.permissions.includes("billing.manage") }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: "No fue posible cargar el expediente contable." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("billing.manage");
    const input = schema.parse(await request.json());
    const db = getDb(); const now = new Date().toISOString();
    const actor = session.user.name || session.user.email;
    if (input.action === "prepare") {
      const [billing] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.publicId, input.billingDocumentPublicId))).limit(1);
      if (!billing) return Response.json({ error: "El cobro no existe." }, { status: 404 });
      if (["Borrador", "Anulada"].includes(billing.status)) return Response.json({ error: "Emita el cobro antes de solicitar una factura." }, { status: 409 });
      if (billing.currency !== "CLP" || ![0, 19].includes(Number(billing.taxPercent))) return Response.json({ error: "Este expediente admite cobros en CLP con IVA 19% o exentos. Revise otros casos con su contador." }, { status: 409 });
      const [[settings], [quote], [order]] = await Promise.all([
        db.select().from(appSettings).where(eq(appSettings.ownerEmail, session.ownerEmail)).limit(1),
        db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, billing.quotePublicId))).limit(1),
        db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, billing.workOrderPublicId))).limit(1),
      ]);
      if (!quote || !order) return Response.json({ error: "Falta la cotización u orden de origen." }, { status: 409 });
      const company = companyFormValues(JSON.parse(settings?.companyJson || "{}"));
      if (!company.tax_id || !isValidChileRut(company.tax_id)) return Response.json({ error: "Configure un RUT válido de su empresa antes de preparar la solicitud." }, { status: 409 });
      const payloadHash = await sha256(JSON.stringify(input));
      const [replay] = await db.select().from(syncReceipts).where(eq(syncReceipts.operationId, input.publicId)).limit(1);
      if (replay) {
        if (replay.ownerEmail !== session.ownerEmail || replay.operationType !== "accounting.request" || replay.payloadHash !== payloadHash) return Response.json({ error: "El identificador ya se utilizó con otros datos." }, { status: 409 });
        return Response.json({ packet: JSON.parse(replay.resultJson), replayed: true });
      }
      const sequence = await reserveDocumentSequence(session.ownerEmail, `accounting:${businessYear()}`);
      const net = Number(billing.netAmount); const tax = Number(billing.taxAmount); const total = Number(billing.totalAmount);
      const packet: AccountingPacket = {
        publicId: input.publicId, number: `FAC-${businessYear()}-${String(sequence).padStart(5, "0")}`, billingDocumentPublicId: billing.publicId, billingNumber: billing.number,
        workOrderNumber: order.number, quoteNumber: quote.number, project: billing.project, concept: billing.concept, preparedAt: now, preparedBy: actor,
        accountantEmail: input.accountantEmail, issuer: { name: company.commercial_name, taxId: normalizeChileRut(company.tax_id), address: company.address, businessActivity: company.business_activity, email: company.email, phone: company.phone }, recipient: input.recipient,
        documentType: Number(billing.taxPercent) === 0 ? 34 : 33, currency: "CLP", netAmount: net, taxAmount: tax, totalAmount: total, taxPercent: Number(billing.taxPercent),
        lines: [{ description: `${billing.concept} · ${billing.project} · Ref. ${quote.number} / ${order.number}`, quantity: 1, unit: "gl", unitPrice: net, netTotal: net }], notes: input.notes, status: "prepared",
      };
      // One active request per collection document, including concurrent tabs.
      const saved = await env.DB.prepare(`INSERT INTO sync_receipts (operation_id, owner_email, operation_type, payload_hash, result_json, created_at)
        SELECT ?, ?, 'accounting.request', ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM sync_receipts WHERE owner_email = ? AND operation_type = 'accounting.request' AND json_extract(result_json, '$.billingDocumentPublicId') = ? AND json_extract(result_json, '$.status') <> 'cancelled') ON CONFLICT(operation_id) DO NOTHING`)
        .bind(input.publicId, session.ownerEmail, payloadHash, JSON.stringify(packet), now, session.ownerEmail, billing.publicId).run();
      if (Number(saved.meta.changes || 0) !== 1) return Response.json({ error: "Este cobro ya tiene una solicitud activa. Actualice para revisarla." }, { status: 409 });
      await writeAuditEvent(session, { action: "ACCOUNTING_REQUEST_PREPARED", entityType: "accounting_request", entityPublicId: packet.publicId, detail: { number: packet.number, billingDocumentPublicId: billing.publicId, total } });
      return Response.json({ packet }, { status: 201 });
    }
    const [receipt] = await db.select().from(syncReceipts).where(and(accountingScope(session.ownerEmail), eq(syncReceipts.operationId, input.publicId))).limit(1);
    if (!receipt) return Response.json({ error: "La solicitud no existe." }, { status: 404 });
    const packet = JSON.parse(receipt.resultJson) as AccountingPacket;
    const [billing] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.publicId, packet.billingDocumentPublicId))).limit(1);
    if (!billing || billing.status === "Anulada" || packet.status === "cancelled") return Response.json({ error: "La solicitud o su cobro están anulados." }, { status: 409 });
    const update = async (next: AccountingPacket) => {
      const rows = await db.update(syncReceipts).set({ resultJson: JSON.stringify(next) }).where(and(accountingScope(session.ownerEmail), eq(syncReceipts.operationId, packet.publicId), eq(syncReceipts.resultJson, receipt.resultJson), next.invoice ? sql`NOT EXISTS (SELECT 1 FROM sync_receipts AS other WHERE other.owner_email = ${session.ownerEmail} AND other.operation_type = 'accounting.request' AND other.operation_id <> ${packet.publicId} AND json_extract(other.result_json, '$.documentType') = ${packet.documentType} AND json_extract(other.result_json, '$.issuer.taxId') = ${packet.issuer.taxId} AND json_extract(other.result_json, '$.invoice.folio') = ${next.invoice.folio})` : undefined)).returning();
      if (!rows.length) throw new Error("La solicitud cambió en otro dispositivo. Actualice antes de continuar.");
      return next;
    };
    if (input.action === "send") {
      if (packet.status === "email_accepted") return Response.json({ packet, replayed: true });
      if (packet.status !== "prepared") return Response.json({ error: "Este intento no admite reenvío automático. Revise el historial del servicio." }, { status: 409 });
      if (!emailConfigured()) return Response.json({ error: "El correo de la plataforma aún no está configurado. Puede descargar el expediente y abrir su correo." }, { status: 503 });
      const sending = await update({ ...packet, status: "email_sending" });
      let sent: { messageId: string };
      try {
        sent = await sendApplicationEmail({ to: packet.accountantEmail, subject: `Solicitar factura · ${packet.number} · ${packet.recipient.name}`, text: accountingText(packet), attachments: [
          { filename: `${packet.number}.pdf`, content: new Uint8Array(buildAccountingRequestPdf(packet)).buffer, type: "application/pdf", disposition: "attachment" },
          { filename: `${packet.number}.json`, content: new TextEncoder().encode(JSON.stringify(packet, null, 2)).buffer, type: "application/json", disposition: "attachment" },
          { filename: `${packet.number}.csv`, content: new TextEncoder().encode(accountingCsv(packet)).buffer, type: "text/csv", disposition: "attachment" },
        ] }, `accounting-${packet.publicId}`);
      } catch {
        await db.update(syncReceipts).set({ resultJson: JSON.stringify({ ...sending, status: "email_uncertain" }) }).where(and(accountingScope(session.ownerEmail), eq(syncReceipts.operationId, packet.publicId)));
        return Response.json({ error: "No se pudo confirmar el envío. Revise el servicio de correo antes de enviar por otro medio." }, { status: 502 });
      }
      const accepted: AccountingPacket = { ...sending, status: "email_accepted", emailMessageId: sent.messageId, emailAcceptedAt: now };
      await db.update(syncReceipts).set({ resultJson: JSON.stringify(accepted) }).where(and(accountingScope(session.ownerEmail), eq(syncReceipts.operationId, packet.publicId)));
      await writeAuditEvent(session, { action: "ACCOUNTING_EMAIL_ACCEPTED", entityType: "accounting_request", entityPublicId: packet.publicId, detail: { to: packet.accountantEmail, messageId: sent.messageId } });
      return Response.json({ packet: accepted });
    }
    if (input.action === "cancel") {
      if (packet.status !== "prepared") return Response.json({ error: "Solo puede anular una solicitud que aún no se ha enviado." }, { status: 409 });
      const cancelled = await update({ ...packet, status: "cancelled", cancelledReason: input.reason });
      await writeAuditEvent(session, { action: "ACCOUNTING_REQUEST_CANCELLED", entityType: "accounting_request", entityPublicId: packet.publicId, detail: { reason: input.reason } });
      return Response.json({ packet: cancelled });
    }
    if (packet.status === "email_sending") return Response.json({ error: "Espere a que termine el envío antes de registrar el folio." }, { status: 409 });
    if (packet.status === "invoice_recorded") return Response.json({ error: "El folio ya se registró. Revise el expediente antes de modificarlo." }, { status: 409 });
    const duplicate = await db.select({ id: syncReceipts.operationId }).from(syncReceipts).where(and(accountingScope(session.ownerEmail), sql`json_extract(${syncReceipts.resultJson}, '$.invoice.folio') = ${input.folio}`, sql`json_extract(${syncReceipts.resultJson}, '$.documentType') = ${packet.documentType}`, sql`json_extract(${syncReceipts.resultJson}, '$.issuer.taxId') = ${packet.issuer.taxId}`)).limit(1);
    if (duplicate.length) return Response.json({ error: "Ese folio y tipo de documento ya están registrados en otra solicitud." }, { status: 409 });
    const recorded = await update({ ...packet, status: "invoice_recorded", invoice: { folio: input.folio, issueDate: input.issueDate, recordedAt: now, recordedBy: actor } });
    await writeAuditEvent(session, { action: "ACCOUNTING_FOLIO_RECORDED", entityType: "accounting_request", entityPublicId: packet.publicId, detail: { folio: input.folio, issueDate: input.issueDate, documentType: packet.documentType } });
    return Response.json({ packet: recorded });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? error.issues[0]?.message || "Revise los datos de facturación." : error instanceof Error ? error.message : "No fue posible completar la solicitud." }, { status: 400 });
  }
}
