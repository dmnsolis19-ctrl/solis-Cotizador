import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workOrders, workOrderSignoffs } from "@/db/schema";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder } from "@/lib/work-orders";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const session = await requirePermission("orders.execute");
    const { publicId } = await context.params;
    const db = getDb();
    const [signoff] = await db.select().from(workOrderSignoffs).where(and(
      eq(workOrderSignoffs.ownerEmail, session.ownerEmail),
      eq(workOrderSignoffs.publicId, publicId),
    )).limit(1);
    if (!signoff) return Response.json({ error: "La conformidad no existe." }, { status: 404 });
    const [order] = await db.select().from(workOrders).where(and(
      eq(workOrders.ownerEmail, session.ownerEmail),
      eq(workOrders.publicId, signoff.workOrderPublicId),
    )).limit(1);
    if (!order || !canAccessWorkOrder(session.user.role, session.user, order)) {
      throw new AuthorizationError("Esta conformidad no pertenece a una orden asignada a su usuario.", 403);
    }
    if (!env.BUCKET) return Response.json({ error: "El almacenamiento no está disponible." }, { status: 503 });
    const object = await env.BUCKET.get(signoff.storageKey);
    if (!object) return Response.json({ error: "La firma no está disponible." }, { status: 404 });
    return new Response(object.body, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store" } });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible abrir la firma." }, { status: 400 });
  }
}
