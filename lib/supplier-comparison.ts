import { z } from "zod";
import { purchaseTotals } from "./procurement";
export const offerLineSchema = z.object({ itemPublicId: z.string().uuid(), unit: z.string().min(1).max(40), presentation: z.string().trim().min(1).max(120), packageQuantity: z.number().finite().positive().max(1e6), packageNetPrice: z.number().finite().min(0).max(1e9), availability: z.enum(["unknown", "available", "order", "unavailable"]), availableQuantity: z.number().finite().min(0).max(1e9) });
export const supplierOfferSchema = z.object({ id: z.string().uuid(), supplierPublicId: z.string().uuid(), reference: z.string().trim().max(160), currency: z.enum(["CLP", "USD", "EUR", "UF"]), dispatchNet: z.number().finite().min(0).max(1e9), deliveryDays: z.number().int().min(0).max(3650), validUntil: z.string().date().or(z.literal("")), discountPercent: z.number().finite().min(0).max(100), taxPercent: z.number().finite().min(0).max(100), confirmed: z.boolean(), lines: z.array(offerLineSchema).min(1).max(100) });
export const comparisonSchema = z.object({ publicId: z.string().uuid(), purchaseRequestPublicId: z.string().uuid(), expectedUpdatedAt: z.string().default(""), purchaseUpdatedAt: z.string(), offers: z.array(supplierOfferSchema).max(12), selectedOfferId: z.string().uuid().or(z.literal("")).default("") });
export type SupplierOffer = z.infer<typeof supplierOfferSchema>;
export type Requirement = { publicId: string; description: string; quantity: number; unit: string };
export type Comparison = z.infer<typeof comparisonSchema> & { updatedAt?: string; requirements?: Requirement[]; preparedAt?: string };
export function evaluateOffer(offer: SupplierOffer, requirements: Requirement[], currency: string, date: string) {
  const errors: string[] = [];
  if (offer.currency !== currency) errors.push("Moneda diferente; solicite una oferta en la misma moneda.");
  if (!offer.confirmed) errors.push("Confirme precio neto, IVA, entrega y despacho.");
  if (!offer.validUntil || offer.validUntil < date) errors.push("Oferta sin vigencia o vencida.");
  if (!offer.reference.trim()) errors.push("Falta la referencia de la oferta.");
  if (requirements.length !== offer.lines.length || new Set(offer.lines.map(l => l.itemPublicId)).size !== offer.lines.length) errors.push("La oferta debe cubrir el mismo listado, sin filas duplicadas.");
  const lines = requirements.map(required => {
    const line = offer.lines.find(l => l.itemPublicId === required.publicId);
    if (!line || line.unit !== required.unit || !Number.isFinite(line.packageQuantity) || line.packageQuantity <= 0) { errors.push(`${required.description}: unidad o presentación incompatible.`); return { publicId: required.publicId, quantity: required.quantity, packages: 0, surplus: 0, unitCost: 0, lineTotal: 0 }; }
    // Avoid floating point noise turning an exact package count into an extra package.
    const packages = Math.ceil(Number((required.quantity / line.packageQuantity).toPrecision(12)));
    const quantity = Math.round(packages * line.packageQuantity * 1e6) / 1e6;
    const lineTotal = Math.round(packages * line.packageNetPrice * 100) / 100;
    if (!["available", "order"].includes(line.availability) || line.availableQuantity < quantity) errors.push(`${required.description}: disponibilidad insuficiente o sin confirmar.`);
    if (line.packageNetPrice <= 0) errors.push(`${required.description}: confirme un precio mayor a cero.`);
    if (quantity > 1e9 || lineTotal > 1e12) errors.push("Cantidad o importe fuera de límite.");
    return { publicId: required.publicId, quantity, packages, surplus: Math.round((quantity - required.quantity) * 1e6) / 1e6, unitCost: line.packageNetPrice / line.packageQuantity, lineTotal };
  });
  const totals = purchaseTotals(lines.map(l => ({ quantity: l.quantity, unitCost: l.unitCost })), offer.discountPercent, offer.taxPercent, offer.dispatchNet);
  if (totals.total > 1e12) errors.push("La compra supera el límite monetario.");
  return { eligible: errors.length === 0, errors, lines, ...totals };
}
