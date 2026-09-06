import type { AppRole } from "@/lib/permissions";

export const ORDER_PRIORITIES = ["Baja", "Normal", "Alta", "Urgente"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export type OrderAssignment = {
  assignedUserPublicId: string;
  assignedUserEmail: string;
};

export function canAccessWorkOrder(
  role: AppRole,
  user: { publicId: string; email: string },
  order: OrderAssignment,
) {
  if (role !== "technician") return true;
  return Boolean(
    order.assignedUserPublicId &&
      (order.assignedUserPublicId === user.publicId ||
        order.assignedUserEmail.toLowerCase() === user.email.toLowerCase()),
  );
}

export function isWorkOrderClosed(order: { status: string; closedAt?: string }) {
  return order.status === "Cerrada" || Boolean(order.closedAt);
}

export function isOrderOverdue(
  dueDate: string,
  status: string,
  referenceDate = new Date().toISOString().slice(0, 10),
) {
  return Boolean(
    dueDate &&
      dueDate < referenceDate &&
      !["Completada", "Cerrada", "Cancelada"].includes(status),
  );
}

export function isOrderDueSoon(
  dueDate: string,
  status: string,
  referenceDate = new Date().toISOString().slice(0, 10),
  days = 3,
) {
  if (!dueDate || ["Completada", "Cerrada", "Cancelada"].includes(status)) return false;
  const start = new Date(`${referenceDate}T00:00:00Z`).getTime();
  const end = new Date(`${dueDate}T00:00:00Z`).getTime();
  const difference = Math.round((end - start) / 86_400_000);
  return difference >= 0 && difference <= days;
}
