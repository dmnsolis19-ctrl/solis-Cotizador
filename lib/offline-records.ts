import { readMaterialGroups } from "./material-groups";
import type { QuoteLine } from "./pricing";
import type { StoredOperation } from "./offline-queue";
import { executionMetrics, type ExecutionActivity, type ExecutionEntry, type MaterialRequest } from "./order-execution";

export function cachedQuoteDetail<T extends { payloadJson?: string }>(quote: T) {
  const payload = JSON.parse(quote.payloadJson || "{}");
  if (!Array.isArray(payload.items) && !Array.isArray(payload.manualItems)) return null;
  const normalize = (row: Record<string, unknown>): QuoteLine => ({ name: String(row.name || row.description || "Partida"), detail: String(row.detail || ""), quantity: Number(row.quantity || 1), unit: String(row.unit || "un"), unitCost: Number(row.unitCost ?? row.unit_cost ?? 0), unitPrice: Number(row.unitPrice ?? row.unit_price ?? 0) });
  const groups = readMaterialGroups(quote.payloadJson || "{}");
  return { quote, items: (payload.items || payload.manualItems).map(normalize), manualItems: (payload.manualItems || payload.items).map(normalize), materialGroups: groups,
    commercial: { taxPercent: Number(payload.taxPercent ?? payload.tax_percent ?? 19), overheadPercent: Number(payload.overheadPercent ?? payload.overhead_percent ?? 10), contingencyPercent: Number(payload.contingencyPercent ?? payload.contingency_percent ?? 5), targetMarginPercent: Number(payload.targetMarginPercent ?? payload.target_margin_percent ?? 25), discountPercent: Number(payload.discountPercent ?? payload.discount_percent ?? 0), roundingMultiple: Number(payload.roundingMultiple ?? payload.rounding_multiple ?? 1000), validityDays: Number(payload.validityDays ?? payload.validity_days ?? 20), paymentTerms: String(payload.paymentTerms ?? payload.payment_terms ?? ""), deliveryTerms: String(payload.deliveryTerms ?? payload.delivery_terms ?? ""), notes: String(payload.notes || ""), technicalValidation: String(payload.technicalValidation || ""), scopeExclusions: String(payload.scopeExclusions || "") } };
}

export function overlayOfflineExecution<T extends { activities: ExecutionActivity[]; entries: ExecutionEntry[]; materialRequests: MaterialRequest[]; showFinancials: boolean }>(data: T, operations: StoredOperation[], workOrderId: string) {
  const next = structuredClone(data);
  for (const operation of operations.filter((row) => row.payload.workOrderPublicId === workOrderId)) {
    const p = operation.payload; const id = `pending:${operation.id}`;
    if (operation.type === "activity.create" && !next.activities.some((row) => row.publicId === id)) next.activities.push({ publicId: id, position: next.activities.length, title: String(p.title || "Actividad pendiente"), required: Boolean(p.required), completed: false, notes: String(p.notes || ""), completedAt: "", completedBy: "" });
    if (operation.type === "activity.update") next.activities = next.activities.map((row) => row.publicId === p.activityPublicId ? { ...row, completed: Boolean(p.completed), notes: String(p.notes || "") } : row);
    if (operation.type === "entry.create" && !next.entries.some((row) => row.publicId === id)) { const cost = next.showFinancials ? Number(p.unitCost || 0) : 0; next.entries.unshift({ publicId: id, entryType: p.entryType as ExecutionEntry["entryType"], description: String(p.description || "Registro pendiente"), quantity: Number(p.quantity || 0), unit: String(p.unit || "un"), unitCost: cost, total: Number(p.quantity || 0) * cost, entryDate: String(p.entryDate || ""), recordedBy: "Pendiente de sincronizar" }); }
    if (operation.type === "material_request.create" && !next.materialRequests.some((row) => row.publicId === id)) next.materialRequests.unshift({ publicId: id, activityPublicId: String(p.activityPublicId || ""), activityTitle: next.activities.find((row) => row.publicId === p.activityPublicId)?.title || "Actividad", status: "Pendiente", urgency: p.urgency as MaterialRequest["urgency"], neededDate: String(p.neededDate || ""), justification: String(p.justification || ""), requestedBy: "Pendiente de sincronizar", reviewedBy: "", reviewedAt: "", responseNotes: "", createdAt: operation.createdAt, items: (p.items as MaterialRequest["items"] || []).map((row, index) => ({ ...row, publicId: `${id}:${index}` })) });
  }
  return { ...next, metrics: executionMetrics(next.activities, next.entries) };
}
