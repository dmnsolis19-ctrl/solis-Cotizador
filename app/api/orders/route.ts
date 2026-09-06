import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appUsers, materialRequests, userNotifications, workOrderActivities, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder, isWorkOrderClosed, ORDER_PRIORITIES } from "@/lib/work-orders";

const orderSchema = z.object({
  publicId: z.string().min(8),
  responsible: z.string().trim().default(""),
  status: z.enum(["Pendiente", "Planificada", "En ejecución", "Completada", "Cancelada"]),
  plannedStart: z.string().default(""),
  plannedEnd: z.string().default(""),
  notes: z.string().trim().default(""),
  assignedUserPublicId: z.string().optional(),
  priority: z.enum(ORDER_PRIORITIES).optional(),
  dueDate: z.string().optional(),
});

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("orders.write");
    const ownerEmail = session.ownerEmail;
    const input = orderSchema.parse(await request.json());
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, input.publicId))).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (!canAccessWorkOrder(session.user.role, session.user, order)) {
      throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
    }
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite modificaciones." }, { status: 409 });
    if (input.status === "Completada") {
      const activities = await db.select({ payloadJson: workOrderActivities.payloadJson }).from(workOrderActivities).where(and(
        eq(workOrderActivities.ownerEmail, ownerEmail),
        eq(workOrderActivities.workOrderPublicId, order.publicId),
      ));
      const incompleteRequired = activities.some(({ payloadJson }) => {
        try {
          const payload = JSON.parse(payloadJson) as Record<string, unknown>;
          const required = payload.required == null ? true : Boolean(payload.required);
          const completed = Boolean(payload.completed) || Number(payload.progress_percent || 0) >= 100;
          return required && !completed;
        } catch {
          return true;
        }
      });
      if (incompleteRequired) {
        return Response.json({ error: "Complete todas las actividades obligatorias antes de cerrar la orden." }, { status: 409 });
      }
      const openMaterialRequests = await db.select({ status: materialRequests.status }).from(materialRequests).where(and(
        eq(materialRequests.ownerEmail, ownerEmail), eq(materialRequests.workOrderPublicId, order.publicId),
      ));
      if (openMaterialRequests.some((request) => ["Pendiente", "Aprobada", "Reservada", "Compra requerida"].includes(request.status))) {
        return Response.json({ error: "Resuelva o entregue las solicitudes de material abiertas antes de cerrar la orden." }, { status: 409 });
      }
    }

    const canAssign = session.permissions.includes("orders.assign");
    const assignmentRequested = input.assignedUserPublicId !== undefined || input.priority !== undefined || input.dueDate !== undefined;
    if (assignmentRequested && !canAssign) {
      throw new AuthorizationError("Su rol no permite cambiar la asignación, prioridad o fecha de compromiso.", 403);
    }

    let assignedUserPublicId = order.assignedUserPublicId;
    let assignedUserEmail = order.assignedUserEmail;
    let responsible = canAssign ? input.responsible : order.responsible;
    let assigneeName = responsible;
    if (input.assignedUserPublicId !== undefined) {
      assignedUserPublicId = input.assignedUserPublicId;
      assignedUserEmail = "";
      responsible = "";
      assigneeName = "";
      if (assignedUserPublicId) {
        const [target] = await db.select().from(appUsers).where(and(
          eq(appUsers.ownerEmail, ownerEmail),
          eq(appUsers.publicId, assignedUserPublicId),
          eq(appUsers.active, true),
        )).limit(1);
        if (!target || !["technician", "supervisor"].includes(target.role)) {
          return Response.json({ error: "Seleccione un técnico o supervisor activo." }, { status: 409 });
        }
        assignedUserEmail = target.email;
        responsible = target.name || target.email;
        assigneeName = responsible;
      }
    }

    const priority = input.priority ?? order.priority;
    const dueDate = input.dueDate ?? order.dueDate;
    const assignmentChanged = assignedUserPublicId !== order.assignedUserPublicId;
    const assignmentUpdatedAt = assignmentChanged ? new Date().toISOString() : order.assignmentUpdatedAt;
    const payload = {
      ...JSON.parse(order.payloadJson || "{}"), status: input.status, responsible,
      assigned_user_public_id: assignedUserPublicId, assigned_user_email: assignedUserEmail,
      priority, due_date: dueDate, planned_start: input.plannedStart,
      planned_end: input.plannedEnd, notes: input.notes,
    };
    await db.update(workOrders).set({
      status: input.status, responsible, assignedUserPublicId, assignedUserEmail,
      priority, dueDate, assignmentUpdatedAt, plannedStart: input.plannedStart,
      plannedEnd: input.plannedEnd, notes: input.notes, payloadJson: JSON.stringify(payload),
      updatedAt: new Date().toISOString(),
    }).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, input.publicId)));

    const planningChanged = priority !== order.priority || dueDate !== order.dueDate;
    if (assignmentChanged && order.assignedUserPublicId) {
      await db.insert(userNotifications).values({
        publicId: crypto.randomUUID(), ownerEmail, recipientUserPublicId: order.assignedUserPublicId,
        recipientEmail: order.assignedUserEmail, type: "WORK_ORDER_UNASSIGNED",
        title: `Orden reasignada: ${order.number}`,
        message: `${order.clientName} · ${order.project} ya no está asignada a su bandeja.`,
        entityType: "work_order", entityPublicId: order.publicId, readAt: "",
        createdAt: new Date().toISOString(),
      });
    }
    if ((assignmentChanged || planningChanged) && assignedUserPublicId) {
      await db.insert(userNotifications).values({
        publicId: crypto.randomUUID(), ownerEmail, recipientUserPublicId: assignedUserPublicId,
        recipientEmail: assignedUserEmail, type: assignmentChanged ? "WORK_ORDER_ASSIGNED" : "WORK_ORDER_PLANNING_UPDATED",
        title: `${assignmentChanged ? "Nueva orden asignada" : "Planificación actualizada"}: ${order.number}`,
        message: `${order.clientName} · ${order.project}${dueDate ? ` · compromiso ${dueDate}` : ""}`,
        entityType: "work_order", entityPublicId: order.publicId, readAt: "",
        createdAt: new Date().toISOString(),
      });
    }
    await writeAuditEvent(session, {
      action: assignmentChanged ? "WORK_ORDER_ASSIGNED" : "WORK_ORDER_UPDATED",
      entityType: "work_order", entityPublicId: input.publicId,
      detail: { previousStatus: order.status, status: input.status, assignedUserPublicId, assignee: assigneeName, priority, dueDate },
    });
    return Response.json({ ok: true });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise estado, asignación, prioridad y fechas." : error instanceof Error ? error.message : "No fue posible actualizar la orden.";
    return Response.json({ error: message }, { status: 400 });
  }
}
