import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { materialRequests, purchaseRequests, quotes, workOrderActivities, workOrderCosts, workOrders, workOrderSignoffs } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { closureBlockers, parseCostPayload, profitabilityMetrics } from "@/lib/profitability";
import { isWorkOrderClosed } from "@/lib/work-orders";

const closeSchema = z.object({
  workOrderPublicId: z.string().min(8),
  closureNotes: z.string().trim().min(5).max(1500),
  costReviewConfirmed: z.literal(true),
});

function activity(payloadJson: string) {
  try {
    const value = JSON.parse(payloadJson) as Record<string, unknown>;
    return {
      required: value.required == null ? true : Boolean(value.required),
      completed: Boolean(value.completed) || Number(value.progress_percent || 0) >= 100,
    };
  } catch { return { required: true, completed: false }; }
}

async function orderAnalysis(ownerEmail: string, order: typeof workOrders.$inferSelect) {
  const db = getDb();
  const [quoteRows, costRows, activityRows, materialRows, purchaseRows, signoffRows] = await Promise.all([
    db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, order.quotePublicId))).limit(1),
    db.select().from(workOrderCosts).where(and(eq(workOrderCosts.ownerEmail, ownerEmail), eq(workOrderCosts.workOrderPublicId, order.publicId))).orderBy(desc(workOrderCosts.entryDate)),
    db.select().from(workOrderActivities).where(and(eq(workOrderActivities.ownerEmail, ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId))),
    db.select({ status: materialRequests.status }).from(materialRequests).where(and(eq(materialRequests.ownerEmail, ownerEmail), eq(materialRequests.workOrderPublicId, order.publicId))),
    db.select({ status: purchaseRequests.status }).from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, ownerEmail), eq(purchaseRequests.workOrderPublicId, order.publicId))),
    db.select({ publicId: workOrderSignoffs.publicId }).from(workOrderSignoffs).where(and(eq(workOrderSignoffs.ownerEmail, ownerEmail), eq(workOrderSignoffs.workOrderPublicId, order.publicId))),
  ]);
  const quote = quoteRows[0];
  const metrics = isWorkOrderClosed(order)
    ? {
        sale: Number(order.approvedSale), budgetedCost: Number(order.budgetedCost), actualCost: Number(order.actualCost),
        actualProfit: Number(order.actualProfit), actualMarginPercent: Number(order.actualMarginPercent),
        budgetedProfit: Number(order.approvedSale) - Number(order.budgetedCost),
        budgetedMarginPercent: Number(order.approvedSale) > 0 ? (Number(order.approvedSale) - Number(order.budgetedCost)) / Number(order.approvedSale) * 100 : 0,
        budgetVariance: Number(order.actualCost) - Number(order.budgetedCost),
        breakdown: (JSON.parse(order.closureSnapshotJson || "{}") as { breakdown?: Record<string, number> }).breakdown || {},
      }
    : profitabilityMetrics(Number(order.approvedSale), Number(quote?.internalCost || 0), costRows.map((row) => parseCostPayload(row.payloadJson)));
  const blockers = closureBlockers({
    status: order.status,
    activities: activityRows.map((row) => activity(row.payloadJson)),
    materialStatuses: materialRows.map((row) => row.status),
    purchaseStatuses: purchaseRows.map((row) => row.status),
    signoffs: signoffRows.length,
  });
  return { quote, metrics, blockers, counts: { activities: activityRows.length, signoffs: signoffRows.length, materialRequests: materialRows.length, purchases: purchaseRows.length } };
}

export async function GET() {
  try {
    const session = await requirePermission("orders.profitability");
    const rows = await getDb().select().from(workOrders).where(eq(workOrders.ownerEmail, session.ownerEmail)).orderBy(desc(workOrders.updatedAt));
    const analyses = await Promise.all(rows.map(async (order) => {
      const analysis = await orderAnalysis(session.ownerEmail, order);
      return { ...order, ...analysis.metrics, blockers: isWorkOrderClosed(order) ? [] : analysis.blockers, readyToClose: !isWorkOrderClosed(order) && !analysis.blockers.length, counts: analysis.counts };
    }));
    return Response.json({ orders: analyses, canClose: session.permissions.includes("orders.close"), canDocument: session.permissions.includes("documents.closure") });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible calcular la rentabilidad." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.close");
    const input = closeSchema.parse(await request.json());
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, input.workOrderPublicId))).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden ya está cerrada y su resultado está congelado." }, { status: 409 });
    const analysis = await orderAnalysis(session.ownerEmail, order);
    if (analysis.blockers.length) return Response.json({ error: analysis.blockers.join(" "), blockers: analysis.blockers }, { status: 409 });
    const closedAt = new Date().toISOString();
    const closedBy = session.user.name || session.user.email;
    const snapshot = { ...analysis.metrics, breakdown: analysis.metrics.breakdown, counts: analysis.counts, closureNotes: input.closureNotes, closedAt, closedBy };
    await db.update(workOrders).set({
      status: "Cerrada", closedAt, closedBy, closureNotes: input.closureNotes,
      budgetedCost: String(analysis.metrics.budgetedCost), actualCost: String(analysis.metrics.actualCost),
      actualProfit: String(analysis.metrics.actualProfit), actualMarginPercent: String(analysis.metrics.actualMarginPercent),
      closureSnapshotJson: JSON.stringify(snapshot), updatedAt: closedAt,
    }).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, order.publicId)));
    await writeAuditEvent(session, { action: "WORK_ORDER_CLOSED", entityType: "work_order", entityPublicId: order.publicId, detail: snapshot });
    return Response.json({ ok: true, closedAt, closedBy, metrics: analysis.metrics });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Confirme la revisión de costos e ingrese una nota de cierre." : error instanceof Error ? error.message : "No fue posible cerrar la orden.";
    return Response.json({ error: message }, { status: 400 });
  }
}
