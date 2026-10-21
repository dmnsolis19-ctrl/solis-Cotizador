import data from "@/data/metalcon-references.json";
import { csvCell, IMPORT_COLUMNS, importNumber, importRowSchema, normalizeCode, type ImportRow } from "./catalog-import";
import { bundleSchema, type Bundle } from "./catalog-bundles";

export type MetalconReference = typeof data.references[number];
export const METALCON_REFERENCES = data.references;
export const METALCON_CHECKED_AT = data.checkedAt;
export const METALCON_SOURCES: Record<string, { label: string; url: string; edition: string }> = data.sources;
export const METALCON_TEMPLATES = [
  { id: "structural", name: "Muro portante · completar desde planos", codes: ["MC-E-C90P085-3000", "MC-E-U92-085-3000", "MC-F-LENTEJA8-58", "MC-A-ANCLAJE", "MC-A-FLEJE", "MC-MO-ESTRUCTURA"] },
  { id: "partition", name: "Tabique interior · solo perfilería", codes: ["MC-T-C60-3000", "MC-T-U61-3000", "MC-F-LENTEJA8-12", "MC-MO-TABIQUE"] },
  { id: "ceiling", name: "Cielo · solo perfilería", codes: ["MC-C-40R-3000", "MC-C-AT-3000", "MC-C-TI", "MC-F-LENTEJA8-12", "MC-MO-CIELO"] },
] as const;
export type MetalconCatalogItem = { publicId: string; code: string; name: string; description: string; type: string; unit: string; currency: string; unitCost: string; unitPrice: string };

export function metalconDescription(ref: MetalconReference) {
  const source = METALCON_SOURCES[ref.sourceId];
  return `${ref.presentation}. ${ref.scope} Fuente técnica: ${source.label}; ${source.edition}. Revisión técnica ${METALCON_CHECKED_AT}; no es fecha de precio.`;
}

export function metalconImportRows(codes: string[], costs: Record<string, string>, markup: number, supplier: string, priceDate: string): ImportRow[] {
  if (!Number.isFinite(markup) || markup < 0 || markup > 500) throw new Error("Use un recargo de venta entre 0 y 500%.");
  if (!codes.length) throw new Error("Seleccione al menos una referencia.");
  return [...new Set(codes)].map(code => {
    const ref = METALCON_REFERENCES.find(ref => ref.code === code);
    if (!ref) throw new Error(`Referencia desconocida: ${code}`);
    const cost = importNumber(costs[code]);
    if (!Number.isFinite(cost) || cost <= 0) throw new Error(`Ingrese su costo neto por ${ref.unit} de ${ref.name}. No se asignan precios ficticios.`);
    return importRowSchema.parse({ codigo: code, tipo: ref.type, categoria: `Construcción / Metalcon / ${ref.family}`, nombre: ref.name,
      descripcion: metalconDescription(ref), unidad: ref.unit, costo: cost, venta: Math.round(cost * (1 + markup / 100) * 100) / 100,
      moneda: "CLP", iva: "neto", tasa_iva: 19, proveedor: supplier, fuente: METALCON_SOURCES[ref.sourceId].url, fecha: priceDate });
  });
}

export function metalconCsv(references: MetalconReference[]) {
  const rows = references.map(ref => [ref.code, ref.type, `Construcción / Metalcon / ${ref.family}`, ref.name, metalconDescription(ref), ref.unit, "", "", "CLP", "neto", 19, "", METALCON_SOURCES[ref.sourceId].url, ""]);
  return "\uFEFF" + [IMPORT_COLUMNS, ...rows].map(row => row.map(csvCell).join(";")).join("\r\n");
}

export function metalconBundle(codes: string[], catalog: MetalconCatalogItem[], quantities: Record<string, number>, name: string): Bundle {
  if (!codes.length) throw new Error("Seleccione referencias para el conjunto.");
  const lines = [...new Set(codes)].map(code => {
    const ref = METALCON_REFERENCES.find(ref => ref.code === code);
    if (!ref) throw new Error(`Referencia desconocida: ${code}`);
    const matches = catalog.filter(item => normalizeCode(item.code) === code);
    if (matches.length !== 1) throw new Error(`Agregue ${code} a su biblioteca; debe existir una sola vez.`);
    const item = matches[0];
    if (item.currency !== "CLP" || item.unit !== ref.unit || item.type !== ref.type) throw new Error(`Revise moneda, tipo y unidad de ${code}.`);
    if (!(Number(item.unitCost) > 0) || !(Number(item.unitPrice) > 0)) throw new Error(`Confirme costo y venta propios de ${code} antes de crear el conjunto.`);
    return { catalogItemPublicId: item.publicId, code: item.code, name: item.name, detail: item.description, type: item.type, unit: item.unit,
      quantity: quantities[code] ?? 1, unitCost: Number(item.unitCost), unitPrice: Number(item.unitPrice) };
  });
  return bundleSchema.parse({ publicId: crypto.randomUUID(), expectedUpdatedAt: "", name, specialty: "Construcción", currency: "CLP", lines });
}
