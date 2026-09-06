export type CostEntry = { entryType: string; total: number };

export function parseCostPayload(payloadJson: string): CostEntry {
  try {
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    const quantity = Number(payload.quantity || 1);
    const unitCost = Number(payload.unit_cost ?? payload.unitCost ?? 0);
    const total = Number(payload.total ?? quantity * unitCost);
    return {
      entryType: String(payload.entry_type || payload.type || "expense"),
      total: Number.isFinite(total) ? total : 0,
    };
  } catch {
    return { entryType: "expense", total: 0 };
  }
}

export function profitabilityMetrics(sale: number, budgetedCost: number, entries: CostEntry[]) {
  const actualCost = entries.reduce((sum, entry) => sum + entry.total, 0);
  const actualProfit = sale - actualCost;
  const actualMarginPercent = sale > 0 ? actualProfit / sale * 100 : 0;
  const budgetedProfit = sale - budgetedCost;
  const budgetedMarginPercent = sale > 0 ? budgetedProfit / sale * 100 : 0;
  const budgetVariance = actualCost - budgetedCost;
  const breakdown = entries.reduce<Record<string, number>>((result, entry) => {
    result[entry.entryType] = (result[entry.entryType] || 0) + entry.total;
    return result;
  }, {});
  return { sale, budgetedCost, actualCost, actualProfit, actualMarginPercent, budgetedProfit, budgetedMarginPercent, budgetVariance, breakdown };
}

export function closureBlockers(input: {
  status: string;
  activities: Array<{ required: boolean; completed: boolean }>;
  materialStatuses: string[];
  purchaseStatuses: string[];
  signoffs: number;
}) {
  const blockers: string[] = [];
  if (input.status !== "Completada") blockers.push("Marque la orden como Completada.");
  if (!input.activities.length) blockers.push("Agregue al menos una actividad de ejecución.");
  if (input.activities.some((activity) => activity.required && !activity.completed)) blockers.push("Complete todas las actividades obligatorias.");
  if (input.materialStatuses.some((status) => ["Pendiente", "Aprobada", "Reservada", "Compra requerida"].includes(status))) blockers.push("Resuelva las solicitudes de material abiertas.");
  if (input.purchaseStatuses.some((status) => ["Solicitada", "Aprobada", "Ordenada", "Recepción parcial"].includes(status))) blockers.push("Complete las recepciones de compra pendientes.");
  if (!input.signoffs) blockers.push("Registre la conformidad del cliente.");
  return blockers;
}
