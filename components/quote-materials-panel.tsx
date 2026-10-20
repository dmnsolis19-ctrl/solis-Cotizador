"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { MaterialGroup } from "@/lib/material-groups";
import { mailtoUrl, whatsappUrl } from "@/lib/sharing";

export function QuoteMaterialsPanel({ quotePublicId, quoteNumber }: { quotePublicId: string; quoteNumber: string }) {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [consolidate, setConsolidate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [prepared, setPrepared] = useState<{ file: File; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/quotes?publicId=${encodeURIComponent(quotePublicId)}`, { signal: controller.signal }).then(async (response) => { const result = await response.json() as { materialGroups?: MaterialGroup[]; error?: string }; if (!response.ok) throw new Error(result.error || "No fue posible cargar las listas."); return result; }).then((result) => { setGroups(result.materialGroups || []); setSelected((result.materialGroups || []).map((group: MaterialGroup) => group.id)); }).catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "No fue posible cargar materiales."); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [quotePublicId]);
  const exportUrl = (format: "pdf" | "csv") => `/api/quote-materials?${new URLSearchParams({ publicId: quotePublicId, format, listIds: selected.join(","), consolidate: String(consolidate) })}`;
  const sharedPdf = prepared?.url === exportUrl("pdf") ? prepared.file : null;
  const selectedGroups = groups.filter((group) => selected.includes(group.id));
  const message = `Solicitamos su oferta para los materiales del proyecto, referencia ${quoteNumber}. Listas: ${selectedGroups.map((group) => group.title).join(", ")}. Favor indicar precios netos, moneda, impuestos, disponibilidad, plazo, despacho y vigencia. Se adjunta listado de materiales.`;
  const prepare = async () => {
    setPreparing(true); setPrepared(null);
    try { const url = exportUrl("pdf"); const response = await fetch(url); if (!response.ok) { const result = await response.json() as { error?: string }; throw new Error(result.error || "No fue posible exportar el PDF."); } setPrepared({ file: new File([await response.blob()], `SC_${quoteNumber}_Materiales.pdf`, { type: "application/pdf" }), url }); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "No fue posible preparar el PDF."); } finally { setPreparing(false); }
  };
  const share = async () => {
    if (!sharedPdf) return;
    if (!navigator.canShare?.({ files: [sharedPdf] })) return toast.info("Descargue el PDF y adjúntelo al mensaje desde WhatsApp o su correo.");
    try { await navigator.share({ files: [sharedPdf], title: `Solicitud ${quoteNumber}`, text: message }); } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) toast.error("No fue posible compartir. Descargue y adjunte el PDF."); }
  };
  return <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
    <div><strong className="text-sm">Solicitar precios a proveedores</strong><p className="mt-1 text-xs text-slate-600">Seleccione listas de esta revisión. El PDF y CSV omiten costos internos y precios de venta.</p></div>
    {loading ? <p className="text-xs"><Loader2 className="mr-1 inline size-3 animate-spin" />Cargando listas…</p> : error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !groups.length ? <p className="text-xs text-slate-500">Agregue listas de materiales al editar el borrador.</p> : <>
      <div className="space-y-2">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(group.id)} onChange={(event) => { setPrepared(null); setSelected((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id)); }} />{group.title} · {group.materials.length} materiales</label>)}</div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={consolidate} onChange={(event) => { setPrepared(null); setConsolidate(event.target.checked); }} />Consolidar artículos con igual código, descripción, especificación, marca y unidad</label>
      <div className="flex flex-wrap gap-2">{(["pdf", "csv"] as const).map((format) => <Button key={format} type="button" size="sm" variant="outline" disabled={!selected.length} asChild={selected.length > 0}>{selected.length ? <a href={exportUrl(format)} download><Download />{format === "csv" ? "CSV para Excel" : "PDF proveedor"}</a> : <span>{format.toUpperCase()}</span>}</Button>)}</div>
      <Input aria-label="Correo del proveedor" placeholder="Correo del proveedor" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input aria-label="WhatsApp del proveedor" placeholder="WhatsApp con código de país" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!selected.length} onClick={() => { try { window.location.href = mailtoUrl(email, `Solicitud de precios · ${quoteNumber}`, message); } catch (reason) { toast.error((reason as Error).message); } }}><Mail />Preparar correo</Button><Button size="sm" variant="outline" disabled={!selected.length} onClick={() => { try { window.open(whatsappUrl(phone, message), "_blank", "noopener,noreferrer"); } catch (reason) { toast.error((reason as Error).message); } }}><MessageCircle />WhatsApp</Button><Button size="sm" variant="outline" disabled={!selected.length || preparing} onClick={sharedPdf ? share : prepare}>{preparing ? <Loader2 className="animate-spin" /> : <Share2 />}{sharedPdf ? "Compartir PDF" : "Preparar PDF para compartir"}</Button></div>
      <p className="text-xs text-slate-500">El correo y WhatsApp se abren con texto preparado. Adjunte el archivo descargado antes de enviarlo. Compartir archivos depende del dispositivo; abrir un chat no confirma el envío.</p>
    </>}
  </div>;
}
