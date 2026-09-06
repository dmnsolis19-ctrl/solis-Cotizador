import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { workOrders, workOrderSignoffs } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder, isWorkOrderClosed } from "@/lib/work-orders";

const signoffSchema = z.object({
  workOrderPublicId: z.string().min(8),
  customerName: z.string().trim().min(3).max(160),
  customerRole: z.string().trim().max(120).default(""),
  notes: z.string().trim().max(1000).default(""),
  signatureDataUrl: z.string().max(2_000_000).startsWith("data:image/png;base64,"),
});

async function ownerPrefix(ownerEmail: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownerEmail.toLowerCase()));
  return [...new Uint8Array(digest)].slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function decodePng(dataUrl: string) {
  const encoded = dataUrl.slice("data:image/png;base64,".length);
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.byteLength < 100 || bytes.byteLength > 1_000_000) throw new Error("La firma no tiene un tamaño válido.");
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((value, index) => bytes[index] === value)) throw new Error("La firma no es una imagen PNG válida.");
  return bytes;
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = signoffSchema.parse(await request.json());
    const db = getDb();
    const [order] = await db.select().from(workOrders).where(and(
      eq(workOrders.ownerEmail, session.ownerEmail),
      eq(workOrders.publicId, input.workOrderPublicId),
    )).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (!canAccessWorkOrder(session.user.role, session.user, order)) {
      throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
    }
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite una nueva conformidad." }, { status: 409 });
    if (!env.BUCKET) return Response.json({ error: "El almacenamiento de firmas no está disponible." }, { status: 503 });
    const bytes = decodePng(input.signatureDataUrl);
    const publicId = crypto.randomUUID();
    const fileName = `${order.number.replace(/[^a-zA-Z0-9._-]+/g, "_")}_conformidad_${publicId.slice(0, 8)}.png`;
    const storageKey = `${await ownerPrefix(session.ownerEmail)}/work-order-signoffs/${order.publicId}/${publicId}/${fileName}`;
    await env.BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: "image/png", contentDisposition: `inline; filename="${fileName}"` },
      customMetadata: { workOrderPublicId: order.publicId, customerName: input.customerName, capturedBy: session.user.email },
    });
    const signedAt = new Date().toISOString();
    await db.insert(workOrderSignoffs).values({
      publicId,
      ownerEmail: session.ownerEmail,
      workOrderPublicId: order.publicId,
      customerName: input.customerName,
      customerRole: input.customerRole,
      notes: input.notes,
      storageKey,
      signedAt,
      createdByUserPublicId: session.user.publicId,
      createdBy: session.user.name,
      createdAt: signedAt,
    });
    await writeAuditEvent(session, { action: "WORK_ORDER_SIGNED_OFF", entityType: "work_order_signoff", entityPublicId: publicId, detail: { workOrderPublicId: order.publicId, customerName: input.customerName, signedAt } });
    return Response.json({ signoff: { publicId, customerName: input.customerName, customerRole: input.customerRole, notes: input.notes, signedAt, createdBy: session.user.name } }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Ingrese el nombre del receptor y una firma válida." : error instanceof Error ? error.message : "No fue posible registrar la conformidad.";
    return Response.json({ error: message }, { status: 400 });
  }
}
