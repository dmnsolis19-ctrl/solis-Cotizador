import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { companySettingsSchema } from "@/lib/company-settings";
import { writeAuditEvent } from "@/lib/audit";

const schema = z.object({ company: companySettingsSchema, expectedUpdatedAt: z.string().default("") });
export async function POST(request: Request) {
  try {
    const session = await requirePermission("settings.manage");
    const input = schema.parse(await request.json());
    const db = getDb();
    const [previous] = await db.select().from(appSettings).where(eq(appSettings.ownerEmail, session.ownerEmail)).limit(1);
    if ((previous?.updatedAt || "") !== input.expectedUpdatedAt) return Response.json({ error: "La configuración cambió. Actualice antes de guardar." }, { status: 409 });
    const company = { ...JSON.parse(previous?.companyJson || "{}"), ...input.company };
    const updatedAt = new Date(Math.max(Date.now(), Date.parse(previous?.updatedAt || "") + 1 || 0)).toISOString();
    if (previous) {
      const changed = await db.update(appSettings).set({ companyJson: JSON.stringify(company), updatedAt }).where(and(eq(appSettings.ownerEmail, session.ownerEmail), eq(appSettings.updatedAt, previous.updatedAt))).returning();
      if (!changed.length) return Response.json({ error: "La configuración cambió en otro dispositivo." }, { status: 409 });
    } else await db.insert(appSettings).values({ ownerEmail: session.ownerEmail, companyJson: JSON.stringify(company), updatedAt }).onConflictDoNothing();
    await writeAuditEvent(session, { action: "COMPANY_SETTINGS_UPDATED", entityType: "settings", entityPublicId: session.ownerEmail, detail: { name: input.company.commercial_name } });
    return Response.json({ company, settingsUpdatedAt: updatedAt });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? error.issues[0]?.message : "No fue posible guardar la configuración." }, { status: 400 });
  }
}
