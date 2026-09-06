export const BILLING_CONCEPTS = ["Anticipo", "Avance", "Saldo final", "Servicio", "Otro"] as const;
export const PAYMENT_METHODS = ["Transferencia", "Tarjeta", "Efectivo", "Cheque", "Otro"] as const;

export function billingAmounts(netAmount: number, taxPercent: number) {
  const net = Math.max(0, netAmount);
  const tax = net * Math.max(0, taxPercent) / 100;
  return { netAmount: net, taxAmount: tax, totalAmount: net + tax };
}

export function collectionStatus(input: { status: string; totalAmount: number; paidAmount: number; dueDate: string }, referenceDate = new Date().toISOString().slice(0, 10)) {
  if (input.status === "Anulada" || input.status === "Borrador") return input.status;
  if (input.paidAmount >= input.totalAmount - 0.005) return "Pagada";
  if (input.paidAmount > 0) return input.dueDate && input.dueDate < referenceDate ? "Vencida" : "Parcial";
  return input.dueDate && input.dueDate < referenceDate ? "Vencida" : "Emitida";
}

export function collectionSummary(documents: Array<{ status: string; totalAmount: number; paidAmount: number }>) {
  return documents.filter((document) => document.status !== "Anulada" && document.status !== "Borrador").reduce((result, document) => {
    result.billed += document.totalAmount;
    result.collected += document.paidAmount;
    result.receivable += Math.max(0, document.totalAmount - document.paidAmount);
    if (document.status === "Vencida") result.overdue += Math.max(0, document.totalAmount - document.paidAmount);
    return result;
  }, { billed: 0, collected: 0, receivable: 0, overdue: 0 });
}
