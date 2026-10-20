import type { SupplierMaterial } from "./material-groups";
import { safeCsvCell } from "./price-reference";

export type OrderMaterialsData = {
  company: Record<string, unknown>;
  order: { publicId: string; number: string; clientName: string; project: string; responsible: string; status: string };
  quoteNumber: string; preparedAt: string;
  groups: Array<{ id: string; title: string; materials: SupplierMaterial[] }>;
  requests: Array<{ publicId: string; number: string; status: string; items: Array<{ description: string; quantity: number; unit: string }> }>;
};
export function orderMaterialsCsv(data: OrderMaterialsData) {
  const rows: unknown[][] = [["Orden", "Origen", "Lista / solicitud", "Estado", "Código", "Material", "Especificación", "Cantidad", "Unidad", "Entregado en terreno", "Observación"]];
  for (const group of data.groups) for (const item of group.materials) rows.push([data.order.number, "Presupuesto aprobado", group.title, "Previsto", item.code, item.description, [item.brand, item.specification].filter(Boolean).join(" / "), item.quantity, item.unit, "", ""]);
  for (const request of data.requests) for (const item of request.items) rows.push([data.order.number, "Solicitud de terreno", request.number, request.status, "", item.description, "", item.quantity, item.unit, "", "No sumar automáticamente al presupuesto"]);
  return "\uFEFF" + rows.map((row) => row.map(safeCsvCell).join(";")).join("\r\n");
}
