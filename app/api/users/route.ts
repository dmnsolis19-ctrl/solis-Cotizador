import { and, asc, count, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appUsers, authCredentials } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { ROLES } from "@/lib/permissions";
import { hashPassword, newSalt } from "@/lib/password";

const createSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  password: z.string().min(10).max(128),
});

const updateSchema = z.object({
  publicId: z.string().min(8),
  name: z.string().trim().min(2).max(120),
  role: z.enum(ROLES),
  active: z.boolean(),
});

export async function GET() {
  try {
    const session = await requirePermission("users.manage");
    const users = await getDb().select().from(appUsers)
      .where(eq(appUsers.ownerEmail, session.ownerEmail)).orderBy(asc(appUsers.name));
    return Response.json({ users });
  } catch (error) {
    return authorizationResponse(error) ?? Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar los usuarios." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const input = createSchema.parse(await request.json());
    const db = getDb();
    const [existing] = await db.select().from(appUsers).where(eq(appUsers.email, input.email)).limit(1);
    if (existing) return Response.json({ error: "Este correo ya está registrado." }, { status: 409 });
    const now = new Date().toISOString();
    const publicId = crypto.randomUUID();
    const salt = newSalt();
    await db.batch([
      db.insert(appUsers).values({
        publicId, ownerEmail: session.ownerEmail, email: input.email, name: input.name, role: input.role,
        active: true, createdBy: session.user.email, createdAt: now, updatedAt: now,
      }),
      db.insert(authCredentials).values({
        userPublicId: publicId, passwordHash: await hashPassword(input.password, salt), passwordSalt: salt,
        iterations: 210000, updatedAt: now,
      }),
    ]);
    await writeAuditEvent(session, { action: "USER_CREATED", entityType: "user", entityPublicId: publicId, detail: { email: input.email, role: input.role } });
    const [user] = await db.select().from(appUsers).where(and(eq(appUsers.ownerEmail, session.ownerEmail), eq(appUsers.publicId, publicId))).limit(1);
    return Response.json({ user }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise nombre, correo, rol y contraseña (mínimo 10 caracteres)." : error instanceof Error ? error.message : "No fue posible crear el usuario.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("users.manage");
    const input = updateSchema.parse(await request.json());
    const db = getDb();
    const [target] = await db.select().from(appUsers).where(and(eq(appUsers.ownerEmail, session.ownerEmail), eq(appUsers.publicId, input.publicId))).limit(1);
    if (!target) return Response.json({ error: "El usuario no existe." }, { status: 404 });
    if (target.publicId === session.user.publicId && (!input.active || input.role !== target.role)) {
      return Response.json({ error: "No puede desactivar ni cambiar su propio rol." }, { status: 409 });
    }
    if (target.role === "administrator" && (input.role !== "administrator" || !input.active)) {
      const [{ value }] = await db.select({ value: count() }).from(appUsers).where(and(
        eq(appUsers.ownerEmail, session.ownerEmail), eq(appUsers.role, "administrator"), eq(appUsers.active, true),
      ));
      if (Number(value) <= 1) return Response.json({ error: "La cuenta debe conservar al menos un administrador activo." }, { status: 409 });
    }
    await db.update(appUsers).set({ name: input.name, role: input.role, active: input.active, updatedAt: new Date().toISOString() })
      .where(and(eq(appUsers.ownerEmail, session.ownerEmail), eq(appUsers.publicId, target.publicId)));
    await writeAuditEvent(session, { action: "USER_UPDATED", entityType: "user", entityPublicId: target.publicId, detail: { email: target.email, previousRole: target.role, role: input.role, active: input.active } });
    return Response.json({ ok: true });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise el usuario, rol y estado." : error instanceof Error ? error.message : "No fue posible actualizar el usuario.";
    return Response.json({ error: message }, { status: 400 });
  }
}
