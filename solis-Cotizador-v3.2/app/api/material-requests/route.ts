import { and, asc, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { catalogItems, inventoryBalances, materialAllocations, materialRequestItems, materialRequests, userNotifications, workOrderActivities, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { MATERIAL_REQUEST_STATUSES, MATERIAL_URGENCIES } from "@/lib/order-execution";
import { canAccessWorkOrder, isWorkOrderClosed } from "@/lib/work-orders";

const querySchema = z.object({ workOrderPublicId: z.string().min(8) });
const createSchema = z.object({
  action: z.literal("create"),
  workOrderPublicId: z.string().min(8),
  activityPublicId: z.string().min(8),
  urgency: z.enum(MATERIAL_URGENCIES).default("Normal"),
  neededDate: z.string().max(10).default(""),
  justification: z.string().trim().max(800).default(""),
  items: z.array(z.object({
    description: z.string().trim().min(2).max(240),
    quantity: z.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(20),
    code: z.string().trim().max(80).default(""),
    catalogItemPublicId: z.string().max(80).default(""),
  })).min(1).max(30),
});
const reviewSchema = z.object({
  publicId: z.string().uuid(),
  status: z.enum(MATERIAL_REQUEST_STATUSES).refine((status) => ["Aprobada", "Rechazada"].includes(status), "Estado no permitido"),
  responseNotes: z.string().trim().max(800).default(""),
});

function activityTitle(payloadJson: string) {
  try { const value = JSON.parse(payloadJson) as Record<string, unknown>; return String(value.title || value.name || "Actividad"); } catch { return "Actividad"; }
}

async function accessibleOrder(publicId: string, session: Awaited<ReturnType<typeof requirePermission>>) {
  const [order] = await getDb().select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, publicId))).limit(1);
  if (!order) return null;
  if (!canAccessWorkOrder(session.user.role, session.user, order)) throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
  return order;
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const order = await accessibleOrder(input.workOrderPublicId, session);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    const db = getDb();
    const [requests, items, activities, catalog, balances, allocations] = await Promise.all([
      db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.workOrderPublicId, order.publicId))).orderBy(desc(materialRequests.createdAt)),
      db.select().from(materialRequestItems).where(eq(materialRequestItems.ownerEmail, session.ownerEmail)).orderBy(asc(materialRequestItems.position)),
      db.select().from(workOrderActivities).where(and(eq(workOrderActivities.ownerEmail, session.ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId))),
      db.select({ publicId: catalogItems.publicId, code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit, type: catalogItems.type }).from(catalogItems).where(and(eq(catalogItems.ownerEmail, session.ownerEmail), eq(catalogItems.active, true))).orderBy(asc(catalogItems.code)),
      db.select().from(inventoryBalances).where(eq(inventoryBalances.ownerEmail, session.ownerEmail)),
      db.select().from(materialAllocations).where(eq(materialAllocations.ownerEmail, session.ownerEmail)),
    ]);
    const titles = new Map(activities.map((activity) => [activity.publicId, activityTitle(activity.payloadJson)]));
    return Response.json({
      requests: requests.map((materialRequest) => ({
        ...materialRequest,
        activityTitle: titles.get(materialRequest.activityPublicId) || "Actividad eliminada",
        items: items.filter((item) => item.requestPublicId === materialRequest.publicId).map((item) => ({ ...item, quantity: Number(item.quantity) })),
        allocations: allocations.filter((allocation) => allocation.materialRequestPublicId === materialRequest.publicId).map((allocation) => ({ ...allocation, requestedQuantity: Number(allocation.requestedQuantity), reservedQuantity: Number(allocation.reservedQuantity), issuedQuantity: Number(allocation.issuedQuantity), returnedQuantity: Number(allocation.returnedQuantity) })),
      })),
      requestOptions: catalog.filter((item) => item.type.toLowerCase().includes("material")).map((item) => ({ ...item, available: balances.filter((balance) => balance.catalogItemPublicId === item.publicId).reduce((sum, balance) => sum + Math.max(0, Number(balance.quantity) - Number(balance.reservedQuantity)), 0) })),
      canApprove: session.permissions.includes("materials.approve"),
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar las solicitudes." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = createSchema.parse(await request.json());
    const order = await accessibleOrder(input.workOrderPublicId, session);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite solicitudes de material." }, { status: 409 });
    const db = getDb();
    const [activity] = await db.select().from(workOrderActivities).where(and(
      eq(workOrderActivities.ownerEmail, session.ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId), eq(workOrderActivities.publicId, input.activityPublicId),
    )).limit(1);
    if (!activity) return Response.json({ error: "Seleccione una actividad válida de esta orden." }, { status: 409 });
    const publicId = crypto.randomUUID();
    const now = new Date().toISOString();
    await db.insert(materialRequests).values({
      publicId, ownerEmail: session.ownerEmail, workOrderPublicId: order.publicId, activityPublicId: activity.publicId,
      status: "Pendiente", urgency: input.urgency, neededDate: input.neededDate, justification: input.justification,
      requestedByUserPublicId: session.user.publicId, requestedBy: session.user.name || session.user.email,
      createdAt: now, updatedAt: now,
    });
    await db.insert(materialRequestItems).values(input.items.map((item, position) => ({
      publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, requestPublicId: publicId, position,
      catalogItemPublicId: item.catalogItemPublicId, code: item.code, description: item.description,
      quantity: String(item.quantity), unit: item.unit,
    })));
    await writeAuditEvent(session, { action: "MATERIAL_REQUEST_CREATED", entityType: "material_request", entityPublicId: publicId, detail: { workOrderPublicId: order.publicId, activityPublicId: activity.publicId, urgency: input.urgency, items: input.items.length } });
    return Response.json({ ok: true, publicId }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise la actividad, el material y la cantidad solicitada." : error instanceof Error ? error.message : "No fue posible crear la solicitud.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("materials.approve");
    const input = reviewSchema.parse(await request.json());
    const db = getDb();
    const [materialRequest] = await db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.publicId, input.publicId))).limit(1);
    if (!materialRequest) return Response.json({ error: "La solicitud no existe." }, { status: 404 });
    const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, materialRequest.workOrderPublicId))).limit(1);
    if (order && isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite cambios en materiales." }, { status: 409 });
    const now = new Date().toISOString();
    await db.update(materialRequests).set({ status: input.status, responseNotes: input.responseNotes, reviewedBy: session.user.name || session.user.email, reviewedAt: now, updatedAt: now }).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.publicId, input.publicId)));
    if (materialRequest.requestedByUserPublicId) {
      await db.insert(userNotifications).values({
        publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, recipientUserPublicId: materialRequest.requestedByUserPublicId,
        recipientEmail: "", type: "MATERIAL_REQUEST_UPDATED", title: `Solicitud de material ${input.status.toLowerCase()}`,
        message: `Orden ${materialRequest.workOrderPublicId.slice(0, 8)} · ${input.responseNotes || "Revise el detalle en la orden."}`,
        entityType: "work_order", entityPublicId: materialRequest.workOrderPublicId, readAt: "", createdAt: now,
      });
    }
    await writeAuditEvent(session, { action: "MATERIAL_REQUEST_REVIEWED", entityType: "material_request", entityPublicId: materialRequest.publicId, detail: { previousStatus: materialRequest.status, status: input.status, workOrderPublicId: materialRequest.workOrderPublicId } });
    return Response.json({ ok: true });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise el estado de la solicitud." : error instanceof Error ? error.message : "No fue posible revisar la solicitud.";
    return Response.json({ error: message }, { status: 400 });
  }
}
