"use client";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importSummary, importTemplateCsv, tableToImportRows, type ImportMode, type ImportPreview } from "@/lib/catalog-import";
import { importTemplateXlsx, readImportFile } from "@/lib/tabular-file";
export function downloadFile(bytes: BlobPart, name: string, type = "text/csv;charset=utf-8") { const url = URL.createObjectURL(new Blob([bytes], { type })); const a = document.createElement("a"); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
export function CatalogImportPanel({ online, onImported }: { online: boolean; onImported(): void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]), [mode, setMode] = useState<ImportMode | "">("");
  const [preview, setPreview] = useState<ImportPreview[]>([]), [busy, setBusy] = useState(false), [name, setName] = useState("");
  const [result, setResult] = useState(""); const summary = importSummary(preview);
  const run = async (action: "preview" | "commit") => {
    setBusy(true); setResult("");
    try {
      const response = await fetch("/api/catalog-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, mode, rows, ...(action === "commit" ? { expectedStates: preview.map(r => r.expectedState) } : {}) }) });
      const body = await response.json() as { error?: string; preview: ImportPreview[]; summary: ReturnType<typeof importSummary> }; if (!response.ok) { if (action === "commit") setPreview([]); throw new Error(body.error); }
      if (action === "preview") setPreview(body.preview);
      else { setResult(`Importación terminada: ${body.summary.added} agregados, ${body.summary.updated} actualizados y ${body.summary.skipped} omitidos.`); setRows([]); setPreview([]); onImported(); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible importar."); } finally { setBusy(false); }
  };
  return <details className="rounded-2xl border bg-white p-5"><summary className="cursor-pointer font-bold">Importar biblioteca desde Excel / CSV</summary><div className="mt-4 space-y-4">
    <p className="text-sm text-slate-600">Use la primera hoja visible y hasta 200 filas. Precios por unidad, sin separador de miles: 12500,50 o 12500.50. Fecha AAAA-MM-DD. Unidades: un, m, m2, m3, kg, l, h, hh, dia, gl, punto, kit, par, rollo, caja. IVA explícito: neto, incluido o exento; los precios se guardan netos.</p>
    <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => downloadFile(importTemplateXlsx(), "Plantilla_biblioteca_SOLIS.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>Plantilla Excel</Button><Button variant="outline" onClick={() => downloadFile(importTemplateCsv(), "Plantilla_biblioteca_SOLIS.csv")}>Plantilla CSV</Button></div>
    <label className="block space-y-2 text-sm">Archivo Excel o CSV<input className="block w-full rounded-lg border p-3" type="file" accept=".csv,.xlsx" disabled={busy} onChange={async e => { const file = e.target.files?.[0]; setPreview([]); setRows([]); setResult(""); if (!file) return; try { setRows(tableToImportRows(await readImportFile(file))); setName(file.name); } catch (error) { toast.error(error instanceof Error ? error.message : "Archivo inválido."); } }} /></label>
    <label className="block space-y-2 text-sm">Qué desea hacer<select className="block min-h-11 w-full rounded-lg border bg-white px-3" value={mode} disabled={busy} onChange={e => { setMode(e.target.value as ImportMode); setPreview([]); }}><option value="">Seleccione una acción…</option><option value="add">Agregar códigos nuevos; omitir existentes</option><option value="update">Actualizar códigos existentes; omitir nuevos</option></select></label>
    <p className="text-xs text-slate-500">Actualizar reemplaza los campos de la plantilla para esos códigos. Conserva información adicional, empresa, clientes, órdenes y cotizaciones. No convierte monedas ni elimina registros. Una cotización conserva su IVA global: revise ese porcentaje si incorpora referencias exentas.</p>
    <Button disabled={!online || !mode || !rows.length || busy} onClick={() => void run("preview")}>{busy ? "Procesando…" : `Validar y previsualizar ${rows.length || ""} filas`}</Button>
    {!online && <p className="text-sm text-amber-800">Puede preparar el archivo sin conexión. La validación y la importación requieren internet.</p>}
    {!!preview.length && <><p role="status" className="text-sm">{name}: {summary.added} por agregar · {summary.updated} por actualizar · {summary.skipped} omitidos · {summary.invalid} inválidos</p><div className="max-h-80 overflow-auto rounded-lg border"><table className="w-full text-left text-xs"><thead><tr>{["Fila / código", "Resultado", "Costo neto / venta neta", "Observaciones"].map(t => <th className="p-3" key={t}>{t}</th>)}</tr></thead><tbody>{preview.map(row => <tr className="border-t" key={row.row}><td className="p-3">{row.row} · {row.code}</td><td className="p-3">{{ add: "Agregar", update: "Actualizar", skip: "Omitir", error: "Inválida" }[row.action]}</td><td className="p-3">{row.netCost} / {row.netPrice} {row.input?.moneda}</td><td className="min-w-48 p-3 text-red-700">{row.errors.join(" · ")}</td></tr>)}</tbody></table></div><Button disabled={!online || busy || !!summary.invalid || !(summary.added + summary.updated)} onClick={() => void run("commit")}>Confirmar {summary.added + summary.updated} cambios en biblioteca</Button></>}
    {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p>}
  </div></details>;
}
