import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { catalogBundles } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { bundleSchema } from "@/lib/catalog-bundles";
import { writeAuditEvent } from "@/lib/audit";
export async function GET() {
  try {
    const session = await requirePermission("catalog.read");
    const rows = await getDb().select().from(catalogBundles).where(eq(catalogBundles.ownerEmail, session.ownerEmail));
    return Response.json({ bundles: rows.map(row => ({ ...JSON.parse(row.payloadJson), publicId: row.publicId, updatedAt: row.updatedAt, expectedUpdatedAt: row.updatedAt })) });
  } catch (error) { const auth = authorizationResponse(error); if (auth) return auth; return Response.json({ error: "No fue posible cargar conjuntos." }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    const session = await requirePermission("catalog.write"), input = bundleSchema.parse(await request.json()), db = getDb();
    const [old] = await db.select().from(catalogBundles).where(eq(catalogBundles.publicId, input.publicId)).limit(1);
    if (old && (old.ownerEmail !== session.ownerEmail || input.expectedUpdatedAt !== old.updatedAt) || !old && input.expectedUpdatedAt) return Response.json({ error: "El conjunto cambió o no pertenece a su cuenta. Actualice antes de guardarlo." }, { status: 409 });
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(old?.updatedAt || "") || 0) + 1)).toISOString();
    const values = { name: input.name, specialty: input.specialty, currency: input.currency, payloadJson: JSON.stringify(input), updatedAt };
    if (old) {
      const saved = await db.update(catalogBundles).set(values).where(and(eq(catalogBundles.ownerEmail, session.ownerEmail), eq(catalogBundles.publicId, input.publicId), eq(catalogBundles.updatedAt, input.expectedUpdatedAt))).returning();
      if (!saved.length) return Response.json({ error: "El conjunto cambió en otro dispositivo." }, { status: 409 });
    } else await db.insert(catalogBundles).values({ publicId: input.publicId, ownerEmail: session.ownerEmail, ...values });
    await writeAuditEvent(session, { action: "BUNDLE_SAVED", entityType: "catalog_bundle", entityPublicId: input.publicId, detail: { name: input.name, count: input.lines.length } });
    return Response.json({ bundle: { ...input, updatedAt, expectedUpdatedAt: updatedAt } }, { status: 201 });
  } catch (error) { const auth = authorizationResponse(error); if (auth) return auth; return Response.json({ error: error instanceof Error ? error.message : "Revise los datos del conjunto." }, { status: 400 }); }
}
