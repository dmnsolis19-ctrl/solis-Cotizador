import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { getDb } from '@/db';
import { clients, quotes } from '@/db/schema';
import { authorizationResponse, requirePermission } from '@/lib/auth';
import { writeAuditEvent } from '@/lib/audit';
import { normalizeChileRut } from '@/lib/clients';
const kindSchema=z.enum(['quote','client']);
const schema=z.object({kind:kindSchema,action:z.enum(['archive','restore']),publicId:z.string().min(8).max(160),expectedUpdatedAt:z.string().min(1).max(80)});
const permission=(kind:'quote'|'client')=>kind==='quote'?'quotes.write' as const:'clients.write' as const;
function payload(raw:string,archive:boolean,quote=false){let p:Record<string,unknown>={};try{const parsed=JSON.parse(raw||'{}');if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))p=parsed;}catch{}if(quote)p.status=archive?'Eliminada':'Borrador';if(archive)p.solisTrash={archivedAt:new Date().toISOString()};else delete p.solisTrash;return JSON.stringify(p);}
export async function GET(request:Request){try{const kind=kindSchema.parse(new URL(request.url).searchParams.get('kind'));const session=await requirePermission(permission(kind));const db=getDb();
 const records=kind==='quote'?await db.select({publicId:quotes.publicId,title:quotes.number,description:quotes.project,updatedAt:quotes.updatedAt}).from(quotes).where(and(eq(quotes.ownerEmail,session.ownerEmail),eq(quotes.status,'Eliminada'))).orderBy(desc(quotes.updatedAt)).limit(100):await db.select({publicId:clients.publicId,title:clients.name,description:clients.taxId,updatedAt:clients.updatedAt}).from(clients).where(and(eq(clients.ownerEmail,session.ownerEmail),eq(clients.active,false))).orderBy(desc(clients.updatedAt)).limit(100);
 return Response.json({records},{headers:{'Cache-Control':'private, no-store'}});
}catch(error){return authorizationResponse(error)||Response.json({error:'No fue posible cargar la papelera.'},{status:400});}}
export async function POST(request:Request){try{const input=schema.parse(await request.json());const session=await requirePermission(permission(input.kind));const db=getDb();const owner=session.ownerEmail;const archive=input.action==='archive';let changed=false;
 if(input.kind==='quote'){
  const [record]=await db.select().from(quotes).where(and(eq(quotes.ownerEmail,owner),eq(quotes.publicId,input.publicId))).limit(1);if(!record)return Response.json({error:'La cotización no existe en el servidor. Sincronice primero los cambios pendientes.'},{status:404});
  if(record.locked||record.status!==(archive?'Borrador':'Eliminada'))return Response.json({error:'Solo puede eliminar borradores sin congelar o restaurar cotizaciones de la papelera. Las enviadas y aprobadas se conservan.'},{status:409});
  const now=new Date(Math.max(Date.now(),(Date.parse(record.updatedAt)||0)+1)).toISOString();
  const result=await db.update(quotes).set({status:archive?'Eliminada':'Borrador',payloadJson:payload(record.payloadJson,archive,true),updatedAt:now}).where(and(eq(quotes.ownerEmail,owner),eq(quotes.publicId,input.publicId),eq(quotes.updatedAt,input.expectedUpdatedAt),eq(quotes.locked,false),eq(quotes.status,archive?'Borrador':'Eliminada'),
   sql`NOT EXISTS (SELECT 1 FROM work_orders WHERE owner_email=${owner} AND quote_public_id=${input.publicId})`,
   sql`NOT EXISTS (SELECT 1 FROM document_snapshots WHERE owner_email=${owner} AND entity_type='quote' AND entity_public_id=${input.publicId})`,
   sql`NOT EXISTS (SELECT 1 FROM billing_documents WHERE owner_email=${owner} AND quote_public_id=${input.publicId})`,
   sql`NOT EXISTS (SELECT 1 FROM quotes AS child WHERE child.owner_email=${owner} AND child.parent_public_id=${input.publicId})`
  )).returning({publicId:quotes.publicId});changed=result.length===1;
 }else{
  const [record]=await db.select().from(clients).where(and(eq(clients.ownerEmail,owner),eq(clients.publicId,input.publicId))).limit(1);if(!record)return Response.json({error:'El cliente no existe en el servidor. Sincronice primero los cambios pendientes.'},{status:404});
  const now=new Date(Math.max(Date.now(),(Date.parse(record.updatedAt)||0)+1)).toISOString();const rut=normalizeChileRut(record.taxId).replace(/[.\-\s]/g,'').toUpperCase();
  const result=await db.update(clients).set({active:!archive,payloadJson:payload(record.payloadJson,archive),updatedAt:now}).where(and(eq(clients.ownerEmail,owner),eq(clients.publicId,input.publicId),eq(clients.updatedAt,input.expectedUpdatedAt),eq(clients.active,archive),
   archive||!rut?sql`1=1`:sql`NOT EXISTS (SELECT 1 FROM clients AS other WHERE other.owner_email=${owner} AND other.public_id<>${input.publicId} AND other.active=1 AND REPLACE(REPLACE(REPLACE(UPPER(other.tax_id),'.',''),'-',''),' ','')=${rut})`
  )).returning({publicId:clients.publicId});changed=result.length===1;
 }
 if(!changed)return Response.json({error:'El registro cambió o tiene vínculos que impiden esta acción. Al restaurar un cliente, compruebe además que no exista otro activo con el mismo RUT.'},{status:409});
 await writeAuditEvent(session,{action:`${input.kind.toUpperCase()}_${archive?'ARCHIVED':'RESTORED'}`,entityType:input.kind,entityPublicId:input.publicId,detail:{recoverable:true}});
 return Response.json({ok:true});
}catch(error){return authorizationResponse(error)||Response.json({error:error instanceof Error?error.message:'No fue posible completar la acción.'},{status:400});}}
