import { importTemplateRows, parseCsv } from "./catalog-import";

const encoder = new TextEncoder(); const decoder = new TextDecoder("utf-8", { fatal: true });
const escapeXml = (value: unknown) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
function crc32(bytes: Uint8Array) { let crc = -1; for (const byte of bytes) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1)); } return (crc ^ -1) >>> 0; }
function zipStore(files: Record<string, string>) {
  const locals: Uint8Array[] = [], centrals: Uint8Array[] = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const path = encoder.encode(name), bytes = encoder.encode(text), crc = crc32(bytes);
    const local = new Uint8Array(30 + path.length + bytes.length), lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint32(14, crc, true); lv.setUint32(18, bytes.length, true); lv.setUint32(22, bytes.length, true); lv.setUint16(26, path.length, true); local.set(path, 30); local.set(bytes, 30 + path.length);
    const central = new Uint8Array(46 + path.length), cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true); cv.setUint16(4, 20, true); cv.setUint16(6, 20, true); cv.setUint32(16, crc, true); cv.setUint32(20, bytes.length, true); cv.setUint32(24, bytes.length, true); cv.setUint16(28, path.length, true); cv.setUint32(42, offset, true); central.set(path, 46);
    locals.push(local); centrals.push(central); offset += local.length;
  }
  const size = centrals.reduce((sum, b) => sum + b.length, 0); const end = new Uint8Array(22), ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, locals.length, true); ev.setUint16(10, locals.length, true); ev.setUint32(12, size, true); ev.setUint32(16, offset, true);
  const all = new Uint8Array(offset + size + 22); let cursor = 0; for (const bytes of [...locals, ...centrals, end]) { all.set(bytes, cursor); cursor += bytes.length; } return all;
}
export function importTemplateXlsx() {
  const sheet = `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${importTemplateRows.map((row, i) => `<row r="${i + 1}">${row.map((cell, j) => `<c r="${String.fromCharCode(65 + j)}${i + 1}" t="inlineStr"><is><t>${escapeXml(cell)}</t></is></c>`).join("")}</row>`).join("")}</sheetData></worksheet>`;
  return zipStore({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml": '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Biblioteca" sheetId="1" r:id="rId1"/></sheets></workbook>',
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": sheet,
  });
}
async function unzip(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let end = bytes.length - 22;
  while (end >= Math.max(0, bytes.length - 65557) && view.getUint32(end, true) !== 0x06054b50) end--;
  if (end < 0 || view.getUint32(end, true) !== 0x06054b50) throw new Error("Excel: archivo ZIP inválido.");
  const count = view.getUint16(end + 10, true); if (count > 500) throw new Error("Excel demasiado complejo. Use la plantilla.");
  let cursor = view.getUint32(end + 16, true), expanded = 0; const files = new Map<string, { offset: number; size: number; expanded: number; method: number; crc: number }>();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Excel: directorio inválido.");
    const size = view.getUint32(cursor + 20, true), length = view.getUint32(cursor + 24, true), pathSize = view.getUint16(cursor + 28, true);
    const path = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + pathSize)); expanded += length;
    if (expanded > 10_000_000 || length > 4_000_000 || view.getUint16(cursor + 8, true) & 1 || files.has(path)) throw new Error("Excel cifrado o demasiado grande. Use CSV o la plantilla.");
    files.set(path, { offset: view.getUint32(cursor + 42, true), size, expanded: length, method: view.getUint16(cursor + 10, true), crc: view.getUint32(cursor + 16, true) });
    cursor += 46 + pathSize + view.getUint16(cursor + 30, true) + view.getUint16(cursor + 32, true);
  }
  return async (path: string) => {
    const entry = files.get(path); if (!entry) return "";
    if (view.getUint32(entry.offset, true) !== 0x04034b50) throw new Error("Excel: entrada inválida.");
    const start = entry.offset + 30 + view.getUint16(entry.offset + 26, true) + view.getUint16(entry.offset + 28, true);
    let content = bytes.slice(start, start + entry.size);
    if (entry.method === 8) {
      if (typeof DecompressionStream === "undefined") throw new Error("Este navegador no permite leer XLSX. Guarde el archivo como CSV UTF-8.");
      const reader = new Blob([content]).stream().pipeThrough(new DecompressionStream("deflate-raw")).getReader(); const parts: Uint8Array[] = []; let total = 0;
      while (true) { const result = await reader.read(); if (result.done) break; total += result.value.length; if (total > entry.expanded || total > 4_000_000) { await reader.cancel(); throw new Error("Excel descomprimido supera el límite."); } parts.push(result.value); }
      content = new Uint8Array(total); let offset = 0; for (const part of parts) { content.set(part, offset); offset += part.length; }
    } else if (entry.method !== 0) throw new Error("Compresión de Excel no compatible. Use CSV.");
    if (content.length !== entry.expanded || crc32(content) !== entry.crc) throw new Error("Excel: contenido dañado.");
    return decoder.decode(content);
  };
}
function xml(text: string) { if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new Error("Excel con entidades externas no permitido."); const doc = new DOMParser().parseFromString(text, "application/xml"); if (doc.querySelector("parsererror")) throw new Error("Excel: XML inválido."); return doc; }
export async function readImportFile(file: File): Promise<string[][]> {
  if (file.size > 3_000_000) throw new Error("Use un archivo de hasta 3 MB y 200 filas.");
  if (/\.csv$/i.test(file.name)) return parseCsv(decoder.decode(await file.arrayBuffer()));
  if (!/\.xlsx$/i.test(file.name)) throw new Error("Seleccione Excel .xlsx o CSV UTF-8. Guarde los .xls antiguos como .xlsx.");
  const get = await unzip(new Uint8Array(await file.arrayBuffer()));
  const workbook = xml(await get("xl/workbook.xml"));
  if (["1", "true"].includes(workbook.querySelector("workbookPr")?.getAttribute("date1904") || "")) throw new Error("Use el calendario 1900 para el libro o guarde como CSV con fechas AAAA-MM-DD.");
  const sheet = [...workbook.getElementsByTagName("sheet")].find(s => !s.getAttribute("state") || s.getAttribute("state") === "visible");
  const rels = xml(await get("xl/_rels/workbook.xml.rels")); const rel = [...rels.getElementsByTagName("Relationship")].find(r => r.getAttribute("Id") === sheet?.getAttribute("r:id"));
  const target = rel?.getAttribute("Target") || "";
  if (!target || target.includes("..") || rel?.getAttribute("TargetMode") === "External") throw new Error("Excel: no hay una hoja de datos disponible.");
  const sharedText = await get("xl/sharedStrings.xml"); const shared = sharedText ? [...xml(sharedText).getElementsByTagName("si")].map(s => [...s.getElementsByTagName("t")].map(t => t.textContent).join("")) : [];
  const doc = xml(await get(target.startsWith("/") ? target.slice(1) : `xl/${target}`)); const rows: string[][] = [];
  for (const row of [...doc.getElementsByTagName("row")]) {
    const values: string[] = [];
    for (const cell of [...row.getElementsByTagName("c")]) {
      if (cell.getElementsByTagName("f").length) throw new Error("La importación no evalúa fórmulas. Pegue como valores antes de subir.");
      if (cell.getAttribute("t") === "e") throw new Error("Excel contiene una celda con error.");
      const ref = cell.getAttribute("r") || ""; const letters = /^[A-Z]+/.exec(ref)?.[0]; if (!letters) throw new Error("Excel: celda sin referencia.");
      const column = [...letters].reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1;
      if (column > 50) throw new Error("Excel: utilice solo las columnas de la plantilla.");
      const raw = cell.getElementsByTagName("v")[0]?.textContent || "";
      let value = cell.getAttribute("t") === "s" ? shared[Number(raw)] || "" : cell.getAttribute("t") === "inlineStr" ? [...cell.getElementsByTagName("t")].map(t => t.textContent).join("") : raw;
      if (rows.length && rows[0][column]?.trim().toLowerCase() === "fecha" && (!cell.getAttribute("t") || cell.getAttribute("t") === "n") && /^\d+(\.0+)?$/.test(value)) value = new Date(Date.UTC(1899, 11, 30) + Number(value) * 86400000).toISOString().slice(0, 10);
      values[column] = value;
    }
    if (values.some(v => v.trim())) rows.push(Array.from({ length: Math.max(values.length, rows[0]?.length || 0) }, (_, i) => values[i] || ""));
    if (rows.length > 201) throw new Error("Máximo 200 filas por archivo.");
  }
  return rows;
}
