import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { workOrderEvidence, workOrders } from "@/db/schema";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder } from "@/lib/work-orders";

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const session = await requirePermission("orders.execute");
    const { publicId } = await context.params;
    const db = getDb();
    const [evidence] = await db.select().from(workOrderEvidence).where(and(
      eq(workOrderEvidence.ownerEmail, session.ownerEmail),
      eq(workOrderEvidence.publicId, publicId),
    )).limit(1);
    if (!evidence) return Response.json({ error: "La evidencia no existe." }, { status: 404 });
    const [order] = await db.select().from(workOrders).where(and(
      eq(workOrders.ownerEmail, session.ownerEmail),
      eq(workOrders.publicId, evidence.workOrderPublicId),
    )).limit(1);
    if (!order || !canAccessWorkOrder(session.user.role, session.user, order)) {
      throw new AuthorizationError("Esta evidencia no pertenece a una orden asignada a su usuario.", 403);
    }
    if (!env.BUCKET) return Response.json({ error: "El almacenamiento no está disponible." }, { status: 503 });
    const object = await env.BUCKET.get(evidence.storageKey);
    if (!object) return Response.json({ error: "El archivo no está disponible." }, { status: 404 });
    return new Response(object.body, {
      headers: {
        "Content-Type": evidence.contentType,
        "Content-Length": String(evidence.byteSize),
        "Content-Disposition": `inline; filename="${evidence.fileName.replace(/[^a-zA-Z0-9._-]+/g, "_")}"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible abrir la evidencia." }, { status: 400 });
  }
}
