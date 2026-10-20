import referenceData from "@/data/chile-price-references.json";

export type PriceReference = {
  code: string; name: string; category: string; unit: string; packageQuantity: number;
  publishedPrice: number; currency: string; priceIncludesVat: boolean | null;
  supplier: string; sourceUrl: string; checkedAt: string; notes: string; vendorCode?: string;
};
export const CHILE_PRICE_REFERENCES: PriceReference[] = referenceData;
export type VatTreatment = "included" | "excluded";
export function referenceUnitCost(reference: PriceReference, treatment?: VatTreatment) {
  const vat = reference.priceIncludesVat === null ? treatment : reference.priceIncludesVat ? "included" : "excluded";
  if (!vat) return null;
  return Math.round(reference.publishedPrice / reference.packageQuantity / (vat === "included" ? 1.19 : 1) * 10000) / 10000;
}
export function priceReferenceExpired(date: string, referenceDate = new Date().toISOString().slice(0, 10)) {
  return !date || Date.parse(referenceDate) - Date.parse(date) > 30 * 86400000;
}
export function safeCsvCell(value: unknown) {
  const text = String(value ?? "");
  return `"${(/^[\s]*[=+@-]/.test(text) ? "'" + text : text).replaceAll('"', '""')}"`;
}
export function referencesCsv(references: PriceReference[]) {
  const rows: unknown[][] = [["Código", "Categoría", "Material", "Unidad de uso", "Unidades por presentación", "Precio presentación CLP", "IVA publicación", "Costo unitario neto CLP", "Proveedor", "Fecha consulta", "Fuente", "Notas"]];
  for (const row of references) rows.push([row.code, row.category, row.name, row.unit, row.packageQuantity, row.publishedPrice, row.priceIncludesVat === null ? "Por confirmar" : row.priceIncludesVat ? "Incluido" : "Neto", referenceUnitCost(row) ?? "Por confirmar", row.supplier, row.checkedAt, row.sourceUrl, row.notes]);
  return "\uFEFF" + rows.map((row) => row.map(safeCsvCell).join(";")).join("\r\n");
}
