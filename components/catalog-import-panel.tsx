"use client";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { importActionLabel, importPreviewCsv, importSummary, importTemplateCsv, tableToImportRows, type ImportMode, type ImportPreview } from "@/lib/catalog-import";
import { importTemplateXlsx, readImportFile } from "@/lib/tabular-file";

export function downloadFile(bytes: BlobPart, name: string, type = "text/csv;charset=utf-8") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
const netPrice = (row: ImportPreview) => row.netCost === undefined ? "Pendiente de validar" : `${row.netCost?.toLocaleString("es-CL", { maximumFractionDigits: 6 })} / ${row.netPrice?.toLocaleString("es-CL", { maximumFractionDigits: 6 })} ${row.input?.moneda}`;

export function CatalogImportPanel({ online, onImported }: { online: boolean; onImported(): void }) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([]), [mode, setMode] = useState<ImportMode | "">("");
  const [preview, setPreview] = useState<ImportPreview[]>([]), [busy, setBusy] = useState(false), [name, setName] = useState("");
  const [reading, setReading] = useState(false), [onlyInvalid, setOnlyInvalid] = useState(false);
  const [result, setResult] = useState(""), [error, setError] = useState("");
  const activeRead = useRef(0), submitting = useRef(false);
  const summary = importSummary(preview), disabled = busy || reading;
  const visible = onlyInvalid ? preview.filter(row => row.action === "error") : preview;

  const loadFile = async (file?: File) => {
    const id = ++activeRead.current;
    setPreview([]); setRows([]); setName(""); setResult(""); setError(""); setOnlyInvalid(false);
    setReading(!!file);
    if (!file) return;
    try {
      const next = tableToImportRows(await readImportFile(file));
      if (id !== activeRead.current) return;
      setRows(next); setName(file.name);
    } catch (e) {
      if (id !== activeRead.current) return;
      const message = e instanceof Error ? e.message : "Archivo inválido.";
      setError(message); toast.error(message);
    } finally { if (id === activeRead.current) setReading(false); }
  };
  const run = async (action: "preview" | "commit") => {
    if (submitting.current || reading || !online || !mode || !rows.length) return;
    submitting.current = true; setBusy(true); setResult(""); setError("");
    const expectedStates = preview.map(row => row.expectedState);
    if (action === "preview") { setPreview([]); setOnlyInvalid(false); }
    try {
      const response = await fetch("/api/catalog-import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, mode, rows, ...(action === "commit" ? { expectedStates } : {}) }),
      });
      const body = await response.json() as { error?: string; preview: ImportPreview[]; summary: ReturnType<typeof importSummary> };
      if (!response.ok) throw new Error(body.error || "No fue posible importar. Vuelva a validar el archivo.");
      if (action === "preview") setPreview(body.preview);
      else {
        setResult(`Importación terminada: ${body.summary.added} agregados, ${body.summary.updated} actualizados y ${body.summary.skipped} omitidos.`);
        setRows([]); setPreview([]); setName(""); onImported();
      }
    } catch (e) {
      setPreview([]);
      const message = e instanceof Error ? e.message : "No fue posible importar.";
      setError(message); toast.error(message);
    } finally { submitting.current = false; setBusy(false); }
  };
  return <details className="min-w-0 rounded-2xl border bg-white p-4 sm:p-5">
    <summary className="cursor-pointer font-bold">Importar biblioteca desde Excel / CSV</summary>
    <div className="mt-4 min-w-0 space-y-4" aria-busy={disabled}>
      <p className="text-sm text-slate-600">1. Complete la plantilla. 2. Elija Agregar o Actualizar. 3. Valide las filas y confirme los cambios.</p>
      <p className="text-sm text-slate-600">Use la primera hoja visible y hasta 200 filas. Precios por unidad, sin separador de miles: 12500,50 o 12500.50. Fecha AAAA-MM-DD. Unidades: un, m, m2, m3, kg, l, h, hh, dia, gl, punto, kit, par, rollo, caja. IVA explícito: neto, incluido o exento; los precios se guardan netos.</p>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => downloadFile(importTemplateXlsx(), "Plantilla_biblioteca_SOLIS.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")}>Plantilla Excel</Button>
        <Button variant="outline" onClick={() => downloadFile(importTemplateCsv(), "Plantilla_biblioteca_SOLIS.csv")}>Plantilla CSV</Button>
      </div>
      <label className="block space-y-2 text-sm">Archivo Excel o CSV
        <input className="block w-full min-w-0 rounded-lg border p-3" type="file" accept=".csv,.xlsx" disabled={disabled}
          onChange={e => { const file = e.target.files?.[0]; e.target.value = ""; void loadFile(file); }} />
      </label>
      {reading && <p role="status" className="text-sm">Leyendo archivo…</p>}
      {!!rows.length && <p role="status" className="break-words rounded-lg bg-slate-50 p-3 text-sm">Archivo listo: <strong>{name}</strong> · {rows.length} filas. {preview.length ? "Revise el resultado de la validación." : "Todavía no se ha importado."}</p>}
      <label className="block space-y-2 text-sm">Qué desea hacer
        <select className="block min-h-11 w-full rounded-lg border bg-white px-3" value={mode} disabled={disabled}
          onChange={e => { setMode(e.target.value as ImportMode); setPreview([]); setError(""); setOnlyInvalid(false); }}>
          <option value="">Seleccione una acción…</option><option value="add">Agregar códigos nuevos; omitir existentes</option><option value="update">Actualizar códigos existentes; omitir nuevos</option>
        </select>
      </label>
      <p className="text-xs text-slate-500">Actualizar reemplaza los campos de la plantilla para esos códigos. Conserva información adicional, empresa, clientes, órdenes y cotizaciones. No convierte monedas ni elimina registros. Una cotización conserva su IVA global: revise ese porcentaje si incorpora referencias exentas.</p>
      <Button className="h-auto min-h-11 max-w-full whitespace-normal py-3" disabled={!online || !mode || !rows.length || disabled} onClick={() => void run("preview")}>{busy ? "Procesando…" : `Validar y previsualizar ${rows.length || ""} filas`}</Button>
      {!online && <p className="text-sm text-amber-800">Puede preparar el archivo sin conexión. La validación y la importación requieren internet.</p>}
      {error && <p role="alert" className="break-words rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!!preview.length && <>
        <p role="status" className="break-words text-sm">{summary.added} por agregar · {summary.updated} por actualizar · {summary.skipped} omitidos · {summary.invalid} inválidos</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" aria-pressed={!onlyInvalid} onClick={() => setOnlyInvalid(false)}>Todas las filas ({preview.length})</Button>
          <Button variant="outline" aria-pressed={onlyInvalid} disabled={!summary.invalid} onClick={() => setOnlyInvalid(true)}>Solo inválidas ({summary.invalid})</Button>
          <Button variant="outline" onClick={() => downloadFile(importPreviewCsv(preview), "Revision_biblioteca_SOLIS.csv")}>Descargar revisión CSV</Button>
        </div>
        <div className="max-h-96 space-y-3 overflow-y-auto md:hidden" aria-label="Filas de la importación">
          {visible.map(row => <article className="min-w-0 space-y-2 rounded-xl border p-3 text-sm" key={row.row}>
            <div className="flex flex-wrap justify-between gap-2"><strong className="break-all">Fila {row.row} · {row.code || "Sin código"}</strong><span>{importActionLabel[row.action]}</span></div>
            {row.input?.nombre && <p className="break-words">{row.input.nombre}</p>}
            <p className="break-words text-xs">Costo neto / venta neta: {netPrice(row)}</p>
            {!!row.errors.length && <p className="break-words text-red-700">{row.errors.join(" · ")}</p>}
          </article>)}
        </div>
        <div className="hidden max-h-96 overflow-auto rounded-lg border md:block" tabIndex={0} role="region" aria-label="Tabla de revisión de importación">
          <table className="w-full text-left text-xs"><thead className="sticky top-0 bg-slate-50"><tr>{["Fila / código", "Resultado", "Costo neto / venta neta", "Observaciones"].map(t => <th scope="col" className="p-3" key={t}>{t}</th>)}</tr></thead>
            <tbody>{visible.map(row => <tr className="border-t" key={row.row}><td className="max-w-60 break-words p-3">{row.row} · {row.code}<div>{row.input?.nombre}</div></td><td className="p-3">{importActionLabel[row.action]}</td><td className="p-3">{netPrice(row)}</td><td className="min-w-48 break-words p-3 text-red-700">{row.errors.join(" · ")}</td></tr>)}</tbody>
          </table>
        </div>
        {!!summary.invalid && <p className="text-sm text-red-800">Corrija las filas inválidas en el archivo original y vuelva a seleccionarlo. No se aplicará ninguna fila mientras existan errores.</p>}
        <Button className="h-auto min-h-11 w-full whitespace-normal py-3 sm:w-auto" disabled={!online || disabled || !!summary.invalid || !(summary.added + summary.updated)} onClick={() => void run("commit")}>Confirmar {summary.added + summary.updated} cambios en biblioteca</Button>
      </>}
      {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800">{result}</p>}
    </div>
  </details>;
}
