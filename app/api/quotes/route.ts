import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { quoteItems, quotes } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { calculateQuote } from "@/lib/pricing";

const quoteSchema = z.object({
  publicId: z.string().uuid().optional(),
  number: z.string().trim().optional(),
  clientPublicId: z.string().default(""),
  clientName: z.string().trim().min(2),
  project: z.string().trim().min(2),
  issueDate: z.string().trim().min(10),
  currency: z.enum(["CLP", "USD", "EUR", "UF"]).default("CLP"),
  taxPercent: z.coerce.number().min(0).max(100).default(19),
  overheadPercent: z.coerce.number().min(0).max(100).default(10),
  contingencyPercent: z.coerce.number().min(0).max(100).default(5),
  targetMarginPercent: z.coerce.number().min(0).max(99).default(25),
  discountPercent: z.coerce.number().min(0).max(100).default(0),
  roundingMultiple: z.coerce.number().min(0).default(1000),
  validityDays: z.coerce.number().int().min(1).default(20),
  paymentTerms: z.string().default(""),
  deliveryTerms: z.string().default(""),
  notes: z.string().default(""),
  items: z.array(z.object({
    name: z.string().trim().min(2),
    detail: z.string().default(""),
    quantity: z.coerce.number().positive(),
    unit: z.string().trim().min(1),
    unitCost: z.coerce.number().min(0),
    unitPrice: z.coerce.number().min(0),
  })).min(1),
});

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
    const sequence = Number(value) + 1;
    const number = input.number || `SIS-COT-${new Date().getUTCFullYear()}-${String(sequence).padStart(3, "0")}`;
    const calculated = calculateQuote(input.items, input);
    const payload = {
      ...input, public_id: publicId, number, status: "Borrador", revision: 0,
      root_public_id: publicId, parent_public_id: "", locked: false,
      calculated: Object.fromEntries(Object.entries(calculated).map(([key, val]) => [key, String(val)])),
    };

    await db.insert(quotes).values({
      publicId, ownerEmail, number, rootPublicId: publicId, parentPublicId: "", revision: 0,
      clientPublicId: input.clientPublicId, clientName: input.clientName, project: input.project,
      issueDate: input.issueDate, status: "Borrador", currency: input.currency, locked: false,
      grossSubtotal: String(calculated.grossSubtotal), netSubtotal: String(calculated.netSubtotal),
      tax: String(calculated.tax), total: String(calculated.total), directCost: String(calculated.directCost),
      internalCost: String(calculated.internalCost), estimatedProfit: String(calculated.estimatedProfit),
      marginPercent: String(calculated.marginPercent), payloadJson: JSON.stringify(payload), updatedAt: new Date().toISOString(),
    });
    await db.insert(quoteItems).values(input.items.map((item, position) => ({
      publicId: `${publicId}:item:${position}`, ownerEmail, quotePublicId: publicId, position,
      name: item.name, detail: item.detail, quantity: String(item.quantity), unit: item.unit,
      unitCost: String(item.unitCost), unitPrice: String(item.unitPrice),
    })));
    const [row] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: "QUOTE_CREATED", entityType: "quote", entityPublicId: publicId, detail: { number, clientName: input.clientName, project: input.project } });
    return Response.json({ quote: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise cliente, proyecto y partidas de la cotización." : error instanceof Error ? error.message : "No fue posible guardar la cotización.";
    return Response.json({ error: message }, { status: 400 });
  }
}
