import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { appSettings, catalogItems, clients, quoteEvents, quotes, workOrders } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";

export async function GET() {
  try {
    const session = await requirePermission("dashboard.view");
    const ownerEmail = session.ownerEmail;
    const canReadQuotes = session.permissions.includes("quotes.read");
    const canReadClients = session.permissions.includes("clients.read");
    const canReadCatalog = session.permissions.includes("catalog.read");
    const canReadOrders = session.permissions.includes("orders.read");
    const db = getDb();
    const orderScope = session.user.role === "technician"
      ? and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.assignedUserPublicId, session.user.publicId))
      : eq(workOrders.ownerEmail, ownerEmail);
    const [settingsRows, clientRows, catalogRows, quoteRows, orderRows, eventRows] = await Promise.all([
      db.select().from(appSettings).where(eq(appSettings.ownerEmail, ownerEmail)).limit(1),
      canReadClients ? db.select().from(clients).where(and(eq(clients.ownerEmail, ownerEmail), eq(clients.active, true))).orderBy(clients.name).limit(500) : Promise.resolve([]),
      canReadCatalog ? db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail, ownerEmail), eq(catalogItems.active, true))).orderBy(catalogItems.code).limit(1000) : Promise.resolve([]),
      canReadQuotes ? db.select().from(quotes).where(eq(quotes.ownerEmail, ownerEmail)).orderBy(desc(quotes.issueDate), desc(quotes.updatedAt)).limit(100) : Promise.resolve([]),
      canReadOrders ? db.select().from(workOrders).where(orderScope).orderBy(desc(workOrders.updatedAt)).limit(100) : Promise.resolve([]),
      canReadQuotes ? db.select().from(quoteEvents).where(eq(quoteEvents.ownerEmail, ownerEmail)).orderBy(desc(quoteEvents.createdAt)).limit(500) : Promise.resolve([]),
    ]);

    const settings = settingsRows[0];
    return Response.json({
      company: settings ? JSON.parse(settings.companyJson) : {},
      economicSettings: settings ? JSON.parse(settings.economicSettingsJson) : {
        overhead_percent: "10",
        contingency_percent: "5",
        target_margin_percent: "25",
        discount_percent: "0",
        rounding_multiple: "1000",
      },
      clients: clientRows,
      catalogItems: catalogRows,
      quotes: quoteRows,
      workOrders: session.user.role === "technician" ? orderRows.map((order) => ({ ...order, approvedSale: "0", payloadJson: "{}" })) : orderRows,
      quoteEvents: eventRows,
      sourceSchemaVersion: settings?.sourceSchemaVersion ?? 0,
      session: { user: session.user, permissions: session.permissions },
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar los datos." }, { status: 500 });
  }
}
