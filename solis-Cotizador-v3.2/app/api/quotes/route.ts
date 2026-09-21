import { env } from "cloudflare:workers";
import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { quoteItems, quotes } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { calculateQuote } from "@/lib/pricing";
import { documentScope, reserveDocumentSequence } from "@/lib/sequences";
import { businessYear } from "@/lib/dates";

const quoteSchema = z.object({
  publicId: z.string().uuid().optional(),
  number: z.string().trim().optional(),
  clientPublicId: z.string().max(120).default(""),
  clientName: z.string().trim().min(2).max(180),
  project: z.string().trim().min(2).max(240),
  issueDate: z.string().date(),
  currency: z.enum(["CLP", "USD", "EUR", "UF"]).default("CLP"),
  taxPercent: z.coerce.number().min(0).max(100).default(19),
  overheadPercent: z.coerce.number().min(0).max(100).default(10),
  contingencyPercent: z.coerce.number().min(0).max(100).default(5),
  targetMarginPercent: z.coerce.number().min(0).max(99).default(25),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  roundingMultiple: z.coerce.number().min(0).max(1_000_000_000).default(1000),
  validityDays: z.coerce.number().int().min(1).max(365).default(20),
  paymentTerms: z.string().trim().max(1000).default(""),
  deliveryTerms: z.string().trim().max(1000).default(""),
  notes: z.string().trim().max(4000).default(""),
  items: z.array(z.object({
    name: z.string().trim().min(2).max(240),
    detail: z.string().trim().max(2000).default(""),
    quantity: z.coerce.number().positive().max(1_000_000_000),
    unit: z.string().trim().min(1).max(40),
    unitCost: z.coerce.number().min(0).max(1_000_000_000_000),
    unitPrice: z.coerce.number().min(0).max(1_000_000_000_000),
  })).min(1).max(500),
});

const updateQuoteSchema = quoteSchema.extend({
  publicId: z.string().min(8),
  expectedUpdatedAt: z.string().optional(),
});

function quotePayload(
  input: z.infer<typeof quoteSchema>,
  identity: { publicId: string; number: string; rootPublicId: string; parentPublicId: string; revision: number },
  calculated: ReturnType<typeof calculateQuote>,
) {
  return {
    ...input,
    public_id: identity.publicId,
    number: identity.number,
    status: "Borrador",
    revision: identity.revision,
    root_public_id: identity.rootPublicId,
    parent_public_id: identity.parentPublicId,
    locked: false,
    calculated: Object.fromEntries(Object.entries(calculated).map(([key, value]) => [key, String(value)])),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("quotes.read");
    const publicId = z.string().min(8).parse(new URL(request.url).searchParams.get("publicId"));
    const db = getDb();
    const [quote] = await db.select().from(quotes).where(and(
      eq(quotes.ownerEmail, session.ownerEmail),
      eq(quotes.publicId, publicId),
    )).limit(1);
    if (!quote) return Response.json({ error: "La cotización no existe." }, { status: 404 });
    const items = await db.select().from(quoteItems).where(and(
      eq(quoteItems.ownerEmail, session.ownerEmail),
      eq(quoteItems.quotePublicId, quote.publicId),
    )).orderBy(quoteItems.position);
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(quote.payloadJson || "{}"); } catch { /* Conserva los datos normalizados. */ }
    return Response.json({
      quote,
      items: items.map((item) => ({
        name: item.name,
        detail: item.detail,
        quantity: Number(item.quantity),
        unit: item.unit,
        unitCost: Number(item.unitCost),
        unitPrice: Number(item.unitPrice),
      })),
      commercial: {
        taxPercent: Number(payload.taxPercent ?? payload.tax_percent ?? 19),
        overheadPercent: Number(payload.overheadPercent ?? payload.overhead_percent ?? 10),
        contingencyPercent: Number(payload.contingencyPercent ?? payload.contingency_percent ?? 5),
        targetMarginPercent: Number(payload.targetMarginPercent ?? payload.target_margin_percent ?? 25),
        discountPercent: Number(payload.discountPercent ?? payload.discount_percent ?? 0),
        roundingMultiple: Number(payload.roundingMultiple ?? payload.rounding_multiple ?? 1000),
        validityDays: Number(payload.validityDays ?? payload.validity_days ?? 20),
        paymentTerms: String(payload.paymentTerms ?? payload.payment_terms ?? ""),
        deliveryTerms: String(payload.deliveryTerms ?? payload.delivery_terms ?? ""),
        notes: String(payload.notes ?? ""),
      },
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Identificador de cotización no válido." : "No fue posible cargar la cotización." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("quotes.write");
    const ownerEmail = session.ownerEmail;
    const input = quoteSchema.parse(await request.json());
    const db = getDb();
    const publicId = input.publicId ?? crypto.randomUUID();
    const [existing] = await db.select().from(quotes).where(eq(quotes.publicId, publicId)).limit(1);
    if (existing) {
      if (existing.ownerEmail !== ownerEmail) return Response.json({ error: "El identificador de la cotización pertenece a otro espacio." }, { status: 409 });
      return Response.json({ quote: existing, replayed: true });
    }
    const [{ value }] = await db.select({ value: count() }).from(quotes).where(eq(quotes.ownerEmail, ownerEmail));
    const sequence = await reserveDocumentSequence(ownerEmail, documentScope("quote"), Number(value));
    const number = input.number || `SIS-COT-${businessYear()}-${String(sequence).padStart(3, "0")}`;
    const calculated = calculateQuote(input.items, input);
    const payload = quotePayload(input, { publicId, number, rootPublicId: publicId, parentPublicId: "", revision: 0 }, calculated);

    await db.batch([
      db.insert(quotes).values({
        publicId, ownerEmail, number, rootPublicId: publicId, parentPublicId: "", revision: 0,
        clientPublicId: input.clientPublicId, clientName: input.clientName, project: input.project,
        issueDate: input.issueDate, status: "Borrador", currency: input.currency, locked: false,
        grossSubtotal: String(calculated.grossSubtotal), netSubtotal: String(calculated.netSubtotal),
        tax: String(calculated.tax), total: String(calculated.total), directCost: String(calculated.directCost),
        internalCost: String(calculated.internalCost), estimatedProfit: String(calculated.estimatedProfit),
        marginPercent: String(calculated.marginPercent), payloadJson: JSON.stringify(payload), updatedAt: new Date().toISOString(),
      }),
      db.insert(quoteItems).values(input.items.map((item, position) => ({
        publicId: `${publicId}:item:${position}`, ownerEmail, quotePublicId: publicId, position,
        name: item.name, detail: item.detail, quantity: String(item.quantity), unit: item.unit,
        unitCost: String(item.unitCost), unitPrice: String(item.unitPrice),
      }))),
    ]);
    const [row] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: "QUOTE_CREATED", entityType: "quote", entityPublicId: publicId, detail: { number, clientName: input.clientName, project: input.project } });
    return Response.json({ quote: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise cliente, proyecto y partidas de la cotización." : error instanceof Error ? error.message : "No fue posible guardar la cotización.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("quotes.write");
    const input = updateQuoteSchema.parse(await request.json());
    const ownerEmail = session.ownerEmail;
    const db = getDb();
    const [existing] = await db.select().from(quotes).where(and(
      eq(quotes.ownerEmail, ownerEmail),
      eq(quotes.publicId, input.publicId),
    )).limit(1);
    if (!existing) return Response.json({ error: "La cotización no existe." }, { status: 404 });
    if (existing.locked || existing.status !== "Borrador") {
      return Response.json({ error: "Solo puede editar una versión en estado Borrador y no congelada." }, { status: 409 });
    }
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt) {
      return Response.json({ error: "La cotización cambió en otro dispositivo. Actualice los datos antes de guardar nuevamente." }, { status: 409 });
    }

    const { expectedUpdatedAt: _expectedUpdatedAt, ...editable } = input;
    void _expectedUpdatedAt;
    const calculated = calculateQuote(editable.items, editable);
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
    const payload = quotePayload(editable, {
      publicId: existing.publicId,
      number: existing.number,
      rootPublicId: existing.rootPublicId,
      parentPublicId: existing.parentPublicId,
      revision: existing.revision,
    }, calculated);
    const guardUpdatedAt = input.expectedUpdatedAt || existing.updatedAt;
    const statements: D1PreparedStatement[] = [
      env.DB.prepare(`
        UPDATE quotes SET
          client_public_id = ?, client_name = ?, project = ?, issue_date = ?, currency = ?,
          gross_subtotal = ?, net_subtotal = ?, tax = ?, total = ?, direct_cost = ?,
          internal_cost = ?, estimated_profit = ?, margin_percent = ?, payload_json = ?, updated_at = ?
        WHERE owner_email = ? AND public_id = ? AND locked = 0 AND status = 'Borrador' AND updated_at = ?
      `).bind(
        editable.clientPublicId, editable.clientName, editable.project, editable.issueDate, editable.currency,
        String(calculated.grossSubtotal), String(calculated.netSubtotal), String(calculated.tax), String(calculated.total),
        String(calculated.directCost), String(calculated.internalCost), String(calculated.estimatedProfit),
        String(calculated.marginPercent), JSON.stringify(payload), updatedAt,
        ownerEmail, existing.publicId, guardUpdatedAt,
      ),
      env.DB.prepare(`
        DELETE FROM quote_items
        WHERE owner_email = ? AND quote_public_id = ?
          AND EXISTS (
            SELECT 1 FROM quotes
            WHERE owner_email = ? AND public_id = ? AND updated_at = ?
          )
      `).bind(ownerEmail, existing.publicId, ownerEmail, existing.publicId, updatedAt),
      ...editable.items.map((item, position) => env.DB.prepare(`
        INSERT INTO quote_items (
          public_id, owner_email, quote_public_id, position, name, detail,
          quantity, unit, unit_cost, unit_price
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE EXISTS (
          SELECT 1 FROM quotes
          WHERE owner_email = ? AND public_id = ? AND updated_at = ?
        )
      `).bind(
        `${existing.publicId}:item:${position}`, ownerEmail, existing.publicId, position,
        item.name, item.detail, String(item.quantity), item.unit, String(item.unitCost), String(item.unitPrice),
        ownerEmail, existing.publicId, updatedAt,
      )),
    ];
    const results = await env.DB.batch(statements);
    if (Number(results[0]?.meta?.changes || 0) !== 1) {
      return Response.json({ error: "La cotización cambió en otro dispositivo. Actualice los datos antes de guardar nuevamente." }, { status: 409 });
    }
    await writeAuditEvent(session, {
      action: "QUOTE_UPDATED",
      entityType: "quote",
      entityPublicId: existing.publicId,
      detail: { number: existing.number, clientName: editable.clientName, project: editable.project, updatedAt },
    });
    const [quote] = await db.select().from(quotes).where(and(
      eq(quotes.ownerEmail, ownerEmail),
      eq(quotes.publicId, existing.publicId),
    )).limit(1);
    return Response.json({ quote });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError
      ? "Revise cliente, proyecto, condiciones comerciales y partidas de la cotización."
      : "No fue posible actualizar la cotización.";
    return Response.json({ error: message }, { status: 400 });
  }
}
