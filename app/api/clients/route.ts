import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";

const clientSchema = z.object({
  publicId: z.string().uuid().optional(),
  name: z.string().trim().min(2),
  taxId: z.string().trim().default(""),
  contactName: z.string().trim().default(""),
  email: z.string().trim().default(""),
  phone: z.string().trim().default(""),
  address: z.string().trim().default(""),
});

export async function POST(request: Request) {
  try {
    const session = await requirePermission("clients.write");
    const ownerEmail = session.ownerEmail;
    const input = clientSchema.parse(await request.json());
    const publicId = input.publicId ?? crypto.randomUUID();
    const db = getDb();
    const [existing] = await db.select().from(clients).where(eq(clients.publicId, publicId)).limit(1);
    if (existing && existing.ownerEmail !== ownerEmail) return Response.json({ error: "El identificador del cliente pertenece a otro espacio." }, { status: 409 });
    await db.insert(clients).values({
      publicId, ownerEmail, ...input, payloadJson: JSON.stringify(input), updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: clients.publicId,
      set: { ...input, payloadJson: JSON.stringify(input), updatedAt: new Date().toISOString() },
    });
    const [row] = await db.select().from(clients).where(and(eq(clients.ownerEmail, ownerEmail), eq(clients.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: existing ? "CLIENT_UPDATED" : "CLIENT_CREATED", entityType: "client", entityPublicId: publicId, detail: { name: input.name } });
    return Response.json({ client: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise los datos obligatorios del cliente." : error instanceof Error ? error.message : "No fue posible guardar el cliente.";
    return Response.json({ error: message }, { status: 400 });
  }
}
