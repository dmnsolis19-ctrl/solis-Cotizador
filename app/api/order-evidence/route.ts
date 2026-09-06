import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { workOrderEvidence, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder, isWorkOrderClosed } from "@/lib/work-orders";

const metadataSchema = z.object({
  workOrderPublicId: z.string().min(8),
  caption: z.string().trim().max(300).default(""),
});
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_BYTES = 8 * 1024 * 1024;

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_").slice(-120) || "evidencia.jpg";
}

async function ownerPrefix(ownerEmail: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownerEmail.toLowerCase()));
  return [...new Uint8Array(digest)].slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("");
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const form = await request.formData();
    const input = metadataSchema.parse({
      workOrderPublicId: form.get("workOrderPublicId"),
      caption: form.get("caption") || "",
    });
    const file = form.get("file");
    if (!(file instanceof File)) return Response.json({ error: "Seleccione una fotografía." }, { status: 400 });
    if (!ALLOWED_TYPES.has(file.type)) return Response.json({ error: "Use una imagen JPG, PNG o WebP." }, { status: 415 });
    if (!file.size || file.size > MAX_BYTES) return Response.json({ error: "La fotografía debe pesar como máximo 8 MB." }, { status: 413 });
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(and(
      eq(workOrders.ownerEmail, session.ownerEmail),
      eq(workOrders.publicId, input.workOrderPublicId),
    )).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (!canAccessWorkOrder(session.user.role, session.user, order)) {
      throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
    }
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite nuevas evidencias." }, { status: 409 });
    if (!env.BUCKET) return Response.json({ error: "El almacenamiento de evidencias no está disponible." }, { status: 503 });
    const publicId = crypto.randomUUID();
    const fileName = safeName(file.name);
    const storageKey = `${await ownerPrefix(session.ownerEmail)}/work-order-evidence/${order.publicId}/${publicId}/${fileName}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    await env.BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: file.type, contentDisposition: `inline; filename="${fileName}"` },
      customMetadata: { workOrderPublicId: order.publicId, uploadedBy: session.user.email },
    });
    const createdAt = new Date().toISOString();
    await db.insert(workOrderEvidence).values({
      publicId,
      ownerEmail: session.ownerEmail,
      workOrderPublicId: order.publicId,
      storageKey,
      fileName,
      contentType: file.type,
      byteSize: bytes.byteLength,
      caption: input.caption,
      createdByUserPublicId: session.user.publicId,
      createdBy: session.user.name,
      createdAt,
    });
    await writeAuditEvent(session, { action: "WORK_EVIDENCE_UPLOADED", entityType: "work_order_evidence", entityPublicId: publicId, detail: { workOrderPublicId: order.publicId, fileName, byteSize: bytes.byteLength } });
    return Response.json({ evidence: { publicId, fileName, contentType: file.type, byteSize: bytes.byteLength, caption: input.caption, createdBy: session.user.name, createdAt } }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise la orden y la descripción de la evidencia." : error instanceof Error ? error.message : "No fue posible guardar la evidencia.";
    return Response.json({ error: message }, { status: 400 });
  }
}
