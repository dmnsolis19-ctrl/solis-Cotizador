"use client";

import { useMemo, useState } from "react";
import { Check, Download, ExternalLink, LibraryBig, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CHILE_PRICE_REFERENCES, priceReferenceExpired, referenceUnitCost, referencesCsv } from "@/lib/price-reference";

const money = (value: number) => new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", maximumFractionDigits: 2 }).format(value);
export function PriceReferencePanel({ online, canImport, existingCodes, onImported }: { online: boolean; canImport: boolean; existingCodes: string[]; onImported(): void }) {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [markup, setMarkup] = useState(30);
  const [unknownVat, setUnknownVat] = useState<"" | "included" | "excluded">("");
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(0);
  const filtered = useMemo(() => CHILE_PRICE_REFERENCES.filter((row) => (!category || row.category === category) && `${row.name} ${row.code} ${row.supplier}`.toLowerCase().includes(search.toLowerCase())), [search, category]);
  const visible = filtered.slice(page * 20, page * 20 + 20);
  const download = () => { const url = URL.createObjectURL(new Blob([referencesCsv(filtered)], { type: "text/csv;charset=utf-8" })); const a = document.createElement("a"); a.href = url; a.download = "Precios_electricos_Chile_2026-10-20.csv"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); };
  const importSelected = async () => {
    const codes = selected.filter((code) => !existingCodes.includes(code));
    if (!codes.length) return;
    if (!unknownVat && codes.some((code) => CHILE_PRICE_REFERENCES.find((row) => row.code === code)?.priceIncludesVat === null)) return void toast.error("Confirme si los precios con IVA pendiente lo incluyen o son netos.");
    setSaving(true); let inserted = 0;
    try {
      for (let i = 0; i < codes.length; i += 100) {
        const response = await fetch("/api/catalog-reference", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codes: codes.slice(i, i + 100), markupPercent: markup, ...(unknownVat ? { unknownVat } : {}) }) });
        const body = await response.json() as { error?: string; inserted: number }; if (!response.ok) throw new Error(body.error); inserted += body.inserted;
      }
      toast.success(`${inserted} materiales agregados. Los precios existentes se conservan.`); setSelected([]); onImported();
    } catch (error) { toast.error(`${inserted ? `${inserted} agregados. ` : ""}${error instanceof Error ? error.message : "No se pudo completar la importación."}`); if (inserted) onImported(); }
    finally { setSaving(false); }
  };
  return <div className="rounded-2xl border border-blue-200 bg-white shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-t-2xl bg-blue-50 p-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-blue-600 p-2.5 text-white"><LibraryBig className="size-5" /></div><div><h2 className="font-bold text-blue-950">Catálogo eléctrico de Chile</h2><p className="mt-1 text-xs text-blue-800">{CHILE_PRICE_REFERENCES.length} referencias · CLP · consultadas el 20/10/2026 · fuentes públicas</p></div></div><div className="flex gap-2"><Button variant="outline" size="sm" onClick={download}><Download />CSV</Button><Button size="sm" onClick={() => setExpanded(!expanded)}>{expanded ? "Contraer" : "Explorar precios"}</Button></div></div>
    {expanded && <div className="space-y-4 p-5"><p className="text-xs leading-relaxed text-slate-600">Precios de consulta, sin despacho y sujetos a stock. El costo interno usa el valor neto por unidad de uso. Una bolsa o rollo se divide por su cantidad indicada; el proveedor puede exigir la presentación completa. AC y DC se mantienen separados. Confirme especificaciones y compatibilidad antes de suministrar.</p>
      <div className="flex flex-wrap gap-2"><div className="relative min-w-48 flex-1"><Search className="absolute left-3 top-3 size-4 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => { setSearch(event.target.value); setPage(0); }} placeholder="Cable 6 mm, EMT, tablero…" aria-label="Buscar referencias" /></div><select aria-label="Familia de materiales" className="rounded-md border bg-white px-3 text-sm" value={category} onChange={(event) => { setCategory(event.target.value); setPage(0); }}><option value="">Todas las familias</option>{[...new Set(CHILE_PRICE_REFERENCES.map((row) => row.category))].sort().map((value) => <option key={value}>{value}</option>)}</select><Button variant="outline" onClick={() => setSelected([...new Set([...selected, ...filtered.filter((row) => !existingCodes.includes(row.code)).map((row) => row.code)])])}>Seleccionar filtrados</Button><Button variant="ghost" onClick={() => setSelected([])}>Limpiar selección</Button></div>
      <div className="overflow-x-auto rounded-lg border"><table className="w-full text-left text-xs"><thead><tr><th className="p-3">Elegir</th><th className="min-w-64 p-3">Material / fuente</th><th className="p-3">Presentación</th><th className="p-3 text-right">Precio publicado</th><th className="p-3 text-right">Neto / unidad</th></tr></thead><tbody>{visible.map((row) => { const cost = referenceUnitCost(row); const exists = existingCodes.includes(row.code); return <tr key={row.code} className="border-t"><td className="p-3">{exists ? <Check className="size-4 text-emerald-600" aria-label="Ya importado" /> : <input type="checkbox" aria-label={`Seleccionar ${row.name}`} checked={selected.includes(row.code)} onChange={(event) => setSelected(event.target.checked ? [...selected, row.code] : selected.filter((code) => code !== row.code))} />}</td><td className="p-3"><div className="font-semibold">{row.name}</div><div className="mt-1 text-slate-500">{row.category} · {row.code}</div><a href={row.sourceUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-blue-600">{row.supplier}<ExternalLink className="size-3" /></a>{row.notes && <div className="mt-1 max-w-md text-[11px] text-amber-800">{row.notes}</div>}{priceReferenceExpired(row.checkedAt) && <span className="ml-2 text-amber-700">Precio con más de 30 días</span>}</td><td className="p-3">{row.packageQuantity} {row.unit}</td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(row.publishedPrice)}<div className="mt-1 font-normal text-slate-500">{row.priceIncludesVat === null ? "Confirmar IVA" : row.priceIncludesVat ? "IVA incluido" : "Neto"}</div></td><td className="whitespace-nowrap p-3 text-right">{cost === null ? "Por confirmar" : money(cost)} / {row.unit}</td></tr>; })}</tbody></table></div>
      <div className="flex items-center justify-between text-xs text-slate-500"><span>{filtered.length} referencias · página {page + 1} de {Math.max(1, Math.ceil(filtered.length / 20))}</span><div className="flex gap-2"><Button size="sm" variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>Anterior</Button><Button size="sm" variant="outline" disabled={(page + 1) * 20 >= filtered.length} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>
      {canImport && <div className="flex flex-wrap items-end gap-3 rounded-xl bg-slate-50 p-4"><label className="space-y-1 text-xs">Recargo de venta (%)<Input type="number" className="w-28 bg-white" min={0} max={500} value={markup} onChange={(event) => setMarkup(Number(event.target.value))} /></label><label className="space-y-1 text-xs">Si la fuente no informa IVA<select className="block h-10 rounded-md border bg-white px-3" value={unknownVat} onChange={(event) => setUnknownVat(event.target.value as typeof unknownVat)}><option value="">Dejar sin resolver</option><option value="included">Confirmé que incluye IVA</option><option value="excluded">Confirmé que es neto</option></select></label><Button disabled={!online || saving || !selected.length} onClick={() => void importSelected()}>{saving && <Loader2 className="animate-spin" />}Agregar {selected.length || ""} a mi biblioteca</Button><p className="w-full text-xs text-slate-500">El recargo se aplica al costo neto. Los materiales quedan como referencia y requieren confirmación al congelar una cotización.</p></div>}
    </div>}
  </div>;
}
