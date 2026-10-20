import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { writeAuditEvent } from "@/lib/audit";
import { CHILE_PRICE_REFERENCES, referenceUnitCost } from "@/lib/price-reference";

const schema = z.object({ codes: z.array(z.string()).min(1).max(100), markupPercent: z.number().min(0).max(500).default(30), unknownVat: z.enum(["included", "excluded"]).optional() });
export async function POST(request: Request) {
  try {
    const session = await requirePermission("catalog.write");
    const input = schema.parse(await request.json());
    const references = [...new Set(input.codes)].map((code) => CHILE_PRICE_REFERENCES.find((row) => row.code === code));
    if (references.some((row) => !row)) return Response.json({ error: "Una referencia no existe." }, { status: 400 });
    const db = getDb();
    const current = await db.select({ code: catalogItems.code }).from(catalogItems).where(and(eq(catalogItems.ownerEmail, session.ownerEmail), eq(catalogItems.active, true)));
    const currentCodes = new Set(current.map((row) => row.code));
    const now = new Date().toISOString();
    const selected = references.filter((row) => row && !currentCodes.has(row.code));
    const values = selected.map((row) => {
      const ref = row!;
      const cost = referenceUnitCost(ref, input.unknownVat);
      if (cost === null) throw new Error("Confirme el tratamiento de IVA para las referencias que no lo informan.");
      const payload = { priceStatus: "reference", priceDate: ref.checkedAt, priceReference: ref, vatAssumption: ref.priceIncludesVat === null ? input.unknownVat : "published" };
      return { publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, code: ref.code, type: "Material", category: ref.category, name: ref.name,
        description: `${ref.notes} Precio de referencia consultado ${ref.checkedAt}. Presentación: ${ref.packageQuantity} ${ref.unit} por ${ref.publishedPrice} CLP. Costo normalizado por ${ref.unit}. Confirmar stock y especificación.`.trim(),
        unit: ref.unit, unitCost: String(cost), unitPrice: String(Math.ceil(cost * (1 + input.markupPercent / 100))), currency: "CLP", supplier: ref.supplier,
        reference: ref.sourceUrl, payloadJson: JSON.stringify(payload), updatedAt: now };
    });
    // At most 4 x 16 bind variables per SQL statement (D1 limit: 100).
    let inserted = 0;
    for (let i = 0; i < values.length; i += 4) {
      const saved = await db.insert(catalogItems).values(values.slice(i, i + 4)).onConflictDoNothing({ target: [catalogItems.ownerEmail, catalogItems.code] }).returning({ code: catalogItems.code });
      inserted += saved.length;
    }
    await writeAuditEvent(session, { action: "PRICE_REFERENCES_IMPORTED", entityType: "catalog_item", detail: { inserted, skipped: references.length - inserted, consultedAt: "2026-10-20", markupPercent: input.markupPercent } });
    return Response.json({ inserted, skipped: references.length - inserted });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Seleccione hasta 100 referencias válidas por envío." : error instanceof Error ? error.message : "No fue posible importar el catálogo." }, { status: 400 });
  }
}
