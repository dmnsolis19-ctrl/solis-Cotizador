"use client";
import { Button } from '@/components/ui/button';
import { commercialOverview, quoteValidity, validityLabel, type CommercialQuote } from '@/lib/commercial-overview';
import { isOrderDueSoon, isOrderOverdue } from '@/lib/work-orders';

type OperationOrder = { publicId: string; number: string; project: string; clientName: string; status: string; dueDate: string; plannedEnd: string; closedAt: string };
const amount = (value: number, currency: string) => value.toLocaleString('es-CL', { maximumFractionDigits: currency === 'CLP' ? 0 : 4 });
export function OperationsOverview<Q extends CommercialQuote, O extends OperationOrder>({ quotes, orders, canReadQuotes, canReadOrders, onQuote, onOrder, onQuotes, onOrders }: {
  quotes: Q[]; orders: O[]; canReadQuotes: boolean; canReadOrders: boolean;
  onQuote?: (quote: Q) => void; onOrder?: (order: O) => void; onQuotes(): void; onOrders(): void;
}) {
  const overview = commercialOverview(canReadQuotes ? quotes : []);
  const pendingQuotes = [...overview.expired, ...overview.expiring].sort((a, b) => quoteValidity(a).expiresOn.localeCompare(quoteValidity(b).expiresOn));
  const pendingOrders = canReadOrders ? orders.filter(order => !order.closedAt && (isOrderOverdue(order.dueDate || order.plannedEnd, order.status) || isOrderDueSoon(order.dueDate || order.plannedEnd, order.status))).sort((a, b) => (a.dueDate || a.plannedEnd).localeCompare(b.dueDate || b.plannedEnd)) : [];
  return <div className="grid min-w-0 gap-5 xl:grid-cols-2">
    {canReadQuotes && <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm" aria-label="Importes por moneda"><div className="mb-4"><h2 className="font-bold text-slate-950">Cartera por moneda</h2><p className="mt-1 text-xs text-slate-500">Una última revisión por cotización cargada. Neto, sin sumar monedas ni revisiones históricas.</p></div>
      {overview.amounts.length ? <div className="space-y-3">{overview.amounts.map(group => <div key={group.currency} className="rounded-xl border bg-slate-50 p-4"><div className="mb-2 flex justify-between gap-2"><strong className="text-sm text-blue-700">{group.currency}</strong><span className="text-xs text-slate-500">{group.count} cotizaciones</span></div><dl className="grid gap-3 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Propuesto neto</dt><dd className="break-all text-lg font-bold">{amount(group.proposedNet, group.currency)}</dd></div><div><dt className="text-xs text-slate-500">Aprobado en esta vista</dt><dd className="break-all text-lg font-semibold text-emerald-700">{amount(group.approvedNet, group.currency)}</dd></div></dl></div>)}</div> : <p className="text-sm text-slate-500">Las cotizaciones aparecerán aquí cuando las agregue.</p>}
      <p className="mt-3 text-xs text-slate-500">Excluye anuladas, canceladas y rechazadas. Estos importes no representan facturación ni cobros. Si una aprobada tiene una revisión nueva en borrador, aquí se muestra esa última revisión.</p>
      {!!overview.invalidAmounts && <p role="status" className="mt-2 text-xs text-amber-800">Revise {overview.invalidAmounts} importes inválidos que no se incluyeron.</p>}
    </section>}
    <section className="min-w-0 rounded-2xl border bg-white p-5 shadow-sm" aria-label="Prioridades de trabajo"><h2 className="font-bold text-slate-950">Prioridades de hoy</h2><p className="mt-1 text-xs text-slate-500">Avisos sobre los datos cargados. La vigencia se calcula desde la fecha de emisión y los días guardados; no cambia el estado de la oferta.</p>
      <div className="mt-4 space-y-3">{canReadQuotes && <><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-semibold">{overview.expired.length} ofertas vencidas · {overview.expiring.length} próximas a vencer</h3><Button size="sm" variant="ghost" onClick={onQuotes}>Ver cotizaciones</Button></div>
        {pendingQuotes.slice(0, 4).map(quote => <div key={quote.publicId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{quote.number} · {quote.clientName}</p><p className="text-xs text-amber-900">{validityLabel(quoteValidity(quote))} · {quoteValidity(quote).expiresOn}</p></div>{onQuote && <Button size="sm" variant="outline" onClick={() => onQuote(quote)}>Gestionar</Button>}</div>)}
        {!pendingQuotes.length && <p className="text-sm text-slate-500">Sin alertas de vigencia en las ofertas con fecha definida.</p>}
        {!!overview.queued.length && <p className="rounded-lg bg-blue-50 p-3 text-xs text-blue-800">{overview.queued.length} cotizaciones pendientes de sincronizar en este dispositivo.</p>}
      </>}
      {canReadOrders && <><div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3"><h3 className="text-sm font-semibold">{pendingOrders.length} trabajos vencidos o próximos (3 días)</h3><Button size="sm" variant="ghost" onClick={onOrders}>Ver trabajos</Button></div>
        {pendingOrders.slice(0, 4).map(order => <div key={order.publicId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-slate-50 p-3"><div className="min-w-0"><p className="break-words text-sm font-semibold">{order.number} · {order.clientName}</p><p className="text-xs text-slate-600">{order.dueDate || order.plannedEnd} · {order.status}</p></div>{onOrder && <Button size="sm" variant="outline" onClick={() => onOrder(order)}>Abrir trabajo</Button>}</div>)}
        {!pendingOrders.length && <p className="text-sm text-slate-500">Sin compromisos próximos en los trabajos cargados.</p>}
      </>}
      </div>
      <p className="mt-4 text-xs text-slate-500">Alcance: hasta las últimas 100 versiones de cotización y 100 órdenes recibidas del servidor, más cambios pendientes. Revise el historial completo antes de usarlo como informe de toda la empresa.</p>
    </section>
  </div>;
}
