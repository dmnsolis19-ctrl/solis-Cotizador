import { businessDate } from './dates';
import { csvCell } from './catalog-import';

export type CommercialQuote = {
  publicId: string; rootPublicId: string; number: string; revision: number;
  clientPublicId: string; clientName: string; project: string; issueDate: string;
  status: string; currency: string; netSubtotal: string; total: string; updatedAt: string; payloadJson?: string;
};
export type QuoteValidity = { state: 'valid' | 'expiring' | 'expired' | 'unknown' | 'not_applicable'; expiresOn: string; daysRemaining: number | null };
export type QuoteFilters = { status: string; currency: string; clientId: string; validity: string; from: string; to: string; sort: 'recent' | 'oldest' | 'amount' | 'expiry'; history: boolean };
export const EMPTY_QUOTE_FILTERS: QuoteFilters = { status: '', currency: '', clientId: '', validity: '', from: '', to: '', sort: 'recent', history: false };
const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-CL');
export function matchesCommercialSearch(text: string, query: string) {
  const haystack = normalized(text);
  return normalized(query).trim().split(/\s+/).filter(Boolean).every(word => haystack.includes(word));
}
function dayNumber(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const ms = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === value ? ms / 86400000 : null;
}
const revision = (quote: CommercialQuote) => Number.isFinite(Number(quote.revision)) ? Number(quote.revision) : 0;
const changed = (quote: CommercialQuote) => Date.parse(quote.updatedAt) || 0;
export function latestQuoteVersions<T extends CommercialQuote>(quotes: T[]): T[] {
  const roots = new Map<string, T>();
  for (const quote of quotes) {
    if (quote.status === 'Eliminada') continue;
    const key = quote.rootPublicId || quote.publicId, previous = roots.get(key);
    if (!previous || revision(quote) > revision(previous) || revision(quote) === revision(previous) && (changed(quote) > changed(previous) || changed(quote) === changed(previous) && quote.publicId > previous.publicId)) roots.set(key, quote);
  }
  return [...roots.values()].sort((a, b) => b.issueDate.localeCompare(a.issueDate) || changed(b) - changed(a) || a.number.localeCompare(b.number));
}
export function quoteValidity(quote: CommercialQuote, referenceDate = businessDate()): QuoteValidity {
  const empty = { expiresOn: '', daysRemaining: null };
  if (quote.status !== 'Enviada') return { ...empty, state: 'not_applicable' };
  let payload: Record<string, unknown> = {};
  try { const value = JSON.parse(quote.payloadJson || '{}'); if (value && typeof value === 'object' && !Array.isArray(value)) payload = value; } catch { /* An imported record may have no validity metadata. */ }
  const raw = payload.validityDays ?? payload.validity_days;
  const days = typeof raw === 'number' || typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
  const issued = dayNumber(quote.issueDate), today = dayNumber(referenceDate);
  if (!Number.isInteger(days) || days < 1 || days > 365 || issued === null || today === null) return { ...empty, state: 'unknown' };
  const expires = issued + days, daysRemaining = expires - today;
  return { state: daysRemaining < 0 ? 'expired' : daysRemaining <= 3 ? 'expiring' : 'valid', expiresOn: new Date(expires * 86400000).toISOString().slice(0, 10), daysRemaining };
}
export function filterCommercialQuotes<T extends CommercialQuote>(quotes: T[], filters: QuoteFilters, query = '', referenceDate = businessDate()): T[] {
  if (filters.from && filters.to && filters.from > filters.to) return [];
  const source = filters.history ? quotes.filter(quote => quote.status !== 'Eliminada') : latestQuoteVersions(quotes);
  const result = source.filter(quote => (!filters.status || quote.status === filters.status) && (!filters.currency || quote.currency === filters.currency) && (!filters.clientId || quote.clientPublicId === filters.clientId) && (!filters.from || quote.issueDate >= filters.from) && (!filters.to || quote.issueDate <= filters.to) && (!filters.validity || quoteValidity(quote, referenceDate).state === filters.validity) && matchesCommercialSearch(`${quote.number} ${quote.clientName} ${quote.project} ${quote.status}`, query));
  const currencies = new Set(result.map(quote => quote.currency));
  return result.sort((a, b) => {
    if (filters.sort === 'amount' && currencies.size === 1) return Number(b.total) - Number(a.total) || a.number.localeCompare(b.number);
    if (filters.sort === 'expiry') return (quoteValidity(a, referenceDate).expiresOn || '9999').localeCompare(quoteValidity(b, referenceDate).expiresOn || '9999') || a.number.localeCompare(b.number);
    return (filters.sort === 'oldest' ? 1 : -1) * a.issueDate.localeCompare(b.issueDate) || changed(b) - changed(a) || a.number.localeCompare(b.number);
  });
}
export function commercialOverview<T extends CommercialQuote>(quotes: T[], referenceDate = businessDate()) {
  const latest = latestQuoteVersions(quotes);
  const amounts = new Map<string, { currency: string; count: number; proposedNet: number; approvedNet: number }>();
  let invalidAmounts = 0;
  for (const quote of latest) {
    if (['Cancelada', 'Anulada', 'Rechazada'].includes(quote.status)) continue;
    const amount = Number(quote.netSubtotal);
    if (!Number.isFinite(amount) || amount < 0) { invalidAmounts++; continue; }
    const group = amounts.get(quote.currency) || { currency: quote.currency, count: 0, proposedNet: 0, approvedNet: 0 };
    group.count++; group.proposedNet += amount; if (quote.status === 'Aprobada') group.approvedNet += amount;
    amounts.set(quote.currency, group);
  }
  return {
    latest, invalidAmounts, amounts: [...amounts.values()].sort((a, b) => a.currency.localeCompare(b.currency)),
    drafts: latest.filter(quote => quote.status === 'Borrador'),
    sent: latest.filter(quote => quote.status === 'Enviada'),
    approved: latest.filter(quote => quote.status === 'Aprobada'),
    queued: latest.filter(quote => quote.status === 'Pendiente de sincronizar'),
    expired: latest.filter(quote => quoteValidity(quote, referenceDate).state === 'expired'),
    expiring: latest.filter(quote => quoteValidity(quote, referenceDate).state === 'expiring'),
  };
}
export function commercialQuotesCsv(quotes: CommercialQuote[], referenceDate = businessDate()) {
  const rows: unknown[][] = [['Número', 'Revisión', 'Cliente', 'Proyecto', 'Fecha', 'Estado', 'Moneda', 'Neto', 'Total', 'Vence el', 'Vigencia']];
  for (const quote of quotes) { const validity = quoteValidity(quote, referenceDate); rows.push([quote.number, quote.revision, quote.clientName, quote.project, quote.issueDate, quote.status, quote.currency, quote.netSubtotal, quote.total, validity.expiresOn, validityLabel(validity)]); }
  return '\uFEFF' + rows.map(row => row.map(csvCell).join(';')).join('\r\n');
}
export function validityLabel(validity: QuoteValidity) {
  if (validity.state === 'expired') return 'Vigencia vencida';
  if (validity.state === 'expiring') return validity.daysRemaining === 0 ? 'Vence hoy' : `Vence en ${validity.daysRemaining} días`;
  if (validity.state === 'valid') return 'Vigente';
  if (validity.state === 'unknown') return 'Vigencia sin definir';
  return 'No aplica';
}
export function followupMessage(quote: Pick<CommercialQuote, 'number' | 'project'>, contactName = '') {
  return `Hola${contactName ? `, ${contactName}` : ''}.\n\nLes escribo para consultar si pudieron revisar la cotización ${quote.number}, correspondiente a ${quote.project}.\n\n¿Tienen alguna consulta o necesitan ajustar el alcance? Quedo atento para coordinar los próximos pasos.\n\nSaludos.`;
}
