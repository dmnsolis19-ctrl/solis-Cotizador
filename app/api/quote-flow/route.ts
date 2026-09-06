import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { quoteEvents, quoteItems, quotes, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { canApprove, canCreateRevision, canCreateWorkOrder, canFreeze, revisionNumber } from "@/lib/workflow";

const flowSchema = z.object({
  action: z.enum(["lock", "revision", "approve", "create_order"]),
  quotePublicId: z.string().min(8),
  actor: z.string().trim().default(""),
  detail: z.string().trim().default(""),
  responsible: z.string().trim().default(""),
});

function updatePayload(payloadJson: string, changes: Record<string, unknown>) {
  try { return JSON.stringify({ ...JSON.parse(payloadJson), ...changes }); }
  catch { return JSON.stringify(changes); }
}

async function addEvent(ownerEmail: string, quotePublicId: string, eventType: string, actor: string, detail: string) {
  await getDb().insert(quoteEvents).values({
    publicId: crypto.randomUUID(), ownerEmail, quotePublicId, eventType, actor, detail,
    createdAt: new Date().toISOString(),
  });
}

export async function POST(request: Request) {
  try {
    const input = flowSchema.parse(await request.json());
    const session = await requirePermission(input.action === "approve" || input.action === "create_order" ? "quotes.approve" : "quotes.flow");
    const ownerEmail = session.ownerEmail;
    const actor = session.user.name || session.user.email;
    const db = getDb();
    const [quote] = await db.select().from(quotes)
      .where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, input.quotePublicId))).limit(1);
    if (!quote) return Response.json({ error: "La cotización no existe." }, { status: 404 });

    if (input.action === "lock") {
      if (!canFreeze(quote)) return Response.json({ error: "La versión ya está congelada." }, { status: 409 });
      const now = new Date().toISOString();
      await db.update(quotes).set({
        locked: true, lockedAt: now, status: "Enviada", updatedAt: now,
        payloadJson: updatePayload(quote.payloadJson, { locked: true, locked_at: now, status: "Enviada" }),
      }).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, quote.publicId)));
      await addEvent(ownerEmail, quote.publicId, "VERSION_CONGELADA", actor, input.detail || "Versión congelada para preservar el documento enviado.");
      await writeAuditEvent(session, { action: "QUOTE_LOCKED", entityType: "quote", entityPublicId: quote.publicId, detail: { number: quote.number } });
      return Response.json({ ok: true, message: "Versión congelada." });
    }

    if (input.action === "revision") {
      if (!canCreateRevision(quote)) return Response.json({ error: "Debe congelar la versión antes de crear una revisión." }, { status: 409 });
      if (!input.detail) return Response.json({ error: "Indique el motivo de la revisión." }, { status: 400 });
      const rootId = quote.rootPublicId || quote.publicId;
      const chain = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.rootPublicId, rootId))).orderBy(desc(quotes.revision));
      const revision = (chain[0]?.revision ?? quote.revision) + 1;
      const publicId = crypto.randomUUID();
      const number = revisionNumber(quote.number, revision);
      const now = new Date().toISOString();
      await db.insert(quotes).values({
        ...quote, publicId, number, rootPublicId: rootId, parentPublicId: quote.publicId, revision,
        status: "Borrador", locked: false, lockedAt: "", approvedAt: "", approvedBy: "", approvalNotes: "",
        payloadJson: updatePayload(quote.payloadJson, {
          public_id: publicId, number, root_public_id: rootId, parent_public_id: quote.publicId,
          revision, revision_reason: input.detail, status: "Borrador", locked: false,
          locked_at: "", approved_at: "", approved_by: "", approval_notes: "",
        }),
        updatedAt: now,
      });
      const items = await db.select().from(quoteItems).where(and(eq(quoteItems.ownerEmail, ownerEmail), eq(quoteItems.quotePublicId, quote.publicId))).orderBy(quoteItems.position);
      if (items.length) await db.insert(quoteItems).values(items.map((item) => ({ ...item, publicId: `${publicId}:item:${item.position}`, quotePublicId: publicId })));
      await addEvent(ownerEmail, quote.publicId, "REVISION_DERIVADA", actor, `Nueva versión ${number}.`);
      await addEvent(ownerEmail, publicId, "REVISION_CREADA", actor, input.detail);
      await writeAuditEvent(session, { action: "QUOTE_REVISION_CREATED", entityType: "quote", entityPublicId: publicId, detail: { sourcePublicId: quote.publicId, number, reason: input.detail } });
      return Response.json({ ok: true, message: `Revisión ${number} creada.`, publicId });
    }

    if (input.action === "approve") {
      if (!quote.locked) return Response.json({ error: "Solo puede aprobar una versión congelada." }, { status: 409 });
      if (!canApprove(quote)) return Response.json({ error: "La cotización ya está aprobada." }, { status: 409 });
      const now = new Date().toISOString();
      await db.update(quotes).set({
        status: "Aprobada", approvedAt: now, approvedBy: actor, approvalNotes: input.detail, updatedAt: now,
        payloadJson: updatePayload(quote.payloadJson, { status: "Aprobada", approved_at: now, approved_by: actor, approval_notes: input.detail }),
      }).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, quote.publicId)));
      await addEvent(ownerEmail, quote.publicId, "APROBADA", actor, input.detail || "Aprobación registrada.");
      await writeAuditEvent(session, { action: "QUOTE_APPROVED", entityType: "quote", entityPublicId: quote.publicId, detail: { number: quote.number, reference: input.detail } });
      return Response.json({ ok: true, message: "Aprobación registrada." });
    }

    if (!canCreateWorkOrder(quote)) return Response.json({ error: "La orden solo puede crearse desde una cotización aprobada." }, { status: 409 });
    const existing = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.quotePublicId, quote.publicId))).limit(1);
    if (existing.length) return Response.json({ error: `Ya existe la orden ${existing[0].number}.` }, { status: 409 });
    const [{ value }] = await db.select({ value: count() }).from(workOrders).where(eq(workOrders.ownerEmail, ownerEmail));
    const number = `SIS-OT-${new Date().getUTCFullYear()}-${String(Number(value) + 1).padStart(3, "0")}`;
    const publicId = crypto.randomUUID();
    const now = new Date().toISOString();
    const payload = {
      public_id: publicId, number, quote_public_id: quote.publicId, quote_number: quote.number,
      created_date: now.slice(0, 10), client_name: quote.clientName, project: quote.project,
      status: "Pendiente", responsible: input.responsible, notes: input.detail,
      currency: quote.currency, approved_sale: quote.netSubtotal,
    };
    await db.insert(workOrders).values({
      publicId, ownerEmail, number, quotePublicId: quote.publicId, clientName: quote.clientName,
      project: quote.project, status: "Pendiente", responsible: input.responsible,
      createdDate: now.slice(0, 10), currency: quote.currency, approvedSale: quote.netSubtotal,
      notes: input.detail, payloadJson: JSON.stringify(payload), updatedAt: now,
    });
    await addEvent(ownerEmail, quote.publicId, "ORDEN_TRABAJO_CREADA", actor, number);
    await writeAuditEvent(session, { action: "WORK_ORDER_CREATED", entityType: "work_order", entityPublicId: publicId, detail: { number, quotePublicId: quote.publicId, responsible: input.responsible } });
    return Response.json({ ok: true, message: `Orden ${number} creada.`, publicId });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise la acción y los datos ingresados." : error instanceof Error ? error.message : "No fue posible completar el flujo.";
    return Response.json({ error: message }, { status: 400 });
  }
}
