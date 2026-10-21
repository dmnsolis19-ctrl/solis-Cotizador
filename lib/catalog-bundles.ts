import { z } from "zod";
import type { QuoteLine } from "./pricing";
export const bundleLineSchema = z.object({
  catalogItemPublicId: z.string().uuid(), code: z.string().min(1).max(80), name: z.string().min(2).max(240), detail: z.string().max(2000).default(""),
  type: z.enum(["Material", "Mano de obra", "Servicio"]), unit: z.string().min(1).max(40), quantity: z.number().finite().positive().max(1e6),
  unitCost: z.number().finite().min(0).max(1e9), unitPrice: z.number().finite().min(0).max(1e9),
});
export const bundleSchema = z.object({
  publicId: z.string().uuid(), expectedUpdatedAt: z.string().default(""), name: z.string().trim().min(2).max(180),
  specialty: z.enum(["Automatización", "Climatización", "Electricidad", "Fotovoltaica", "Construcción"]), currency: z.enum(["CLP", "USD", "EUR", "UF"]),
  lines: z.array(bundleLineSchema).min(1).max(100),
}).superRefine((bundle, ctx) => { if (new Set(bundle.lines.map(l => l.catalogItemPublicId)).size !== bundle.lines.length) ctx.addIssue({ code: "custom", message: "Use una sola fila por código y ajuste su cantidad." }); });
export type Bundle = z.infer<typeof bundleSchema> & { updatedAt?: string };
export type SourcedQuoteLine = QuoteLine & { sourceBundleId?: string; sourceCatalogItemPublicId?: string };
export function applyBundle(bundle: Bundle, quantities: Record<string, number>, existing: SourcedQuoteLine[], groupedCatalogIds: string[], currency: string) {
  if (bundle.currency !== currency) throw new Error("El conjunto usa otra moneda. No se convierten precios automáticamente.");
  if (existing.some(line => line.sourceBundleId === bundle.publicId)) throw new Error("Este conjunto ya está aplicado. Edite las cantidades de sus partidas.");
  const lines: SourcedQuoteLine[] = []; const skipped: string[] = [];
  for (const line of bundle.lines) {
    if (groupedCatalogIds.includes(line.catalogItemPublicId) || existing.some(old => old.sourceCatalogItemPublicId === line.catalogItemPublicId || (old.name === line.name && old.unit === line.unit))) { skipped.push(line.code); continue; }
    const quantity = quantities[line.catalogItemPublicId] ?? line.quantity;
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1e6) throw new Error("Revise las cantidades del conjunto.");
    lines.push({ name: line.name, detail: line.detail, quantity, unit: line.unit, unitCost: line.unitCost, unitPrice: line.unitPrice, sourceBundleId: bundle.publicId, sourceCatalogItemPublicId: line.catalogItemPublicId });
  }
  if (existing.length + lines.length > 500) throw new Error("La cotización supera 500 partidas.");
  return { lines, skipped };
}
