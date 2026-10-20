"use client";

import { useCallback, useEffect, useState } from "react";
import { Check, Download, ExternalLink, FileText, Loader2, Mail, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ACCOUNTING_STATUS, accountingCsv, accountingText, invoiceRecipientSchema, type AccountingPacket, type InvoiceRecipient } from "@/lib/accounting";
import { buildAccountingRequestPdf } from "@/lib/pdf-documents";
import { cachedApi } from "@/lib/offline-queue";
import { mailtoUrl } from "@/lib/sharing";
import { businessDate } from "@/lib/dates";

type AccountingData = { history: AccountingPacket[]; configured: boolean; accountantEmail: string; recipient: InvoiceRecipient; canManage: boolean };
const blankRecipient: InvoiceRecipient = { name: "", taxId: "", businessActivity: "", address: "", commune: "", city: "", email: "" };
export function AccountingPanel({ billingDocumentPublicId, online }: { billingDocumentPublicId: string; online: boolean }) {
  const [data, setData] = useState<AccountingData | null>(null);
  const [recipient, setRecipient] = useState<InvoiceRecipient>(blankRecipient);
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [requestId, setRequestId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [folio, setFolio] = useState("");
  const [issueDate, setIssueDate] = useState(businessDate());
  const [cancelReason, setCancelReason] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await cachedApi<AccountingData>(`/api/accounting?billingDocumentPublicId=${billingDocumentPublicId}`);
      setData(result); setRecipient(result.recipient); setEmail(result.accountantEmail);
    } catch (error) { setError(error instanceof Error ? error.message : "No fue posible cargar contabilidad."); }
    finally { setLoading(false); }
  }, [billingDocumentPublicId]);
  useEffect(() => { const timer = setTimeout(() => { setRequestId(crypto.randomUUID()); void load(); }, 0); return () => clearTimeout(timer); }, [load]);
  const packet = data?.history.find((item) => item.status !== "cancelled");
  const action = async (payload: Record<string, unknown>) => {
    setSaving(true);
    try {
      const response = await fetch("/api/accounting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string; packet?: AccountingPacket };
      if (!response.ok) throw new Error(result.error || "No se pudo completar la acción.");
      toast.success(payload.action === "send" ? "El servicio de correo aceptó el expediente." : payload.action === "record" ? "Folio registrado. Verifique el DTE emitido con su contador." : payload.action === "cancel" ? "Solicitud anulada. Puede preparar una nueva." : "Expediente preparado.");
      if (payload.action === "cancel") setRequestId(crypto.randomUUID());
      await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo completar la acción."); await load(); }
    finally { setSaving(false); }
  };
  const prepare = () => {
    const parsed = invoiceRecipientSchema.safeParse(recipient);
    if (!parsed.success) return void toast.error(`Revise el receptor: ${parsed.error.issues[0]?.path.join(" ")} · ${parsed.error.issues[0]?.message}`);
    void action({ action: "prepare", publicId: requestId, billingDocumentPublicId, recipient: parsed.data, accountantEmail: email, notes });
  };
  const download = (format: "pdf" | "json" | "csv") => {
    if (!packet) return;
    const content = format === "pdf" ? new Uint8Array(buildAccountingRequestPdf(packet)).buffer : format === "json" ? JSON.stringify(packet, null, 2) : accountingCsv(packet);
    const url = URL.createObjectURL(new Blob([content], { type: format === "pdf" ? "application/pdf" : format === "json" ? "application/json" : "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${packet.number}.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
  };
  return <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/40 p-4"><div className="flex items-start justify-between gap-3"><div><h3 className="flex items-center gap-2 font-semibold"><Mail className="size-4 text-blue-600" />Solicitar factura al contador</h3><p className="mt-1 text-xs leading-relaxed text-slate-500">Prepara los antecedentes de este cobro. La emisión del DTE se realiza en el sistema de facturación del contador.</p></div><Button size="sm" variant="ghost" disabled={loading || !online} onClick={() => void load()} aria-label="Actualizar expediente"><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
    {loading ? <Loader2 className="size-5 animate-spin" /> : error ? <p role="alert" className="text-xs text-amber-800">{error}</p> : packet ? <>
      <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-blue-900">{packet.number}</span><span className="rounded-full border bg-white px-2 py-1 text-xs">{ACCOUNTING_STATUS[packet.status]}</span></div>
      <div className="grid gap-2 text-xs sm:grid-cols-2"><p><strong>Receptor:</strong> {packet.recipient.name} · {packet.recipient.taxId}</p><p><strong>Contador:</strong> {packet.accountantEmail}</p><p><strong>Concepto:</strong> {packet.concept}</p><p><strong>Total solicitado:</strong> {packet.totalAmount.toLocaleString("es-CL")} CLP</p></div>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-xs font-semibold">Revisar el expediente antes de enviarlo</summary><pre className="mt-3 whitespace-pre-wrap font-sans text-xs leading-relaxed">{accountingText(packet)}</pre></details>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => download("pdf")}><FileText />PDF</Button><Button size="sm" variant="outline" onClick={() => download("csv")}><Download />CSV</Button><Button size="sm" variant="outline" onClick={() => download("json")}><Download />JSON</Button><Button size="sm" variant="outline" onClick={() => { try { window.location.href = mailtoUrl(packet.accountantEmail, `Solicitud de factura ${packet.number}`, accountingText(packet)); } catch (error) { toast.error(error instanceof Error ? error.message : "Revise el correo."); } }}><Mail />Abrir mi correo</Button>{data?.canManage && packet.status === "prepared" && <Button size="sm" disabled={!online || !data.configured || saving} onClick={() => void action({ action: "send", publicId: packet.publicId })}>{saving ? <Loader2 className="animate-spin" /> : <Mail />}Enviar con adjuntos</Button>}</div>
      <p className="text-xs text-slate-500">Al abrir su correo, adjunte los archivos descargados. El envío desde la plataforma adjunta PDF, CSV y JSON. {data && !data.configured && "El servicio de correo de Cloudflare todavía no está configurado."}</p>
      {packet.status === "email_uncertain" && <p role="alert" className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">Verifique el registro del servicio antes de hacer otro envío. El intento no se repetirá automáticamente.</p>}
      {packet.invoice ? <p className="rounded-lg bg-emerald-50 p-3 text-xs text-emerald-900">Folio {packet.invoice.folio} · {packet.invoice.issueDate} · Registrado por {packet.invoice.recordedBy}. Registro informado por el usuario; verificar con el DTE del contador.</p> : data?.canManage && <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-xs font-semibold">Registrar la factura recibida</summary><div className="mt-3 flex flex-wrap items-end gap-3"><label className="space-y-1 text-xs">Folio del DTE<Input value={folio} inputMode="numeric" onChange={(event) => setFolio(event.target.value)} placeholder="1234" /></label><label className="space-y-1 text-xs">Fecha de emisión<Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></label><Button size="sm" disabled={!online || saving || !folio} onClick={() => void action({ action: "record", publicId: packet.publicId, folio, issueDate })}><Check />Registrar folio</Button></div></details>}
      {data?.canManage && packet.status === "prepared" && <details className="text-xs"><summary className="cursor-pointer text-slate-500">Corregir una solicitud sin enviar</summary><div className="mt-2 flex gap-2"><Input value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} placeholder="Motivo de anulación" /><Button size="sm" variant="outline" disabled={!online || saving || cancelReason.trim().length < 5} onClick={() => void action({ action: "cancel", publicId: packet.publicId, reason: cancelReason })}>Anular solicitud</Button></div></details>}
    </> : data?.canManage ? <>
      <div className="grid gap-3 sm:grid-cols-2">{([
        ["name", "Razón social receptor"], ["taxId", "RUT receptor"], ["businessActivity", "Giro del receptor"], ["address", "Dirección"], ["commune", "Comuna"], ["city", "Ciudad"], ["email", "Correo del receptor"],
      ] as const).map(([key, label]) => <div key={key} className="space-y-1"><Label htmlFor={`invoice-${key}`} className="text-xs">{label}</Label><Input id={`invoice-${key}`} className="bg-white" value={recipient[key]} type={key === "email" ? "email" : "text"} onChange={(event) => setRecipient({ ...recipient, [key]: event.target.value })} /></div>)}<div className="space-y-1"><Label className="text-xs" htmlFor="invoice-accountant">Correo del contador</Label><Input id="invoice-accountant" className="bg-white" type="email" value={email} onChange={(event) => setEmail(event.target.value)} /></div></div>
      <div className="space-y-1"><Label className="text-xs" htmlFor="invoice-notes">Indicaciones para el contador</Label><textarea id="invoice-notes" value={notes} maxLength={2000} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border bg-white p-3 text-sm" /></div><Button size="sm" disabled={!online || saving || !email || !requestId} onClick={prepare}>{saving && <Loader2 className="animate-spin" />}Preparar solicitud</Button>
    </> : <p className="text-xs text-slate-500">Aún no se ha preparado una solicitud para este cobro.</p>}
    <a href="https://www.sii.cl/servicios_online/1039-1183.html" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-blue-700">Abrir facturación gratuita del SII<ExternalLink className="size-3" /></a>
  </div>;
}
