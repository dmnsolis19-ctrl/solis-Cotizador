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
const state = globalThis.__solisV38Api = { env: { DB, BUCKET: { get: async () => ({ size: 20, arrayBuffer: async () => new TextEncoder().encode("%PDF-TEST").buffer }) } }, owner: "owner@solis.test", permissions: ["dashboard.view", "clients.write", "catalog.read", "catalog.write", "billing.read", "billing.manage", "settings.manage", "orders.execute", "documents.order"], role: "administrator", emails: 0 };
const vite = await createServer({ appType: "custom", configFile: false, root,
  resolve: { alias: [{ find: "@/lib/auth", replacement: "virtual:solis-auth" }, { find: "@", replacement: root }] },
  plugins: [{ name: "api-test-bindings", resolveId(id) { if (id === "cloudflare:workers" || id === "virtual:solis-auth") return `\0${id}`; }, load(id) {
    if (id === "\0cloudflare:workers") return "export const env = globalThis.__solisV38Api.env;";
    if (id === "\0virtual:solis-auth") return `
      export class AuthorizationError extends Error { constructor(message, status) { super(message); this.status = status; } }
      export const authorizationResponse = error => error instanceof AuthorizationError ? Response.json({ error: error.message }, { status: error.status }) : null;
      export async function requirePermission(permission) { const s = globalThis.__solisV38Api; if (!s.permissions.includes(permission)) throw new AuthorizationError('Sin permiso', 403); return { ownerEmail: s.owner, user: { name: 'Cotizador', email: 'user@solis.test', role: s.role, publicId: 'test-user' }, permissions: s.permissions }; }
      export async function sha256(value) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join(''); }
    `;
  } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); sqlite.close(); delete globalThis.__solisV38Api; });

const trash=await vite.ssrLoadModule('/app/api/trash/route.ts');
const intake=await vite.ssrLoadModule('/app/api/stock-intake/route.ts');
const dashboard=await vite.ssrLoadModule('/app/api/dashboard/route.ts');
const flow=await vite.ssrLoadModule('/app/api/quote-flow/route.ts');
const read=(path)=>new Request('https://solis.test'+path);
const post=(path,body)=>new Request('https://solis.test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const json=async(response,status=200)=>{const body=await response.json();assert.equal(response.status,status,JSON.stringify(body));return body;};
state.permissions.push('clients.read','quotes.read','quotes.write','quotes.flow','inventory.manage','inventory.read','orders.read');
const owner=state.owner;
const clientId=crypto.randomUUID(),quoteId=crypto.randomUUID(),warehouseId=crypto.randomUUID(),materialId=crypto.randomUUID();
const receipt=()=>({receiptPublicId:crypto.randomUUID(),warehousePublicId:warehouseId,catalogItemPublicId:materialId,quantity:10,unitCost:1000,reference:'Guía 123'});
sqlite.prepare('INSERT INTO clients (public_id,owner_email,name,tax_id,payload_json,updated_at) VALUES (?,?,?,?,?,?)').run(clientId,owner,'Cliente para papelera','6.076.986-9','{"businessActivity":"Servicios","custom":"KEEP"}','2026-10-22T10:00:00Z');
sqlite.prepare('INSERT INTO quotes (public_id,owner_email,number,root_public_id,client_public_id,client_name,project,issue_date,payload_json,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)').run(quoteId,owner,'COT-PAPELERA',quoteId,clientId,'Cliente para papelera','Proyecto','2026-10-22','{"custom":"KEEP","status":"Borrador"}','2026-10-22T10:00:00Z');
sqlite.prepare('INSERT INTO quote_items (public_id,owner_email,quote_public_id,position,name,quantity,unit,unit_cost,unit_price) VALUES (?,?,?,?,?,?,?,?,?)').run(crypto.randomUUID(),owner,quoteId,0,'Cable','1','m','100','200');
sqlite.prepare('INSERT INTO warehouses (public_id,owner_email,code,name,active) VALUES (?,?,?,?,1)').run(warehouseId,owner,'BOD-1','Bodega principal');
sqlite.prepare('INSERT INTO catalog_items (public_id,owner_email,code,type,category,name,unit,unit_cost,unit_price,currency,payload_json) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(materialId,owner,'MAT-SCAN','Material','Electricidad','Cable de cobre','m','1000','1500','CLP','{}');

test('quote archive is recoverable, hidden from active dashboard, preserves items and blocks flow while trashed',async()=>{
 const row=sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(quoteId);
 await json(await trash.POST(post('/api/trash',{kind:'quote',action:'archive',publicId:quoteId,expectedUpdatedAt:row.updated_at})));
 assert.equal(sqlite.prepare('SELECT status FROM quotes WHERE public_id=?').get(quoteId).status,'Eliminada');assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quote_items WHERE quote_public_id=?').get(quoteId).n,1);
 const panel=await json(await dashboard.GET());assert.ok(!panel.quotes.some(q=>q.publicId===quoteId));
 assert.equal((await flow.POST(post('/api/quote-flow',{action:'lock',quotePublicId:quoteId}))).status,409);
 const bin=await json(await trash.GET(read('/api/trash?kind=quote')));assert.equal(bin.records[0].publicId,quoteId);
 await json(await trash.POST(post('/api/trash',{kind:'quote',action:'restore',publicId:quoteId,expectedUpdatedAt:bin.records[0].updatedAt})));
 const restored=sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(quoteId);assert.equal(restored.status,'Borrador');assert.equal(JSON.parse(restored.payload_json).custom,'KEEP');assert.ok(!JSON.parse(restored.payload_json).solisTrash);
 assert.equal((await trash.POST(post('/api/trash',{kind:'quote',action:'archive',publicId:quoteId,expectedUpdatedAt:row.updated_at}))).status,409);
});
test('locked, approved and linked quotes cannot be removed, and account permissions are enforced',async()=>{
 const original=sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(quoteId);
 sqlite.prepare('UPDATE quotes SET locked=1,status=? WHERE public_id=?').run('Aprobada',quoteId);
 assert.equal((await trash.POST(post('/api/trash',{kind:'quote',action:'archive',publicId:quoteId,expectedUpdatedAt:original.updated_at}))).status,409);
 sqlite.prepare('UPDATE quotes SET locked=0,status=? WHERE public_id=?').run('Borrador',quoteId);
 const orderId=crypto.randomUUID();sqlite.prepare('INSERT INTO work_orders (public_id,owner_email,number,quote_public_id,client_name,project,status,payload_json) VALUES (?,?,?,?,?,?,?,?)').run(orderId,owner,'OT-PROTECT',quoteId,'Cliente','Trabajo','Pendiente','{}');
 assert.equal((await trash.POST(post('/api/trash',{kind:'quote',action:'archive',publicId:quoteId,expectedUpdatedAt:original.updated_at}))).status,409);
 state.owner='other@test.cl';assert.equal((await trash.POST(post('/api/trash',{kind:'quote',action:'archive',publicId:quoteId,expectedUpdatedAt:original.updated_at}))).status,404);state.owner=owner;
 state.permissions=state.permissions.filter(p=>p!=='quotes.write');assert.equal((await trash.GET(read('/api/trash?kind=quote'))).status,403);state.permissions.push('quotes.write');
});
test('client archive preserves quote linkage and custom fields; restore rejects an active duplicate RUT',async()=>{
 const record=sqlite.prepare('SELECT * FROM clients WHERE public_id=?').get(clientId);await json(await trash.POST(post('/api/trash',{kind:'client',action:'archive',publicId:clientId,expectedUpdatedAt:record.updated_at})));
 const bin=await json(await trash.GET(read('/api/trash?kind=client')));assert.equal(bin.records[0].publicId,clientId);
 assert.equal(sqlite.prepare('SELECT client_public_id FROM quotes WHERE public_id=?').get(quoteId).client_public_id,clientId);
 const duplicate=crypto.randomUUID();sqlite.prepare('INSERT INTO clients (public_id,owner_email,name,tax_id,payload_json) VALUES (?,?,?,?,?)').run(duplicate,owner,'Duplicado','6076986-9','{}');
 const body={kind:'client',action:'restore',publicId:clientId,expectedUpdatedAt:bin.records[0].updatedAt};assert.equal((await trash.POST(post('/api/trash',body))).status,409);
 sqlite.prepare('UPDATE clients SET active=0 WHERE public_id=?').run(duplicate);await json(await trash.POST(post('/api/trash',body)));
 const restored=sqlite.prepare('SELECT * FROM clients WHERE public_id=?').get(clientId);assert.equal(restored.active,1);assert.equal(JSON.parse(restored.payload_json).custom,'KEEP');
});
test('scanned intake is idempotent and concurrent retries do not add stock twice or change minimums',async()=>{
 const input=receipt();await json(await intake.POST(post('/api/stock-intake',input)));
 assert.equal(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity,'10');
 await Promise.all([intake.POST(post('/api/stock-intake',input)),intake.POST(post('/api/stock-intake',input))]);
 assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE public_id=?').get(input.receiptPublicId).n,1);
 assert.equal(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity,'10');
 assert.equal((await intake.POST(post('/api/stock-intake',{...input,quantity:12}))).status,409);
 sqlite.prepare('UPDATE inventory_balances SET minimum_quantity=5,reserved_quantity=3 WHERE catalog_item_public_id=?').run(materialId);
 await json(await intake.POST(post('/api/stock-intake',{...receipt(),quantity:10,unitCost:2000})));
 const balance=sqlite.prepare('SELECT * FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId);assert.equal(balance.quantity,'20');assert.equal(balance.average_unit_cost,'1500');assert.equal(balance.minimum_quantity,'5');assert.equal(balance.reserved_quantity,'3');
});
test('intake rejects missing permission, other-account materials, non-materials, foreign currency and invalid amounts',async()=>{
 const before=sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity;
 state.permissions=state.permissions.filter(p=>p!=='inventory.manage');assert.equal((await intake.POST(post('/api/stock-intake',receipt()))).status,403);state.permissions.push('inventory.manage');
 state.owner='other@test.cl';assert.equal((await intake.POST(post('/api/stock-intake',receipt()))).status,409);state.owner=owner;
 sqlite.prepare('UPDATE catalog_items SET currency=? WHERE public_id=?').run('USD',materialId);assert.equal((await intake.POST(post('/api/stock-intake',receipt()))).status,409);sqlite.prepare('UPDATE catalog_items SET currency=? WHERE public_id=?').run('CLP',materialId);
 sqlite.prepare('UPDATE catalog_items SET type=? WHERE public_id=?').run('Servicio',materialId);assert.equal((await intake.POST(post('/api/stock-intake',receipt()))).status,409);sqlite.prepare('UPDATE catalog_items SET type=? WHERE public_id=?').run('Material',materialId);
 assert.equal((await intake.POST(post('/api/stock-intake',{...receipt(),quantity:-1}))).status,400);assert.equal(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity,before);
});
test('intake transaction rolls back a movement if the balance update fails, and retry with the same id succeeds once',async()=>{
 const input=receipt();const before=sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity;
 sqlite.exec("CREATE TRIGGER fail_scan_update BEFORE UPDATE ON inventory_balances BEGIN SELECT RAISE(ABORT,'test balance failure'); END;");
 assert.equal((await intake.POST(post('/api/stock-intake',input))).status,400);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE public_id=?').get(input.receiptPublicId).n,0);assert.equal(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity,before);
 sqlite.exec('DROP TRIGGER fail_scan_update');await json(await intake.POST(post('/api/stock-intake',input)));await json(await intake.POST(post('/api/stock-intake',input)));assert.equal(Number(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity),Number(before)+10);
});

test('different simultaneous receipts preserve the balance; a conflicted receipt can be retried without duplication',async()=>{
 const before=Number(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity);
 const inputs=[{...receipt(),quantity:3},{...receipt(),quantity:7}];
 const responses=await Promise.all(inputs.map(input=>intake.POST(post('/api/stock-intake',input))));
 for(let i=0;i<responses.length;i++){assert.ok([200,409].includes(responses[i].status));if(responses[i].status===409)await json(await intake.POST(post('/api/stock-intake',inputs[i])));}
 for(const input of inputs)await json(await intake.POST(post('/api/stock-intake',input)));
 assert.equal(Number(sqlite.prepare('SELECT quantity FROM inventory_balances WHERE catalog_item_public_id=?').get(materialId).quantity),before+10);
 for(const input of inputs)assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM inventory_movements WHERE public_id=?').get(input.receiptPublicId).n,1);
});
