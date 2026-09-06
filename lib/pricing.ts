export type QuoteLine = {
  name: string;
  detail?: string;
  quantity: number;
  unit: string;
  unitCost: number;
  unitPrice: number;
};

export type EconomicInput = {
  overheadPercent: number;
  contingencyPercent: number;
  targetMarginPercent: number;
  discountPercent: number;
  taxPercent: number;
  roundingMultiple: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculateQuote(items: QuoteLine[], settings: EconomicInput) {
  const grossSubtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
  const directCost = items.reduce((sum, item) => sum + item.quantity * item.unitCost, 0);
  const overhead = directCost * settings.overheadPercent / 100;
  const contingency = directCost * settings.contingencyPercent / 100;
  const internalCost = directCost + overhead + contingency;
  const discountAmount = grossSubtotal * settings.discountPercent / 100;
  const netSubtotal = grossSubtotal - discountAmount;
  const tax = netSubtotal * settings.taxPercent / 100;
  const total = netSubtotal + tax;
  const estimatedProfit = netSubtotal - internalCost;
  const marginPercent = netSubtotal > 0 ? estimatedProfit / netSubtotal * 100 : 0;
  const targetRaw = settings.targetMarginPercent >= 100
    ? 0
    : internalCost / (1 - settings.targetMarginPercent / 100);
  const targetNetSale = settings.roundingMultiple > 0
    ? Math.ceil(targetRaw / settings.roundingMultiple) * settings.roundingMultiple
    : targetRaw;

  return {
    grossSubtotal: money(grossSubtotal),
    directCost: money(directCost),
    overhead: money(overhead),
    contingency: money(contingency),
    internalCost: money(internalCost),
    discountAmount: money(discountAmount),
    netSubtotal: money(netSubtotal),
    tax: money(tax),
    total: money(total),
    estimatedProfit: money(estimatedProfit),
    marginPercent: money(marginPercent),
    targetNetSale: money(targetNetSale),
  };
}
