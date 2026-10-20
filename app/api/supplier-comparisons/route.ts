import { env } from "cloudflare:workers";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { purchaseRequestItems, purchaseRequests, supplierComparisons, suppliers } from "@/db/schema";
import { authorizationResponse, requirePermission } from "@/lib/auth";
import { comparisonSchema, evaluateOffer, type Requirement } from "@/lib/supplier-comparison";
import { businessDate } from "@/lib/dates";
const idSchema = z.string().uuid();
export async function GET(request: Request) {
  try {
    const session = await requirePermission("purchases.manage"), db = getDb();
    const id = idSchema.parse(new URL(request.url).searchParams.get("purchaseRequestPublicId"));
    const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, id))).limit(1);
    if (!purchase) return Response.json({ error: "Solicitud no disponible." }, { status: 404 });
    const [old] = await db.select().from(supplierComparisons).where(and(eq(supplierComparisons.ownerEmail, session.ownerEmail), eq(supplierComparisons.purchaseRequestPublicId, id))).limit(1);
    const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, id)));
    const payload = old ? JSON.parse(old.payloadJson) : null;
    return Response.json({ comparison: old ? { ...payload, publicId: old.publicId, expectedUpdatedAt: old.updatedAt, updatedAt: old.updatedAt, purchaseUpdatedAt: purchase.updatedAt } : null, requirements: payload?.requirements || items.map(i => ({ publicId: i.publicId, description: i.description, quantity: Number(i.quantity), unit: i.unit })), purchaseUpdatedAt: purchase.updatedAt });
  } catch (error) { const auth = authorizationResponse(error); if (auth) return auth; return Response.json({ error: "No fue posible cargar el comparador." }, { status: 400 }); }
}
export async function POST(request: Request) {
  try {
    const session = await requirePermission("purchases.manage"), input = comparisonSchema.parse(await request.json()), db = getDb();
    const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, input.purchaseRequestPublicId))).limit(1);
    if (!purchase || purchase.status !== "Solicitada") return Response.json({ error: "Solo se comparan compras solicitadas de su cuenta." }, { status: 409 });
    if (input.purchaseUpdatedAt !== purchase.updatedAt) return Response.json({ error: "La compra cambió. Actualice el comparador." }, { status: 409 });
    const [old] = await db.select().from(supplierComparisons).where(eq(supplierComparisons.publicId, input.publicId)).limit(1);
    if (old && (old.ownerEmail !== session.ownerEmail || old.purchaseRequestPublicId !== purchase.publicId || old.updatedAt !== input.expectedUpdatedAt) || !old && input.expectedUpdatedAt) return Response.json({ error: "El comparador cambió en otro dispositivo." }, { status: 409 });
    const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId)));
    const requirements: Requirement[] = old ? JSON.parse(old.payloadJson).requirements : items.map(i => ({ publicId: i.publicId, description: i.description, quantity: Number(i.quantity), unit: i.unit }));
    const ownedSuppliers = await db.select().from(suppliers).where(and(eq(suppliers.ownerEmail, session.ownerEmail), eq(suppliers.active, true)));
    if (new Set(input.offers.map(o => o.id)).size !== input.offers.length || input.offers.some(o => !ownedSuppliers.some(s => s.publicId === o.supplierPublicId))) return Response.json({ error: "Seleccione proveedores activos de su cuenta y ofertas distintas." }, { status: 400 });
    if (input.selectedOfferId && !input.offers.some(o => o.id === input.selectedOfferId)) return Response.json({ error: "Oferta seleccionada inválida." }, { status: 400 });
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(old?.updatedAt || "") || 0) + 1)).toISOString(); const payload = { ...input, requirements };
    const ops: D1PreparedStatement[] = [];
    if (old) {
      ops.push(env.DB.prepare("UPDATE supplier_comparisons SET payload_json=?,updated_at=? WHERE owner_email=? AND public_id=? AND updated_at=?").bind(JSON.stringify(payload), updatedAt, session.ownerEmail, input.publicId, input.expectedUpdatedAt));
      ops.push(env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'CONFLICT' END)"));
    } else ops.push(env.DB.prepare("INSERT INTO supplier_comparisons (public_id,owner_email,purchase_request_public_id,payload_json,updated_at) VALUES (?,?,?,?,?)").bind(input.publicId, session.ownerEmail, purchase.publicId, JSON.stringify(payload), updatedAt));
    // Reject a save if approval/preparation raced with this write; the batch rolls back.
    ops.push(env.DB.prepare("SELECT json(CASE WHEN EXISTS(SELECT 1 FROM purchase_requests WHERE owner_email=? AND public_id=? AND status='Solicitada' AND updated_at=?) THEN 'true' ELSE 'CONFLICT' END)").bind(session.ownerEmail, purchase.publicId, input.purchaseUpdatedAt));
    ops.push(env.DB.prepare("INSERT INTO audit_events (public_id,owner_email,actor_email,actor_name,actor_role,action,entity_type,entity_public_id) VALUES (?,?,?,?,?,'COMPARISON_SAVED','supplier_comparison',?)").bind(crypto.randomUUID(), session.ownerEmail, session.user.email, session.user.name, session.user.role, input.publicId));
    await env.DB.batch(ops);
    return Response.json({ comparison: { ...payload, updatedAt, expectedUpdatedAt: updatedAt } }, { status: 201 });
  } catch (error) { const auth = authorizationResponse(error); if (auth) return auth; const conflict = /constraint|CONFLICT|malformed JSON/i.test(String(error)); return Response.json({ error: conflict ? "Los datos cambiaron. Actualice antes de guardar." : "Revise las ofertas, cantidades, fechas y proveedores." }, { status: conflict ? 409 : 400 }); }
}
export async function PATCH(request: Request) {
  try {
    const session = await requirePermission("purchases.manage"), db = getDb();
    const input = z.object({ publicId: idSchema, expectedUpdatedAt: z.string(), purchaseUpdatedAt: z.string() }).parse(await request.json());
    const [row] = await db.select().from(supplierComparisons).where(and(eq(supplierComparisons.ownerEmail, session.ownerEmail), eq(supplierComparisons.publicId, input.publicId))).limit(1);
    if (!row || row.updatedAt !== input.expectedUpdatedAt) return Response.json({ error: "El comparador cambió. Guarde y actualice antes de preparar." }, { status: 409 });
    const payload = JSON.parse(row.payloadJson); const comparison = comparisonSchema.parse(payload);
    const [purchase] = await db.select().from(purchaseRequests).where(and(eq(purchaseRequests.ownerEmail, session.ownerEmail), eq(purchaseRequests.publicId, row.purchaseRequestPublicId))).limit(1);
    if (!purchase || purchase.status !== "Solicitada" || purchase.updatedAt !== input.purchaseUpdatedAt) return Response.json({ error: "La compra cambió o ya fue aprobada." }, { status: 409 });
    const offer = comparison.offers.find(o => o.id === comparison.selectedOfferId);
    if (!offer) return Response.json({ error: "Seleccione y guarde una oferta." }, { status: 400 });
    const [supplier] = await db.select().from(suppliers).where(and(eq(suppliers.ownerEmail, session.ownerEmail), eq(suppliers.publicId, offer.supplierPublicId), eq(suppliers.active, true))).limit(1);
    if (!supplier) return Response.json({ error: "Proveedor no disponible." }, { status: 409 });
    const requirements = payload.requirements as Requirement[], result = evaluateOffer(offer, requirements, purchase.currency, businessDate());
    const items = await db.select().from(purchaseRequestItems).where(and(eq(purchaseRequestItems.ownerEmail, session.ownerEmail), eq(purchaseRequestItems.purchaseRequestPublicId, purchase.publicId)));
    if (!result.eligible || items.length !== requirements.length || requirements.some(r => !items.some(i => i.publicId === r.publicId && i.unit === r.unit))) return Response.json({ error: result.errors.join(" ") || "El listado cambió. Revise la solicitud." }, { status: 409 });
    const updatedAt = new Date(Math.max(Date.now(), (Date.parse(row.updatedAt) || 0) + 1, (Date.parse(purchase.updatedAt) || 0) + 1)).toISOString();
    const notes = `Oferta ${offer.reference}. Entrega: ${offer.deliveryDays} días. Vigencia: ${offer.validUntil}. Despacho neto: ${offer.dispatchNet} ${offer.currency}. Presentaciones completas; sobrantes incluidos.\n${offer.lines.map(l => `${items.find(i => i.publicId === l.itemPublicId)?.description}: ${l.presentation} (${l.packageQuantity} ${l.unit})`).join("; ")}`;
    const ops = [env.DB.prepare("UPDATE purchase_requests SET supplier_public_id=?,supplier=?,currency=?,dispatch_net=?,discount_percent=?,tax_percent=?,subtotal=?,discount_amount=?,net_subtotal=?,tax_amount=?,total=?,notes=?,updated_at=? WHERE owner_email=? AND public_id=? AND status='Solicitada' AND updated_at=?").bind(supplier.publicId, supplier.name, offer.currency, String(offer.dispatchNet), String(offer.discountPercent), String(offer.taxPercent), String(result.subtotal), String(result.discountAmount), String(result.netSubtotal), String(result.taxAmount), String(result.total), notes, updatedAt, session.ownerEmail, purchase.publicId, purchase.updatedAt), env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'CONFLICT' END)")];
    for (const line of result.lines) ops.push(env.DB.prepare("UPDATE purchase_request_items SET quantity=?,unit_cost=?,line_total=? WHERE owner_email=? AND purchase_request_public_id=? AND public_id=?").bind(String(line.quantity), String(line.unitCost), String(line.lineTotal), session.ownerEmail, purchase.publicId, line.publicId));
    const next = { ...payload, purchaseUpdatedAt: updatedAt, preparedAt: updatedAt, preparedOfferId: offer.id };
    ops.push(env.DB.prepare("UPDATE supplier_comparisons SET payload_json=?,updated_at=? WHERE owner_email=? AND public_id=? AND updated_at=?").bind(JSON.stringify(next), updatedAt, session.ownerEmail, row.publicId, row.updatedAt), env.DB.prepare("SELECT json(CASE WHEN changes()=1 THEN 'true' ELSE 'CONFLICT' END)"));
    ops.push(env.DB.prepare("INSERT INTO audit_events (public_id,owner_email,actor_email,actor_name,actor_role,action,entity_type,entity_public_id,detail_json) VALUES (?,?,?,?,?,'PURCHASE_COMPARED','purchase_request',?,?)").bind(crypto.randomUUID(), session.ownerEmail, session.user.email, session.user.name, session.user.role, purchase.publicId, JSON.stringify({ comparisonId: row.publicId, offerId: offer.id, total: result.total })));
    await env.DB.batch(ops);
    return Response.json({ comparison: { ...next, updatedAt, expectedUpdatedAt: updatedAt }, message: "Compra preparada. Requiere aprobación en Inventario y compras antes de emitirla." });
  } catch (error) { const auth = authorizationResponse(error); if (auth) return auth; return Response.json({ error: "No fue posible preparar. Actualice y revise ofertas y compra; la operación es atómica." }, { status: 409 }); }
}
