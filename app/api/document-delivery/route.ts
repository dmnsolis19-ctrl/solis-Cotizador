import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients, documentSnapshots, quoteEvents, quotes, syncReceipts } from "@/db/schema";
import { authorizationResponse, requirePermission, sha256 } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit";

type EmailEnvironment = { EMAIL?: { send(message: { from: string; to: string; subject: string; text: string; attachments: { filename: string; content: ArrayBuffer; type: string; disposition: "attachment" }[] }): Promise<{ messageId: string }> }; EMAIL_FROM?: string };
const emailEnvironment = () => env as unknown as EmailEnvironment;
const schema = z.object({
  documentId: z.string().uuid(),
  deliveryId: z.string().uuid(),
  to: z.string().trim().email().max(254),
  subject: z.string().trim().min(2).max(200).refine((value) => !/[\r\n]/.test(value)),
  body: z.string().trim().min(2).max(5000),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("documents.quote");
    const documentId = z.string().uuid().parse(new URL(request.url).searchParams.get("documentId"));
    const db = getDb();
    const [document] = await db.select().from(documentSnapshots).where(and(eq(documentSnapshots.ownerEmail, session.ownerEmail), eq(documentSnapshots.publicId, documentId), eq(documentSnapshots.entityType, "quote"), eq(documentSnapshots.securityProfile, "commercial_v2"))).limit(1);
    if (!document) return Response.json({ error: "Seleccione un PDF comercial vigente." }, { status: 404 });
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, document.entityPublicId))).limit(1);
    if (!quote?.locked) return Response.json({ error: "La versión comercial debe estar congelada." }, { status: 409 });
    const [client] = quote.clientPublicId ? await db.select().from(clients).where(and(eq(clients.ownerEmail, session.ownerEmail), eq(clients.publicId, quote.clientPublicId))).limit(1) : [];
    const email = emailEnvironment();
    return Response.json({ configured: Boolean(email.EMAIL && z.string().email().safeParse(email.EMAIL_FROM).success), to: client?.email || "", phone: client?.phone || "", subject: `Cotización ${quote.number} · ${quote.project}`, body: `Estimado/a ${client?.contactName || quote.clientName}:\n\nAdjuntamos la cotización ${quote.number} para ${quote.project}. Quedamos atentos a sus comentarios.\n\nSaludos cordiales.`, quoteNumber: quote.number }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: "No fue posible preparar el envío." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("documents.quote");
    const input = schema.parse(await request.json());
    const email = emailEnvironment();
    if (!email.EMAIL || !z.string().email().safeParse(email.EMAIL_FROM).success) return Response.json({ error: "Configure EMAIL y EMAIL_FROM en Cloudflare para enviar desde la plataforma. Puede descargar el PDF y preparar un correo." }, { status: 503 });
    const db = getDb();
    const [document] = await db.select().from(documentSnapshots).where(and(eq(documentSnapshots.ownerEmail, session.ownerEmail), eq(documentSnapshots.publicId, input.documentId), eq(documentSnapshots.entityType, "quote"), eq(documentSnapshots.securityProfile, "commercial_v2"))).limit(1);
    if (!document) return Response.json({ error: "El documento comercial no existe." }, { status: 404 });
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, document.entityPublicId))).limit(1);
    if (!quote?.locked || document.revision !== quote.revision) return Response.json({ error: "El PDF debe corresponder a una revisión congelada." }, { status: 409 });
    const payloadHash = await sha256(JSON.stringify({ documentId: input.documentId, to: input.to, subject: input.subject, body: input.body }));
    const [previous] = await db.select().from(syncReceipts).where(eq(syncReceipts.operationId, input.deliveryId)).limit(1);
    if (previous) {
      if (previous.ownerEmail !== session.ownerEmail || previous.operationType !== "document.email" || previous.payloadHash !== payloadHash) return Response.json({ error: "El identificador de envío ya fue usado con otros datos." }, { status: 409 });
      const result = JSON.parse(previous.resultJson);
      if (result.status === "accepted") return Response.json({ ...result, replayed: true });
      return Response.json({ error: "Este intento está en proceso o su resultado es incierto. Revise el registro del servicio antes de iniciar otro envío." }, { status: 409 });
    }
    const object = env.BUCKET ? await env.BUCKET.get(document.storageKey) : null;
    if (!object) return Response.json({ error: "El PDF no está disponible." }, { status: 404 });
    if (object.size > 3 * 1024 * 1024) return Response.json({ error: "El PDF supera el tamaño permitido para este envío. Descárguelo y adjúntelo desde su correo." }, { status: 413 });
    const content = await object.arrayBuffer();
    // Reserve before the external side effect. Uncertain attempts are never retried automatically.
    const reserved = await env.DB.prepare(`INSERT INTO sync_receipts (operation_id, owner_email, operation_type, payload_hash, result_json, created_at)
      SELECT ?, ?, 'document.email', ?, ?, ? WHERE (SELECT COUNT(*) FROM sync_receipts WHERE owner_email = ? AND operation_type = 'document.email' AND created_at > ?) < 10
      ON CONFLICT(operation_id) DO NOTHING`).bind(input.deliveryId, session.ownerEmail, payloadHash, JSON.stringify({ status: "sending", documentId: input.documentId }), new Date().toISOString(), session.ownerEmail, new Date(Date.now() - 60_000).toISOString()).run();
    if (Number(reserved.meta?.changes || 0) !== 1) return Response.json({ error: "El envío ya fue reservado o se alcanzó el límite temporal. Espere y revise antes de reintentar." }, { status: 409 });
    let result: { status: string; messageId?: string; error?: string };
    try {
      const response = await email.EMAIL.send({ from: email.EMAIL_FROM!, to: input.to, subject: input.subject, text: input.body, attachments: [{ filename: document.fileName, content, type: "application/pdf", disposition: "attachment" }] });
      result = { status: "accepted", messageId: response.messageId };
    } catch {
      await db.update(syncReceipts).set({ resultJson: JSON.stringify({ status: "uncertain", documentId: input.documentId }) }).where(and(eq(syncReceipts.ownerEmail, session.ownerEmail), eq(syncReceipts.operationId, input.deliveryId)));
      return Response.json({ error: "No se pudo confirmar el envío. Revise el registro del servicio de correo antes de crear otro intento." }, { status: 502 });
    }
    await db.update(syncReceipts).set({ resultJson: JSON.stringify(result) }).where(and(eq(syncReceipts.ownerEmail, session.ownerEmail), eq(syncReceipts.operationId, input.deliveryId)));
    await db.insert(quoteEvents).values({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, quotePublicId: quote.publicId, eventType: "CORREO_ACEPTADO_SERVICIO", actor: session.user.name || session.user.email, detail: `${document.fileName} · ${input.to} · ${result.messageId}`, createdAt: new Date().toISOString() });
    await writeAuditEvent(session, { action: "QUOTE_EMAIL_ACCEPTED", entityType: "quote", entityPublicId: quote.publicId, detail: { documentId: input.documentId, deliveryId: input.deliveryId, recipient: input.to, messageId: result.messageId } });
    return Response.json(result);
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Revise destinatario, asunto y mensaje." : "No fue posible confirmar el envío. Revise el historial antes de reintentar." }, { status: 400 });
  }
}
