import assert from "node:assert/strict";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const sqlite = new DatabaseSync(":memory:");
for (const name of (await readdir(new URL("../drizzle/", import.meta.url))).filter((name) => name.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(`../drizzle/${name}`, import.meta.url), "utf8"));
function statement(sql, values = []) {
  if (values.length > 100) throw new Error("D1 bind limit exceeded");
  const query = sqlite.prepare(sql);
  const returnsRows = /^\s*select\b|\breturning\b/i.test(sql);
  const result = () => { const results = returnsRows ? query.all(...values) : []; const run = returnsRows ? { changes: 0 } : query.run(...values); return { success: true, results, meta: { changes: Number(run.changes), last_row_id: Number(run.lastInsertRowid || 0) } }; };
  return { bind: (...args) => statement(sql, args), all: async () => result(), run: async () => result(), raw: async () => query.all(...values).map((row) => Object.values(row)), first: async () => query.get(...values), _result: result };
}
const DB = { prepare: (sql) => statement(sql), batch: async (statements) => { sqlite.exec("BEGIN"); try { const rows = statements.map((value) => value._result()); sqlite.exec("COMMIT"); return rows; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
const state = globalThis.__solisProApi = { env: { DB, BUCKET: { get: async () => ({ size: 20, arrayBuffer: async () => new TextEncoder().encode("%PDF-TEST").buffer }) } }, owner: "owner@solis.test", permissions: ["dashboard.view", "clients.write", "catalog.read", "catalog.write", "billing.read", "billing.manage", "settings.manage", "orders.execute", "documents.order"], role: "administrator", emails: 0 };
const vite = await createServer({ appType: "custom", configFile: false, root,
  resolve: { alias: [{ find: "@/lib/auth", replacement: "virtual:solis-auth" }, { find: "@", replacement: root }] },
  plugins: [{ name: "api-test-bindings", resolveId(id) { if (id === "cloudflare:workers" || id === "virtual:solis-auth") return `\0${id}`; }, load(id) {
    if (id === "\0cloudflare:workers") return "export const env = globalThis.__solisProApi.env;";
    if (id === "\0virtual:solis-auth") return `
      export class AuthorizationError extends Error { constructor(message, status) { super(message); this.status = status; } }
      export const authorizationResponse = error => error instanceof AuthorizationError ? Response.json({ error: error.message }, { status: error.status }) : null;
      export async function requirePermission(permission) { const s = globalThis.__solisProApi; if (!s.permissions.includes(permission)) throw new AuthorizationError('Sin permiso', 403); return { ownerEmail: s.owner, user: { name: 'Cotizador', email: 'user@solis.test', role: s.role, publicId: 'test-user' }, permissions: s.permissions }; }
      export async function sha256(value) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join(''); }
    `;
  } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); sqlite.close(); delete globalThis.__solisProApi; });
const settings = await vite.ssrLoadModule('/app/api/settings/route.ts');
const catalog = await vite.ssrLoadModule('/app/api/catalog-reference/route.ts');
const editCatalog = await vite.ssrLoadModule('/app/api/catalog/route.ts');
const accounting = await vite.ssrLoadModule('/app/api/accounting/route.ts');
const orderMaterials = await vite.ssrLoadModule('/app/api/order-materials/route.ts');
const sync = await vite.ssrLoadModule('/app/api/sync/route.ts');
const { CHILE_PRICE_REFERENCES, referenceUnitCost } = await vite.ssrLoadModule('/lib/price-reference.ts');
const { emptyMaterialGroup } = await vite.ssrLoadModule('/lib/material-groups.ts');
const request = (path, body, headers = {}) => new Request(`https://solis.test${path}`, { method:'POST', headers:{'Content-Type':'application/json', ...headers}, body:JSON.stringify(body) });
const read = (path) => new Request(`https://solis.test${path}`);
const okJson = async (response, expected=200) => { const body = await response.json(); assert.equal(response.status,expected,JSON.stringify(body)); return body; };
const quoteId = crypto.randomUUID(), orderId = crypto.randomUUID(), clientId = crypto.randomUUID();
const billId = crypto.randomUUID(), bill2Id = crypto.randomUUID();
const group = emptyMaterialGroup(); group.title='Materiales AC'; group.materials[0].description='Cable de cobre'; group.materials[0].code='CABLE'; group.materials[0].unitCost=888888; group.materials[0].priceStatus='confirmed';
sqlite.prepare('INSERT INTO clients (public_id, owner_email, name, tax_id, address, payload_json) VALUES (?, ?, ?, ?, ?, ?)').run(clientId,state.owner,'Receptor SpA','6.076.986-9','Dirección real de prueba',JSON.stringify({businessActivity:'Servicios',commune:'Macul',city:'Santiago'}));
sqlite.prepare('INSERT INTO quotes (public_id, owner_email, number, root_public_id, client_public_id, client_name, project, issue_date, status, locked, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)').run(quoteId,state.owner,'COT-TEST-001',quoteId,clientId,'Receptor SpA','Proyecto solar','2026-10-20','Aprobada',JSON.stringify({materialGroups:[group]}));
sqlite.prepare('INSERT INTO work_orders (public_id, owner_email, number, quote_public_id, client_name, project, status, approved_sale, payload_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').run(orderId,state.owner,'OT-TEST-001',quoteId,'Receptor SpA','Proyecto solar','En ejecución','500000','{}');
for (const [id,number,net] of [[billId,'COB-001',100000],[bill2Id,'COB-002',200000]]) sqlite.prepare('INSERT INTO billing_documents (public_id, owner_email, number, work_order_public_id, quote_public_id, client_name, project, status, concept, currency, issue_date, net_amount, tax_percent, tax_amount, total_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(id,state.owner,number,orderId,quoteId,'Receptor SpA','Proyecto solar','Emitida','Anticipo','CLP','2026-10-20',String(net),'19',String(net*.19),String(net*1.19));

test('settings preserve legacy economics, reject stale updates and restrict administration', async () => {
  const company={commercial_name:'SOLIS Prueba',tax_id:'12.345.678-5',accountant_email:'contador@solis.test',representative_title:'Ingeniero',bank_account_holder:'SOLIS Prueba',bank_account_number:'000123456789',bank_name:'Banco de prueba',bank_account_type:'Corriente',bank_notification_email:'pagos@solis.test'};
  await okJson(await settings.POST(request('/api/settings',{company,expectedUpdatedAt:''})));
  const result=sqlite.prepare('SELECT * FROM app_settings').get();
  assert.equal(JSON.parse(result.company_json).tax_id,company.tax_id);
  for(const key of ["representative_title","bank_account_holder","bank_account_number","bank_name","bank_account_type","bank_notification_email"])assert.equal(JSON.parse(result.company_json)[key],company[key]);
  assert.equal((await settings.POST(request('/api/settings',{company,expectedUpdatedAt:''}))).status,409);
  state.permissions=state.permissions.filter(p=>p!=='settings.manage');
  assert.equal((await settings.POST(request('/api/settings',{company,expectedUpdatedAt:result.updated_at}))).status,403);
  state.permissions.push('settings.manage');
});

test('imports sourced prices with correct package and VAT conversion and no overwrites', async () => {
  const reference=CHILE_PRICE_REFERENCES.find(r=>r.packageQuantity===100 && r.priceIncludesVat===true);
  const ambiguous=CHILE_PRICE_REFERENCES.find(r=>r.priceIncludesVat===null);
  assert.equal((await catalog.POST(request('/api/catalog-reference',{codes:[reference.code,ambiguous.code]}))).status,400);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM catalog_items').get().n,0);
  await okJson(await catalog.POST(request('/api/catalog-reference',{codes:[reference.code]})));
  const item=sqlite.prepare('SELECT * FROM catalog_items WHERE code = ?').get(reference.code);
  assert.equal(Number(item.unit_cost),referenceUnitCost(reference));
  assert.equal(item.unit,reference.unit);
  const cost=Number(item.unit_cost)+5;
  const edit={publicId:item.public_id,expectedUpdatedAt:item.updated_at,code:item.code,type:item.type,category:item.category,name:item.name,unit:item.unit,unitCost:cost,unitPrice:cost*1.3,currency:'CLP'};
  await okJson(await editCatalog.POST(request('/api/catalog',edit)),201);
  assert.equal((await editCatalog.POST(request('/api/catalog',edit))).status,409);
  const repeat=await okJson(await catalog.POST(request('/api/catalog-reference',{codes:[reference.code]})));
  assert.equal(repeat.inserted,0); assert.equal(Number(sqlite.prepare('SELECT unit_cost FROM catalog_items WHERE code = ?').get(reference.code).unit_cost),cost);
  const codes=CHILE_PRICE_REFERENCES.filter(r=>r.priceIncludesVat===true).slice(0,100).map(r=>r.code);
  await okJson(await catalog.POST(request('/api/catalog-reference',{codes})));
  assert.equal((await catalog.POST(request('/api/catalog-reference',{codes:Array(101).fill(reference.code)}))).status,400);
});

test('work-order materials isolate assignments and exclude all internal prices', async () => {
  const data=await okJson(await orderMaterials.GET(read(`/api/order-materials?publicId=${orderId}`)));
  assert.equal(data.groups[0].materials[0].description,'Cable de cobre');
  assert.ok(!JSON.stringify(data).includes('888888')); assert.ok(!JSON.stringify(data).includes('accountant_email'));
  state.role='technician'; assert.equal((await orderMaterials.GET(read(`/api/order-materials?publicId=${orderId}`))).status,403);
  sqlite.prepare('UPDATE work_orders SET assigned_user_public_id = ? WHERE public_id = ?').run('test-user',orderId);
  await okJson(await orderMaterials.GET(read(`/api/order-materials?publicId=${orderId}`)));
  state.role='administrator'; state.owner='another@solis.test'; assert.equal((await orderMaterials.GET(read(`/api/order-materials?publicId=${orderId}`))).status,404); state.owner='owner@solis.test';
});

test('accounting snapshots only the collection amount and prevents duplicate requests and emails', async () => {
  const defaults=await okJson(await accounting.GET(read(`/api/accounting?billingDocumentPublicId=${billId}`)));
  assert.equal(defaults.recipient.commune,'Macul');
  const input={action:'prepare',publicId:crypto.randomUUID(),billingDocumentPublicId:billId,recipient:defaults.recipient,accountantEmail:'contador@solis.test',notes:'Preparar anticipo'};
  const prepared=await okJson(await accounting.POST(request('/api/accounting',input)),201);
  assert.equal(prepared.packet.netAmount,100000); assert.equal(prepared.packet.lines.length,1); assert.equal(prepared.packet.lines[0].netTotal,100000);
  assert.ok(!JSON.stringify(prepared.packet).includes('888888'));
  const concurrent=await accounting.POST(request('/api/accounting',{...input,publicId:crypto.randomUUID()})); assert.equal(concurrent.status,409);
  const replay=await okJson(await accounting.POST(request('/api/accounting',input))); assert.equal(replay.replayed,true);
  assert.equal((await accounting.POST(request('/api/accounting',{action:'send',publicId:input.publicId}))).status,503);
  state.env.EMAIL_FROM='ventas@solis.test'; state.env.EMAIL={send:async message=>{state.emails++;assert.equal(message.to,'contador@solis.test');assert.equal(message.attachments.length,3);return{messageId:'test-email-'+state.emails};}};
  await okJson(await accounting.POST(request('/api/accounting',{action:'send',publicId:input.publicId})));
  await okJson(await accounting.POST(request('/api/accounting',{action:'send',publicId:input.publicId}))); assert.equal(state.emails,1);
  await okJson(await accounting.POST(request('/api/accounting',{action:'record',publicId:input.publicId,folio:'456',issueDate:'2026-10-20'})));
  assert.equal((await accounting.POST(request('/api/accounting',{action:'send',publicId:input.publicId}))).status,409);
  state.owner='other@solis.test'; assert.equal((await accounting.POST(request('/api/accounting',{action:'record',publicId:input.publicId,folio:'999',issueDate:'2026-10-20'}))).status,404); state.owner='owner@solis.test';
});

test('a rejected or uncertain email is not resent automatically', async () => {
  const defaults=await okJson(await accounting.GET(read(`/api/accounting?billingDocumentPublicId=${bill2Id}`)));
  const id=crypto.randomUUID(); await okJson(await accounting.POST(request('/api/accounting',{action:'prepare',publicId:id,billingDocumentPublicId:bill2Id,recipient:defaults.recipient,accountantEmail:'contador@solis.test'})),201);
  state.env.EMAIL={send:async()=>{throw new Error('network failure');}};
  assert.equal((await accounting.POST(request('/api/accounting',{action:'send',publicId:id}))).status,502);
  assert.equal((await accounting.POST(request('/api/accounting',{action:'send',publicId:id}))).status,409);
  assert.equal((await accounting.POST(request('/api/accounting',{action:'record',publicId:id,folio:'456',issueDate:'2026-10-20'}))).status,409);
});

test('offline sync reserves once before mutations, replays receipts and rejects session changes', async () => {
  const operation={id:crypto.randomUUID(),type:'entry.create',createdAt:new Date().toISOString(),payload:{action:'add_entry',workOrderPublicId:orderId,entryType:'hours',description:'Montaje',quantity:2,unit:'h',unitCost:10000,entryDate:'2026-10-20'}};
  const headers={'X-Solis-Offline-User':'test-user'};
  const results=await Promise.all([sync.POST(request('/api/sync',operation,headers)),sync.POST(request('/api/sync',operation,headers))]);
  assert.ok(results.some(r=>r.status===200)); assert.ok(results.every(r=>[200,503].includes(r.status)));
  const replay=await okJson(await sync.POST(request('/api/sync',operation,headers))); assert.equal(replay.replayed,true);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM work_order_costs').get().n,1);
  assert.equal((await sync.POST(request('/api/sync',{...operation,payload:{...operation.payload,quantity:3}},headers))).status,409);
  assert.equal((await sync.POST(request('/api/sync',{...operation,id:crypto.randomUUID()},{'X-Solis-Offline-User':'other-user'}))).status,409);
});
