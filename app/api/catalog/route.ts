import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";

const itemSchema = z.object({
  publicId: z.string().uuid().optional(),
  expectedUpdatedAt: z.string().optional(),
  priceDate: z.union([z.literal(""), z.string().date()]).default(""),
  code: z.string().trim().min(1).max(80),
  type: z.enum(["Material", "Mano de obra", "Servicio"]),
  category: z.string().trim().default("General"),
  name: z.string().trim().min(2).max(240),
  description: z.string().trim().default(""),
  unit: z.string().trim().min(1),
  unitCost: z.coerce.number().min(0),
  unitPrice: z.coerce.number().min(0),
  currency: z.enum(["CLP", "USD", "EUR", "UF"]).default("CLP"),
  supplier: z.string().trim().default(""),
  reference: z.string().trim().default(""),
});

export async function POST(request: Request) {
  try {
    const session = await requirePermission("catalog.write");
    const ownerEmail = session.ownerEmail;
    const input = itemSchema.parse(await request.json());
    const publicId = input.publicId ?? crypto.randomUUID();
    const db = getDb();
    const [existing] = await db.select().from(catalogItems).where(eq(catalogItems.publicId, publicId)).limit(1);
    if (existing && existing.ownerEmail !== ownerEmail) return Response.json({ error: "El identificador del ítem pertenece a otro espacio." }, { status: 409 });
    if (existing && input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt) return Response.json({ error: "El material cambió en otro dispositivo. Actualice antes de guardar." }, { status: 409 });
    const [sameCode] = await db.select({ publicId: catalogItems.publicId }).from(catalogItems).where(and(eq(catalogItems.ownerEmail, ownerEmail), eq(catalogItems.code, input.code))).limit(1);
    if (sameCode && sameCode.publicId !== publicId) return Response.json({ error: "Ese código ya existe en la biblioteca." }, { status: 409 });
    const { expectedUpdatedAt: _expectedUpdatedAt, priceDate, ...fields } = input;
    void _expectedUpdatedAt;
    const previousPayload = JSON.parse(existing?.payloadJson || "{}");
    const record = {
      publicId, ownerEmail, ...fields,
      unitCost: String(input.unitCost), unitPrice: String(input.unitPrice),
      payloadJson: JSON.stringify({ ...previousPayload, ...fields, priceDate }), updatedAt: new Date(Math.max(Date.now(), Date.parse(existing?.updatedAt || "") + 1 || 0)).toISOString(),
    };
    if (existing) {
      const { publicId: _publicId, ownerEmail: _ownerEmail, ...changes } = record;
      void _publicId; void _ownerEmail;
      const updated = await db.update(catalogItems).set(changes).where(and(eq(catalogItems.ownerEmail, ownerEmail), eq(catalogItems.publicId, publicId), eq(catalogItems.updatedAt, input.expectedUpdatedAt || existing.updatedAt))).returning();
      if (!updated.length) return Response.json({ error: "El material cambió en otro dispositivo. Actualice antes de guardar." }, { status: 409 });
    } else await db.insert(catalogItems).values(record);
    const [row] = await db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail, ownerEmail), eq(catalogItems.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: existing ? "CATALOG_UPDATED" : "CATALOG_CREATED", entityType: "catalog_item", entityPublicId: publicId, detail: { code: input.code, name: input.name } });
    return Response.json({ item: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise código, nombre, unidad, costo y precio." : error instanceof Error ? error.message : "No fue posible guardar el ítem.";
    return Response.json({ error: message }, { status: 400 });
  }
}
