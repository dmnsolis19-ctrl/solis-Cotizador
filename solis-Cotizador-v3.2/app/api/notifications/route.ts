import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { userNotifications } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";

const updateSchema = z.object({
  publicId: z.string().uuid().optional(),
  markAll: z.boolean().optional(),
}).refine((value) => value.publicId || value.markAll, "Seleccione una notificación.");

export async function GET() {
  try {
    const session = await requirePermission("notifications.read");
    const db = getDb();
    const where = and(
      eq(userNotifications.ownerEmail, session.ownerEmail),
      eq(userNotifications.recipientUserPublicId, session.user.publicId),
    );
    const [notifications, [unread]] = await Promise.all([
      db.select().from(userNotifications).where(where).orderBy(desc(userNotifications.createdAt)).limit(50),
      db.select({ value: count() }).from(userNotifications).where(and(where, eq(userNotifications.readAt, ""))),
    ]);
    return Response.json({ notifications, unreadCount: Number(unread?.value || 0) });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar las notificaciones." }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("notifications.read");
    const input = updateSchema.parse(await request.json());
    const db = getDb();
    const ownerAndRecipient = and(
      eq(userNotifications.ownerEmail, session.ownerEmail),
      eq(userNotifications.recipientUserPublicId, session.user.publicId),
    );
    const where = input.markAll
      ? and(ownerAndRecipient, eq(userNotifications.readAt, ""))
      : and(ownerAndRecipient, eq(userNotifications.publicId, input.publicId!));
    await db.update(userNotifications).set({ readAt: new Date().toISOString() }).where(where);
    return Response.json({ ok: true });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Seleccione una notificación válida." : error instanceof Error ? error.message : "No fue posible actualizar la notificación." }, { status: 400 });
  }
}
