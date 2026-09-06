export const INVENTORY_MOVEMENT_TYPES = ["RECEIPT", "ADJUSTMENT", "RESERVATION", "RELEASE", "ISSUE", "RETURN"] as const;
export type InventoryMovementType = (typeof INVENTORY_MOVEMENT_TYPES)[number];

export function availableStock(quantity: number, reservedQuantity: number) {
  return Math.max(0, quantity - reservedQuantity);
}

export function inventoryHealth(quantity: number, reservedQuantity: number, minimumQuantity: number) {
  const available = availableStock(quantity, reservedQuantity);
  if (available <= 0) return "Sin stock";
  if (available <= minimumQuantity) return "Stock bajo";
  return "Disponible";
}

export function allocationRemaining(requested: number, reserved: number, issued: number) {
  return Math.max(0, requested - reserved - issued);
}
