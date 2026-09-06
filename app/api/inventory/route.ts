import { and, asc, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import {
  catalogItems, inventoryBalances, inventoryMovements, materialAllocations, materialRequestItems,
  materialRequests, purchaseRequestItems, purchaseRequests, suppliers, warehouses, workOrderCosts, workOrders,
} from "@/db/schema";
import { writeAuditEvent } from "@/lib/audit";
import { AuthorizationError, authorizationResponse, requirePermission } from "@/lib/auth";
import { purchaseReceiptStatus, purchaseTotals, weightedAverageCost } from "@/lib/procurement";
import { isWorkOrderClosed } from "@/lib/work-orders";

const purchaseLineSchema = z.object({ publicId: z.string().uuid(), unitCost: z.number().min(0).max(1_000_000_000) });
const receiptLineSchema = z.object({ itemPublicId: z.string().uuid(), quantity: z.number().positive().max(1_000_000) });
const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create_warehouse"), code: z.string().trim().min(2).max(24), name: z.string().trim().min(3).max(120), location: z.string().trim().max(240).default(""), isDefault: z.boolean().default(false) }),
  z.object({ action: z.literal("create_supplier"), code: z.string().trim().min(2).max(24), name: z.string().trim().min(2).max(160), taxId: z.string().trim().max(30).default(""), contactName: z.string().trim().max(120).default(""), email: z.string().trim().email().or(z.literal("")).default(""), phone: z.string().trim().max(40).default(""), address: z.string().trim().max(240).default(""), paymentTerms: z.string().trim().max(240).default(""), currency: z.enum(["CLP", "USD", "EUR", "UF"]).default("CLP") }),
  z.object({ action: z.literal("receive_stock"), warehousePublicId: z.string().uuid(), catalogItemPublicId: z.string().min(8), quantity: z.number().positive().max(1_000_000), unitCost: z.number().min(0).max(1_000_000_000).default(0), minimumQuantity: z.number().min(0).max(1_000_000).default(0), reference: z.string().trim().max(120).default(""), reason: z.string().trim().max(500).default("Recepción de material") }),
  z.object({ action: z.literal("adjust_stock"), balancePublicId: z.string().uuid(), newQuantity: z.number().min(0).max(1_000_000), minimumQuantity: z.number().min(0).max(1_000_000), reason: z.string().trim().min(5).max(500) }),
  z.object({ action: z.literal("allocate_request"), materialRequestPublicId: z.string().uuid(), warehousePublicId: z.string().uuid() }),
  z.object({ action: z.literal("issue_request"), materialRequestPublicId: z.string().uuid() }),
  z.object({ action: z.literal("return_allocation"), allocationPublicId: z.string().uuid(), quantity: z.number().positive().max(1_000_000), reason: z.string().trim().min(3).max(500) }),
  z.object({ action: z.literal("prepare_purchase"), purchaseRequestPublicId: z.string().uuid(), supplierPublicId: z.string().uuid(), currency: z.enum(["CLP", "USD", "EUR", "UF"]), discountPercent: z.number().min(0).max(100).default(0), taxPercent: z.number().min(0).max(100).default(19), notes: z.string().trim().max(800).default(""), items: z.array(purchaseLineSchema).min(1).max(100) }),
  z.object({ action: z.literal("approve_purchase"), purchaseRequestPublicId: z.string().uuid(), approvalNotes: z.string().trim().max(800).default("") }),
  z.object({ action: z.literal("order_purchase"), purchaseRequestPublicId: z.string().uuid() }),
  z.object({ action: z.literal("receive_purchase"), purchaseRequestPublicId: z.string().uuid(), reference: z.string().trim().min(2).max(120), receipts: z.array(receiptLineSchema).min(1).max(100) }),
]);

type Session = Awaited<ReturnType<typeof requirePermission>>;
const n = (value: unknown) => Number(value || 0);
const actor = (session: Session) => session.user.name || session.user.email;

function assertPermission(session: Session, permission: "inventory.manage" | "purchases.manage" | "purchases.approve") {
  if (!session.permissions.includes(permission)) throw new AuthorizationError("Su rol no permite realizar esta operación.", 403);
}

async function balanceFor(ownerEmail: string, warehousePublicId: string, catalogItemPublicId: string) {
  return (await getDb().select().from(inventoryBalances).where(and(
    eq(inventoryBalances.ownerEmail, ownerEmail), eq(inventoryBalances.warehousePublicId, warehousePublicId), eq(inventoryBalances.catalogItemPublicId, catalogItemPublicId),
  )).limit(1))[0];
}

async function ensureBalance(input: { ownerEmail: string; warehousePublicId: string; catalogItemPublicId: string; itemCode: string; itemName: string; unit: string }) {
  const existing = await balanceFor(input.ownerEmail, input.warehousePublicId, input.catalogItemPublicId);
  if (existing) return existing;
  const publicId = crypto.randomUUID();
  await getDb().insert(inventoryBalances).values({ publicId, ...input, quantity: "0", reservedQuantity: "0", minimumQuantity: "0", averageUnitCost: "0", updatedAt: new Date().toISOString() });
  return (await getDb().select().from(inventoryBalances).where(eq(inventoryBalances.publicId, publicId)).limit(1))[0];
}

async function move(session: Session, balance: typeof inventoryBalances.$inferSelect, input: {
  type: string; quantity: number; stockAfter: number; reservedAfter: number; averageUnitCost?: number;
  workOrderPublicId?: string; activityPublicId?: string; materialRequestPublicId?: string; reference?: string; reason?: string;
}) {
  const now = new Date().toISOString();
  await getDb().update(inventoryBalances).set({ quantity: String(input.stockAfter), reservedQuantity: String(input.reservedAfter), averageUnitCost: String(input.averageUnitCost ?? n(balance.averageUnitCost)), updatedAt: now }).where(and(eq(inventoryBalances.ownerEmail, session.ownerEmail), eq(inventoryBalances.publicId, balance.publicId)));
  await getDb().insert(inventoryMovements).values({
    publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, warehousePublicId: balance.warehousePublicId,
    catalogItemPublicId: balance.catalogItemPublicId, movementType: input.type, quantity: String(input.quantity),
    stockBefore: balance.quantity, stockAfter: String(input.stockAfter), reservedBefore: balance.reservedQuantity,
    reservedAfter: String(input.reservedAfter), workOrderPublicId: input.workOrderPublicId || "",
    activityPublicId: input.activityPublicId || "", materialRequestPublicId: input.materialRequestPublicId || "",
    reference: input.reference || "", reason: input.reason || "", actor: actor(session), createdAt: now,
  });
}

async function createPurchase(session: Session, materialRequest: typeof materialRequests.$inferSelect, warehousePublicId: string, shortages: Array<{ item: typeof materialRequestItems.$inferSelect; quantity: number }>) {
  if (!shortages.length) return "";
  const [{ value }] = await getDb().select({ value: count() }).from(purchaseRequests).where(eq(purchaseRequests.ownerEmail, session.ownerEmail));
  const number = `OC-${new Date().getUTCFullYear()}-${String(Number(value) + 1).padStart(5, "0")}`;
  const publicId = crypto.randomUUID();
  const now = new Date().toISOString();
  await getDb().insert(purchaseRequests).values({ publicId, ownerEmail: session.ownerEmail, number, materialRequestPublicId: materialRequest.publicId, workOrderPublicId: materialRequest.workOrderPublicId, warehousePublicId, status: "Solicitada", createdBy: actor(session), createdAt: now, updatedAt: now });
  await getDb().insert(purchaseRequestItems).values(shortages.map(({ item, quantity }) => ({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, purchaseRequestPublicId: publicId, materialRequestItemPublicId: item.publicId, catalogItemPublicId: item.catalogItemPublicId, description: item.description, quantity: String(quantity), unit: item.unit, unitCost: "0", lineTotal: "0", receivedQuantity: "0" })));
  return publicId;
}

export async function GET() {
  try {
    const session = await requirePermission("inventory.read");
    const db = getDb();
    const orderScope = session.user.role === "technician" ? and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.assignedUserPublicId, session.user.publicId)) : eq(workOrders.ownerEmail, session.ownerEmail);
    const [warehouseRows, balanceRows, movementRows, requestRows, requestItemRows, allocationRows, purchaseRows, purchaseItemRows, supplierRows, orderRows, catalogRows] = await Promise.all([
      db.select().from(warehouses).where(eq(warehouses.ownerEmail, session.ownerEmail)).orderBy(desc(warehouses.isDefault), asc(warehouses.name)),
      db.select().from(inventoryBalances).where(eq(inventoryBalances.ownerEmail, session.ownerEmail)).orderBy(asc(inventoryBalances.itemCode)),
      db.select().from(inventoryMovements).where(eq(inventoryMovements.ownerEmail, session.ownerEmail)).orderBy(desc(inventoryMovements.createdAt)).limit(200),
      db.select().from(materialRequests).where(eq(materialRequests.ownerEmail, session.ownerEmail)).orderBy(desc(materialRequests.createdAt)).limit(200),
      db.select().from(materialRequestItems).where(eq(materialRequestItems.ownerEmail, session.ownerEmail)),
      db.select().from(materialAllocations).where(eq(materialAllocations.ownerEmail, session.ownerEmail)),
      db.select().from(purchaseRequests).where(eq(purchaseRequests.ownerEmail, session.ownerEmail)).orderBy(desc(purchaseRequests.createdAt)).limit(200),
      db.select().from(purchaseRequestItems).where(eq(purchaseRequestItems.ownerEmail, session.ownerEmail)),
      db.select().from(suppliers).where(eq(suppliers.ownerEmail, session.ownerEmail)).orderBy(asc(suppliers.name)),
      db.select({ publicId: workOrders.publicId, number: workOrders.number, clientName: workOrders.clientName, project: workOrders.project }).from(workOrders).where(orderScope),
      db.select({ publicId: catalogItems.publicId, code: catalogItems.code, name: catalogItems.name, unit: catalogItems.unit, type: catalogItems.type, unitCost: catalogItems.unitCost }).from(catalogItems).where(and(eq(catalogItems.ownerEmail, session.ownerEmail), eq(catalogItems.active, true))).orderBy(catalogItems.code),
    ]);
    const orderMap = new Map(orderRows.map((order) => [order.publicId, order]));
    const canSeePurchases = session.user.role !== "technician";
    return Response.json({
      warehouses: warehouseRows,
      balances: balanceRows.map((balance) => ({ ...balance, quantity: n(balance.quantity), reservedQuantity: n(balance.reservedQuantity), minimumQuantity: n(balance.minimumQuantity), averageUnitCost: n(balance.averageUnitCost), inventoryValue: n(balance.quantity) * n(balance.averageUnitCost) })),
      movements: movementRows.filter((movement) => session.user.role !== "technician" || Boolean(movement.workOrderPublicId && orderMap.has(movement.workOrderPublicId))).map((movement) => ({ ...movement, quantity: n(movement.quantity), stockBefore: n(movement.stockBefore), stockAfter: n(movement.stockAfter), reservedBefore: n(movement.reservedBefore), reservedAfter: n(movement.reservedAfter) })),
      materialRequests: requestRows.filter((request) => session.user.role !== "technician" || orderMap.has(request.workOrderPublicId)).map((request) => ({ ...request, order: orderMap.get(request.workOrderPublicId), items: requestItemRows.filter((item) => item.requestPublicId === request.publicId).map((item) => ({ ...item, quantity: n(item.quantity) })), allocations: allocationRows.filter((allocation) => allocation.materialRequestPublicId === request.publicId).map((allocation) => ({ ...allocation, requestedQuantity: n(allocation.requestedQuantity), reservedQuantity: n(allocation.reservedQuantity), issuedQuantity: n(allocation.issuedQuantity), returnedQuantity: n(allocation.returnedQuantity), issueUnitCost: n(allocation.issueUnitCost) })) })),
      purchases: canSeePurchases ? purchaseRows.map((purchase) => ({ ...purchase, discountPercent: n(purchase.discountPercent), taxPercent: n(purchase.taxPercent), subtotal: n(purchase.subtotal), discountAmount: n(purchase.discountAmount), netSubtotal: n(purchase.netSubtotal), taxAmount: n(purchase.taxAmount), total: n(purchase.total), order: orderMap.get(purchase.workOrderPublicId), items: purchaseItemRows.filter((item) => item.purchaseRequestPublicId === purchase.publicId).map((item) => ({ ...item, quantity: n(item.quantity), unitCost: n(item.unitCost), lineTotal: n(item.lineTotal), receivedQuantity: n(item.receivedQuantity) })) })) : [],
      suppliers: canSeePurchases ? supplierRows : [],
      catalogItems: catalogRows.filter((item) => item.type.toLowerCase().includes("material")).map((item) => ({ ...item, unitCost: n(item.unitCost) })),
      canManage: session.permissions.includes("inventory.manage"), canManagePurchases: session.permissions.includes("purchases.manage"), canApprovePurchases: session.permissions.includes("purchases.approve"), canDocumentPurchases: session.permissions.includes("documents.purchase"),
    });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    return Response.json({ error: error instanceof Error ? error.message : "No fue posible cargar el inventario." }, { status: 400 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requirePermission("inventory.read");
    const input = actionSchema.parse(await request.json());
    const db = getDb();
    const now = new Date().toISOString();

    if (input.action === "create_warehouse") {
      assertPermission(session, "inventory.manage");
      if (input.isDefault) await db.update(warehouses).set({ isDefault: false }).where(eq(warehouses.ownerEmail, session.ownerEmail));
      const publicId = crypto.randomUUID();
      await db.insert(warehouses).values({ publicId, ownerEmail: session.ownerEmail, code: input.code.toUpperCase(), name: input.name, location: input.location, active: true, isDefault: input.isDefault, createdAt: now, updatedAt: now });
      await writeAuditEvent(session, { action: "WAREHOUSE_CREATED", entityType: "warehouse", entityPublicId: publicId, detail: { code: input.code, name: input.name } });
      return Response.json({ ok: true, publicId }, { status: 201 });
    }

    if (input.action === "create_supplier") {
      assertPermission(session, "purchases.manage");
      const publicId = crypto.randomUUID();
      await db.insert(suppliers).values({ publicId, ownerEmail: session.ownerEmail, code: input.code.toUpperCase(), name: input.name, taxId: input.taxId, contactName: input.contactName, email: input.email, phone: input.phone, address: input.address, paymentTerms: input.paymentTerms, currency: input.currency, active: true, createdBy: actor(session), createdAt: now, updatedAt: now });
      await writeAuditEvent(session, { action: "SUPPLIER_CREATED", entityType: "supplier", entityPublicId: publicId, detail: { code: input.code, name: input.name } });
      return Response.json({ ok: true, publicId }, { status: 201 });
    }

    if (input.action === "receive_stock") {
      assertPermission(session, "inventory.manage");
      const [warehouse] = await db.select().from(warehouses).where(and(eq(warehouses.ownerEmail, session.ownerEmail), eq(warehouses.publicId, input.warehousePublicId), eq(warehouses.active, true))).limit(1);
      const [item] = await db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail, session.ownerEmail), eq(catalogItems.publicId, input.catalogItemPublicId), eq(catalogItems.active, true))).limit(1);
      if (!warehouse || !item) return Response.json({ error: "Seleccione una bodega y un material vigentes." }, { status: 409 });
      const balance = await ensureBalance({ ownerEmail: session.ownerEmail, warehousePublicId: warehouse.publicId, catalogItemPublicId: item.publicId, itemCode: item.code, itemName: item.name, unit: item.unit });
      const averageUnitCost = weightedAverageCost(n(balance.quantity), n(balance.averageUnitCost), input.quantity, input.unitCost);
      await move(session, balance, { type: "RECEIPT", quantity: input.quantity, stockAfter: n(balance.quantity) + input.quantity, reservedAfter: n(balance.reservedQuantity), averageUnitCost, reference: input.reference, reason: input.reason });
      await db.update(inventoryBalances).set({ minimumQuantity: String(input.minimumQuantity) }).where(eq(inventoryBalances.publicId, balance.publicId));
      await writeAuditEvent(session, { action: "INVENTORY_RECEIVED", entityType: "inventory_balance", entityPublicId: balance.publicId, detail: { quantity: input.quantity, unitCost: input.unitCost, averageUnitCost, warehousePublicId: warehouse.publicId, catalogItemPublicId: item.publicId } });
      return Response.json({ ok: true });
    }

    if (input.action === "adjust_stock") {
      assertPermission(session, "inventory.manage");
      const [balance] = await db.select().from(inventoryBalances).where(and(eq(inventoryBalances.ownerEmail, session.ownerEmail), eq(inventoryBalances.publicId, input.balancePublicId))).limit(1);
      if (!balance) return Response.json({ error: "El saldo de inventario no existe." }, { status: 404 });
      if (input.newQuantity < n(balance.reservedQuantity)) return Response.json({ error: "El nuevo saldo no puede ser menor que la cantidad reservada." }, { status: 409 });
      await move(session, balance, { type: "ADJUSTMENT", quantity: input.newQuantity - n(balance.quantity), stockAfter: input.newQuantity, reservedAfter: n(balance.reservedQuantity), reason: input.reason });
      await db.update(inventoryBalances).set({ minimumQuantity: String(input.minimumQuantity) }).where(eq(inventoryBalances.publicId, balance.publicId));
      await writeAuditEvent(session, { action: "INVENTORY_ADJUSTED", entityType: "inventory_balance", entityPublicId: balance.publicId, detail: { previous: n(balance.quantity), next: input.newQuantity, reason: input.reason } });
      return Response.json({ ok: true });
    }

    if (input.action === "allocate_request") {
      assertPermission(session, "inventory.manage");
      const [materialRequest] = await db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.publicId, input.materialRequestPublicId))).limit(1);
      const [warehouse] = await db.select().from(warehouses).where(and(eq(warehouses.ownerEmail, session.ownerEmail), eq(warehouses.publicId, input.warehousePublicId), eq(warehouses.active, true))).limit(1);
      if (!materialRequest || !warehouse) return Response.json({ error: "La solicitud o la bodega no están disponibles." }, { status: 404 });
      if (!["Pendiente", "Aprobada", "Compra requerida"].includes(materialRequest.status)) return Response.json({ error: "La solicitud ya fue procesada." }, { status: 409 });
      const items = await db.select().from(materialRequestItems).where(and(eq(materialRequestItems.ownerEmail, session.ownerEmail), eq(materialRequestItems.requestPublicId, materialRequest.publicId)));
      const existingPurchases = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.materialRequestPublicId, materialRequest.publicId)));
      const shortages: Array<{ item: typeof materialRequestItems.$inferSelect; quantity: number }> = [];
      for (const item of items) {
        const [existing] = await db.select().from(materialAllocations).where(and(eq(materialAllocations.ownerEmail, session.ownerEmail), eq(materialAllocations.materialRequestItemPublicId, item.publicId))).limit(1);
        const catalogKey = item.catalogItemPublicId || `manual:${item.publicId}`;
        const requested = n(item.quantity); const targetWarehouse = existing?.warehousePublicId || warehouse.publicId;
        const balance = await balanceFor(session.ownerEmail, targetWarehouse, catalogKey);
        const available = balance ? Math.max(0, n(balance.quantity) - n(balance.reservedQuantity)) : 0;
        const alreadyCovered = existing ? n(existing.reservedQuantity) + n(existing.issuedQuantity) : 0;
        const reserved = Math.min(Math.max(0, requested - alreadyCovered), available);
        if (existing) await db.update(materialAllocations).set({ reservedQuantity: String(n(existing.reservedQuantity) + reserved), status: alreadyCovered + reserved >= requested ? "Reservada" : "Parcial", updatedAt: now }).where(eq(materialAllocations.publicId, existing.publicId));
        else await db.insert(materialAllocations).values({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, materialRequestPublicId: materialRequest.publicId, materialRequestItemPublicId: item.publicId, warehousePublicId: warehouse.publicId, catalogItemPublicId: catalogKey, requestedQuantity: String(requested), reservedQuantity: String(reserved), issuedQuantity: "0", returnedQuantity: "0", issueUnitCost: "0", status: reserved === requested ? "Reservada" : "Parcial", updatedAt: now });
        if (balance && reserved > 0) await move(session, balance, { type: "RESERVATION", quantity: reserved, stockAfter: n(balance.quantity), reservedAfter: n(balance.reservedQuantity) + reserved, workOrderPublicId: materialRequest.workOrderPublicId, activityPublicId: materialRequest.activityPublicId, materialRequestPublicId: materialRequest.publicId, reason: "Reserva para orden de trabajo" });
        if (alreadyCovered + reserved < requested) shortages.push({ item, quantity: requested - alreadyCovered - reserved });
      }
      let purchasePublicId = existingPurchases.find((purchase) => !["Recibida", "Cancelada"].includes(purchase.status))?.publicId || "";
      if (shortages.length && !purchasePublicId) purchasePublicId = await createPurchase(session, materialRequest, warehouse.publicId, shortages);
      const status = shortages.length ? "Compra requerida" : "Reservada";
      if (!shortages.length) for (const purchase of existingPurchases.filter((candidate) => candidate.status === "Solicitada")) await db.update(purchaseRequests).set({ status: "Cancelada", notes: "Cancelada automáticamente: el stock fue cubierto antes de emitir la compra.", updatedAt: now }).where(eq(purchaseRequests.publicId, purchase.publicId));
      await db.update(materialRequests).set({ status, reviewedBy: actor(session), reviewedAt: now, responseNotes: purchasePublicId ? "Stock parcial o insuficiente; se generó solicitud de compra." : "Stock reservado para entrega.", updatedAt: now }).where(eq(materialRequests.publicId, materialRequest.publicId));
      await writeAuditEvent(session, { action: "MATERIAL_REQUEST_ALLOCATED", entityType: "material_request", entityPublicId: materialRequest.publicId, detail: { warehousePublicId: warehouse.publicId, status, purchasePublicId } });
      return Response.json({ ok: true, status, purchasePublicId });
    }

    if (input.action === "issue_request") {
      assertPermission(session, "inventory.manage");
      const [materialRequest] = await db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.publicId, input.materialRequestPublicId))).limit(1);
      if (!materialRequest || materialRequest.status !== "Reservada") return Response.json({ error: "La solicitud debe estar completamente reservada antes de entregarla." }, { status: 409 });
      const allocations = await db.select().from(materialAllocations).where(and(eq(materialAllocations.ownerEmail, session.ownerEmail), eq(materialAllocations.materialRequestPublicId, materialRequest.publicId)));
      const requestItems = await db.select().from(materialRequestItems).where(and(eq(materialRequestItems.ownerEmail, session.ownerEmail), eq(materialRequestItems.requestPublicId, materialRequest.publicId)));
      if (!allocations.length || allocations.some((allocation) => n(allocation.reservedQuantity) <= 0)) return Response.json({ error: "No existen reservas completas para esta solicitud." }, { status: 409 });
      for (const allocation of allocations) {
        const balance = await balanceFor(session.ownerEmail, allocation.warehousePublicId, allocation.catalogItemPublicId); const quantity = n(allocation.reservedQuantity);
        if (!balance || n(balance.quantity) < quantity || n(balance.reservedQuantity) < quantity) return Response.json({ error: "El saldo reservado cambió; revise la bodega antes de entregar." }, { status: 409 });
        const unitCost = n(balance.averageUnitCost); const requestItem = requestItems.find((item) => item.publicId === allocation.materialRequestItemPublicId);
        await move(session, balance, { type: "ISSUE", quantity, stockAfter: n(balance.quantity) - quantity, reservedAfter: n(balance.reservedQuantity) - quantity, workOrderPublicId: materialRequest.workOrderPublicId, activityPublicId: materialRequest.activityPublicId, materialRequestPublicId: materialRequest.publicId, reason: "Entrega a orden de trabajo" });
        await db.update(materialAllocations).set({ issuedQuantity: String(n(allocation.issuedQuantity) + quantity), reservedQuantity: "0", issueUnitCost: String(unitCost), status: "Entregada", updatedAt: now }).where(eq(materialAllocations.publicId, allocation.publicId));
        await db.insert(workOrderCosts).values({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, workOrderPublicId: materialRequest.workOrderPublicId, entryDate: now.slice(0, 10), payloadJson: JSON.stringify({ entry_type: "material", description: requestItem?.description || balance.itemName, quantity, unit: requestItem?.unit || balance.unit, unit_cost: unitCost, total: quantity * unitCost, recorded_by: actor(session), source: "inventory_issue", material_request_public_id: materialRequest.publicId, allocation_public_id: allocation.publicId, recorded_at: now }) });
      }
      await db.update(materialRequests).set({ status: "Entregada", reviewedBy: actor(session), reviewedAt: now, responseNotes: "Material entregado desde inventario y cargado al costo real.", updatedAt: now }).where(eq(materialRequests.publicId, materialRequest.publicId));
      await writeAuditEvent(session, { action: "MATERIAL_REQUEST_ISSUED", entityType: "material_request", entityPublicId: materialRequest.publicId, detail: { allocations: allocations.length } });
      return Response.json({ ok: true });
    }

    if (input.action === "return_allocation") {
      assertPermission(session, "inventory.manage");
      const [allocation] = await db.select().from(materialAllocations).where(and(eq(materialAllocations.ownerEmail, session.ownerEmail), eq(materialAllocations.publicId, input.allocationPublicId))).limit(1);
      if (!allocation) return Response.json({ error: "La entrega no existe." }, { status: 404 });
      const returnable = n(allocation.issuedQuantity) - n(allocation.returnedQuantity);
      if (input.quantity > returnable) return Response.json({ error: `Solo puede devolver hasta ${returnable}.` }, { status: 409 });
      const [materialRequest] = await db.select().from(materialRequests).where(and(eq(materialRequests.ownerEmail, session.ownerEmail), eq(materialRequests.publicId, allocation.materialRequestPublicId))).limit(1);
      const [requestItem] = await db.select().from(materialRequestItems).where(and(eq(materialRequestItems.ownerEmail, session.ownerEmail), eq(materialRequestItems.publicId, allocation.materialRequestItemPublicId))).limit(1);
      const balance = await balanceFor(session.ownerEmail, allocation.warehousePublicId, allocation.catalogItemPublicId);
      if (!balance || !materialRequest) return Response.json({ error: "No se encontró el saldo asociado a la entrega." }, { status: 409 });
      const [order] = await db.select().from(workOrders).where(and(eq(workOrders.ownerEmail, session.ownerEmail), eq(workOrders.publicId, materialRequest.workOrderPublicId))).limit(1);
      if (order && isWorkOrderClosed(order)) return Response.json({ error: "La orden está cerrada y no admite devoluciones que alteren su costo real." }, { status: 409 });
      const unitCost = n(allocation.issueUnitCost); const averageUnitCost = weightedAverageCost(n(balance.quantity), n(balance.averageUnitCost), input.quantity, unitCost);
      await move(session, balance, { type: "RETURN", quantity: input.quantity, stockAfter: n(balance.quantity) + input.quantity, reservedAfter: n(balance.reservedQuantity), averageUnitCost, workOrderPublicId: materialRequest.workOrderPublicId, activityPublicId: materialRequest.activityPublicId, materialRequestPublicId: materialRequest.publicId, reason: input.reason });
      await db.update(materialAllocations).set({ returnedQuantity: String(n(allocation.returnedQuantity) + input.quantity), status: input.quantity === returnable ? "Devuelta" : "Devolución parcial", updatedAt: now }).where(eq(materialAllocations.publicId, allocation.publicId));
      await db.insert(workOrderCosts).values({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, workOrderPublicId: materialRequest.workOrderPublicId, entryDate: now.slice(0, 10), payloadJson: JSON.stringify({ entry_type: "material", description: `Devolución: ${requestItem?.description || balance.itemName}`, quantity: -input.quantity, unit: requestItem?.unit || balance.unit, unit_cost: unitCost, total: -input.quantity * unitCost, recorded_by: actor(session), source: "inventory_return", material_request_public_id: materialRequest.publicId, allocation_public_id: allocation.publicId, recorded_at: now }) });
      await writeAuditEvent(session, { action: "INVENTORY_RETURNED", entityType: "material_allocation", entityPublicId: allocation.publicId, detail: { quantity: input.quantity, unitCost, reason: input.reason } });
      return Response.json({ ok: true });
    }

    if (input.action === "prepare_purchase") {
      assertPermission(session, "purchases.manage");
      const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, input.purchaseRequestPublicId))).limit(1);
      const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.ownerEmail, session.ownerEmail), eq(suppliers.publicId, input.supplierPublicId), eq(suppliers.active, true))).limit(1);
      if (!purchase || purchase.status !== "Solicitada" || !supplier) return Response.json({ error: "La solicitud o el proveedor no están disponibles para preparar la compra." }, { status: 409 });
      const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId)));
      const costMap = new Map(input.items.map((item) => [item.publicId, item.unitCost]));
      if (items.some((item) => !costMap.has(item.publicId))) return Response.json({ error: "Ingrese el costo unitario de todas las partidas." }, { status: 409 });
      const totals = purchaseTotals(items.map((item) => ({ quantity: n(item.quantity), unitCost: costMap.get(item.publicId) || 0 })), input.discountPercent, input.taxPercent);
      for (const item of items) { const unitCost = costMap.get(item.publicId) || 0; await db.update(purchaseRequestItems).set({ unitCost: String(unitCost), lineTotal: String(n(item.quantity) * unitCost) }).where(eq(purchaseRequestItems.publicId, item.publicId)); }
      await db.update(purchaseRequests).set({ supplierPublicId: supplier.publicId, supplier: supplier.name, currency: input.currency, discountPercent: String(input.discountPercent), taxPercent: String(input.taxPercent), subtotal: String(totals.subtotal), discountAmount: String(totals.discountAmount), netSubtotal: String(totals.netSubtotal), taxAmount: String(totals.taxAmount), total: String(totals.total), notes: input.notes, updatedAt: now }).where(eq(purchaseRequests.publicId, purchase.publicId));
      await writeAuditEvent(session, { action: "PURCHASE_PREPARED", entityType: "purchase_request", entityPublicId: purchase.publicId, detail: { supplierPublicId: supplier.publicId, total: totals.total, currency: input.currency } });
      return Response.json({ ok: true, totals });
    }

    if (input.action === "approve_purchase") {
      assertPermission(session, "purchases.approve");
      const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, input.purchaseRequestPublicId))).limit(1);
      if (!purchase || purchase.status !== "Solicitada" || !purchase.supplierPublicId) return Response.json({ error: "Prepare la compra y seleccione un proveedor antes de aprobarla." }, { status: 409 });
      const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId)));
      if (!items.length || items.some((item) => n(item.unitCost) <= 0)) return Response.json({ error: "Todas las partidas deben tener un costo unitario mayor que cero." }, { status: 409 });
      await db.update(purchaseRequests).set({ status: "Aprobada", approvedBy: actor(session), approvedAt: now, approvalNotes: input.approvalNotes, updatedAt: now }).where(eq(purchaseRequests.publicId, purchase.publicId));
      await writeAuditEvent(session, { action: "PURCHASE_APPROVED", entityType: "purchase_request", entityPublicId: purchase.publicId, detail: { total: purchase.total, currency: purchase.currency } });
      return Response.json({ ok: true });
    }

    if (input.action === "order_purchase") {
      assertPermission(session, "purchases.manage");
      const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, input.purchaseRequestPublicId))).limit(1);
      if (!purchase || purchase.status !== "Aprobada") return Response.json({ error: "La orden de compra debe estar aprobada antes de enviarla." }, { status: 409 });
      await db.update(purchaseRequests).set({ status: "Ordenada", orderedBy: actor(session), orderedAt: now, updatedAt: now }).where(eq(purchaseRequests.publicId, purchase.publicId));
      await writeAuditEvent(session, { action: "PURCHASE_ORDERED", entityType: "purchase_request", entityPublicId: purchase.publicId, detail: { supplier: purchase.supplier, total: purchase.total } });
      return Response.json({ ok: true });
    }

    assertPermission(session, "purchases.manage");
    const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, input.purchaseRequestPublicId))).limit(1);
    if (!purchase || !["Ordenada", "Recepción parcial"].includes(purchase.status)) return Response.json({ error: "La compra debe estar ordenada y con saldo pendiente de recepción." }, { status: 409 });
    const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId)));
    const receiptMap = new Map(input.receipts.map((receipt) => [receipt.itemPublicId, receipt.quantity]));
    for (const [itemPublicId, quantity] of receiptMap) {
      const item = items.find((candidate) => candidate.publicId === itemPublicId);
      if (!item || quantity > n(item.quantity) - n(item.receivedQuantity)) return Response.json({ error: "Una cantidad recibida supera el saldo pendiente de la orden." }, { status: 409 });
      const [requestItem] = await db.select().from(materialRequestItems).where(and(eq(materialRequestItems.ownerEmail, session.ownerEmail), eq(materialRequestItems.publicId, item.materialRequestItemPublicId))).limit(1);
      if (!requestItem) continue;
      const catalogKey = item.catalogItemPublicId || `manual:${requestItem.publicId}`;
      const catalog = item.catalogItemPublicId ? (await db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail, session.ownerEmail), eq(catalogItems.publicId, item.catalogItemPublicId))).limit(1))[0] : undefined;
      let balance = await ensureBalance({ ownerEmail: session.ownerEmail, warehousePublicId: purchase.warehousePublicId, catalogItemPublicId: catalogKey, itemCode: catalog?.code || requestItem.code, itemName: catalog?.name || requestItem.description, unit: catalog?.unit || requestItem.unit });
      const averageUnitCost = weightedAverageCost(n(balance.quantity), n(balance.averageUnitCost), quantity, n(item.unitCost));
      await move(session, balance, { type: "RECEIPT", quantity, stockAfter: n(balance.quantity) + quantity, reservedAfter: n(balance.reservedQuantity), averageUnitCost, materialRequestPublicId: purchase.materialRequestPublicId, workOrderPublicId: purchase.workOrderPublicId, reference: input.reference, reason: `Recepción de ${purchase.number}` });
      balance = (await balanceFor(session.ownerEmail, purchase.warehousePublicId, catalogKey))!;
      const [allocation] = await db.select().from(materialAllocations).where(and(eq(materialAllocations.ownerEmail, session.ownerEmail), eq(materialAllocations.materialRequestItemPublicId, requestItem.publicId))).limit(1);
      const missing = allocation ? Math.max(0, n(allocation.requestedQuantity) - n(allocation.reservedQuantity) - n(allocation.issuedQuantity)) : n(requestItem.quantity);
      const reserve = Math.min(missing, quantity);
      if (reserve > 0) {
        await move(session, balance, { type: "RESERVATION", quantity: reserve, stockAfter: n(balance.quantity), reservedAfter: n(balance.reservedQuantity) + reserve, materialRequestPublicId: purchase.materialRequestPublicId, workOrderPublicId: purchase.workOrderPublicId, reason: "Reserva automática de compra recibida" });
        if (allocation) await db.update(materialAllocations).set({ reservedQuantity: String(n(allocation.reservedQuantity) + reserve), status: n(allocation.reservedQuantity) + reserve + n(allocation.issuedQuantity) >= n(allocation.requestedQuantity) ? "Reservada" : "Parcial", updatedAt: now }).where(eq(materialAllocations.publicId, allocation.publicId));
        else await db.insert(materialAllocations).values({ publicId: crypto.randomUUID(), ownerEmail: session.ownerEmail, materialRequestPublicId: purchase.materialRequestPublicId, materialRequestItemPublicId: requestItem.publicId, warehousePublicId: purchase.warehousePublicId, catalogItemPublicId: catalogKey, requestedQuantity: requestItem.quantity, reservedQuantity: String(reserve), issuedQuantity: "0", returnedQuantity: "0", issueUnitCost: "0", status: reserve >= n(requestItem.quantity) ? "Reservada" : "Parcial", updatedAt: now });
      }
      await db.update(purchaseRequestItems).set({ receivedQuantity: String(n(item.receivedQuantity) + quantity) }).where(eq(purchaseRequestItems.publicId, item.publicId));
    }
    const updatedItems = items.map((item) => ({ quantity: n(item.quantity), receivedQuantity: n(item.receivedQuantity) + (receiptMap.get(item.publicId) || 0) }));
    const status = purchaseReceiptStatus(updatedItems);
    await db.update(purchaseRequests).set({ status, receivedAt: status === "Recibida" ? now : purchase.receivedAt, updatedAt: now }).where(eq(purchaseRequests.publicId, purchase.publicId));
    const allocations = await db.select().from(materialAllocations).where(and(eq(materialAllocations.ownerEmail, session.ownerEmail), eq(materialAllocations.materialRequestPublicId, purchase.materialRequestPublicId)));
    const fullyReserved = allocations.length > 0 && allocations.every((allocation) => n(allocation.reservedQuantity) + n(allocation.issuedQuantity) >= n(allocation.requestedQuantity));
    if (fullyReserved) await db.update(materialRequests).set({ status: "Reservada", responseNotes: "Compra recibida y stock reservado para entrega.", reviewedBy: actor(session), reviewedAt: now, updatedAt: now }).where(eq(materialRequests.publicId, purchase.materialRequestPublicId));
    await writeAuditEvent(session, { action: "PURCHASE_RECEIVED", entityType: "purchase_request", entityPublicId: purchase.publicId, detail: { receiptReference: input.reference, receiptLines: input.receipts.length, status, fullyReserved } });
    return Response.json({ ok: true, status, fullyReserved });
  } catch (error) {
    const auth = authorizationResponse(error); if (auth) return auth;
    const message = error instanceof z.ZodError ? "Revise las cantidades, costos, proveedor y referencias." : error instanceof Error ? error.message : "No fue posible actualizar el inventario.";
    return Response.json({ error: message }, { status: 400 });
  }
}
