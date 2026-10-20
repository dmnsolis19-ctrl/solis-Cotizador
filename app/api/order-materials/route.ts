import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings, materialRequestItems, materialRequests, quotes, workOrders } from "@/db/schema";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder } from "@/lib/work-orders";
import { readMaterialGroups, supplierMaterials } from "@/lib/material-groups";
import type { OrderMaterialsData } from "@/lib/order-materials";

export async function GET(request: Request) {
  try {
    const session = await requirePermission("documents.order");
    const publicId = z.string().min(8).max(120).parse(new URL(request.url).searchParams.get("publicId"));
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, publicId))).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (!canAccessWorkOrder(session.user.role, session.user, order)) throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
    const [[quote], [settings], requests] = await Promise.all([
      db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, order.quotePublicId))).limit(1),
      db.select().from(appSettings).where(eq(appSettings.ownerEmail, session.ownerEmail)).limit(1),
      db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.workOrderPublicId, order.publicId))).orderBy(desc(materialRequests.createdAt)).limit(200),
    ]);
    if (!quote) return Response.json({ error: "No se encontró la cotización de origen." }, { status: 409 });
    const requestIds = requests.map((row) => row.publicId);
    const requestItems = [] as Array<typeof materialRequestItems.$inferSelect>;
    for (let i = 0; i < requestIds.length; i += 80) requestItems.push(...await db.select().from(materialRequestItems).where(and(eq(materialRequestItems.ownerEmail, session.ownerEmail), inArray(materialRequestItems.requestPublicId, requestIds.slice(i, i + 80)))).orderBy(materialRequestItems.position));
    const rawCompany = JSON.parse(settings?.companyJson || "{}");
    const company = Object.fromEntries(["commercial_name", "name", "tax_id", "rut", "tagline", "address", "phone", "email", "logo_jpeg"].map((key) => [key, rawCompany[key] || ""]));
    const result: OrderMaterialsData = {
      company, order: { publicId: order.publicId, number: order.number, clientName: order.clientName, project: order.project, responsible: order.responsible, status: order.status }, quoteNumber: quote.number, preparedAt: new Date().toISOString(),
      groups: readMaterialGroups(quote.payloadJson).map((group) => ({ id: group.id, title: group.title, materials: supplierMaterials([group], true) })),
      requests: requests.map((row) => ({ publicId: row.publicId, number: row.publicId.slice(0, 8).toUpperCase(), status: row.status, items: requestItems.filter((item) => item.requestPublicId === row.publicId).map((item) => ({ description: item.description, quantity: Number(item.quantity), unit: item.unit })) })),
    };
    return Response.json(result, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Identificador no válido." : "No fue posible preparar los materiales de la orden." }, { status: 400 });
  }
}
