"use client";

import { useCallback, useEffect, useState } from "react";
import { Boxes, Download, FileText, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cachedApi } from "@/lib/offline-queue";
import { orderMaterialsCsv, type OrderMaterialsData } from "@/lib/order-materials";
import { buildOrderMaterialsPdf } from "@/lib/pdf-documents";

export function OrderMaterialsPanel({ publicId, online }: { publicId: string; online: boolean }) {
  const [data, setData] = useState<OrderMaterialsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try { setData(await cachedApi<OrderMaterialsData>(`/api/order-materials?publicId=${publicId}`)); }
    catch (error) { setError(error instanceof Error ? error.message : "No fue posible cargar los materiales."); }
    finally { setLoading(false); }
  }, [publicId]);
  useEffect(() => { const timer = setTimeout(() => void load(), 0); return () => clearTimeout(timer); }, [load, online]);
  const download = (format: "pdf" | "csv") => {
    if (!data) return;
    try {
      const content = format === "pdf" ? new Uint8Array(buildOrderMaterialsPdf(data)).buffer : orderMaterialsCsv(data);
      const url = URL.createObjectURL(new Blob([content], { type: format === "pdf" ? "application/pdf" : "text/csv;charset=utf-8" }));
      const a = document.createElement("a"); a.href = url; a.download = `${data.order.number.replace(/[^a-zA-Z0-9_-]/g, "_")}_Materiales.${format}`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch { toast.error("No fue posible preparar la descarga."); }
  };
  const count = data?.groups.reduce((sum, group) => sum + group.materials.length, 0) || 0;
  return <div className="space-y-3 rounded-xl border border-blue-200 bg-blue-50/50 p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><Boxes className="size-4 text-blue-600" />Materiales para ejecutar la orden</h3><p className="mt-1 text-xs text-slate-500">Presupuesto aprobado y solicitudes de terreno, con cantidades y espacio de entrega.</p></div><Button variant="ghost" size="sm" disabled={loading || !online} onClick={() => void load()} aria-label="Actualizar materiales"><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
    {loading ? <Loader2 className="size-5 animate-spin" /> : error ? <p role="alert" className="text-xs text-amber-800">{error}</p> : data && <><div className="flex flex-wrap gap-2"><Button size="sm" disabled={!count && !data.requests.length} onClick={() => download("pdf")}><FileText />PDF de materiales</Button><Button size="sm" variant="outline" disabled={!count && !data.requests.length} onClick={() => download("csv")}><Download />CSV</Button></div><p className="text-xs text-slate-500">{count} materiales · {data.groups.length} listas · {data.requests.length} solicitudes. Consulta: {new Date(data.preparedAt).toLocaleString("es-CL")}{!online ? " · Copia offline" : ""}</p>{!count && <p className="text-xs text-amber-800">La cotización de origen no tiene listas desglosadas. Las solicitudes de terreno aparecerán por separado.</p>}</>}
  </div>;
}
