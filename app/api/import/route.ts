import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  appSettings, catalogItems, clients, importHistory, quoteEvents, quoteItems, quotes, quoteTemplates,
  workOrderActivities, workOrderCosts, workOrders,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { authorizationResponse, requirePermission } from "@/lib/auth";

const backupSchema = z.object({
  contract: z.literal("solis.cotizador.v1"),
  schema_version: z.number().int().min(17).max(19),
  export_id: z.string().min(8),
  exported_at: z.string().default(""),
  company: z.record(z.string(), z.unknown()).default({}),
  economic_settings: z.record(z.string(), z.unknown()).default({}),
  clients: z.array(z.record(z.string(), z.unknown())).default([]),
  catalog_items: z.array(z.record(z.string(), z.unknown())).default([]),
  quote_templates: z.array(z.record(z.string(), z.unknown())).default([]),
  quotes: z.array(z.record(z.string(), z.unknown())).default([]),
  work_orders: z.array(z.record(z.string(), z.unknown())).default([]),
});

const s = (value: unknown) => value == null ? "" : String(value);
const n = (value: unknown, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const b = (value: unknown, fallback = true) => value == null ? fallback : Boolean(value);
const idOf = (row: Record<string, unknown>, prefix: string, position: number) => s(row.public_id) || `${prefix}-${position}-${crypto.randomUUID()}`;

export async function POST(request: Request) {
  try {
    const session = await requirePermission("imports.execute");
    const ownerEmail = session.ownerEmail;
    const backup = backupSchema.parse(await request.json());
    const db = getDb();
    const existingImport = await db.select().from(importHistory)
      .where(and(eq(importHistory.ownerEmail, ownerEmail), eq(importHistory.exportId, backup.export_id))).limit(1);
    if (existingImport.length) {
      return Response.json({ error: "Este respaldo ya fue importado.", duplicate: true }, { status: 409 });
    }

    await db.insert(appSettings).values({
      ownerEmail,
      companyJson: JSON.stringify(backup.company),
      economicSettingsJson: JSON.stringify(backup.economic_settings),
      sourceSchemaVersion: backup.schema_version,
      updatedAt: new Date().toISOString(),
    }).onConflictDoUpdate({
      target: appSettings.ownerEmail,
      set: {
        companyJson: JSON.stringify(backup.company),
        economicSettingsJson: JSON.stringify(backup.economic_settings),
        sourceSchemaVersion: backup.schema_version,
        updatedAt: new Date().toISOString(),
      },
    });

    for (const [position, row] of backup.clients.entries()) {
      const publicId = idOf(row, "client", position);
      const record = {
        publicId, ownerEmail,
        name: s(row.name || row.client_name || "Cliente sin nombre"), taxId: s(row.tax_id),
        contactName: s(row.contact_name), email: s(row.email), phone: s(row.phone), address: s(row.address),
        active: b(row.active), payloadJson: JSON.stringify(row), updatedAt: new Date().toISOString(),
      };
      await db.insert(clients).values(record).onConflictDoUpdate({ target: clients.publicId, set: record });
    }

    for (const [position, row] of backup.catalog_items.entries()) {
      const publicId = idOf(row, "catalog", position);
      const record = {
        publicId, ownerEmail, code: s(row.code || `IMP-${position + 1}`), type: s(row.type || "Material"),
        category: s(row.category || "General"), name: s(row.name || row.description || "Ítem importado"),
        description: s(row.description || row.detail), unit: s(row.unit || "un"),
        unitCost: s(row.unit_cost || row.cost || 0), unitPrice: s(row.unit_price || row.price || 0),
        currency: s(row.currency || "CLP"), supplier: s(row.supplier), reference: s(row.reference),
        active: b(row.active), payloadJson: JSON.stringify(row), updatedAt: new Date().toISOString(),
      };
      await db.insert(catalogItems).values(record).onConflictDoUpdate({ target: catalogItems.publicId, set: record });
    }

    for (const [position, row] of backup.quote_templates.entries()) {
      const publicId = idOf(row, "template", position);
      const record = { publicId, ownerEmail, name: s(row.name || `Plantilla ${position + 1}`), active: b(row.active), payloadJson: JSON.stringify(row), updatedAt: new Date().toISOString() };
      await db.insert(quoteTemplates).values(record).onConflictDoUpdate({ target: quoteTemplates.publicId, set: record });
    }

    for (const [position, row] of backup.quotes.entries()) {
      const publicId = idOf(row, "quote", position);
      const calculated = (row.calculated && typeof row.calculated === "object" ? row.calculated : {}) as Record<string, unknown>;
      const record = {
        publicId, ownerEmail, number: s(row.number || `SIS-COT-IMP-${position + 1}`),
        rootPublicId: s(row.root_public_id || publicId), parentPublicId: s(row.parent_public_id), revision: n(row.revision),
        clientPublicId: s(row.client_public_id), clientName: s(row.client_name || "Cliente importado"),
        project: s(row.project || "Proyecto importado"), issueDate: s(row.issue_date), status: s(row.status || "Borrador"),
        currency: s(row.currency || "CLP"), locked: b(row.locked, false),
        lockedAt: s(row.locked_at), approvedAt: s(row.approved_at), approvedBy: s(row.approved_by),
        approvalNotes: s(row.approval_notes),
        grossSubtotal: s(calculated.gross_subtotal || 0), netSubtotal: s(calculated.net_subtotal || 0),
        tax: s(calculated.tax || 0), total: s(calculated.total || 0), directCost: s(calculated.direct_cost || 0),
        internalCost: s(calculated.internal_cost || 0), estimatedProfit: s(calculated.estimated_profit || 0),
        marginPercent: s(calculated.margin_percent || 0), payloadJson: JSON.stringify(row), updatedAt: new Date().toISOString(),
      };
      await db.insert(quotes).values(record).onConflictDoUpdate({ target: quotes.publicId, set: record });
      await db.delete(quoteItems).where(and(eq(quoteItems.ownerEmail, ownerEmail), eq(quoteItems.quotePublicId, publicId)));
      const items = Array.isArray(row.items) ? row.items as Array<Record<string, unknown>> : [];
      if (items.length) {
        await db.insert(quoteItems).values(items.map((item, itemPosition) => ({
          publicId: `${publicId}:item:${itemPosition}`, ownerEmail, quotePublicId: publicId, position: itemPosition,
          name: s(item.name || "Partida"), detail: s(item.detail), quantity: s(item.quantity || 1),
          unit: s(item.unit || "un"), unitCost: s(item.unit_cost || 0), unitPrice: s(item.unit_price || 0),
        })));
      }
      const events = Array.isArray(row.events) ? row.events as Array<Record<string, unknown>> : [];
      for (const [eventPosition, event] of events.entries()) {
        const eventId = `${publicId}:event:${eventPosition}`;
        const eventRecord = {
          publicId: eventId, ownerEmail, quotePublicId: publicId,
          eventType: s(event.event_type || "IMPORTADO"), actor: s(event.actor), detail: s(event.detail),
          createdAt: s(event.event_at || backup.exported_at || new Date().toISOString()),
        };
        await db.insert(quoteEvents).values(eventRecord).onConflictDoUpdate({ target: quoteEvents.publicId, set: eventRecord });
      }
    }

    for (const [position, row] of backup.work_orders.entries()) {
      const publicId = idOf(row, "order", position);
      const record = {
        publicId, ownerEmail, number: s(row.number || `SIS-OT-IMP-${position + 1}`), quotePublicId: s(row.quote_public_id),
        clientName: s(row.client_name), project: s(row.project), status: s(row.status || "Pendiente"),
        responsible: s(row.responsible), assignedUserPublicId: "", assignedUserEmail: "",
        priority: s(row.priority || "Normal"), dueDate: s(row.due_date), assignmentUpdatedAt: "",
        createdDate: s(row.created_date), currency: s(row.currency || "CLP"),
        approvedSale: s(row.approved_sale || 0), plannedStart: s(row.planned_start), plannedEnd: s(row.planned_end),
        notes: s(row.notes), payloadJson: JSON.stringify(row), updatedAt: new Date().toISOString(),
      };
      await db.insert(workOrders).values(record).onConflictDoUpdate({ target: workOrders.publicId, set: record });
      const activities = Array.isArray(row.activities) ? row.activities as Array<Record<string, unknown>> : [];
      const costs = Array.isArray(row.cost_entries) ? row.cost_entries as Array<Record<string, unknown>> : [];
      for (const [itemPosition, activity] of activities.entries()) {
        const activityId = idOf(activity, `${publicId}-activity`, itemPosition);
        const activityRecord = { publicId: activityId, ownerEmail, workOrderPublicId: publicId, position: n(activity.position, itemPosition), payloadJson: JSON.stringify(activity) };
        await db.insert(workOrderActivities).values(activityRecord).onConflictDoUpdate({ target: workOrderActivities.publicId, set: activityRecord });
      }
      for (const [itemPosition, cost] of costs.entries()) {
        const costId = idOf(cost, `${publicId}-cost`, itemPosition);
        const costRecord = { publicId: costId, ownerEmail, workOrderPublicId: publicId, entryDate: s(cost.entry_date), payloadJson: JSON.stringify(cost) };
        await db.insert(workOrderCosts).values(costRecord).onConflictDoUpdate({ target: workOrderCosts.publicId, set: costRecord });
      }
    }

    const summary = {
      clients: backup.clients.length, catalogItems: backup.catalog_items.length,
      templates: backup.quote_templates.length, quotes: backup.quotes.length, workOrders: backup.work_orders.length,
    };
    await db.insert(importHistory).values({
      exportId: backup.export_id, ownerEmail, contract: backup.contract, schemaVersion: backup.schema_version,
      exportedAt: backup.exported_at, summaryJson: JSON.stringify(summary),
    });
    await writeAuditEvent(session, { action: "BACKUP_IMPORTED", entityType: "import", entityPublicId: backup.export_id, detail: { schemaVersion: backup.schema_version, summary } });
    return Response.json({ ok: true, summary });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError
      ? "El archivo no corresponde a un respaldo compatible solis.cotizador.v1 de esquema 17 a 19."
      : error instanceof Error ? error.message : "No fue posible importar el respaldo.";
    return Response.json({ error: message }, { status: 400 });
  }
}
