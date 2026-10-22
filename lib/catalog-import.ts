import { z } from "zod";

export const IMPORT_COLUMNS = ["codigo", "tipo", "categoria", "nombre", "descripcion", "unidad", "costo", "venta", "moneda", "iva", "tasa_iva", "proveedor", "fuente", "fecha"] as const;
export const IMPORT_UNITS = ["un", "m", "m2", "m3", "kg", "l", "h", "hh", "dia", "gl", "punto", "kit", "par", "rollo", "caja"] as const;
export const importRowSchema = z.object({
  codigo: z.string().trim().min(1).max(80), tipo: z.enum(["Material", "Mano de obra", "Servicio"]),
  categoria: z.string().trim().max(160).default("General"), nombre: z.string().trim().min(2).max(240),
  descripcion: z.string().max(2000).default(""), unidad: z.enum(IMPORT_UNITS),
  costo: z.number().finite().min(0).max(1e9), venta: z.number().finite().min(0).max(1e9),
  moneda: z.enum(["CLP", "USD", "EUR", "UF"]), iva: z.enum(["neto", "incluido", "exento"]),
  tasa_iva: z.number().finite().min(0).max(100), proveedor: z.string().max(180).default(""),
  fuente: z.string().max(1000).default(""), fecha: z.string().date(),
}).superRefine((row, ctx) => {
  if ((row.iva === "exento") !== (row.tasa_iva === 0)) ctx.addIssue({ code: "custom", path: ["tasa_iva"], message: "Use tasa 0 solo para exento; confirme el IVA." });
});
export type ImportRow = z.infer<typeof importRowSchema>;
export type ImportMode = "add" | "update";
export type ExistingCatalog = { publicId: string; code: string; updatedAt: string; payloadJson?: string };
export type ImportPreview = { row: number; code: string; action: "add" | "update" | "skip" | "error"; errors: string[]; input?: ImportRow; expectedState: string; publicId?: string; netCost?: number; netPrice?: number };
export const normalizeCode = (value: string) => value.trim().normalize("NFKC").toLocaleUpperCase("es-CL");

// Decimal comma is accepted; thousands separators must follow a single consistent format.
export function importNumber(value: unknown): number {
  if (typeof value === "number") return value;
  const raw = String(value ?? "").trim();
  if (!raw || !/^[0-9.,]+$/.test(raw)) return NaN;
  if (/^\d+$/.test(raw)) return Number(raw);
  if (/^\d+,\d{1,6}$/.test(raw)) return Number(raw.replace(",", "."));
  if (/^\d+\.\d{1,6}$/.test(raw)) return Number(raw);
  if (/^\d{1,3}(\.\d{3})+,\d{1,6}$/.test(raw)) return Number(raw.replaceAll(".", "").replace(",", "."));
  return NaN;
}
export function previewCatalogImport(rows: Record<string, unknown>[], existing: ExistingCatalog[], mode: ImportMode): ImportPreview[] {
  const byCode = new Map<string, ExistingCatalog[]>();
  for (const item of existing) { const key = normalizeCode(item.code); byCode.set(key, [...(byCode.get(key) || []), item]); }
  const counts = new Map<string, number>();
  for (const row of rows) { const code = normalizeCode(String(row.codigo ?? "")); counts.set(code, (counts.get(code) || 0) + 1); }
  return rows.map((raw, index) => {
    const code = normalizeCode(String(raw.codigo ?? "")); const matches = byCode.get(code) || []; const old = matches[0];
    const result = importRowSchema.safeParse({ ...raw, codigo: code, costo: importNumber(raw.costo), venta: importNumber(raw.venta), tasa_iva: importNumber(raw.tasa_iva) });
    const errors = result.success ? [] : result.error.issues.map(issue => `${issue.path.join(".")}: ${issue.message}`);
    if ((counts.get(code) || 0) > 1) errors.push("Código repetido dentro del archivo.");
    if (matches.length > 1) errors.push("La biblioteca tiene códigos equivalentes. Corríjalos antes de importar.");
    const expectedState = old?.updatedAt || "missing";
    if (errors.length || !result.success) return { row: index + 2, code, action: "error", errors, expectedState };
    const row = result.data; const divisor = row.iva === "incluido" ? 1 + row.tasa_iva / 100 : 1;
    return { row: index + 2, code, action: mode === "add" ? old ? "skip" : "add" : old ? "update" : "skip", errors, expectedState, publicId: old?.publicId, input: row, netCost: Math.round(row.costo / divisor * 1e6) / 1e6, netPrice: Math.round(row.venta / divisor * 1e6) / 1e6 };
  });
}
export function importSummary(preview: ImportPreview[]) {
  return { added: preview.filter(r => r.action === "add").length, updated: preview.filter(r => r.action === "update").length, skipped: preview.filter(r => r.action === "skip").length, invalid: preview.filter(r => r.action === "error").length };
}
export function csvCell(value: unknown) {
  let text = String(value ?? ""); if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
export const importActionLabel = { add: "Agregar", update: "Actualizar", skip: "Omitir", error: "Inválida" } as const;
export function importPreviewCsv(preview: ImportPreview[]) {
  const rows: unknown[][] = [["fila", "codigo", "resultado", "nombre", "costo_neto", "venta_neta", "moneda", "observaciones"]];
  for (const row of preview) rows.push([row.row, row.code, importActionLabel[row.action], row.input?.nombre ?? "", row.netCost ?? "", row.netPrice ?? "", row.input?.moneda ?? "", row.errors.join(" · ")]);
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
}
export const importTemplateRows = [IMPORT_COLUMNS, ["MAT-EJEMPLO", "Material", "Electricidad", "Material de ejemplo: reemplace esta fila", "Especifique el alcance", "un", "0", "0", "CLP", "neto", "19", "", "", "2026-10-20"]];
export function importTemplateCsv() { return "\uFEFF" + importTemplateRows.map(row => row.map(csvCell).join(";")).join("\r\n"); }

export function parseCsv(text: string): string[][] {
  text = text.replace(/^\uFEFF/, "");
  const firstLine = text.split(/\r?\n/)[0];
  const separator = [";", ",", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = []; let row: string[] = [], value = "", quoted = false, closed = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { value += '"'; i++; } else if (ch === '"') { quoted = false; closed = true; } else value += ch; }
    else if (ch === '"' && value === "" && !closed) quoted = true;
    else if (ch === separator) { row.push(value); value = ""; closed = false; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(value); if (row.some(v => v.trim())) rows.push(row); row = []; value = ""; closed = false; }
    else { if (closed && ch.trim()) throw new Error("CSV: texto inesperado después de comillas."); value += ch; }
  }
  if (quoted) throw new Error("CSV: faltan comillas de cierre.");
  row.push(value); if (row.some(v => v.trim())) rows.push(row);
  return rows;
}
export function tableToImportRows(table: string[][]) {
  if (table.length < 2 || table.length > 201) throw new Error("Use entre 1 y 200 filas por archivo.");
  const headers = table[0].map(h => h.trim().toLowerCase());
  if (headers.length !== IMPORT_COLUMNS.length || new Set(headers).size !== headers.length || IMPORT_COLUMNS.some(h => !headers.includes(h))) throw new Error(`Use las columnas de la plantilla: ${IMPORT_COLUMNS.join(", ")}.`);
  return table.slice(1).map((values, i) => { if (values.length > headers.length) throw new Error(`Fila ${i + 2}: demasiadas columnas.`); return Object.fromEntries(headers.map((h, j) => [h, values[j] ?? ""])); });
}
