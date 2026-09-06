import { and, eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import { appUsers, authSessions } from "@/db/schema";
import { isAppRole, permissionsForRole, roleHasPermission, type AppRole, type Permission } from "@/lib/permissions";

export type AppSession = {
  ownerEmail: string;
  user: { publicId: string; email: string; name: string; role: AppRole };
  permissions: Permission[];
};

export class AuthorizationError extends Error {
  constructor(message: string, public status: 401 | 403) { super(message); }
}

export const SESSION_COOKIE = "solis_session";

export async function requireSession(): Promise<AppSession> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) throw new AuthorizationError("Debe iniciar sesión para usar SOLIS Cotizador.", 401);
  const db = getDb();
  const tokenHash = await sha256(token);
  const now = new Date().toISOString();
  const [row] = await db.select({ user: appUsers, session: authSessions }).from(authSessions)
    .innerJoin(appUsers, eq(appUsers.publicId, authSessions.userPublicId))
    .where(and(eq(authSessions.tokenHash, tokenHash), lt(now, authSessions.expiresAt))).limit(1);
  const user = row?.user;
  if (!user) throw new AuthorizationError("Debe iniciar sesión para usar SOLIS Cotizador.", 401);
  if (!user.active || !isAppRole(user.role)) throw new AuthorizationError("Su usuario no está habilitado en esta cuenta SOLIS.", 403);
  return {
    ownerEmail: user.ownerEmail,
    user: { publicId: user.publicId, email: user.email, name: user.name || user.email, role: user.role },
    permissions: permissionsForRole(user.role),
  };
}

export async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function requirePermission(permission: Permission) {
  const session = await requireSession();
  if (!roleHasPermission(session.user.role, permission)) throw new AuthorizationError("Su rol no permite realizar esta acción.", 403);
  return session;
}

export function authorizationResponse(error: unknown) {
  return error instanceof AuthorizationError ? Response.json({ error: error.message }, { status: error.status }) : null;
}
