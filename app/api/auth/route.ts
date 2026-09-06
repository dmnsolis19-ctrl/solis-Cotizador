import { count, eq, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { z } from "zod";
import { getDb } from "@/db";
import { appUsers, authAttempts, authCredentials, authSessions } from "@/db/schema";
import { SESSION_COOKIE, sha256 } from "@/lib/auth";
import { hashPassword, newSalt, secureEqual } from "@/lib/password";

const passwordSchema = z.string().min(10).max(128);
const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: passwordSchema,
});
const setupSchema = credentialsSchema.extend({ name: z.string().trim().min(2).max(120) });
const SESSION_HOURS = 8;
const MAX_FAILURES = 5;
const BLOCK_MINUTES = 15;

function sessionToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function setSession(userPublicId: string) {
  const token = sessionToken();
  const expires = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await getDb().insert(authSessions).values({
    tokenHash: await sha256(token), userPublicId, expiresAt: expires.toISOString(), createdAt: new Date().toISOString(),
  });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: "strict", path: "/", expires,
  });
}

export async function GET() {
  const [{ value }] = await getDb().select({ value: count() }).from(appUsers);
  return Response.json({ needsSetup: Number(value) === 0 });
}

export async function PUT(request: Request) {
  try {
    const input = setupSchema.parse(await request.json());
    const db = getDb();
    const [{ value }] = await db.select({ value: count() }).from(appUsers);
    
    if (Number(value) !== 0) return Response.json({ error: "La cuenta inicial ya fue configurada." }, { status: 409 });
    
    const now = new Date().toISOString();
    const publicId = crypto.randomUUID();
    const salt = newSalt();
    
    await db.batch([
      db.insert(appUsers).values({ publicId, ownerEmail: input.email, email: input.email, name: input.name, role: "administrator", active: true, createdBy: input.email, createdAt: now, updatedAt: now }),
      db.insert(authCredentials).values({ userPublicId: publicId, passwordHash: await hashPassword(input.password, salt), passwordSalt: salt, iterations: 100000, updatedAt: now }),
    ]);
    
    await setSession(publicId);
    return Response.json({ ok: true }, { status: 201 });
  } catch (error) {
    console.error("Fallo detectado en el servidor:", error);
    const realError = error instanceof Error ? error.message : String(error);
    return Response.json({ error: `Fallo técnico: ${realError}` }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const genericError = "Correo o contraseña incorrectos.";
  try {
    const input = credentialsSchema.parse(await request.json());
    const db = getDb();
    const now = new Date();
    const [attempt] = await db.select().from(authAttempts).where(eq(authAttempts.email, input.email)).limit(1);
    if (attempt?.blockedUntil && attempt.blockedUntil > now.toISOString()) {
      return Response.json({ error: "Demasiados intentos. Espere 15 minutos antes de volver a intentar." }, { status: 429 });
    }
    const [row] = await db.select({ user: appUsers, credential: authCredentials }).from(appUsers)
      .innerJoin(authCredentials, eq(authCredentials.userPublicId, appUsers.publicId))
      .where(eq(appUsers.email, input.email)).limit(1);
    const candidate = row ? await hashPassword(input.password, row.credential.passwordSalt, row.credential.iterations) : await hashPassword(input.password, "invalid-login-salt");
    if (!row || !row.user.active || !secureEqual(candidate, row.credential.passwordHash)) {
      const failures = (attempt?.failures || 0) + 1;
      const blockedUntil = failures >= MAX_FAILURES ? new Date(now.getTime() + BLOCK_MINUTES * 60 * 1000).toISOString() : "";
      await db.insert(authAttempts).values({ email: input.email, failures, blockedUntil, updatedAt: now.toISOString() })
        .onConflictDoUpdate({ target: authAttempts.email, set: { failures, blockedUntil, updatedAt: now.toISOString() } });
      return Response.json({ error: genericError }, { status: 401 });
    }
    await db.delete(authAttempts).where(eq(authAttempts.email, input.email));
    await db.delete(authSessions).where(lt(authSessions.expiresAt, now.toISOString()));
    await setSession(row.user.publicId);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json({ error: error instanceof z.ZodError ? genericError : "No fue posible iniciar sesión." }, { status: 401 });
  }
}

export async function DELETE() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) await getDb().delete(authSessions).where(eq(authSessions.tokenHash, await sha256(token)));
  cookieStore.delete(SESSION_COOKIE);
  return Response.json({ ok: true });
}
