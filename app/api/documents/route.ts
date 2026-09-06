import { env } from "cloudflare:workers";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { appSettings, billingDocuments, billingPayments, clients, documentSnapshots, materialRequestItems, materialRequests, purchaseRequestItems, purchaseRequests, quoteEvents, quoteItems, quotes, suppliers, workOrderActivities, workOrderCosts, workOrderEvidence, workOrders, workOrderSignoffs } from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { buildClosureReportPdf, buildCollectionDocumentPdf, buildPurchaseOrderPdf, buildQuotePdf, buildWorkOrderPdf } from "@/lib/pdf-documents";
import { canAccessWorkOrder } from "@/lib/work-orders";

const requestSchema = z.object({
  entityType: z.enum(["quote", "work_order", "purchase_order", "closure_report", "collection_document"]),
  entityPublicId: z.string().min(8),
  actor: z.string().trim().max(120).optional(),
});

const querySchema = z.object({
  entityType: z.enum(["quote", "work_order", "purchase_order", "closure_report", "collection_document"]),
  entityPublicId: z.string().min(8),
});

function safeName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9._-]+/g, "_").replace(/_+/g, "_");
}

function jsonObject(value: string) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch { return {}; }
}

async function hexDigest(bytes: Uint8Array) {
  const owned = new Uint8Array(bytes.byteLength);
  owned.set(bytes);
  const digest = await crypto.subtle.digest("SHA-256", owned.buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

async function ownerPrefix(ownerEmail: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(ownerEmail.toLowerCase()));
  return [...new Uint8Array(digest)].slice(0, 10).map((value) => value.toString(16).padStart(2, "0")).join("");
}

function documentPermission(entityType: "quote" | "work_order" | "purchase_order" | "closure_report" | "collection_document") {
  return entityType === "quote" ? "documents.quote" : entityType === "work_order" ? "documents.order" : entityType === "closure_report" ? "documents.closure" : entityType === "collection_document" ? "documents.collection" : "documents.purchase";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const input = querySchema.parse({ entityType: url.searchParams.get("entityType"), entityPublicId: url.searchParams.get("entityPublicId") });
    const session = await requirePermission(documentPermission(input.entityType));
    const ownerEmail = session.ownerEmail;
    if (input.entityType === "work_order" && session.user.role === "technician") {
      const [order] = await getDb().select().from(workOrders).where(and(
        eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, input.entityPublicId),
      )).limit(1);
      if (!order || !canAccessWorkOrder(session.user.role, session.user, order)) {
        throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
      }
    }
    const rows = await getDb().select({
      publicId: documentSnapshots.publicId,
      entityType: documentSnapshots.entityType,
      entityPublicId: documentSnapshots.entityPublicId,
      documentNumber: documentSnapshots.documentNumber,
      revision: documentSnapshots.revision,
      version: documentSnapshots.version,
      fileName: documentSnapshots.fileName,
      byteSize: documentSnapshots.byteSize,
      sha256: documentSnapshots.sha256,
      securityProfile: documentSnapshots.securityProfile,
      createdBy: documentSnapshots.createdBy,
      createdAt: documentSnapshots.createdAt,
    }).from(documentSnapshots).where(and(
      eq(documentSnapshots.ownerEmail, ownerEmail),
      eq(documentSnapshots.entityType, input.entityType),
      eq(documentSnapshots.entityPublicId, input.entityPublicId),
      session.user.role === "technician" ? eq(documentSnapshots.securityProfile, "operational_v2") : undefined,
    )).orderBy(desc(documentSnapshots.version)).limit(50);
    return Response.json({ documents: rows });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Identificador de documento no válido." : error instanceof Error ? error.message : "No fue posible cargar los documentos.";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const session = await requirePermission(documentPermission(input.entityType));
    const ownerEmail = session.ownerEmail;
    const actor = session.user.name || session.user.email;
    const db = getDb();
    const settingsRows = await db.select().from(appSettings).where(eq(appSettings.ownerEmail, ownerEmail)).limit(1);
    const company = settingsRows[0] ? JSON.parse(settingsRows[0].companyJson || "{}") : {};
    const previous = await db.select({ version: documentSnapshots.version }).from(documentSnapshots).where(and(
      eq(documentSnapshots.ownerEmail, ownerEmail),
      eq(documentSnapshots.entityType, input.entityType),
      eq(documentSnapshots.entityPublicId, input.entityPublicId),
    )).orderBy(desc(documentSnapshots.version)).limit(1);
    const version = (previous[0]?.version ?? 0) + 1;

    let bytes: Uint8Array;
    let documentNumber: string;
    let revision = 0;
    let fileName: string;
    let quotePublicId = "";

    if (input.entityType === "quote") {
      const [quote] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, input.entityPublicId))).limit(1);
      if (!quote) return Response.json({ error: "La cotización no existe." }, { status: 404 });
      if (!quote.locked) return Response.json({ error: "Congele la versión antes de emitir su PDF controlado." }, { status: 409 });
      const items = await db.select().from(quoteItems).where(and(eq(quoteItems.ownerEmail, ownerEmail), eq(quoteItems.quotePublicId, quote.publicId))).orderBy(quoteItems.position);
      const clientRows = quote.clientPublicId ? await db.select().from(clients).where(and(eq(clients.ownerEmail, ownerEmail), eq(clients.publicId, quote.clientPublicId))).limit(1) : [];
      bytes = buildQuotePdf({ company, client: clientRows[0], quote, items });
      documentNumber = quote.number;
      revision = quote.revision;
      quotePublicId = quote.publicId;
      fileName = safeName(`${quote.number}_Cotizacion_v${String(version).padStart(2, "0")}.pdf`);
    } else if (input.entityType === "work_order") {
      const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, input.entityPublicId))).limit(1);
      if (!order) return Response.json({ error: "La orden de trabajo no existe." }, { status: 404 });
      if (!canAccessWorkOrder(session.user.role, session.user, order)) {
        throw new AuthorizationError("Esta orden no está asignada a su usuario.", 403);
      }
      const [quote] = await db.select().from(quotes).where(and(eq(quotes.ownerEmail, ownerEmail), eq(quotes.publicId, order.quotePublicId))).limit(1);
      if (!quote) return Response.json({ error: "No se encontró la cotización aprobada vinculada." }, { status: 409 });
      const items = await db.select().from(quoteItems).where(and(eq(quoteItems.ownerEmail, ownerEmail), eq(quoteItems.quotePublicId, quote.publicId))).orderBy(quoteItems.position);
      const [activityRows, entryRows, evidenceRows, signoffRows, requestRows, requestItemRows] = await Promise.all([
        db.select().from(workOrderActivities).where(and(eq(workOrderActivities.ownerEmail, ownerEmail), eq(workOrderActivities.workOrderPublicId, order.publicId))).orderBy(workOrderActivities.position),
        db.select().from(workOrderCosts).where(and(eq(workOrderCosts.ownerEmail, ownerEmail), eq(workOrderCosts.workOrderPublicId, order.publicId))).orderBy(desc(workOrderCosts.entryDate)),
        db.select({ caption: workOrderEvidence.caption, createdAt: workOrderEvidence.createdAt }).from(workOrderEvidence).where(and(eq(workOrderEvidence.ownerEmail, ownerEmail), eq(workOrderEvidence.workOrderPublicId, order.publicId))).orderBy(desc(workOrderEvidence.createdAt)),
        db.select({ customerName: workOrderSignoffs.customerName, customerRole: workOrderSignoffs.customerRole, signedAt: workOrderSignoffs.signedAt, notes: workOrderSignoffs.notes }).from(workOrderSignoffs).where(and(eq(workOrderSignoffs.ownerEmail, ownerEmail), eq(workOrderSignoffs.workOrderPublicId, order.publicId))).orderBy(desc(workOrderSignoffs.signedAt)).limit(1),
        db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, ownerEmail), eq(materialRequests.workOrderPublicId, order.publicId))).orderBy(desc(materialRequests.createdAt)),
        db.select().from(materialRequestItems).where(eq(materialRequestItems.ownerEmail, ownerEmail)).orderBy(materialRequestItems.position),
      ]);
      const activityTitles = new Map(activityRows.map((row) => { const payload = jsonObject(row.payloadJson); return [row.publicId, String(payload.title || payload.name || payload.description || "Actividad")]; }));
      const execution = {
        activities: activityRows.map((row) => { const payload = jsonObject(row.payloadJson); return { title: String(payload.title || payload.name || payload.description || "Actividad"), required: payload.required == null ? true : Boolean(payload.required), completed: Boolean(payload.completed) || Number(payload.progress_percent || 0) >= 100 }; }),
        entries: entryRows.map((row) => { const payload = jsonObject(row.payloadJson); return { type: String(payload.entry_type || payload.type || "expense"), description: String(payload.description || payload.name || payload.detail || "Registro"), quantity: Number(payload.quantity || 1), unit: String(payload.unit || "un"), entryDate: row.entryDate }; }),
        evidence: evidenceRows,
        signoff: signoffRows[0],
        materialRequests: requestRows.map((materialRequest) => ({
          status: materialRequest.status, urgency: materialRequest.urgency, neededDate: materialRequest.neededDate,
          activityTitle: activityTitles.get(materialRequest.activityPublicId) || "Actividad", requestedBy: materialRequest.requestedBy,
          items: requestItemRows.filter((item) => item.requestPublicId === materialRequest.publicId).map((item) => ({ description: item.description, quantity: Number(item.quantity), unit: item.unit })),
        })),
      };
      bytes = buildWorkOrderPdf({ company, order, quote, items, execution });
      documentNumber = order.number;
      revision = quote.revision;
      quotePublicId = quote.publicId;
      fileName = safeName(`${order.number}_Orden_Trabajo_v${String(version).padStart(2, "0")}.pdf`);
    } else if (input.entityType === "closure_report") {
      const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, input.entityPublicId))).limit(1);
      if (!order) return Response.json({ error: "La orden de trabajo no existe." }, { status: 404 });
      if (!order.closedAt || order.status !== "Cerrada") return Response.json({ error: "Cierre la orden antes de emitir el informe final." }, { status: 409 });
      const snapshot = jsonObject(order.closureSnapshotJson);
      bytes = buildClosureReportPdf({ company, closure: {
        number: order.number, clientName: order.clientName, project: order.project, currency: order.currency,
        closedAt: order.closedAt, closedBy: order.closedBy, closureNotes: order.closureNotes,
        sale: Number(order.approvedSale), budgetedCost: Number(order.budgetedCost), actualCost: Number(order.actualCost),
        actualProfit: Number(order.actualProfit), actualMarginPercent: Number(order.actualMarginPercent),
        budgetVariance: Number(order.actualCost) - Number(order.budgetedCost),
        breakdown: (snapshot.breakdown && typeof snapshot.breakdown === "object" ? snapshot.breakdown : {}) as Record<string, number>,
        counts: (snapshot.counts && typeof snapshot.counts === "object" ? snapshot.counts : { activities: 0, signoffs: 0, materialRequests: 0, purchases: 0 }) as { activities: number; signoffs: number; materialRequests: number; purchases: number },
      }});
      documentNumber = order.number;
      fileName = safeName(`${order.number}_Cierre_v${String(version).padStart(2, "0")}.pdf`);
    } else if (input.entityType === "collection_document") {
      const [collection] = await db.select().from(billingDocuments).where(and(eq(billingDocuments.ownerEmail, ownerEmail), eq(billingDocuments.publicId, input.entityPublicId))).limit(1);
      if (!collection) return Response.json({ error: "El documento de cobro no existe." }, { status: 404 });
      if (collection.status === "Borrador") return Response.json({ error: "Emita el documento antes de generar su PDF." }, { status: 409 });
      if (collection.status === "Anulada") return Response.json({ error: "El documento está anulado." }, { status: 409 });
      const payments = await db.select().from(billingPayments).where(and(eq(billingPayments.ownerEmail, ownerEmail), eq(billingPayments.billingDocumentPublicId, collection.publicId))).orderBy(desc(billingPayments.paymentDate));
      const paidAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
      bytes = buildCollectionDocumentPdf({ company, document: {
        number: collection.number, clientName: collection.clientName, project: collection.project, concept: collection.concept,
        status: paidAmount >= Number(collection.totalAmount) - 0.005 ? "Pagada" : paidAmount > 0 ? "Parcial" : collection.status,
        currency: collection.currency, issueDate: collection.issueDate, dueDate: collection.dueDate,
        netAmount: Number(collection.netAmount), taxPercent: Number(collection.taxPercent), taxAmount: Number(collection.taxAmount), totalAmount: Number(collection.totalAmount),
        paidAmount, balance: Math.max(0, Number(collection.totalAmount) - paidAmount), notes: collection.notes,
        payments: payments.map((payment) => ({ paymentDate: payment.paymentDate, amount: Number(payment.amount), method: payment.method, reference: payment.reference })),
      }});
      documentNumber = collection.number;
      fileName = safeName(`${collection.number}_Documento_Cobro_v${String(version).padStart(2, "0")}.pdf`);
    } else {
      const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, ownerEmail), eq(purchaseRequests.publicId, input.entityPublicId))).limit(1);
      if (!purchase) return Response.json({ error: "La orden de compra no existe." }, { status: 404 });
      if (!["Aprobada", "Ordenada", "Recepción parcial", "Recibida"].includes(purchase.status)) return Response.json({ error: "Apruebe la orden de compra antes de emitir su PDF." }, { status: 409 });
      const [supplier] = purchase.supplierPublicId ? await db.select().from(suppliers).where(and(eq(suppliers.ownerEmail, ownerEmail), eq(suppliers.publicId, purchase.supplierPublicId))).limit(1) : [];
      if (!supplier) return Response.json({ error: "No se encontró el proveedor vinculado." }, { status: 409 });
      const [items, orderRows] = await Promise.all([
        db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId))),
        db.select({ number: workOrders.number, project: workOrders.project }).from(workOrders).where(and(eq(workOrders.ownerEmail, ownerEmail), eq(workOrders.publicId, purchase.workOrderPublicId))).limit(1),
      ]);
      bytes = buildPurchaseOrderPdf({ company, supplier, purchase: { ...purchase, workOrderNumber: orderRows[0]?.number, project: orderRows[0]?.project }, items });
      documentNumber = purchase.number;
      fileName = safeName(`${purchase.number}_Orden_Compra_v${String(version).padStart(2, "0")}.pdf`);
    }

    if (!env.BUCKET) throw new Error("El almacenamiento documental R2 no está disponible.");
    const publicId = crypto.randomUUID();
    const storageKey = `${await ownerPrefix(ownerEmail)}/${input.entityType}/${input.entityPublicId}/${publicId}/${fileName}`;
    const sha256 = await hexDigest(bytes);
    await env.BUCKET.put(storageKey, bytes, {
      httpMetadata: { contentType: "application/pdf", contentDisposition: `attachment; filename="${fileName}"` },
      customMetadata: { entityType: input.entityType, entityPublicId: input.entityPublicId, sha256 },
    });
    const createdAt = new Date().toISOString();
    await db.insert(documentSnapshots).values({
      publicId, ownerEmail, entityType: input.entityType, entityPublicId: input.entityPublicId,
      documentNumber, revision, version, storageKey, fileName, contentType: "application/pdf",
      byteSize: bytes.byteLength, sha256, securityProfile: input.entityType === "quote" ? "commercial_v2" : input.entityType === "work_order" ? "operational_v2" : input.entityType === "closure_report" ? "closure_internal_v1" : input.entityType === "collection_document" ? "collection_internal_v1" : "procurement_v1", createdBy: actor, createdAt,
    });
    if (quotePublicId) await db.insert(quoteEvents).values({
      publicId: crypto.randomUUID(), ownerEmail, quotePublicId, eventType: input.entityType === "quote" ? "PDF_COTIZACION_GENERADO" : "PDF_ORDEN_GENERADO",
      actor, detail: `${fileName} · SHA-256 ${sha256.slice(0, 12)}`, createdAt,
    });
    const auditAction = input.entityType === "quote" ? "QUOTE_PDF_GENERATED" : input.entityType === "work_order" ? "WORK_ORDER_PDF_GENERATED" : input.entityType === "closure_report" ? "CLOSURE_PDF_GENERATED" : input.entityType === "collection_document" ? "COLLECTION_PDF_GENERATED" : "PURCHASE_PDF_GENERATED";
    await writeAuditEvent(session, { action: auditAction, entityType: input.entityType, entityPublicId: input.entityPublicId, detail: { fileName, version, sha256 } });
    return Response.json({ document: { publicId, entityType: input.entityType, entityPublicId: input.entityPublicId, documentNumber, revision, version, fileName, byteSize: bytes.byteLength, sha256, createdBy: actor, createdAt } }, { status: 201 });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise el documento y el responsable de la emisión." : error instanceof Error ? error.message : "No fue posible generar el PDF.";
    return Response.json({ error: message }, { status: 400 });
  }
}
