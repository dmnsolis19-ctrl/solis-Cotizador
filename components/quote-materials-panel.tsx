"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Mail, MessageCircle, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { materialGroupsSchema, supplierCsv, supplierMaterials, type MaterialGroup } from "@/lib/material-groups";
import { mailtoUrl, whatsappUrl } from "@/lib/sharing";
import { cachedApi, listOperations } from "@/lib/offline-queue";
import { buildSupplierInquiryPdf } from "@/lib/pdf-documents";
import { businessDate } from "@/lib/dates";

export function QuoteMaterialsPanel({ quotePublicId, quoteNumber, project, company }: { quotePublicId: string; quoteNumber: string; project: string; company: Record<string, unknown> }) {
  const [groups, setGroups] = useState<MaterialGroup[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [consolidate, setConsolidate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [currentProject, setCurrentProject] = useState(project);
  const [pending, setPending] = useState(false);
  const [prepared, setPrepared] = useState<{ file: File; url: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const operations = await listOperations().catch(() => []);
      const queued = operations.filter((operation) => ["quote.create", "quote.update"].includes(operation.type) && operation.payload.publicId === quotePublicId).at(-1);
      const result = queued ? { materialGroups: queued.payload.materialGroups, quote: { project: String(queued.payload.project || project) } } : await cachedApi<{ materialGroups?: MaterialGroup[]; quote?: { project: string } }>(`/api/quotes?publicId=${encodeURIComponent(quotePublicId)}`);
      const lists = materialGroupsSchema.parse(result.materialGroups || []);
      if (!cancelled) { setGroups(lists); setSelected(lists.map((group) => group.id)); setCurrentProject(result.quote?.project || project); setPending(Boolean(queued)); }
    })().catch((reason) => { if (!cancelled) setError(reason instanceof Error ? reason.message : "No fue posible cargar materiales."); }).finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [quotePublicId, project]);
  const exportKey = JSON.stringify([selected, consolidate, groups]);
  const sharedPdf = prepared?.url === exportKey ? prepared.file : null;
  const selectedGroups = groups.filter((group) => selected.includes(group.id));
  const makeFile = (format: "pdf" | "csv") => {
    const rows = supplierMaterials(selectedGroups, consolidate);
    const contents = format === "pdf" ? new Uint8Array(buildSupplierInquiryPdf({ company, number: `SC-${quoteNumber}`, project: currentProject, issueDate: businessDate(), rows })).buffer : supplierCsv(rows);
    return new File([contents], `SC_${quoteNumber.replace(/[^a-zA-Z0-9_-]/g, "_")}_Materiales.${format}`, { type: format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8" });
  };
  const download = (format: "pdf" | "csv") => {
    try { const file = makeFile(format); const url = URL.createObjectURL(file); const link = document.createElement("a"); link.href = url; link.download = file.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 2000); }
    catch { toast.error("No fue posible preparar la descarga."); }
  };
  const message = `Solicitamos su oferta para los materiales del proyecto, referencia ${quoteNumber}. Listas: ${selectedGroups.map((group) => group.title).join(", ")}. Favor indicar precios netos, moneda, impuestos, disponibilidad, plazo, despacho y vigencia. Se adjunta listado de materiales.`;
  const prepare = async () => {
    setPreparing(true); setPrepared(null);
    try { setPrepared({ file: makeFile("pdf"), url: exportKey }); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "No fue posible preparar el PDF."); } finally { setPreparing(false); }
  };
  const share = async () => {
    if (!sharedPdf) return;
    if (!navigator.canShare?.({ files: [sharedPdf] })) return toast.info("Descargue el PDF y adjúntelo al mensaje desde WhatsApp o su correo.");
    try { await navigator.share({ files: [sharedPdf], title: `Solicitud ${quoteNumber}`, text: message }); } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) toast.error("No fue posible compartir. Descargue y adjunte el PDF."); }
  };
  return <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/40 p-4">
    <div><strong className="text-sm">Solicitar precios a proveedores</strong><p className="mt-1 text-xs text-slate-600">Seleccione listas de esta revisión. El PDF y CSV omiten costos internos y precios de venta. También se generan sin conexión con los datos guardados en este equipo.</p>{pending && <p className="mt-1 text-xs text-amber-800">Incluye cambios locales pendientes de sincronizar. Revise la cola antes de solicitar precios.</p>}</div>
    {loading ? <p className="text-xs"><Loader2 className="mr-1 inline size-3 animate-spin" />Cargando listas…</p> : error ? <p role="alert" className="text-xs text-red-700">{error}</p> : !groups.length ? <p className="text-xs text-slate-500">Agregue listas de materiales al editar el borrador.</p> : <>
      <div className="space-y-2">{groups.map((group) => <label key={group.id} className="flex items-center gap-2 text-xs"><input type="checkbox" checked={selected.includes(group.id)} onChange={(event) => { setPrepared(null); setSelected((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id)); }} />{group.title} · {group.materials.length} materiales</label>)}</div>
      <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={consolidate} onChange={(event) => { setPrepared(null); setConsolidate(event.target.checked); }} />Consolidar artículos con igual código, descripción, especificación, marca y unidad</label>
      <div className="flex flex-wrap gap-2">{(["pdf", "csv"] as const).map((format) => <Button key={format} type="button" size="sm" variant="outline" disabled={!selected.length} onClick={() => download(format)}><Download />{format === "csv" ? "CSV para Excel" : "PDF proveedor"}</Button>)}</div>
      <Input aria-label="Correo del proveedor" placeholder="Correo del proveedor" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      <Input aria-label="WhatsApp del proveedor" placeholder="WhatsApp con código de país" type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} />
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={!selected.length} onClick={() => { try { window.location.href = mailtoUrl(email, `Solicitud de precios · ${quoteNumber}`, message); } catch (reason) { toast.error((reason as Error).message); } }}><Mail />Preparar correo</Button><Button size="sm" variant="outline" disabled={!selected.length} onClick={() => { try { window.open(whatsappUrl(phone, message), "_blank", "noopener,noreferrer"); } catch (reason) { toast.error((reason as Error).message); } }}><MessageCircle />WhatsApp</Button><Button size="sm" variant="outline" disabled={!selected.length || preparing} onClick={sharedPdf ? share : prepare}>{preparing ? <Loader2 className="animate-spin" /> : <Share2 />}{sharedPdf ? "Compartir PDF" : "Preparar PDF para compartir"}</Button></div>
      <p className="text-xs text-slate-500">El correo y WhatsApp se abren con texto preparado. Adjunte el archivo descargado antes de enviarlo. Compartir archivos depende del dispositivo; abrir un chat no confirma el envío.</p>
    </>}
  </div>;
}
