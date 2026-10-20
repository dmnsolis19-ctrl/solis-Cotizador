"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyMaterial, emptyMaterialGroup, MATERIAL_TEMPLATES, materialGroupCost, materialGroupPrice, pendingMaterialPrices, type Material, type MaterialGroup } from "@/lib/material-groups";
import type { EconomicInput } from "@/lib/pricing";
import { businessDate } from "@/lib/dates";

type CatalogOption = { publicId: string; code: string; name: string; description: string; type: string; currency: string; unit: string; unitCost: string; supplier: string };
const selectClass = "h-10 w-full rounded-md border bg-white px-3 text-sm";
function money(value: number, currency: string) { return currency === "UF" ? `${value.toLocaleString("es-CL", { maximumFractionDigits: 2 })} UF` : new Intl.NumberFormat("es-CL", { style: "currency", currency, maximumFractionDigits: currency === "CLP" ? 0 : 2 }).format(value); }

export function MaterialGroupsEditor({ groups, onChange, catalog, currency, economic }: { groups: MaterialGroup[]; onChange: (groups: MaterialGroup[]) => void; catalog: CatalogOption[]; currency: string; economic: EconomicInput }) {
  const [template, setTemplate] = useState<keyof typeof MATERIAL_TEMPLATES>("solar");
  const update = (id: string, changes: Partial<MaterialGroup>) => onChange(groups.map((group) => group.id === id ? { ...group, ...changes } : group));
  const updateMaterial = (group: MaterialGroup, id: string, changes: Partial<Material>) => update(group.id, { materials: group.materials.map((item) => item.id === id ? { ...item, ...changes } : item) });
  const move = (index: number, delta: number) => { const next = [...groups]; const target = index + delta; if (target < 0 || target >= next.length) return; [next[index], next[target]] = [next[target], next[index]]; onChange(next); };
  const available = catalog.filter((item) => item.currency === currency && item.type.toLowerCase().includes("material"));

  return <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/30 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="font-semibold">Listas de materiales y partidas globales</h3><p className="mt-1 text-xs text-slate-600">El desglose es interno. Cada lista genera una sola partida comercial; los costos se suman automáticamente.</p></div>
      <Button type="button" variant="outline" onClick={() => onChange([...groups, emptyMaterialGroup()])} disabled={groups.length >= 30}><Plus /> Nueva lista</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Plantilla de materiales" className={`${selectClass} sm:w-64`} value={template} onChange={(event) => setTemplate(event.target.value as keyof typeof MATERIAL_TEMPLATES)}>{Object.entries(MATERIAL_TEMPLATES).map(([key, value]) => <option key={key} value={key}>{value.name}</option>)}</select>
      <Button type="button" variant="outline" disabled={groups.length + MATERIAL_TEMPLATES[template].titles.length > 30} onClick={() => onChange([...groups, ...MATERIAL_TEMPLATES[template].titles.map((title) => emptyMaterialGroup(title))])}>Agregar estructura</Button>
      <span className="text-xs text-slate-500">Las estructuras se completan con los materiales reales del proyecto.</span>
    </div>
    {!groups.length && <p className="rounded-lg border border-dashed p-5 text-center text-sm text-slate-500">Cree listas para corriente alterna, corriente continua, tableros u otros suministros.</p>}
    {groups.map((group, index) => {
      let price = 0; let priceError = "";
      try { price = materialGroupPrice(group, economic); } catch (error) { priceError = error instanceof Error ? error.message : "Revise el cálculo."; }
      const pending = pendingMaterialPrices([group]);
      return <div key={group.id} className="space-y-4 rounded-xl border bg-white p-4">
        <div className="flex items-center justify-between gap-2"><strong className="text-sm">Lista {index + 1} · {group.title}</strong><div className="flex gap-1">
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Subir lista" disabled={!index} onClick={() => move(index, -1)}><ArrowUp /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Bajar lista" disabled={index === groups.length - 1} onClick={() => move(index, 1)}><ArrowDown /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label="Duplicar lista" disabled={groups.length >= 30} onClick={() => onChange([...groups, { ...group, id: crypto.randomUUID(), title: `${group.title} (copia)`, materials: group.materials.map((item) => ({ ...item, id: crypto.randomUUID() })) }])}><Copy /></Button>
          <Button type="button" size="icon-sm" variant="ghost" aria-label={`Eliminar lista ${group.title}`} onClick={() => onChange(groups.filter((item) => item.id !== group.id))}><Trash2 /></Button>
        </div></div>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">Título interno<Input aria-label={`Título interno lista ${index + 1}`} maxLength={180} value={group.title} onChange={(event) => update(group.id, { title: event.target.value })} /></label>
          <label className="space-y-1 text-xs font-medium">Título visible en la cotización del cliente<Input aria-label={`Título comercial lista ${index + 1}`} maxLength={240} value={group.customerTitle} onChange={(event) => update(group.id, { customerTitle: event.target.value })} /></label>
          <label className="space-y-1 text-xs font-medium md:col-span-2">Alcance comercial del suministro<Input value={group.detail} maxLength={2000} onChange={(event) => update(group.id, { detail: event.target.value })} placeholder="Ej.: Suministro de conductores, canalizaciones y protecciones" /></label>
        </div>
        <div className="space-y-3">
          {group.materials.map((item, materialIndex) => <div key={item.id} className="rounded-lg border bg-slate-50 p-3">
            <div className="grid items-end gap-2 sm:grid-cols-2 lg:grid-cols-[100px_1fr_90px_75px_125px_140px_35px]">
              <label className="space-y-1 text-xs">Código<Input value={item.code} maxLength={80} onChange={(event) => updateMaterial(group, item.id, { code: event.target.value })} /></label>
              <label className="space-y-1 text-xs">Material<Input aria-label={`Material ${materialIndex + 1} lista ${index + 1}`} value={item.description} maxLength={240} onChange={(event) => updateMaterial(group, item.id, { description: event.target.value })} /></label>
              <label className="space-y-1 text-xs">Cantidad<Input type="number" min="0.000001" max="1000000" step="any" value={item.quantity} onChange={(event) => updateMaterial(group, item.id, { quantity: Number(event.target.value) })} /></label>
              <label className="space-y-1 text-xs">Unidad<Input value={item.unit} maxLength={40} onChange={(event) => updateMaterial(group, item.id, { unit: event.target.value })} /></label>
              <label className="space-y-1 text-xs text-blue-800">Costo unitario neto<Input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => updateMaterial(group, item.id, { unitCost: Number(event.target.value), priceStatus: "pending", priceDate: "" })} /></label>
              <label className="space-y-1 text-xs">Precio<select className={selectClass} value={item.priceStatus} onChange={(event) => updateMaterial(group, item.id, { priceStatus: event.target.value as Material["priceStatus"], priceDate: event.target.value === "confirmed" ? item.priceDate || businessDate() : item.priceDate })}><option value="pending">Por confirmar</option><option value="confirmed">Confirmado</option></select></label>
              <Button type="button" size="icon-sm" variant="ghost" aria-label="Eliminar material" disabled={group.materials.length === 1} onClick={() => update(group.id, { materials: group.materials.filter((material) => material.id !== item.id) })}><Trash2 /></Button>
            </div>
            <details className="mt-2 text-xs text-slate-600"><summary className="cursor-pointer">Especificación, marca y proveedor · Subtotal {money(item.quantity * item.unitCost, currency)}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="space-y-1">Especificación técnica<Input maxLength={600} value={item.specification} placeholder="Sección, tensión, capacidad, referencia…" onChange={(event) => updateMaterial(group, item.id, { specification: event.target.value })} /></label>
              <label className="space-y-1">Marca / modelo<Input maxLength={120} value={item.brand} onChange={(event) => updateMaterial(group, item.id, { brand: event.target.value })} /></label>
              <label className="space-y-1">Proveedor de referencia<Input maxLength={180} value={item.supplier} onChange={(event) => updateMaterial(group, item.id, { supplier: event.target.value })} /></label>
              <label className="space-y-1">Fecha del precio<Input type="date" value={item.priceDate} onChange={(event) => updateMaterial(group, item.id, { priceDate: event.target.value })} /></label>
            </div></details>
          </div>)}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={group.materials.length >= 200} onClick={() => update(group.id, { materials: [...group.materials, emptyMaterial()] })}><Plus /> Material manual</Button>
          <select aria-label={`Agregar material de biblioteca a ${group.title}`} className={`${selectClass} sm:max-w-lg`} value="" disabled={group.materials.length >= 200} onChange={(event) => {
            const source = available.find((entry) => entry.publicId === event.target.value); if (!source) return;
            const current = group.materials.length === 1 && group.materials[0].description === "Nuevo material" && !group.materials[0].code && group.materials[0].unitCost === 0 ? [] : group.materials;
            update(group.id, { materials: [...current, { ...emptyMaterial(), catalogItemPublicId: source.publicId, code: source.code, description: source.name, specification: source.description, quantity: 1, unit: source.unit, unitCost: Number(source.unitCost), supplier: source.supplier, priceStatus: "pending" }] });
          }}><option value="">Agregar desde biblioteca ({currency})…</option>{available.map((entry) => <option key={entry.publicId} value={entry.publicId}>{entry.code} · {entry.name}</option>)}</select>
        </div>
        <div className="grid items-end gap-3 rounded-lg bg-blue-50 p-3 sm:grid-cols-3">
          <div className="space-y-1"><Label>Precio de venta del grupo</Label><select className={selectClass} value={group.pricingMode} onChange={(event) => update(group.id, { pricingMode: event.target.value as MaterialGroup["pricingMode"] })}><option value="markup">Costo + recargo (%)</option><option value="margin">Margen sobre venta (%)</option><option value="manual">Precio manual</option><option value="cost">Igual al costo</option></select></div>
          {(group.pricingMode === "margin" || group.pricingMode === "markup") && <label className="space-y-1 text-xs">{group.pricingMode === "margin" ? "Margen objetivo (%)" : "Recargo sobre costo (%)"}<Input type="number" min="0" max="99" step="0.1" value={group.pricingPercent} onChange={(event) => update(group.id, { pricingPercent: Number(event.target.value) })} /></label>}
          {group.pricingMode === "manual" && <label className="space-y-1 text-xs">Venta neta antes del descuento<Input type="number" min="0" step="0.01" value={group.salePrice} onChange={(event) => update(group.id, { salePrice: Number(event.target.value) })} /></label>}
          <div className="text-sm"><div className="text-blue-800">Costo: <strong>{money(materialGroupCost(group), currency)}</strong></div><div>Venta: <strong>{money(price, currency)}</strong></div></div>
          <p className="text-xs text-slate-600 sm:col-span-3">{group.pricingMode === "margin" ? "El margen incorpora gastos generales, contingencia y el descuento global configurados." : "El precio de venta recibe después el descuento global y el IVA de la cotización."} {pending > 0 && <span className="font-semibold text-amber-800">{pending} precio(s) por confirmar. Puede guardar el borrador y solicitar precios.</span>} {priceError && <span role="alert" className="text-red-700">{priceError}</span>}</p>
        </div>
        <div className="rounded-lg border border-dashed p-3 text-xs"><span className="text-slate-500">Vista del cliente: </span><strong>{group.customerTitle || "Defina el título comercial"}</strong> · 1 gl · {money(price, currency)}</div>
      </div>;
    })}
  </div>;
}
