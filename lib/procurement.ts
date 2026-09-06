export const PURCHASE_STATUSES = [
  "Solicitada",
  "Aprobada",
  "Ordenada",
  "Recepción parcial",
  "Recibida",
  "Cancelada",
] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

const finite = (value: number) => Number.isFinite(value) ? value : 0;
const roundMoney = (value: number) => Math.round((finite(value) + Number.EPSILON) * 100) / 100;

export function purchaseTotals(
  items: Array<{ quantity: number; unitCost: number }>,
  discountPercent = 0,
  taxPercent = 19,
) {
  const subtotal = roundMoney(items.reduce((sum, item) => sum + Math.max(0, finite(item.quantity)) * Math.max(0, finite(item.unitCost)), 0));
  const discountAmount = roundMoney(subtotal * Math.min(100, Math.max(0, finite(discountPercent))) / 100);
  const netSubtotal = roundMoney(subtotal - discountAmount);
  const taxAmount = roundMoney(netSubtotal * Math.min(100, Math.max(0, finite(taxPercent))) / 100);
  return { subtotal, discountAmount, netSubtotal, taxAmount, total: roundMoney(netSubtotal + taxAmount) };
}

export function weightedAverageCost(currentQuantity: number, currentAverage: number, receivedQuantity: number, receivedUnitCost: number) {
  const currentValue = Math.max(0, finite(currentQuantity)) * Math.max(0, finite(currentAverage));
  const receivedValue = Math.max(0, finite(receivedQuantity)) * Math.max(0, finite(receivedUnitCost));
  const totalQuantity = Math.max(0, finite(currentQuantity)) + Math.max(0, finite(receivedQuantity));
  return totalQuantity > 0 ? roundMoney((currentValue + receivedValue) / totalQuantity) : 0;
}

export function purchaseReceiptStatus(items: Array<{ quantity: number; receivedQuantity: number }>): PurchaseStatus {
  const received = items.reduce((sum, item) => sum + Math.max(0, finite(item.receivedQuantity)), 0);
  const ordered = items.reduce((sum, item) => sum + Math.max(0, finite(item.quantity)), 0);
  if (ordered > 0 && received >= ordered) return "Recibida";
  return received > 0 ? "Recepción parcial" : "Ordenada";
}
