import { z } from "zod";
import { isValidChileRut, normalizeChileRut } from "./clients";
import { safeCsvCell } from "./price-reference";

const rut = z.string().trim().min(3).max(20).refine(isValidChileRut, "RUT no válido.").transform(normalizeChileRut);
export const invoiceRecipientSchema = z.object({
  name: z.string().trim().min(2).max(180), taxId: rut,
  businessActivity: z.string().trim().min(2).max(180), address: z.string().trim().min(3).max(300),
  commune: z.string().trim().min(2).max(120), city: z.string().trim().min(2).max(120),
  email: z.union([z.literal(""), z.string().trim().email().max(254)]).default(""),
});
export type InvoiceRecipient = z.infer<typeof invoiceRecipientSchema>;
export type AccountingPacket = {
  publicId: string; number: string; billingDocumentPublicId: string; billingNumber: string;
  workOrderNumber: string; quoteNumber: string; project: string; concept: string;
  preparedAt: string; preparedBy: string; accountantEmail: string;
  issuer: Record<string, string>; recipient: InvoiceRecipient;
  documentType: 33 | 34; currency: "CLP"; netAmount: number; taxAmount: number; totalAmount: number;
  taxPercent: number; lines: Array<{ description: string; quantity: number; unit: string; unitPrice: number; netTotal: number }>;
  notes: string; status: "prepared" | "email_sending" | "email_accepted" | "email_uncertain" | "invoice_recorded" | "cancelled";
  emailMessageId?: string; emailAcceptedAt?: string; cancelledReason?: string;
  invoice?: { folio: string; issueDate: string; recordedAt: string; recordedBy: string };
};
export const ACCOUNTING_STATUS: Record<AccountingPacket["status"], string> = { prepared: "Preparada", email_sending: "Enviando", email_accepted: "Correo aceptado por el servicio", email_uncertain: "Envío por verificar", invoice_recorded: "Folio registrado", cancelled: "Anulada" };
export function accountingText(packet: AccountingPacket) {
  return [`Solicitud ${packet.number}`, "SOLICITUD INTERNA PARA EL CONTADOR. NO ES FACTURA NI DTE.", `Tipo solicitado: ${packet.documentType === 33 ? "Factura electrónica afecta (33)" : "Factura electrónica exenta (34)"}`, `Emisor: ${packet.issuer.name} · RUT ${packet.issuer.taxId}`, `Receptor: ${packet.recipient.name} · RUT ${packet.recipient.taxId}`, `Giro: ${packet.recipient.businessActivity}`, `Dirección: ${packet.recipient.address}, ${packet.recipient.commune}, ${packet.recipient.city}`, `Correo cliente: ${packet.recipient.email || "Sin informar"}`, `Proyecto: ${packet.project}`, `Referencias: ${packet.quoteNumber} / ${packet.workOrderNumber} / ${packet.billingNumber}`, ...packet.lines.map((line) => `${line.quantity} ${line.unit} · ${line.description} · Neto CLP ${line.netTotal}`), `Neto: CLP ${packet.netAmount}`, `IVA: CLP ${packet.taxAmount}`, `Total: CLP ${packet.totalAmount}`, packet.notes, "Por favor emitir y devolver el folio y PDF/XML de la factura. Verificar antecedentes y tratamiento tributario antes de emitir."].filter(Boolean).join("\n");
}
export function accountingCsv(packet: AccountingPacket) {
  const header = ["Solicitud", "Tipo DTE solicitado", "RUT receptor", "Razón social", "Giro", "Dirección", "Comuna", "Ciudad", "Referencia cobro", "Concepto", "Descripción", "Cantidad", "Unidad", "Precio unitario neto CLP", "Total neto CLP", "IVA CLP", "Total CLP"];
  const rows = packet.lines.map((line) => [packet.number, packet.documentType, packet.recipient.taxId, packet.recipient.name, packet.recipient.businessActivity, packet.recipient.address, packet.recipient.commune, packet.recipient.city, packet.billingNumber, packet.concept, line.description, line.quantity, line.unit, line.unitPrice, line.netTotal, packet.taxAmount, packet.totalAmount]);
  return "\uFEFF" + [header, ...rows].map((row) => row.map(safeCsvCell).join(";")).join("\r\n");
}
