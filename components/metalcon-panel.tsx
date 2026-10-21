"use client";

import { useMemo, useState } from "react";
import { Download, ExternalLink, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { downloadFile } from "@/components/catalog-import-panel";
import { businessDate } from "@/lib/dates";
import { executeOrQueue } from "@/lib/offline-queue";
import { importSummary, normalizeCode, type ImportPreview, type ImportRow } from "@/lib/catalog-import";
import { METALCON_CHECKED_AT, METALCON_REFERENCES, METALCON_SOURCES, METALCON_TEMPLATES, metalconBundle, metalconCsv, metalconImportRows, type MetalconCatalogItem } from "@/lib/metalcon";

const money = (value: string | number, currency = "CLP") => new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: 2 }).format(Number(value));
const control = "min-h-11 w-full rounded-md border bg-white px-3 text-sm";
type Preview = { rows: ImportRow[]; items: ImportPreview[]; existing: number };

export function MetalconPanel({ online, canWrite, catalog, onImported, onQueued, onBundleSaved }: {
  online: boolean; canWrite: boolean; catalog: MetalconCatalogItem[]; onImported(): void; onQueued(): void; onBundleSaved(): void;
}) {
  const [expanded, setExpanded] = useState(false), [search, setSearch] = useState(""), [family, setFamily] = useState("");
  const [selected, setSelected] = useState<string[]>([]), [onlySelected, setOnlySelected] = useState(false), [page, setPage] = useState(0);
  const [costs, setCosts] = useState<Record<string, string>>({}), [quantities, setQuantities] = useState<Record<string, number>>({});
  const [markup, setMarkup] = useState(30), [supplier, setSupplier] = useState(""), [priceDate, setPriceDate] = useState(businessDate);
  const [bundleName, setBundleName] = useState("Materiales Metalcon"), [busy, setBusy] = useState(false), [preview, setPreview] = useState<Preview | null>(null), [result, setResult] = useState("");
  const currentCodes = new Set(catalog.map(item => normalizeCode(item.code)));
  const filtered = useMemo(() => METALCON_REFERENCES.filter(ref => (!family || ref.family === family) && (!onlySelected || selected.includes(ref.code)) && `${ref.name} ${ref.code} ${ref.family} metalcon metalcom`.toLocaleLowerCase("es-CL").includes(search.toLocaleLowerCase("es-CL"))), [family, onlySelected, selected, search]);
  const visible = filtered.slice(page * 12, page * 12 + 12);
  const invalidate = () => { setPreview(null); setResult(""); };
  const select = (codes: string[]) => { setSelected(codes); setPage(0); invalidate(); };
  const runImport = async (action: "preview" | "commit") => {
    setBusy(true); setResult("");
    try {
      const codes = selected.filter(code => !currentCodes.has(code));
      if (action === "preview" && !codes.length) throw new Error("Las referencias seleccionadas ya están en su biblioteca. Puede usarlas para crear un conjunto.");
      const rows = action === "commit" ? preview?.rows : metalconImportRows(codes, costs, markup, supplier, priceDate);
      if (!rows) throw new Error("Valide los precios antes de confirmar.");
      const response = await fetch("/api/catalog-import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, mode: "add", rows, ...(action === "commit" ? { expectedStates: preview!.items.map(item => item.expectedState) } : {}) }) });
      const body = await response.json() as { error?: string; preview?: ImportPreview[]; summary: ReturnType<typeof importSummary> };
      if (!response.ok) throw new Error(body.error || "No fue posible agregar los materiales.");
      if (action === "preview") setPreview({ rows, items: body.preview || [], existing: selected.length - codes.length });
      else { setPreview(null); setResult(`${body.summary.added} referencias agregadas; ${body.summary.skipped + (preview?.existing || 0)} omitidas por existir. Sus precios anteriores se conservaron.`); onImported(); }
    } catch (error) { if (action === "commit") setPreview(null); toast.error(error instanceof Error ? error.message : "Revise los precios."); }
    finally { setBusy(false); }
  };
  const saveBundle = async () => {
    setBusy(true);
    try {
      const draft = metalconBundle(selected, catalog, quantities, bundleName);
      const saved = await executeOrQueue("bundle.save", draft);
      if (saved.queued) { onQueued(); setResult("Conjunto pendiente de sincronizar. Espere la sincronización para aplicarlo a una cotización."); }
      else { onBundleSaved(); setResult(`Conjunto guardado: ${draft.name}. Ábralo desde Aplicar conjunto reutilizable al crear una cotización.`); }
    } catch (error) { toast.error(error instanceof Error ? error.message : "Revise el conjunto."); }
    finally { setBusy(false); }
  };
  const summary = preview ? importSummary(preview.items) : null;
  return <section className="min-w-0 rounded-2xl border border-slate-300 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-slate-100 p-5"><div><h2 className="font-bold text-slate-950">Biblioteca Metalcon / Metalcom</h2><p className="mt-1 text-xs text-slate-600">{METALCON_REFERENCES.length} referencias · estructura, tabiques, cielos y complementos · precios propios</p></div><Button aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>{expanded ? "Contraer Metalcon" : "Explorar Metalcon"}</Button></div>
    {expanded && <fieldset disabled={busy} className="min-w-0 space-y-5 p-4 sm:p-5">
      <p className="text-sm text-slate-600">Referencias para presupuestar. Los perfiles de tabique no son portantes. Secciones, luces, arriostres, anclajes y cantidades de la estructura se definen en los planos y cálculo del proyecto. Las listas iniciales contienen 1 unidad por ítem y no son rendimientos por m2 ni diseños constructivos.</p>
      <p className="text-xs text-slate-500">Revisión técnica: {METALCON_CHECKED_AT}. La edición de cada fuente se indica en la ficha; no se afirma stock ni precio vigente. Los códigos MC son internos de SOLIS.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><label className="space-y-1 text-sm">Buscar<Input value={search} placeholder="Perfil 90, tornillo, placa…" onChange={e => { setSearch(e.target.value); setPage(0); }} /></label><label className="space-y-1 text-sm">Familia<select className={control} value={family} onChange={e => { setFamily(e.target.value); setPage(0); }}><option value="">Todas las familias</option>{[...new Set(METALCON_REFERENCES.map(ref => ref.family))].sort().map(value => <option key={value}>{value}</option>)}</select></label><label className="space-y-1 text-sm">Lista inicial editable<select className={control} value="" onChange={e => { const template = METALCON_TEMPLATES.find(t => t.id === e.target.value); if (!template) return; select([...template.codes]); setQuantities({}); setFamily(""); setSearch(""); setOnlySelected(true); setBundleName(template.name); }}><option value="">Elegir lista…</option>{METALCON_TEMPLATES.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label></div>
      <div className="flex flex-wrap items-center gap-2"><Button variant="outline" onClick={() => select([...new Set([...selected, ...filtered.map(ref => ref.code)])])}>Seleccionar filtrados</Button><Button variant="outline" onClick={() => { setOnlySelected(!onlySelected); setPage(0); }}>{onlySelected ? "Ver todas" : `Ver selección (${selected.length})`}</Button><Button variant="ghost" onClick={() => select([])}>Limpiar selección</Button><Button variant="outline" onClick={() => downloadFile(metalconCsv(selected.length ? METALCON_REFERENCES.filter(ref => selected.includes(ref.code)) : filtered), "Biblioteca_Metalcon_SOLIS_completar_precios.csv")}><Download />CSV para completar precios</Button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{visible.map(ref => {
        const item = catalog.find(item => normalizeCode(item.code) === ref.code), source = METALCON_SOURCES[ref.sourceId], checked = selected.includes(ref.code);
        return <article key={ref.code} className="min-w-0 space-y-3 rounded-xl border p-4">
          <label className="flex items-start gap-3 text-sm font-semibold"><input className="mt-1 size-5 shrink-0" type="checkbox" checked={checked} aria-label={`Seleccionar ${ref.name}`} onChange={e => select(e.target.checked ? [...selected, ref.code] : selected.filter(code => code !== ref.code))} /><span>{ref.name}</span></label>
          <p className="break-words text-xs text-slate-500">{ref.code} · {ref.family} · {ref.type}</p><p className="text-sm font-medium">{ref.presentation} · unidad de cobro: {ref.unit}</p><p className="text-xs leading-relaxed text-slate-600">{ref.scope}</p>
          <div className="text-xs text-slate-500">{source.url ? <a className="inline-flex items-center gap-1 text-blue-700 underline" href={source.url} target="_blank" rel="noreferrer">{source.label}<ExternalLink className="size-3" /></a> : source.label}<p className="mt-1">{source.edition}</p></div>
          {canWrite && checked && <div className="space-y-2 rounded-lg bg-slate-50 p-3">{item ? <p className="text-xs text-emerald-800">En su biblioteca: costo {money(item.unitCost, item.currency)} / venta {money(item.unitPrice, item.currency)} {item.currency} por {item.unit}. Se conservan sus valores.</p> : <label className="block space-y-1 text-xs">Su costo neto CLP por {ref.unit}<Input type="number" min="0.01" step="any" value={costs[ref.code] ?? ""} placeholder="Ingrese precio del proveedor" aria-label={`Costo neto ${ref.code}`} onChange={e => { setCosts({ ...costs, [ref.code]: e.target.value }); invalidate(); }} /></label>}<label className="block space-y-1 text-xs">Cantidad para el conjunto ({ref.unit})<Input type="number" min="0.000001" max="1000000" step="any" value={quantities[ref.code] ?? 1} aria-label={`Cantidad ${ref.code}`} onChange={e => setQuantities({ ...quantities, [ref.code]: Number(e.target.value) })} /></label></div>}
        </article>;
      })}</div>
      {!filtered.length && <p className="text-sm text-slate-500">No hay referencias para estos filtros.</p>}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500"><span>{filtered.length} referencias · página {page + 1} de {Math.max(1, Math.ceil(filtered.length / 12))}</span><div className="flex gap-2"><Button variant="outline" size="sm" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="outline" size="sm" disabled={(page + 1) * 12 >= filtered.length} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>
      {canWrite && <div className="space-y-4 rounded-xl border bg-blue-50 p-4">
        <h3 className="font-semibold">Agregar referencias con mis precios</h3><p className="text-xs">Ingrese costos netos por la unidad indicada, sin confundir barra, metro, plancha o caja. Se agregarán solo códigos nuevos. Para modificar uno existente use Editar en su biblioteca. El precio de venta se calcula desde su costo y el recargo elegido; podrá editarlo después.</p>
        <div className="grid gap-3 sm:grid-cols-3"><label className="space-y-1 text-xs">Recargo de venta (%)<Input type="number" min="0" max="500" value={markup} onChange={e => { setMarkup(Number(e.target.value)); invalidate(); }} /></label><label className="space-y-1 text-xs">Proveedor / trabajador<Input value={supplier} maxLength={180} onChange={e => { setSupplier(e.target.value); invalidate(); }} /></label><label className="space-y-1 text-xs">Fecha de sus precios<Input type="date" value={priceDate} onChange={e => { setPriceDate(e.target.value); invalidate(); }} /></label></div>
        <Button disabled={!online || busy || !selected.length} onClick={() => void runImport("preview")}>{busy && <Loader2 className="animate-spin" />}Validar antes de agregar</Button>
        {preview && summary && <div className="space-y-3 text-sm" role="status"><p>{summary.added} por agregar · {summary.skipped + preview.existing} existentes conservados · {summary.invalid} inválidos</p><ul className="max-h-48 overflow-y-auto text-xs">{preview.items.map(item => <li className="py-1" key={item.code}>{item.code} · costo neto {money(item.netCost ?? 0)} · venta neta {money(item.netPrice ?? 0)} · {item.errors.join("; ") || item.action}</li>)}</ul><Button disabled={!online || busy || !!summary.invalid || !summary.added} onClick={() => void runImport("commit")}>Confirmar {summary.added} referencias nuevas</Button></div>}
        <div className="space-y-3 border-t border-blue-200 pt-4"><h3 className="font-semibold">Guardar mi conjunto reutilizable</h3><p className="text-xs">Primero agregue las referencias a su biblioteca con precios propios. Revise las cantidades de la selección; se copiarán con sus precios actuales. Aplicar el conjunto a una cotización crea partidas independientes.</p><label className="block space-y-1 text-xs">Nombre del conjunto<Input maxLength={180} value={bundleName} onChange={e => setBundleName(e.target.value)} /></label><Button variant="outline" disabled={busy || !selected.length} onClick={() => void saveBundle()}>Guardar conjunto de {selected.length} ítems</Button></div>
      </div>}
      {!online && <p className="text-sm text-amber-800">Las referencias se pueden consultar offline. Agregar precios a la biblioteca requiere conexión. Un conjunto con referencias ya guardadas puede quedar en la cola de sincronización.</p>}
      {result && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-900">{result}</p>}
    </fieldset>}
  </section>;
}
