import { env } from "cloudflare:workers";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { catalogItems } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { importSummary, previewCatalogImport } from "@/lib/catalog-import";

const schema = z.object({ action: z.enum(["preview", "commit"]), mode: z.enum(["add", "update"]), rows: z.array(z.record(z.unknown())).min(1).max(200), expectedStates: z.array(z.string()).max(200).optional() });
export async function POST(request: Request) {
  try {
    const session = await requirePermission("catalog.write");
    const input = schema.parse(await request.json());
    if (JSON.stringify(input).length > 1_000_000) return Response.json({ error: "Archivo demasiado grande." }, { status: 413 });
    const existing = await getDb().select().from(catalogItems).where(eq(catalogItems.ownerEmail, session.ownerEmail));
    const preview = previewCatalogImport(input.rows, existing, input.mode); const summary = importSummary(preview);
    if (input.action === "preview") return Response.json({ preview, summary });
    if (summary.invalid) return Response.json({ error: "Corrija las filas inválidas. No se guardó ninguna fila.", preview, summary }, { status: 400 });
    if (!input.expectedStates || input.expectedStates.length !== preview.length || preview.some((row, index) => row.expectedState !== input.expectedStates?.[index])) return Response.json({ error: "La biblioteca cambió. Genere otra vista previa antes de importar." }, { status: 409 });
    const operations: D1PreparedStatement[] = [];
    for (const row of preview.filter(row => row.action !== "skip")) {
      const item = row.input!; const old = existing.find(i => i.publicId === row.publicId);
      const id = old?.publicId || crypto.randomUUID(); const updatedAt = new Date(Math.max(Date.now(), (Date.parse(old?.updatedAt || "") || 0) + 1)).toISOString();
      const payloadJson = JSON.stringify({ ...JSON.parse(old?.payloadJson || "{}"), priceDate: item.fecha, importVat: item.iva, importTaxPercent: item.tasa_iva, importedAt: updatedAt, importSource: item.fuente, ...(item.tipo === "Mano de obra" ? { internalCostStatus: "confirmed" } : {}) });
      const values = [item.tipo, item.categoria || "General", item.nombre, item.descripcion, item.unidad, String(row.netCost), String(row.netPrice), item.moneda, item.proveedor, item.fuente, payloadJson, updatedAt];
      if (old) {
        operations.push(env.DB.prepare("UPDATE catalog_items SET type=?, category=?, name=?, description=?, unit=?, unit_cost=?, unit_price=?, currency=?, supplier=?, reference=?, payload_json=?, updated_at=? WHERE owner_email=? AND public_id=? AND updated_at=?").bind(...values, session.ownerEmail, id, old.updatedAt));
        // D1 batch is a transaction. A failed CAS throws here and rolls back the entire import.
        operations.push(env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'CONFLICT' END)"));
      } else {
        operations.push(env.DB.prepare("INSERT INTO catalog_items (type,category,name,description,unit,unit_cost,unit_price,currency,supplier,reference,payload_json,updated_at,owner_email,public_id,code) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE NOT EXISTS(SELECT 1 FROM catalog_items WHERE owner_email=? AND upper(trim(code))=upper(trim(?)))").bind(...values, session.ownerEmail, id, item.codigo, session.ownerEmail, item.codigo));
        operations.push(env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'CONFLICT' END)"));
      }
    }
    if (operations.length) {
      operations.push(env.DB.prepare("INSERT INTO audit_events (public_id,owner_email,actor_email,actor_name,actor_role,action,entity_type,detail_json) VALUES (?,?,?,?,?,'CATALOG_IMPORTED','catalog',?)").bind(crypto.randomUUID(), session.ownerEmail, session.user.email, session.user.name, session.user.role, JSON.stringify({ mode: input.mode, ...summary })));
      await env.DB.batch(operations);
    }
    return Response.json({ summary, message: "Importación completa. Cotizaciones, empresa y demás datos conservados." });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof Error ? error.message : "No fue posible importar.";
    return Response.json({ error: /constraint|CONFLICT|malformed JSON/i.test(message) ? "La biblioteca cambió; la importación se revirtió. Genere otra vista previa." : error instanceof z.ZodError ? "Revise el formato del archivo." : message }, { status: /constraint|CONFLICT|malformed JSON/i.test(message) ? 409 : 400 });
  }
}
