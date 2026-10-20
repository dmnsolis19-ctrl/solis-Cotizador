"use client";

import { useState } from "react";
import Image from "next/image";
import { Building2, Check, Loader2, Mail, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { companyFormValues, companySettingsSchema } from "@/lib/company-settings";

export function CompanySettingsPanel({ company, updatedAt, online, onSaved }: { company: Record<string, unknown>; updatedAt: string; online: boolean; onSaved(): void }) {
  const [form, setForm] = useState(() => companyFormValues(company));
  const [saving, setSaving] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size > 5 * 1024 * 1024) return void toast.error("Use PNG, JPEG o WebP de hasta 5 MB.");
    const url = URL.createObjectURL(file);
    try {
      const img = new window.Image(); img.src = url; await img.decode();
      const factor = Math.min(1, 720 / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * factor); canvas.height = Math.round(img.height * factor);
      const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("No fue posible preparar el logo.");
      ctx.fillStyle = "white"; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", 0.86);
      if (data.length > 350000) throw new Error("El logo contiene demasiado detalle. Use una imagen más pequeña.");
      setForm((current) => ({ ...current, logo_jpeg: data })); setLogoFailed(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible leer el logo."); }
    finally { URL.revokeObjectURL(url); }
  };
  const save = async () => {
    const valid = companySettingsSchema.safeParse(form);
    if (!valid.success) return void toast.error(valid.error.issues[0]?.message || "Revise los datos.");
    setSaving(true);
    try {
      const response = await fetch("/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company: valid.data, expectedUpdatedAt: updatedAt }) });
      const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error);
      toast.success("Identidad y datos de empresa actualizados."); onSaved();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo guardar."); }
    finally { setSaving(false); }
  };
  return <section className="space-y-6">
    <div><div className="mb-2 text-xs font-bold uppercase tracking-widest text-blue-600">Administración</div><h1 className="text-3xl font-bold tracking-tight">Tu empresa</h1><p className="mt-2 text-sm text-slate-500">Identidad visual, documentos comerciales y contacto de contabilidad.</p></div>
    <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
      <div className="self-start rounded-2xl border bg-white p-6 shadow-sm"><div className="flex h-44 items-center justify-center rounded-xl border bg-slate-50">{logoFailed ? <Building2 className="size-14 text-blue-600" /> : <Image unoptimized src={form.logo_jpeg || "/solis-logo.png"} alt="Logo de la empresa" width={180} height={180} className="h-36 w-44 object-contain" onError={() => setLogoFailed(true)} />}</div><Label className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-lg border p-3 text-sm"><Upload className="size-4" />Cambiar logo<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => void uploadLogo(event.target.files?.[0])} /></Label><Button variant="ghost" className="mt-2 w-full" onClick={() => { setForm({ ...form, logo_jpeg: "" }); setLogoFailed(false); }}>Restaurar SOLIS</Button><p className="mt-4 text-xs leading-relaxed text-slate-500">El logo se incluye en la aplicación y en los nuevos PDF. Las versiones ya emitidas conservan su formato original.</p></div>
      <div className="rounded-2xl border bg-white p-6 shadow-sm"><h2 className="mb-5 flex items-center gap-2 font-semibold"><Building2 className="size-5 text-blue-600" />Datos comerciales</h2><div className="grid gap-4 sm:grid-cols-2">{([
        ["commercial_name", "Razón social / nombre comercial"], ["tax_id", "RUT empresa"], ["tagline", "Línea de servicios"], ["business_activity", "Giro"], ["representative", "Representante comercial"], ["phone", "Teléfono"], ["email", "Correo comercial"], ["address", "Dirección"],
      ] as const).map(([key, label]) => <div className="space-y-2" key={key}><Label htmlFor={`company-${key}`}>{label}</Label><Input id={`company-${key}`} value={form[key]} type={key === "email" ? "email" : "text"} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></div>)}</div><div className="mt-6 rounded-xl border border-blue-100 bg-blue-50 p-4"><Label htmlFor="accountant-email" className="flex items-center gap-2"><Mail className="size-4" />Correo del contador</Label><Input id="accountant-email" className="mt-3 bg-white" type="email" placeholder="contador@empresa.cl" value={form.accountant_email} onChange={(event) => setForm({ ...form, accountant_email: event.target.value })} /><p className="mt-2 text-xs text-blue-800">Se usará al preparar solicitudes de facturación desde Cobranza.</p></div><Button className="mt-6" disabled={!online || saving} onClick={() => void save()}>{saving ? <Loader2 className="animate-spin" /> : <Check />}Guardar configuración</Button>{!online && <p className="mt-2 text-xs text-amber-700">Conéctese para cambiar los datos compartidos de la empresa.</p>}</div>
    </div>
  </section>;
}
