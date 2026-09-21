import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { documentSnapshots, workOrders } from "@/db/schema";
import { AuthorizationError, authorizationResponse, requireSession } from "@/lib/auth";
import { canAccessWorkOrder } from "@/lib/work-orders";

function dispositionName(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "_");
}

export async function GET(_request: Request, context: { params: Promise<{ publicId: string }> }) {
  try {
    const session = await requireSession();
    const ownerEmail = session.ownerEmail;
    const { publicId } = await context.params;
    const [metadata] = await getDb().select().from(documentSnapshots).where(and(
      eq(documentSnapshots.ownerEmail, ownerEmail),
      eq(documentSnapshots.publicId, publicId),
    )).limit(1);
    if (!metadata) return Response.json({ error: "El documento no existe." }, { status: 404 });
    const permission = metadata.entityType === "quote" ? "documents.quote" : metadata.entityType === "work_order" ? "documents.order" : metadata.entityType === "closure_report" ? "documents.closure" : metadata.entityType === "collection_document" ? "documents.collection" : "documents.purchase";
    if (!session.permissions.includes(permission)) throw new AuthorizationError("Su rol no permite descargar este documento.", 403);
    if (session.user.role === "technician" && metadata.securityProfile !== "operational_v2") {
      throw new AuthorizationError("Este PDF antiguo contiene información comercial y no está disponible para el rol técnico. Genere una nueva versión operativa.", 403);
    }
    if (metadata.entityType === "work_order" && session.user.role === "technician") {
      const [order] = await getDb().select().from(workOrders).where(and(
        eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, metadata.entityPublicId),
      )).limit(1);
      if (!order || !canAccessWorkOrder(session.user.role, session.user, order)) {
        throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
      }
    }
    if (!env.BUCKET) return Response.json({ error: "El almacenamiento documental R2 no está disponible." }, { status: 503 });
    const object = await env.BUCKET.get(metadata.storageKey);
    if (!object) return Response.json({ error: "El archivo no está disponible en R2." }, { status: 404 });
    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set("Content-Type", "application/pdf");
    headers.set("Content-Disposition", `attachment; filename="${dispositionName(metadata.fileName)}"`);
    headers.set("Content-Length", String(metadata.byteSize));
    headers.set("Cache-Control", "private, no-store");
    headers.set("ETag", metadata.sha256);
    return new Response(object.body, { headers });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible descargar el documento." }, { status: 400 });
  }
}
