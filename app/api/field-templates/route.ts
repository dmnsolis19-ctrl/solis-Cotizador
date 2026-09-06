import { and, asc, eq, max } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { fieldWorkTemplateActivities, fieldWorkTemplates, workOrderActivities, workOrders } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { canAccessWorkOrder, isWorkOrderClosed } from "@/lib/work-orders";

const activitySchema = z.object({
  title: z.string().trim().min(2).max(200),
  required: z.boolean().default(true),
  notes: z.string().trim().max(1000).default(""),
});

const actionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create"),
    name: z.string().trim().min(3).max(120),
    category: z.string().trim().min(2).max(80).default("General"),
    description: z.string().trim().max(500).default(""),
    activities: z.array(activitySchema).min(1).max(100),
  }),
  z.object({
    action: z.literal("apply"),
    templatePublicId: z.string().uuid(),
    workOrderPublicId: z.string().min(8),
  }),
]);

export async function GET() {
  try {
    const session = await requirePermission("orders.execute");
    const db = getDb();
    const templates = await db.select().from(fieldWorkTemplates).where(and(
      eq(fieldWorkTemplates.ownerEmail, session.ownerEmail),
      eq(fieldWorkTemplates.active, true),
    )).orderBy(asc(fieldWorkTemplates.category), asc(fieldWorkTemplates.name));
    const activities = await db.select().from(fieldWorkTemplateActivities).where(eq(fieldWorkTemplateActivities.ownerEmail, session.ownerEmail)).orderBy(asc(fieldWorkTemplateActivities.position));
    return Response.json({
      templates: templates.map((template) => ({
        ...template,
        activities: activities.filter((activity) => activity.templatePublicId === template.publicId),
      })),
      canManage: session.permissions.includes("field_templates.manage"),
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar las plantillas." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("orders.execute");
    const input = actionSchema.parse(await request.json());
    const db = getDb();
    const now = new Date().toISOString();

    if (input.action === "create") {
      if (!session.permissions.includes("field_templates.manage")) {
        throw new AuthorizationError("Su rol no permite crear plantillas de terreno.", 403);
      }
      const publicId = crypto.randomUUID();
      await db.insert(fieldWorkTemplates).values({
        publicId, ownerEmail: session.ownerEmail, name: input.name, category: input.category,
        description: input.description, active: true, createdBy: session.user.name || session.user.email,
        createdAt: now, updatedAt: now,
      });
      await db.insert(fieldWorkTemplateActivities).values(input.activities.map((activity, position) => ({
        publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, templatePublicId: publicId,
        position, title: activity.title, required: activity.required, defaultNotes: activity.notes,
      })));
      await writeAuditEvent(session, { action: "FIELD_TEMPLATE_CREATED", entityType: "field_work_template", entityPublicId: publicId, detail: { name: input.name, category: input.category, activities: input.activities.length } });
      return Response.json({ ok: true, publicId }, { status: 201 });
    }

    const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, input.workOrderPublicId))).limit(1);
    if (!order) return Response.json({ error: "La orden no existe." }, { status: 404 });
    if (!canAccessWorkOrder(session.user.role, session.user, order)) throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
    if (isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite nuevas actividades." }, { status: 409 });
    const [template] = await db.select().from(fieldWorkTemplates).where(and(
      eq(fieldWorkTemplates.ownerEmail, session.ownerEmail), eq(fieldWorkTemplates.publicId, input.templatePublicId), eq(fieldWorkTemplates.active, true),
    )).limit(1);
    if (!template) return Response.json({ error: "La plantilla no está disponible." }, { status: 404 });
    const templateActivities = await db.select().from(fieldWorkTemplateActivities).where(and(
      eq(fieldWorkTemplateActivities.ownerEmail, session.ownerEmail), eq(fieldWorkTemplateActivities.templatePublicId, template.publicId),
    )).orderBy(asc(fieldWorkTemplateActivities.position));
    if (!templateActivities.length) return Response.json({ error: "La plantilla no contiene actividades." }, { status: 409 });
    const [{ value }] = await db.select({ value: max(workOrderActivities.position) }).from(workOrderActivities).where(and(
      eq(workOrderActivities.ownerEmail, session.ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId),
    ));
    const start = Number(value ?? -1) + 1;
    await db.insert(workOrderActivities).values(templateActivities.map((activity, offset) => ({
      publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, workOrderPublicId: order.publicId,
      position: start + offset, payloadJson: JSON.stringify({ title: activity.title, required: activity.required, completed: false, notes: activity.defaultNotes, template_public_id: template.publicId }),
    })));
    await writeAuditEvent(session, { action: "FIELD_TEMPLATE_APPLIED", entityType: "work_order", entityPublicId: order.publicId, detail: { templatePublicId: template.publicId, templateName: template.name, activities: templateActivities.length } });
    return Response.json({ ok: true, added: templateActivities.length });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise el nombre y las actividades de la plantilla." : error instanceof Error ? error.message : "No fue posible actualizar la plantilla.";
    return Response.json({ error: message }, { status: 400 });
  }
}
