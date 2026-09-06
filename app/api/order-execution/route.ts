import { and, asc, desc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  workOrderActivities,
  workOrderCosts,
  workOrderEvidence,
  workOrders,
  workOrderSignoffs,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import {
  EXECUTION_ENTRY_TYPES,
  executionMetrics,
  type ExecutionActivity,
  type ExecutionEntry,
} from "@/lib/order-execution";
import { canAccessWorkOrder, isWorkOrderClosed } from "@/lib/work-orders";

const querySchema = z.object({ workOrderPublicId: z.string().min(8) });
const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("add_activity"),
    workOrderPublicId: z.string().min(8),
    title: z.string().trim().min(2).max(200),
    required: z.boolean().default(true),
    notes: z.string().trim().max(1000).default(""),
  }),
  z.object({
    action: z.literal("update_activity"),
    workOrderPublicId: z.string().min(8),
    activityPublicId: z.string().min(8),
    completed: z.boolean(),
    notes: z.string().trim().max(1000).default(""),
  }),
  z.object({
    action: z.literal("add_entry"),
    workOrderPublicId: z.string().min(8),
    entryType: z.enum(EXECUTION_ENTRY_TYPES),
    description: z.string().trim().min(2).max(240),
    quantity: z.number().positive().max(1_000_000),
    unit: z.string().trim().min(1).max(20),
    unitCost: z.number().min(0).max(1_000_000_000).default(0),
    entryDate: z.string().min(10).max(10),
  }),
]);

function jsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

function text(value: unknown, fallback = "") {
  return value == null ? fallback : String(value);
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

async function accessibleOrder(workOrderPublicId: string, session: Awaited<ReturnType<typeof requirePermission>>) {
  const [order] = await getDb().select().from(workOrders).where(and(
    eq(workOrders.ownerEmail, session.ownerEmail),
    eq(workOrders.publicId, workOrderPublicId),
  )).limit(1);
  if (!order) return null;
  if (!canAccessWorkOrder(session.user.role, session.user, order)) {
    throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
  }
  return order;
}

function normalizeActivity(row: typeof workOrderActivities.$inferSelect): ExecutionActivity {
  const payload = jsonObject(row.payloadJson);
  return {
    publicId: row.publicId,
    position: row.position,
    title: text(payload.title || payload.name || payload.description, "Actividad"),
    required: payload.required == null ? true : Boolean(payload.required),
    completed: Boolean(payload.completed) || number(payload.progress_percent) >= 100,
    notes: text(payload.notes || payload.observations),
    completedAt: text(payload.completed_at),
    completedBy: text(payload.completed_by),
  };
}

function normalizeEntry(row: typeof workOrderCosts.$inferSelect): ExecutionEntry {
  const payload = jsonObject(row.payloadJson);
  const rawType = text(payload.entry_type || payload.type).toLowerCase();
  const entryType = EXECUTION_ENTRY_TYPES.includes(rawType as ExecutionEntry["entryType"])
    ? rawType as ExecutionEntry["entryType"]
    : "expense";
  const quantity = number(payload.quantity, 1);
  const unitCost = number(payload.unit_cost || payload.unitCost);
  return {
    publicId: row.publicId,
    entryType,
    description: text(payload.description || payload.name || payload.detail, "Registro importado"),
    quantity,
    unit: text(payload.unit, entryType === "hours" ? "h" : "un"),
    unitCost,
    total: number(payload.total, quantity * unitCost),
    entryDate: row.entryDate,
    recordedBy: text(payload.recorded_by || payload.actor),
  };
}

export async function GET(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = querySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const order = await accessibleOrder(input.workOrderPublicId, session);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    const db = getDb();
    const [activityRows, entryRows, evidence, signoffs] = await Promise.all([
      db.select().from(workOrderActivities).where(and(eq(workOrderActivities.ownerEmail, session.ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId))).orderBy(asc(workOrderActivities.position)),
      db.select().from(workOrderCosts).where(and(eq(workOrderCosts.ownerEmail, session.ownerEmail), eq(workOrderCosts.workOrderPublicId, order.publicId))).orderBy(desc(workOrderCosts.entryDate)),
      db.select({
        publicId: workOrderEvidence.publicId,
        fileName: workOrderEvidence.fileName,
        contentType: workOrderEvidence.contentType,
        byteSize: workOrderEvidence.byteSize,
        caption: workOrderEvidence.caption,
        createdBy: workOrderEvidence.createdBy,
        createdAt: workOrderEvidence.createdAt,
      }).from(workOrderEvidence).where(and(eq(workOrderEvidence.ownerEmail, session.ownerEmail), eq(workOrderEvidence.workOrderPublicId, order.publicId))).orderBy(desc(workOrderEvidence.createdAt)),
      db.select({
        publicId: workOrderSignoffs.publicId,
        customerName: workOrderSignoffs.customerName,
        customerRole: workOrderSignoffs.customerRole,
        notes: workOrderSignoffs.notes,
        signedAt: workOrderSignoffs.signedAt,
        createdBy: workOrderSignoffs.createdBy,
      }).from(workOrderSignoffs).where(and(eq(workOrderSignoffs.ownerEmail, session.ownerEmail), eq(workOrderSignoffs.workOrderPublicId, order.publicId))).orderBy(desc(workOrderSignoffs.signedAt)).limit(20),
    ]);
    const activities = activityRows.map(normalizeActivity);
    const fullEntries = entryRows.map(normalizeEntry);
    const metrics = executionMetrics(activities, fullEntries);
    const showFinancials = session.user.role !== "technician";
    const entries = showFinancials ? fullEntries : fullEntries.map((entry) => ({ ...entry, unitCost: 0, total: 0 }));
    return Response.json({
      activities,
      entries,
      evidence,
      signoffs,
      metrics: showFinancials ? metrics : { ...metrics, realCost: 0 },
      showFinancials,
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "La orden no es válida." : error instanceof Error ? error.message : "No fue posible cargar el control de terreno.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = actionSchema.parse(await request.json());
    const order = await accessibleOrder(input.workOrderPublicId, session);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y sus registros reales están congelados." }, { status: 409 });
    const db = getDb();
    const now = new Date().toISOString();
    if (input.action === "add_activity") {
      const [{ value }] = await db.select({ value: max(workOrderActivities.position) }).from(workOrderActivities).where(and(
        eq(workOrderActivities.ownerEmail, session.ownerEmail),
        eq(workOrderActivities.workOrderPublicId, order.publicId),
      ));
      const publicId = crypto.randomUUID();
      await db.insert(workOrderActivities).values({
        publicId,
        ownerEmail: session.ownerEmail,
        workOrderPublicId: order.publicId,
        position: Number(value ?? -1) + 1,
        payloadJson: JSON.stringify({ title: input.title, required: input.required, completed: false, notes: input.notes }),
      });
      await writeAuditEvent(session, { action: "WORK_ACTIVITY_CREATED", entityType: "work_order_activity", entityPublicId: publicId, detail: { workOrderPublicId: order.publicId, title: input.title } });
      return Response.json({ ok: true, publicId }, { status: 201 });
    }
    if (input.action === "update_activity") {
      const [activity] = await db.select().from(workOrderActivities).where(and(
        eq(workOrderActivities.ownerEmail, session.ownerEmail),
        eq(workOrderActivities.workOrderPublicId, order.publicId),
        eq(workOrderActivities.publicId, input.activityPublicId),
      )).limit(1);
      if (!activity) return Response.json({ error: "La actividad no existe." }, { status: 404 });
      const payload = jsonObject(activity.payloadJson);
      await db.update(workOrderActivities).set({ payloadJson: JSON.stringify({
        ...payload,
        completed: input.completed,
        notes: input.notes,
        completed_at: input.completed ? now : "",
        completed_by: input.completed ? session.user.name : "",
      }) }).where(eq(workOrderActivities.publicId, activity.publicId));
      await writeAuditEvent(session, { action: "WORK_ACTIVITY_UPDATED", entityType: "work_order_activity", entityPublicId: activity.publicId, detail: { workOrderPublicId: order.publicId, completed: input.completed } });
      return Response.json({ ok: true });
    }
    const unitCost = session.user.role === "technician" ? 0 : input.unitCost;
    const publicId = crypto.randomUUID();
    await db.insert(workOrderCosts).values({
      publicId,
      ownerEmail: session.ownerEmail,
      workOrderPublicId: order.publicId,
      entryDate: input.entryDate,
      payloadJson: JSON.stringify({
        entry_type: input.entryType,
        description: input.description,
        quantity: input.quantity,
        unit: input.unit,
        unit_cost: unitCost,
        total: input.quantity * unitCost,
        recorded_by: session.user.name,
        recorded_at: now,
      }),
    });
    await writeAuditEvent(session, { action: "WORK_ENTRY_CREATED", entityType: "work_order_entry", entityPublicId: publicId, detail: { workOrderPublicId: order.publicId, entryType: input.entryType, quantity: input.quantity, unit: input.unit } });
    return Response.json({ ok: true, publicId }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise la actividad o el registro ingresado." : error instanceof Error ? error.message : "No fue posible actualizar el control de terreno.";
    return Response.json({ error: message }, { status: 400 });
  }
}
