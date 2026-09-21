import { env } from "cloudflare:workers";
import { and, count, desc, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { billingDocuments, billingPayments, quotes, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { BILLING_CONCEPTS, billingAmounts, collectionStatus, collectionSummary, PAYMENT_METHODS } from "@/lib/billing";
import { documentScope, reserveDocumentSequence } from "@/lib/sequences";
import { businessDate, businessYear } from "@/lib/dates";

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), workOrderPublicId: z.string().min(8), concept: z.enum(BILLING_CONCEPTS), issueDate: z.string().length(10), dueDate: z.string().length(10), netAmount: z.number().positive().max(1_000_000_000_000), taxPercent: z.number().min(0).max(100).default(19), notes: z.string().trim().max(1000).default("") }),
  z.object({ action: z.literal("issue"), publicId: z.string().uuid() }),
  z.object({ action: z.literal("payment"), publicId: z.string().uuid(), paymentDate: z.string().length(10), amount: z.number().positive().max(1_000_000_000_000), method: z.enum(PAYMENT_METHODS), reference: z.string().trim().min(2).max(160), notes: z.string().trim().max(800).default("") }),
  z.object({ action: z.literal("void"), publicId: z.string().uuid(), reason: z.string().trim().min(5).max(800) }),
]);

const n = (value: unknown) => Number(value || 0);

async function normalizedDocuments(ownerEmail: string) {
  const db = getDb();
  const [documents, payments] = await Promise.all([
    db.select().from(billingDocuments).where(eq(billingDocuments.ownerEmail, ownerEmail)).orderBy(desc(billingDocuments.issueDate), desc(billingDocuments.createdAt)).limit(500),
    db.select().from(billingPayments).where(eq(billingPayments.ownerEmail, ownerEmail)).orderBy(desc(billingPayments.paymentDate), desc(billingPayments.createdAt)).limit(2000),
  ]);
  return documents.map((document) => {
    const documentPayments = payments.filter((payment) => payment.billingDocumentPublicId === document.publicId).map((payment) => ({ ...payment, amount: n(payment.amount) }));
    const paidAmount = documentPayments.reduce((sum, payment) => sum + payment.amount, 0);
    const totalAmount = n(document.totalAmount);
    const status = collectionStatus({ status: document.status, totalAmount, paidAmount, dueDate: document.dueDate });
    return { ...document, netAmount: n(document.netAmount), taxPercent: n(document.taxPercent), taxAmount: n(document.taxAmount), totalAmount, paidAmount, balance: Math.max(0, totalAmount - paidAmount), status, payments: documentPayments };
  });
}

export async function GET() {
  try {
    const session = await requirePermission("billing.read");
    const [documents, orders] = await Promise.all([
      normalizedDocuments(session.ownerEmail),
      getDb().select({ publicId: workOrders.publicId, number: workOrders.number, quotePublicId: workOrders.quotePublicId, clientName: workOrders.clientName, project: workOrders.project, currency: workOrders.currency, approvedSale: workOrders.approvedSale, status: workOrders.status }).from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), ne(workOrders.status, "Cancelada"))).orderBy(desc(workOrders.updatedAt)).limit(300),
    ]);
    const orderOptions = orders.map((order) => {
      const committedNet = documents.filter((document) => document.workOrderPublicId === order.publicId && document.status !== "Anulada").reduce((sum, document) => sum + document.netAmount, 0);
      return { ...order, approvedSale: n(order.approvedSale), committedNet, availableNet: Math.max(0, n(order.approvedSale) - committedNet) };
    });
    const summaryByCurrency = Object.fromEntries([...new Set(documents.map((document) => document.currency))].map((currency) => [currency, collectionSummary(documents.filter((document) => document.currency === currency))]));
    return Response.json({ documents, orders: orderOptions, summaryByCurrency, canManage: session.permissions.includes("billing.manage"), canRecordPayments: session.permissions.includes("billing.payments"), canDocument: session.permissions.includes("documents.collection"), notice: "Los documentos de cobro de SOLIS son internos y no reemplazan una factura electrónica DTE autorizada por el SII." });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la cobranza." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const input = actionSchema.parse(raw);
    const session = await requirePermission(input.action === "payment" ? "billing.payments" : "billing.manage");
    const db = getDb();
    const actor = session.user.name || session.user.email;
    const now = new Date().toISOString();

    if (input.action === "create") {
      const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, input.workOrderPublicId))).limit(1);
      if (!order) return Response.json({ error: "La orden de trabajo no existe." }, { status: 404 });
      if (input.dueDate < input.issueDate) return Response.json({ error: "El vencimiento no puede ser anterior a la emisión." }, { status: 409 });
      const existing = await db.select({ netAmount: billingDocuments.netAmount }).from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.workOrderPublicId, order.publicId), ne(billingDocuments.status, "Anulada")));
      const committedNet = existing.reduce((sum, document) => sum + n(document.netAmount), 0);
      if (committedNet + input.netAmount > n(order.approvedSale) + 0.005) return Response.json({ error: `El monto supera el saldo comercial disponible de ${Math.max(0, n(order.approvedSale) - committedNet).toFixed(2)} ${order.currency}.` }, { status: 409 });
      const [quote] = await db.select({ publicId: quotes.publicId }).from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, order.quotePublicId))).limit(1);
      if (!quote) return Response.json({ error: "No se encontró la cotización aprobada vinculada." }, { status: 409 });
      const [{ value }] = await db.select({ value: count() }).from(billingDocuments).where(eq(billingDocuments.ownerEmail, session.ownerEmail));
      const sequence = await reserveDocumentSequence(session.ownerEmail, documentScope("billing"), Number(value));
      const number = `COB-${businessYear()}-${String(sequence).padStart(5, "0")}`;
      const publicId = crypto.randomUUID();
      const amounts = billingAmounts(input.netAmount, input.taxPercent);
      const created = await env.DB.prepare(`
        INSERT INTO billing_documents (
          public_id, owner_email, number, work_order_public_id, quote_public_id,
          client_name, project, concept, status, currency, issue_date, due_date,
          net_amount, tax_percent, tax_amount, total_amount, notes, created_by,
          created_at, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM work_orders AS selected_order
          WHERE selected_order.owner_email = ? AND selected_order.public_id = ?
            AND ? <= CAST(selected_order.approved_sale AS REAL) - COALESCE((
              SELECT SUM(CAST(existing.net_amount AS REAL))
              FROM billing_documents AS existing
              WHERE existing.owner_email = ?
                AND existing.work_order_public_id = ?
                AND existing.status <> 'Anulada'
            ), 0) + 0.005
        )
      `).bind(
        publicId, session.ownerEmail, number, order.publicId, quote.publicId,
        order.clientName, order.project, input.concept, "Borrador", order.currency,
        input.issueDate, input.dueDate, String(amounts.netAmount), String(input.taxPercent),
        String(amounts.taxAmount), String(amounts.totalAmount), input.notes, actor, now, now,
        session.ownerEmail, order.publicId, input.netAmount, session.ownerEmail, order.publicId,
      ).run();
      if (Number(created.meta.changes || 0) !== 1) {
        return Response.json({ error: "El saldo comercial cambió en otro dispositivo. Actualice la cobranza antes de crear el documento." }, { status: 409 });
      }
      await writeAuditEvent(session, { action: "COLLECTION_DOCUMENT_CREATED", entityType: "billing_document", entityPublicId: publicId, detail: { number, workOrderPublicId: order.publicId, concept: input.concept, ...amounts } });
      return Response.json({ ok: true, publicId, number }, { status: 201 });
    }

    const [document] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.publicId, input.publicId))).limit(1);
    if (!document) return Response.json({ error: "El documento de cobro no existe." }, { status: 404 });
    const payments = await db.select().from(billingPayments).where(and(eq(billingPayments.ownerEmail, session.ownerEmail), eq(billingPayments.billingDocumentPublicId, document.publicId)));
    const paidAmount = payments.reduce((sum, payment) => sum + n(payment.amount), 0);

    if (input.action === "issue") {
      if (document.status !== "Borrador") return Response.json({ error: "Solo puede emitir un documento en borrador." }, { status: 409 });
      const issued = await env.DB.prepare(`
        UPDATE billing_documents SET status = 'Emitida', issued_at = ?, updated_at = ?
        WHERE owner_email = ? AND public_id = ? AND status = 'Borrador'
      `).bind(now, now, session.ownerEmail, document.publicId).run();
      if (Number(issued.meta.changes || 0) !== 1) return Response.json({ error: "El documento cambió en otro dispositivo. Actualice la cobranza." }, { status: 409 });
      await writeAuditEvent(session, { action: "COLLECTION_DOCUMENT_ISSUED", entityType: "billing_document", entityPublicId: document.publicId, detail: { number: document.number, totalAmount: document.totalAmount } });
      return Response.json({ ok: true });
    }
    if (input.action === "void") {
      if (document.status === "Anulada") return Response.json({ error: "El documento ya está anulado." }, { status: 409 });
      if (paidAmount > 0) return Response.json({ error: "No puede anular un documento con pagos. Registre primero la devolución o conciliación fuera de esta etapa." }, { status: 409 });
      const voided = await env.DB.prepare(`
        UPDATE billing_documents SET
          status = 'Anulada', voided_at = ?, voided_by = ?, void_reason = ?, updated_at = ?
        WHERE owner_email = ? AND public_id = ? AND status <> 'Anulada'
          AND NOT EXISTS (
            SELECT 1 FROM billing_payments
            WHERE owner_email = ? AND billing_document_public_id = ?
          )
      `).bind(now, actor, input.reason, now, session.ownerEmail, document.publicId, session.ownerEmail, document.publicId).run();
      if (Number(voided.meta.changes || 0) !== 1) return Response.json({ error: "El documento cambió o ya recibió un pago. Actualice la cobranza." }, { status: 409 });
      await writeAuditEvent(session, { action: "COLLECTION_DOCUMENT_VOIDED", entityType: "billing_document", entityPublicId: document.publicId, detail: { number: document.number, reason: input.reason } });
      return Response.json({ ok: true });
    }
    if (["Borrador", "Anulada"].includes(document.status)) return Response.json({ error: "Emita el documento antes de registrar pagos." }, { status: 409 });
    const balance = n(document.totalAmount) - paidAmount;
    if (input.amount > balance + 0.005) return Response.json({ error: `El pago supera el saldo pendiente de ${Math.max(0, balance).toFixed(2)} ${document.currency}.` }, { status: 409 });
    const publicId = crypto.randomUUID();
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO billing_payments (
          public_id, owner_email, billing_document_public_id, payment_date, amount,
          method, reference, notes, recorded_by, created_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM billing_documents AS selected_document
          WHERE selected_document.owner_email = ? AND selected_document.public_id = ?
            AND selected_document.status NOT IN ('Borrador', 'Anulada')
            AND ? + COALESCE((
              SELECT SUM(CAST(existing.amount AS REAL))
              FROM billing_payments AS existing
              WHERE existing.owner_email = ?
                AND existing.billing_document_public_id = ?
            ), 0) <= CAST(selected_document.total_amount AS REAL) + 0.005
        )
      `).bind(
        publicId, session.ownerEmail, document.publicId, input.paymentDate, String(input.amount),
        input.method, input.reference, input.notes, actor, now,
        session.ownerEmail, document.publicId, input.amount, session.ownerEmail, document.publicId,
      ),
      env.DB.prepare(`
        UPDATE billing_documents SET
          status = CASE
            WHEN COALESCE((
              SELECT SUM(CAST(payment.amount AS REAL)) FROM billing_payments AS payment
              WHERE payment.owner_email = ? AND payment.billing_document_public_id = ?
            ), 0) >= CAST(total_amount AS REAL) - 0.005 THEN 'Pagada'
            WHEN due_date <> '' AND due_date < ? THEN 'Vencida'
            ELSE 'Parcial'
          END,
          updated_at = ?
        WHERE owner_email = ? AND public_id = ?
          AND EXISTS (SELECT 1 FROM billing_payments WHERE public_id = ? AND owner_email = ?)
      `).bind(
        session.ownerEmail, document.publicId, businessDate(), now,
        session.ownerEmail, document.publicId, publicId, session.ownerEmail,
      ),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return Response.json({ error: "El saldo cambió en otro dispositivo o el pago supera el monto pendiente. Actualice la cobranza." }, { status: 409 });
    }
    const [freshDocument] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, session.ownerEmail), eq(billingDocuments.publicId, document.publicId))).limit(1);
    const freshPayments = await db.select({ amount: billingPayments.amount }).from(billingPayments).where(and(eq(billingPayments.ownerEmail, session.ownerEmail), eq(billingPayments.billingDocumentPublicId, document.publicId)));
    const nextPaid = freshPayments.reduce((sum, payment) => sum + n(payment.amount), 0);
    const status = freshDocument?.status || "Parcial";
    await writeAuditEvent(session, { action: "PAYMENT_RECORDED", entityType: "billing_payment", entityPublicId: publicId, detail: { billingDocumentPublicId: document.publicId, number: document.number, amount: input.amount, method: input.method, reference: input.reference, balance: Math.max(0, n(document.totalAmount) - nextPaid) } });
    return Response.json({ ok: true, publicId, status });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise fechas, montos, concepto, método y referencia." : error instanceof Error ? error.message : "No fue posible actualizar la cobranza.";
    return Response.json({ error: message }, { status: 400 });
  }
}
