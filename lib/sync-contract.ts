import { z } from "zod";

export const SYNC_OPERATION_TYPES = [
  "client.create",
  "catalog.create",
  "quote.create",
  "order.update",
  "activity.create",
  "activity.update",
  "entry.create",
  "material_request.create",
] as const;
export type SyncOperationType = (typeof SYNC_OPERATION_TYPES)[number];

export const syncOperationSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(SYNC_OPERATION_TYPES),
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.string().datetime(),
});

export type SyncOperation = z.infer<typeof syncOperationSchema>;

export function syncOperationLabel(type: SyncOperationType) {
  return ({
    "client.create": "Nuevo cliente",
    "catalog.create": "Nuevo ítem de biblioteca",
    "quote.create": "Nueva cotización",
    "order.update": "Actualización de orden",
    "activity.create": "Nueva actividad de terreno",
    "activity.update": "Actualización de checklist",
    "entry.create": "Registro de terreno",
    "material_request.create": "Solicitud de material",
  } as const)[type];
}
