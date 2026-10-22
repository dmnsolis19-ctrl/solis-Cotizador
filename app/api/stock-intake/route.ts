import { env } from 'cloudflare:workers';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { catalogItems, inventoryBalances, inventoryMovements, warehouses } from '@/db/schema';
import { authorizationResponse, requirePermission, sha256 } from '@/lib/auth';
import { weightedAverageCost } from '@/lib/procurement';
import { writeAuditEvent } from '@/lib/audit';
const schema=z.object({receiptPublicId:z.string().uuid(),warehousePublicId:z.string().uuid(),catalogItemPublicId:z.string().min(8).max(160),quantity:z.number().finite().positive().max(1e6),unitCost:z.number().finite().min(0).max(1e9),reference:z.string().trim().max(120).default('')});
export async function POST(request:Request){try{
 const session=await requirePermission('inventory.manage');const input=schema.parse(await request.json());const db=getDb(),owner=session.ownerEmail;const fingerprint=await sha256(JSON.stringify(input));const reason=`Entrada por escaneo [SOLIS:${fingerprint}]`;
 const existing=async()=>{const [row]=await db.select().from(inventoryMovements).where(and(eq(inventoryMovements.ownerEmail,owner),eq(inventoryMovements.publicId,input.receiptPublicId))).limit(1);return row;};
 const prior=await existing();if(prior)return prior.reason===reason?Response.json({ok:true,replayed:true}):Response.json({error:'Este identificador de entrada ya se utilizó con otros datos.'},{status:409});
 const [warehouse]=await db.select().from(warehouses).where(and(eq(warehouses.ownerEmail,owner),eq(warehouses.publicId,input.warehousePublicId),eq(warehouses.active,true))).limit(1);
 const [item]=await db.select().from(catalogItems).where(and(eq(catalogItems.ownerEmail,owner),eq(catalogItems.publicId,input.catalogItemPublicId),eq(catalogItems.active,true))).limit(1);
 if(!warehouse||!item||!item.type.toLowerCase().includes('material'))return Response.json({error:'Seleccione una bodega activa y un material de su biblioteca.'},{status:409});
 if(item.currency!=='CLP')return Response.json({error:'El inventario valoriza en CLP. Normalice el costo del material a CLP antes de ingresarlo.'},{status:409});
 const getBalance=async()=>(await db.select().from(inventoryBalances).where(and(eq(inventoryBalances.ownerEmail,owner),eq(inventoryBalances.warehousePublicId,input.warehousePublicId),eq(inventoryBalances.catalogItemPublicId,input.catalogItemPublicId))).limit(1))[0];
 let balance=await getBalance();if(!balance){await db.insert(inventoryBalances).values({publicId:crypto.randomUUID(),ownerEmail:owner,warehousePublicId:warehouse.publicId,catalogItemPublicId:item.publicId,itemCode:item.code,itemName:item.name,unit:item.unit,quantity:'0',reservedQuantity:'0',minimumQuantity:'0',averageUnitCost:'0',updatedAt:new Date().toISOString()}).onConflictDoNothing();balance=await getBalance();}if(!balance)throw Error('No fue posible preparar el saldo.');
 const before=Number(balance.quantity),after=before+input.quantity;if(after>1e9)return Response.json({error:'La cantidad resultante supera el límite del inventario.'},{status:400});
 const average=weightedAverageCost(before,Number(balance.averageUnitCost),input.quantity,input.unitCost);const now=new Date(Math.max(Date.now(),(Date.parse(balance.updatedAt)||0)+1)).toISOString();let results;
 try{results=await env.DB.batch([
  env.DB.prepare(`INSERT INTO inventory_movements (public_id,owner_email,warehouse_public_id,catalog_item_public_id,movement_type,quantity,stock_before,stock_after,reserved_before,reserved_after,reference,reason,actor,created_at)
   SELECT ?,?,?,?,'RECEIPT',?,?,?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM inventory_balances WHERE owner_email=? AND public_id=? AND updated_at=? AND quantity=? AND reserved_quantity=?)`).bind(input.receiptPublicId,owner,warehouse.publicId,item.publicId,String(input.quantity),balance.quantity,String(after),balance.reservedQuantity,balance.reservedQuantity,input.reference,reason,session.user.name||session.user.email,now,owner,balance.publicId,balance.updatedAt,balance.quantity,balance.reservedQuantity),
  env.DB.prepare(`UPDATE inventory_balances SET quantity=?,average_unit_cost=?,updated_at=? WHERE owner_email=? AND public_id=? AND updated_at=? AND quantity=? AND reserved_quantity=? AND EXISTS (SELECT 1 FROM inventory_movements WHERE public_id=? AND owner_email=? AND reason=?)`).bind(String(after),String(average),now,owner,balance.publicId,balance.updatedAt,balance.quantity,balance.reservedQuantity,input.receiptPublicId,owner,reason)
 ]);}catch(error){const completed=await existing();if(completed)return completed.reason===reason?Response.json({ok:true,replayed:true}):Response.json({error:'La entrada ya existe con otros datos.'},{status:409});throw error;}
 if(results.some(result=>Number(result.meta?.changes)!==1))return Response.json({error:'El saldo cambió en otro dispositivo. Actualice y reintente la misma entrada; no se volvió a sumar.'},{status:409});
 await writeAuditEvent(session,{action:'INVENTORY_SCAN_RECEIVED',entityType:'inventory_balance',entityPublicId:balance.publicId,detail:{receiptPublicId:input.receiptPublicId,quantity:input.quantity,unitCost:input.unitCost,reference:input.reference}});
 return Response.json({ok:true,replayed:false});
}catch(error){return authorizationResponse(error)||Response.json({error:error instanceof z.ZodError?'Revise material, bodega, cantidad y costo.':error instanceof Error?error.message:'No fue posible registrar la entrada.'},{status:400});}}
