"use client";

import { useState } from "react";
import { Download, Loader2, Mail, MessageCircle, Send, Share2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { mailtoUrl, whatsappUrl } from "@/lib/sharing";

type Delivery = { configured: boolean; to: string; phone: string; subject: string; body: string; quoteNumber: string };
export function DocumentShare({ documentId, fileName }: { documentId: string; fileName: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Delivery | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);
  const [deliveryId, setDeliveryId] = useState("");
  const [sent, setSent] = useState(false);
  const [reviewed, setReviewed] = useState(false);
  const update = (changes: Partial<Delivery>) => { setData((current) => current ? { ...current, ...changes } : current); setDeliveryId(crypto.randomUUID()); setSent(false); setReviewed(false); };
  const prepare = async () => {
    setOpen(true); setLoading(true); setData(null); setFile(null); setReviewed(false);
    if (!deliveryId) setDeliveryId(crypto.randomUUID());
    try {
      const response = await fetch(`/api/document-delivery?documentId=${encodeURIComponent(documentId)}`);
      const result = await response.json() as Delivery & { error?: string }; if (!response.ok) throw new Error(result.error || "No fue posible preparar el envío.");
      setData(result);
      const pdf = await fetch(`/api/documents/${encodeURIComponent(documentId)}`); if (!pdf.ok) throw new Error("No fue posible preparar el PDF.");
      setFile(new File([await pdf.blob()], fileName, { type: "application/pdf" }));
    } catch (reason) { toast.error(reason instanceof Error ? reason.message : "No fue posible preparar el envío."); } finally { setLoading(false); }
  };
  const send = async () => {
    if (!data || !reviewed || sent) return;
    setWorking(true);
    try { const response = await fetch("/api/document-delivery", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId, deliveryId, to: data.to, subject: data.subject, body: data.body }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error || "No fue posible confirmar el envío."); setSent(true); toast.success("El servicio de correo aceptó el envío. La entrega final se verifica en sus registros."); }
    catch (reason) { toast.error(reason instanceof Error ? reason.message : "No fue posible confirmar el envío."); } finally { setWorking(false); }
  };
  const share = async () => {
    if (!file || !data) return;
    if (!navigator.canShare?.({ files: [file] })) return toast.info("Este dispositivo no permite compartir archivos directamente. Descargue el PDF y adjúntelo al mensaje.");
    try { await navigator.share({ files: [file], title: data.subject, text: data.body }); } catch (reason) { if (!(reason instanceof DOMException && reason.name === "AbortError")) toast.error("No fue posible compartir. Descargue el PDF para adjuntarlo."); }
  };
  return <>
    <Button size="icon-sm" variant="outline" onClick={prepare} aria-label={`Compartir ${fileName}`}><Share2 /></Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle>Compartir cotización</DialogTitle><DialogDescription>{fileName} · Se comparte esta versión del PDF comercial.</DialogDescription></DialogHeader>
      {loading ? <p className="flex items-center gap-2 py-8 text-sm"><Loader2 className="animate-spin" />Preparando documento…</p> : data ? <div className="space-y-3">
        <label className="block space-y-1 text-xs">Correo del destinatario<Input type="email" maxLength={254} value={data.to} onChange={(event) => update({ to: event.target.value })} /></label>
        <label className="block space-y-1 text-xs">WhatsApp con código de país<Input type="tel" value={data.phone} onChange={(event) => update({ phone: event.target.value })} /></label>
        <label className="block space-y-1 text-xs">Asunto<Input maxLength={200} value={data.subject} onChange={(event) => update({ subject: event.target.value })} /></label>
        <label className="block space-y-1 text-xs">Mensaje<textarea maxLength={5000} className="min-h-32 w-full rounded-md border p-3 text-sm" value={data.body} onChange={(event) => update({ body: event.target.value })} /></label>
        <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" asChild><a href={`/api/documents/${documentId}`} download={fileName}><Download />Descargar PDF</a></Button><Button size="sm" variant="outline" disabled={!file} onClick={share}><Share2 />Compartir archivo</Button><Button size="sm" variant="outline" onClick={() => { try { window.open(whatsappUrl(data.phone, data.body), "_blank", "noopener,noreferrer"); } catch (reason) { toast.error((reason as Error).message); } }}><MessageCircle />WhatsApp</Button><Button size="sm" variant="outline" onClick={() => { try { window.location.href = mailtoUrl(data.to, data.subject, data.body); } catch (reason) { toast.error((reason as Error).message); } }}><Mail />Preparar correo</Button></div>
        <p className="text-xs text-slate-500">WhatsApp y el correo preparado requieren adjuntar el PDF manualmente, salvo que use Compartir archivo. Los enlaces privados de la plataforma no se envían al cliente.</p>
        {data.configured ? <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3"><p className="text-xs">Envío directo con el PDF adjunto: revise destinatario, mensaje y archivo antes de enviar.</p><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />Revisé los datos y autorizo este envío</label><Button disabled={!reviewed || !file || working || sent} onClick={send}>{working ? <Loader2 className="animate-spin" /> : <Send />}{sent ? "Aceptado por el servicio" : "Enviar correo con PDF"}</Button></div> : <p className="rounded-lg bg-slate-100 p-3 text-xs text-slate-600">El envío directo requiere configurar el servicio de correo de la empresa. Puede usar las opciones de compartir y preparar correo.</p>}
      </div> : <p role="alert" className="py-5 text-sm text-red-700">No fue posible cargar el documento. Cierre la ventana y vuelva a intentarlo.</p>}
    </DialogContent></Dialog>
  </>;
}
