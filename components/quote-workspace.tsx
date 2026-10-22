"use client";
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { downloadFile } from '@/components/catalog-import-panel';
import { commercialOverview, commercialQuotesCsv, EMPTY_QUOTE_FILTERS, filterCommercialQuotes, followupMessage, quoteValidity, validityLabel, type CommercialQuote, type QuoteFilters } from '@/lib/commercial-overview';
import { mailtoUrl, whatsappUrl } from '@/lib/sharing';

type WorkspaceQuote = CommercialQuote & { locked: boolean; marginPercent: string };
type Contact = { publicId: string; name: string; contactName: string; email: string; phone: string };
const money = (value: string, currency: string) => Number.isFinite(Number(value)) ? `${Number(value).toLocaleString('es-CL', { maximumFractionDigits: currency === 'CLP' ? 0 : 4 })} ${currency}` : 'Importe por revisar';
const control = 'mt-1 block min-h-11 w-full min-w-0 rounded-lg border bg-white px-3 text-sm';

export function QuoteWorkspace<T extends WorkspaceQuote>({ quotes, clients, query, online, onClearSearch, onManage, onEdit, onDelete }: {
  quotes: T[]; clients: Contact[]; query: string; online: boolean; onClearSearch(): void; onManage?: (quote: T) => void; onEdit?: (quote: T) => void; onDelete?: (quote: T) => void;
}) {
  const [filters, setFilters] = useState<QuoteFilters>({ ...EMPTY_QUOTE_FILTERS });
  const [selected, setSelected] = useState<T | null>(null), [message, setMessage] = useState('');
  const overview = commercialOverview(quotes), rows = filterCommercialQuotes(quotes, filters, query);
  const statusSource = filters.history ? quotes : overview.latest;
  const statuses = [...new Set(quotes.map(quote => quote.status))].sort();
  const currencies = [...new Set(quotes.map(quote => quote.currency))].sort();
  const quoteClients = [...new Map(quotes.filter(quote => quote.clientPublicId).map(quote => [quote.clientPublicId, quote.clientName])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
  const activeFilters = Object.entries(filters).filter(([key, value]) => key !== 'sort' && value).length + (query.trim() ? 1 : 0);
  const invalidRange = !!filters.from && !!filters.to && filters.from > filters.to;
  const update = (patch: Partial<QuoteFilters>) => setFilters(current => ({ ...current, ...patch, ...('currency' in patch && !patch.currency && current.sort === 'amount' ? { sort: 'recent' } : {}) }));
  const reset = () => { setFilters({ ...EMPTY_QUOTE_FILTERS }); onClearSearch(); };
  const beginFollowup = (quote: T) => { const contact = clients.find(client => client.publicId === quote.clientPublicId); setSelected(quote); setMessage(followupMessage(quote, contact?.contactName)); };
  const actions = (quote: T) => <div className="flex flex-wrap gap-2">
    {onEdit && !quote.locked && quote.status === 'Borrador' && <Button size="sm" variant="outline" onClick={() => onEdit(quote)}>Editar</Button>}
    {onDelete && !quote.locked && quote.status === 'Borrador' && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => onDelete(quote)}>Eliminar</Button>}
    {onManage && <Button size="sm" variant="outline" onClick={() => onManage(quote)}>Gestionar</Button>}
    {quote.status === 'Enviada' && <Button size="sm" variant="outline" onClick={() => beginFollowup(quote)}>Seguimiento</Button>}
  </div>;
  const contact = selected ? clients.find(client => client.publicId === selected.clientPublicId) : undefined;
  let emailLink = '', phoneLink = '';
  if (contact && selected) {
    try { emailLink = mailtoUrl(contact.email.trim(), `Consulta sobre cotización ${selected.number}`, message); } catch { /* Show the missing-contact guidance below. */ }
    try {
      const phone = contact.phone.trim(), digits = phone.replace(/\D/g, '');
      if (phone.startsWith('+') || digits.startsWith('56') && digits.length === 11) phoneLink = whatsappUrl(phone, message);
    } catch { /* An invalid or local-only phone must not open an incorrect recipient. */ }
  }
  return <div className="min-w-0 space-y-4">
    <div className="flex flex-wrap gap-2" aria-label="Estados de cotizaciones">
      {[['', 'Todas'], ['Borrador', 'Borradores'], ['Enviada', 'Enviadas'], ['Aprobada', 'Aprobadas']].map(([status, label]) => <Button key={status} variant={filters.status === status ? 'default' : 'outline'} aria-pressed={filters.status === status} onClick={() => update({ status, validity: '' })}>{label} · {statusSource.filter(quote => !status || quote.status === status).length}</Button>)}
    </div>
    <details className="rounded-xl border bg-white p-4">
      <summary className="cursor-pointer text-sm font-semibold">Filtrar y ordenar {activeFilters ? `· ${activeFilters} filtros activos` : ''}</summary>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="text-sm">Estado<select aria-label="Filtrar estado" className={control} value={filters.status} onChange={e => update({ status: e.target.value, validity: '' })}><option value="">Todos los estados</option>{statuses.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm">Moneda<select aria-label="Filtrar moneda" className={control} value={filters.currency} onChange={e => update({ currency: e.target.value })}><option value="">Todas las monedas</option>{currencies.map(value => <option key={value}>{value}</option>)}</select></label>
        <label className="text-sm">Cliente<select aria-label="Filtrar cliente" className={control} value={filters.clientId} onChange={e => update({ clientId: e.target.value })}><option value="">Todos los clientes</option>{quoteClients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-sm">Vigencia de enviadas<select aria-label="Filtrar vigencia" className={control} value={filters.validity} onChange={e => update({ validity: e.target.value, ...(e.target.value ? { status: 'Enviada' } : {}) })}><option value="">Todas</option><option value="expired">Vencidas</option><option value="expiring">Vencen en 0–3 días</option><option value="valid">Vigentes por más de 3 días</option><option value="unknown">Sin vigencia definida</option></select></label>
        <label className="text-sm">Emitida desde<input aria-label="Fecha desde" type="date" className={control} value={filters.from} onChange={e => update({ from: e.target.value })} /></label>
        <label className="text-sm">Emitida hasta<input aria-label="Fecha hasta" type="date" className={control} value={filters.to} onChange={e => update({ to: e.target.value })} /></label>
        <label className="text-sm">Ordenar por<select aria-label="Ordenar cotizaciones" className={control} value={filters.sort} onChange={e => update({ sort: e.target.value as QuoteFilters['sort'] })}><option value="recent">Fecha más reciente</option><option value="oldest">Fecha más antigua</option><option value="expiry">Vencimiento más próximo</option><option value="amount" disabled={!filters.currency}>Mayor total (seleccione moneda)</option></select></label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={filters.history} onChange={e => update({ history: e.target.checked })} />Incluir revisiones anteriores</label>
      </div>
      {invalidRange && <p role="alert" className="mt-3 text-sm text-red-700">La fecha inicial debe ser anterior o igual a la final.</p>}
    </details>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p role="status" className="text-sm text-slate-600">{rows.length} resultados · {filters.history ? 'Todas las revisiones cargadas' : 'Última revisión de cada cotización cargada'}</p>
      <div className="flex flex-wrap gap-2"><Button variant="ghost" onClick={reset}>Limpiar filtros</Button><Button className="h-auto min-h-11 whitespace-normal py-2" variant="outline" disabled={!rows.length} onClick={() => downloadFile(commercialQuotesCsv(rows), 'Cotizaciones_filtradas_SOLIS.csv')}>Exportar resultados CSV</Button></div>
    </div>
    <p className="text-xs text-slate-500">Vista de las últimas {quotes.length} versiones cargadas (máximo 100 del servidor, más cambios pendientes). Los filtros y el CSV se aplican a esta vista; no representan todo el historial de la empresa.</p>
    {!rows.length ? <div className="rounded-xl border border-dashed bg-white p-8 text-center"><p className="font-medium">No hay cotizaciones para estos filtros.</p><Button variant="ghost" className="mt-2" onClick={reset}>Mostrar todas las cargadas</Button></div> : <>
      <div className="grid gap-3 sm:grid-cols-2 xl:hidden">{rows.map(quote => { const validity = quoteValidity(quote); return <article key={quote.publicId} className="min-w-0 space-y-3 rounded-xl border bg-white p-4 shadow-sm">
        <div className="flex flex-wrap justify-between gap-2"><strong className="break-all">{quote.number}</strong><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{quote.status}</span></div>
        <div><p className="break-words font-medium">{quote.clientName}</p><p className="break-words text-sm text-slate-600">{quote.project}</p></div>
        <div className="flex flex-wrap justify-between gap-2 text-sm"><span>{quote.issueDate} · R{quote.revision}</span><strong>{money(quote.total, quote.currency)}</strong></div>
        {validity.state !== 'not_applicable' && <p className={validity.state === 'expired' ? 'text-sm font-medium text-red-700' : 'text-sm text-slate-600'}>{validityLabel(validity)}{validity.expiresOn ? ` · ${validity.expiresOn}` : ''}</p>}
        {actions(quote)}
      </article>; })}</div>
      <div className="hidden overflow-x-auto rounded-xl border bg-white xl:block" tabIndex={0} role="region" aria-label="Listado de cotizaciones"><table className="w-full text-left text-sm"><thead className="bg-slate-50 text-xs text-slate-600"><tr>{['Cotización', 'Cliente / proyecto', 'Estado / vigencia', 'Margen', 'Total', 'Acciones'].map(title => <th key={title} scope="col" className="p-3">{title}</th>)}</tr></thead><tbody>{rows.map(quote => { const validity = quoteValidity(quote); return <tr key={quote.publicId} className="border-t"><td className="p-3"><strong>{quote.number}</strong><p className="text-xs text-slate-500">{quote.issueDate} · R{quote.revision}</p></td><td className="max-w-80 break-words p-3"><p className="font-medium">{quote.clientName}</p><p className="text-xs text-slate-600">{quote.project}</p></td><td className="p-3"><span className="text-xs font-semibold">{quote.status}</span>{validity.state !== 'not_applicable' && <p className={validity.state === 'expired' ? 'mt-1 text-xs text-red-700' : 'mt-1 text-xs text-slate-600'}>{validityLabel(validity)}{validity.expiresOn && <span className="block">{validity.expiresOn}</span>}</p>}</td><td className="p-3 text-right">{Number(quote.marginPercent).toFixed(1)}%</td><td className="whitespace-nowrap p-3 text-right font-semibold">{money(quote.total, quote.currency)}</td><td className="p-3">{actions(quote)}</td></tr>; })}</tbody></table></div>
    </>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Preparar seguimiento · {selected?.number}</DialogTitle><DialogDescription>Revisa el mensaje y envíalo desde tu aplicación de correo o WhatsApp. Adjunta el PDF por separado si lo necesitas.</DialogDescription></DialogHeader>
      <div className="space-y-3"><p className="break-words text-sm"><strong>{contact?.name || selected?.clientName}</strong><br />{contact?.email || 'Sin correo en la ficha'} · {contact?.phone || 'Sin teléfono en la ficha'}</p><label className="block text-sm">Mensaje<Textarea aria-label="Mensaje de seguimiento" value={message} onChange={e => setMessage(e.target.value)} rows={7} maxLength={4000} /></label>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={async () => { try { await navigator.clipboard.writeText(message); toast.success('Mensaje copiado.'); } catch { toast.error('Seleccione el texto y cópielo desde el campo del mensaje.'); } }}>Copiar mensaje</Button>{emailLink && <Button asChild variant="outline"><a href={emailLink}>Preparar correo</a></Button>}{phoneLink && online && <Button asChild><a href={phoneLink} target="_blank" rel="noreferrer">Abrir WhatsApp</a></Button>}</div>
        {(!emailLink || !phoneLink) && <p className="text-xs text-slate-500">Para habilitar los canales, complete el correo y un teléfono internacional (por ejemplo +56 9…) en Clientes. El contacto debe estar vinculado a esta cotización.</p>}
        {!online && <p className="text-xs text-amber-800">WhatsApp requiere conexión. Puede revisar o copiar el mensaje ahora.</p>}
      </div>
    </DialogContent></Dialog>
  </div>;
}
