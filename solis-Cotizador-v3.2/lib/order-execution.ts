export const EXECUTION_ENTRY_TYPES = ["hours", "material", "service", "expense", "note"] as const;
export type ExecutionEntryType = (typeof EXECUTION_ENTRY_TYPES)[number];

export type ExecutionActivity = {
  publicId: string;
  position: number;
  title: string;
  required: boolean;
  completed: boolean;
  notes: string;
  completedAt: string;
  completedBy: string;
};

export type ExecutionEntry = {
  publicId: string;
  entryType: ExecutionEntryType;
  description: string;
  quantity: number;
  unit: string;
  unitCost: number;
  total: number;
  entryDate: string;
  recordedBy: string;
};

export const MATERIAL_REQUEST_STATUSES = ["Pendiente", "Aprobada", "Reservada", "Compra requerida", "Rechazada", "Entregada", "Cancelada"] as const;
export type MaterialRequestStatus = (typeof MATERIAL_REQUEST_STATUSES)[number];
export const MATERIAL_URGENCIES = ["Baja", "Normal", "Alta", "Urgente"] as const;

export type MaterialRequestItem = {
  publicId: string;
  catalogItemPublicId: string;
  description: string;
  quantity: number;
  unit: string;
  code: string;
};

export type MaterialRequest = {
  publicId: string;
  activityPublicId: string;
  activityTitle: string;
  status: MaterialRequestStatus;
  urgency: (typeof MATERIAL_URGENCIES)[number];
  neededDate: string;
  justification: string;
  requestedBy: string;
  reviewedBy: string;
  reviewedAt: string;
  responseNotes: string;
  createdAt: string;
  items: MaterialRequestItem[];
};

export function executionMetrics(
  activities: ExecutionActivity[],
  entries: ExecutionEntry[],
) {
  const required = activities.filter((item) => item.required);
  const completedRequired = required.filter((item) => item.completed).length;
  const progressPercent = required.length
    ? Math.round((completedRequired / required.length) * 100)
    : 0;
  return {
    progressPercent,
    requiredActivities: required.length,
    completedRequired,
    hours: entries
      .filter((item) => item.entryType === "hours")
      .reduce((sum, item) => sum + item.quantity, 0),
    materialEntries: entries.filter((item) => item.entryType === "material").length,
    realCost: entries.reduce((sum, item) => sum + item.total, 0),
  };
}

export function canCompleteExecution(activities: ExecutionActivity[]) {
  const required = activities.filter((item) => item.required);
  return required.length > 0 && required.every((item) => item.completed);
}

export function pendingMaterialRequests(requests: MaterialRequest[]) {
  return requests.filter((request) => ["Pendiente", "Aprobada", "Reservada", "Compra requerida"].includes(request.status)).length;
}
