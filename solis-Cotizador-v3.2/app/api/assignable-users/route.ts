import { and, asc, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db";
import { appUsers } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requirePermission("orders.assign");
    const users = await getDb().select({
      publicId: appUsers.publicId,
      email: appUsers.email,
      name: appUsers.name,
      role: appUsers.role,
    }).from(appUsers).where(and(
      eq(appUsers.ownerEmail, session.ownerEmail),
      eq(appUsers.active, true),
      inArray(appUsers.role, ["technician", "supervisor"]),
    )).orderBy(asc(appUsers.name));
    return Response.json({ users });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar los responsables." }, { status: 400 });
  }
}
