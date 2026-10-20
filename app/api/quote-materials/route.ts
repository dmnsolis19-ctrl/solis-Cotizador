import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings, quotes } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { readMaterialGroups, supplierCsv, supplierMaterials } from "@/lib/material-groups";
import { buildSupplierInquiryPdf } from "@/lib/pdf-documents";
import { businessDate } from "@/lib/dates";

const schema = z.object({
  publicId: z.string().min(8).max(120),
  format: z.enum(["pdf", "csv"]),
  listIds: z.string().min(1).max(1200).transform((value) => value.split(",")).pipe(z.array(z.string().uuid()).min(1).max(30)),
  consolidate: z.enum(["true", "false"]).default("true"),
});

export async function GET(request: Request) {
  try {
    const session = await requirePermission("documents.quote");
    const input = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const db = getDb();
    const [quote] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, session.ownerEmail), eq(quotes.publicId, input.publicId))).limit(1);
    if (!quote) return Response.json({ error: "La cotización no existe." }, { status: 404 });
    const allGroups = readMaterialGroups(quote.payloadJson);
    const selected = allGroups.filter((group) => input.listIds.includes(group.id));
    if (selected.length !== new Set(input.listIds).size) return Response.json({ error: "Una lista seleccionada no pertenece a esta revisión." }, { status: 400 });
    const rows = supplierMaterials(selected, input.consolidate === "true");
    const filename = `SC_${quote.number.replace(/[^a-zA-Z0-9_-]/g, "_")}_Materiales.${input.format}`;
    const headers = { "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
    if (input.format === "csv") return new Response(supplierCsv(rows), { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8" } });
    const [settings] = await db.select().from(appSettings).where(eq(appSettings.ownerEmail, session.ownerEmail)).limit(1);
    const bytes = buildSupplierInquiryPdf({ company: settings ? JSON.parse(settings.companyJson || "{}") : {}, number: `SC-${quote.number}`, project: quote.project, issueDate: businessDate(), rows });
    return new Response(new Uint8Array(bytes).buffer, { headers: { ...headers, "Content-Type": "application/pdf" } });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof z.ZodError ? "Seleccione listas y un formato válido." : "No fue posible exportar los materiales." }, { status: 400 });
  }
}
