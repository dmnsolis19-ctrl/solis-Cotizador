import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import type { AppSession } from "@/lib/auth";

export async function writeAuditEvent(session: AppSession, input: {
  action: string;
  entityType: string;
  entityPublicId?: string;
  detail?: Record<string, unknown>;
}) {
  await getDb().insert(auditEvents).values({
    publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail,
    actorEmail: session.user.email, actorName: session.user.name, actorRole: session.user.role,
    action: input.action, entityType: input.entityType, entityPublicId: input.entityPublicId || "",
    detailJson: JSON.stringify(input.detail || {}), createdAt: new Date().toISOString(),
  });
}
