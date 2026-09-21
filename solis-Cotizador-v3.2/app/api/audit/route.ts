import { desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { auditEvents } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requirePermission("audit.read");
    const events = await getDb().select().from(auditEvents)
      .where(eq(auditEvents.ownerEmail, session.ownerEmail)).orderBy(desc(auditEvents.createdAt)).limit(300);
    return Response.json({ events });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar la auditoría." }, { status: 400 });
  }
}
