import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { clients } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { isValidChileRut, normalizeChileRut } from "@/lib/clients";

const clientFieldsSchema = z.object({
  name: z.string().trim().min(2).max(180),
  taxId: z.string().trim().max(20).refine(isValidChileRut, "El RUT no es válido.").default(""),
  contactName: z.string().trim().max(180).default(""),
  email: z.string().trim().max(254).refine((value) => !value || z.string().email().safeParse(value).success, "El correo no es válido.").default(""),
  phone: z.string().trim().max(60).default(""),
  address: z.string().trim().max(500).default(""),
});
const createClientSchema = clientFieldsSchema.extend({ publicId: z.string().uuid().optional() });
const updateClientSchema = clientFieldsSchema.extend({
  publicId: z.string().uuid(),
  expectedUpdatedAt: z.string().min(1).optional(),
});

function clientRecord(input: z.infer<typeof clientFieldsSchema>) {
  return { ...input, taxId: normalizeChileRut(input.taxId) };
}

async function duplicateRut(db: ReturnType<typeof getDb>, ownerEmail: string, taxId: string, excludePublicId = "") {
  if (!taxId) return false;
  const rows = await db.select({ publicId: clients.publicId, taxId: clients.taxId }).from(clients).where(and(
    eq(clients.ownerEmail, ownerEmail),
    eq(clients.active, true),
  ));
  return rows.some((row) => row.publicId !== excludePublicId && normalizeChileRut(row.taxId) === taxId);
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("clients.write");
    const ownerEmail = session.ownerEmail;
    const input = createClientSchema.parse(await request.json());
    const publicId = input.publicId ?? crypto.randomUUID();
    const db = getDb();
    const [existing] = await db.select().from(clients).where(eq(clients.publicId, publicId)).limit(1);
    if (existing) return Response.json({ error: "Ya existe un cliente con ese identificador." }, { status: 409 });
    const { publicId: _requestedPublicId, ...fields } = input;
    void _requestedPublicId;
    const record = clientRecord(fields);
    if (await duplicateRut(db, ownerEmail, record.taxId)) {
      return Response.json({ error: "Ya existe un cliente activo con ese RUT." }, { status: 409 });
    }
    const updatedAt = new Date().toISOString();
    await db.insert(clients).values({ publicId, ownerEmail, ...record, payloadJson: JSON.stringify(record), updatedAt });
    const [row] = await db.select().from(clients).where(and(eq(clients.ownerEmail, ownerEmail), eq(clients.publicId, publicId))).limit(1);
    await writeAuditEvent(session, { action: "CLIENT_CREATED", entityType: "client", entityPublicId: publicId, detail: { name: record.name, taxId: record.taxId } });
    return Response.json({ client: row }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise los datos obligatorios del cliente." : error instanceof Error ? error.message : "No fue posible guardar el cliente.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("clients.write");
    const ownerEmail = session.ownerEmail;
    const input = updateClientSchema.parse(await request.json());
    const db = getDb();
    const [existing] = await db.select().from(clients).where(and(
      eq(clients.ownerEmail, ownerEmail),
      eq(clients.publicId, input.publicId),
      eq(clients.active, true),
    )).limit(1);
    if (!existing) return Response.json({ error: "El cliente no existe o está inactivo." }, { status: 404 });
    if (input.expectedUpdatedAt && input.expectedUpdatedAt !== existing.updatedAt) {
      return Response.json({ error: "El cliente cambió en otro dispositivo. Actualice los datos antes de guardar nuevamente." }, { status: 409 });
    }

    const { publicId, expectedUpdatedAt: _expectedUpdatedAt, ...fields } = input;
    void _expectedUpdatedAt;
    const record = clientRecord(fields);
    if (await duplicateRut(db, ownerEmail, record.taxId, publicId)) {
      return Response.json({ error: "Ya existe otro cliente activo con ese RUT." }, { status: 409 });
    }
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(existing.updatedAt) + 1)).toISOString();
    const [row] = await db.update(clients).set({
      ...record,
      payloadJson: JSON.stringify(record),
      updatedAt,
    }).where(and(
      eq(clients.ownerEmail, ownerEmail),
      eq(clients.publicId, publicId),
      eq(clients.updatedAt, input.expectedUpdatedAt || existing.updatedAt),
      eq(clients.active, true),
    )).returning();
    if (!row) {
      return Response.json({ error: "El cliente cambió en otro dispositivo. Actualice los datos antes de guardar nuevamente." }, { status: 409 });
    }
    await writeAuditEvent(session, {
      action: "CLIENT_UPDATED",
      entityType: "client",
      entityPublicId: publicId,
      detail: { previousName: existing.name, name: row.name, taxId: row.taxId, updatedAt },
    });
    return Response.json({ client: row });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? error.issues[0]?.message || "Revise los datos del cliente." : error instanceof Error ? error.message : "No fue posible actualizar el cliente.";
    return Response.json({ error: message }, { status: 400 });
  }
}
