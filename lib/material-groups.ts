import { z } from "zod";
import type { EconomicInput, QuoteLine } from "./pricing";

const amount = z.coerce.number().finite().min(0).max(1_000_000_000_000);
export const materialSchema = z.object({
  id: z.string().uuid(),
  catalogItemPublicId: z.string().max(120).default(""),
  code: z.string().trim().max(80).default(""),
  description: z.string().trim().min(2).max(240),
  specification: z.string().trim().max(600).default(""),
  brand: z.string().trim().max(120).default(""),
  quantity: z.coerce.number().finite().positive().max(1_000_000).multipleOf(0.000001),
  unit: z.string().trim().min(1).max(40),
  unitCost: amount,
  priceStatus: z.enum(["pending", "confirmed"]).default("pending"),
  supplier: z.string().trim().max(180).default(""),
  priceDate: z.union([z.literal(""), z.string().date()]).default(""),
});

export const materialGroupSchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(2).max(180),
  customerTitle: z.string().trim().min(2).max(240),
  detail: z.string().trim().max(2000).default(""),
  pricingMode: z.enum(["cost", "markup", "margin", "manual"]).default("markup"),
  pricingPercent: z.coerce.number().finite().min(0).max(99).default(25),
  salePrice: amount.default(0),
  materials: z.array(materialSchema).min(1).max(200),
});

export const materialGroupsSchema = z.array(materialGroupSchema).max(30).superRefine((groups, ctx) => {
  const ids = groups.flatMap((group) => [group.id, ...group.materials.map((material) => material.id)]);
  if (new Set(ids).size !== ids.length) ctx.addIssue({ code: "custom", message: "Las listas y materiales deben tener identificadores únicos." });
  if (groups.reduce((sum, group) => sum + group.materials.length, 0) > 1000) ctx.addIssue({ code: "custom", message: "Máximo 1000 materiales por cotización." });
});

export type Material = z.infer<typeof materialSchema>;
export type MaterialGroup = z.infer<typeof materialGroupSchema>;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function materialGroupCost(group: MaterialGroup) {
  return roundMoney(group.materials.reduce((sum, item) => sum + roundMoney(item.quantity * item.unitCost), 0));
}

export function materialGroupPrice(group: MaterialGroup, economic?: Pick<EconomicInput, "overheadPercent" | "contingencyPercent" | "discountPercent">) {
  const cost = materialGroupCost(group);
  if (group.pricingMode === "manual") return roundMoney(group.salePrice);
  if (group.pricingMode === "cost") return cost;
  if (group.pricingMode === "markup") return roundMoney(cost * (1 + group.pricingPercent / 100));
  const discount = economic?.discountPercent ?? 0;
  if (discount >= 100) throw new Error("Un descuento de 100% no permite calcular un margen objetivo.");
  const internalCost = cost * (1 + ((economic?.overheadPercent ?? 0) + (economic?.contingencyPercent ?? 0)) / 100);
  return roundMoney(internalCost / (1 - group.pricingPercent / 100) / (1 - discount / 100));
}

export function materialLines(groups: MaterialGroup[], economic?: Pick<EconomicInput, "overheadPercent" | "contingencyPercent" | "discountPercent">): QuoteLine[] {
  return groups.map((group) => ({ name: group.customerTitle, detail: group.detail, quantity: 1, unit: "gl", unitCost: materialGroupCost(group), unitPrice: materialGroupPrice(group, economic) }));
}

export function composeQuoteLines(manualItems: QuoteLine[], groups: MaterialGroup[], economic: EconomicInput) {
  const items = [...manualItems, ...materialLines(groups, economic)];
  if (!items.length || items.length > 500) throw new Error("La cotización debe contener entre 1 y 500 partidas comerciales.");
  if (items.some((item) => !Number.isFinite(item.unitCost) || !Number.isFinite(item.unitPrice) || item.quantity * Math.max(item.unitCost, item.unitPrice) > 1_000_000_000_000)) throw new Error("Una partida supera el límite monetario permitido.");
  if (items.reduce((sum, item) => sum + item.quantity * Math.max(item.unitCost, item.unitPrice), 0) > 1_000_000_000_000) throw new Error("El presupuesto supera el límite monetario permitido.");
  return items;
}

export function readMaterialGroups(payloadJson: string): MaterialGroup[] {
  const payload = JSON.parse(payloadJson || "{}");
  return materialGroupsSchema.parse(payload.materialGroups ?? []);
}

export function pendingMaterialPrices(groups: MaterialGroup[]) {
  return groups.reduce((sum, group) => sum + group.materials.filter((item) => item.priceStatus === "pending").length, 0);
}

// Supplier exports deliberately construct an allowlist; internal prices never enter it.
export type SupplierMaterial = { code: string; description: string; specification: string; brand: string; quantity: number; unit: string; lists: string[] };
export function supplierMaterials(groups: MaterialGroup[], consolidate = false): SupplierMaterial[] {
  const rows: SupplierMaterial[] = [];
  const byIdentity = new Map<string, SupplierMaterial>();
  for (const group of groups) for (const item of group.materials) {
    const row: SupplierMaterial = { code: item.code, description: item.description, specification: item.specification, brand: item.brand, quantity: item.quantity, unit: item.unit, lists: [group.title] };
    const key = JSON.stringify([row.code, row.description, row.specification, row.brand, row.unit]);
    const previous = consolidate ? byIdentity.get(key) : undefined;
    if (previous) {
      previous.quantity = Math.round((previous.quantity + row.quantity) * 1e6) / 1e6;
      if (!previous.lists.includes(group.title)) previous.lists.push(group.title);
    } else { rows.push(row); byIdentity.set(key, row); }
  }
  return rows;
}

export function supplierCsv(rows: SupplierMaterial[]) {
  const cell = (value: string | number) => {
    let text = String(value);
    if (/^[\s]*[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + [["Listas", "Código", "Descripción", "Especificación", "Marca/modelo", "Cantidad", "Unidad", "Precio unitario proveedor", "Plazo de entrega", "Observaciones"], ...rows.map((row) => [row.lists.join(" / "), row.code, row.description, row.specification, row.brand, row.quantity, row.unit, "", "", ""])].map((row) => row.map(cell).join(";")).join("\r\n");
}

export const MATERIAL_TEMPLATES = {
  solar: { name: "Fotovoltaica", titles: ["Paneles e inversor", "Materiales de corriente continua", "Materiales de corriente alterna", "Estructura y puesta a tierra"] },
  metalcon: { name: "Construcción en Metalcon", titles: ["Perfilería estructural según planos", "Anclajes y arriostramientos", "Tabiques y cielos no portantes", "Placas y aislación"] },
  automation: { name: "Automatización industrial", titles: ["PLC, HMI y comunicaciones", "Tablero de control", "Instrumentación y actuadores", "Canalizaciones y cableado"] },
  hvac: { name: "Aire acondicionado", titles: ["Equipos de climatización", "Tuberías y aislamiento", "Drenaje y accesorios", "Alimentación eléctrica"] },
  electrical: { name: "Electricidad domiciliaria", titles: ["Tablero y protecciones", "Conductores y canalizaciones", "Enchufes e iluminación", "Puesta a tierra"] },
} as const;

export function emptyMaterial(): Material {
  return { id: crypto.randomUUID(), catalogItemPublicId: "", code: "", description: "Nuevo material", specification: "", brand: "", quantity: 1, unit: "un", unitCost: 0, priceStatus: "pending", supplier: "", priceDate: "" };
}

export function emptyMaterialGroup(title = "Materiales de corriente alterna"): MaterialGroup {
  return { id: crypto.randomUUID(), title, customerTitle: `Suministro de ${title.toLowerCase()}`, detail: "", pricingMode: "markup", pricingPercent: 25, salePrice: 0, materials: [emptyMaterial()] };
}
