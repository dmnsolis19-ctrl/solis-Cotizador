import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";

const itemSchema = z.object({
  publicId: z.string().uuid().optional(),
  code: z.string().trim().min(1),
  type: z.enum(["Material", "Mano de obra", "Servicio"]),
  category: z.string().trim().default("General"),
  name: z.string().trim().min(2),
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
    const record = {
      publicId, ownerEmail, ...input,
      unitCost: String(input.unitCost), unitPrice: String(input.unitPrice),
      payloadJson: JSON.stringify(input), updatedAt: new Date().toISOString(),
    };
    await db.insert(catalogItems).values(record).onConflictDoUpdate({
      target: catalogItems.publicId,
      set: {
        code: record.code, type: record.type, category: record.category, name: record.name,
        description: record.description, unit: record.unit, unitCost: record.unitCost,
        unitPrice: record.unitPrice, currency: record.currency, supplier: record.supplier,
        reference: record.reference, payloadJson: record.payloadJson, updatedAt: record.updatedAt,
      },
    });
    const [row] = await db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail, ownerEmail), eq(catalogItems.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: existing ? "CATALOG_UPDATED" : "CATALOG_CREATED", entityType: "catalog_item", entityPublicId: publicId, detail: { code: input.code, name: input.name } });
    return Response.json({ item: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise código, nombre, unidad, costo y precio." : error instanceof Error ? error.message : "No fue posible guardar el ítem.";
    return Response.json({ error: message }, { status: 400 });
  }
}
