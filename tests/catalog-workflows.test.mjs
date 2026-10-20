import assert from "node:assert/strict";
import test, { after } from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFile, readdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const sqlite = new DatabaseSync(":memory:");
for (const f of (await readdir(new URL("../drizzle", import.meta.url))).filter(f => f.endsWith(".sql")).sort()) sqlite.exec(await readFile(new URL(`../drizzle/${f}`, import.meta.url), "utf8"));
const state = globalThis.__solisCatalogTests = { owner: "owner@solis.test", permissions: ["catalog.read", "catalog.write", "purchases.manage", "quotes.write", "quotes.read"], beforeBatch: null, failInsertCode: "" };
function statement(sql, values = []) {
  assert.ok(values.length <= 100, "D1 bind limit"); const query = sqlite.prepare(sql);
  const returnsRows = /^\s*select\b|\breturning\b/i.test(sql);
  const result = () => { if (state.failInsertCode && /^insert into catalog_items/i.test(sql) && values.includes(state.failInsertCode)) throw new Error("forced failure"); const results = returnsRows ? query.all(...values) : []; const run = returnsRows ? { changes: 0 } : query.run(...values); return { success: true, results, meta: { changes: Number(run.changes), last_row_id: Number(run.lastInsertRowid || 0) } }; };
  return { bind: (...args) => statement(sql, args), all: async () => result(), run: async () => result(), raw: async () => query.all(...values).map(row => Object.values(row)), first: async () => query.get(...values), _result: result };
}
const DB = { prepare: sql => statement(sql), batch: async statements => { const before = state.beforeBatch; state.beforeBatch = null; before?.(); sqlite.exec("BEGIN"); try { const results = statements.map(s => s._result()); sqlite.exec("COMMIT"); return results; } catch (e) { sqlite.exec("ROLLBACK"); throw e; } } };
state.env = { DB };
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: [{ find: "@/lib/auth", replacement: "virtual:catalog-auth" }, { find: "@", replacement: root }] }, server: { middlewareMode: true }, plugins: [{ name: "catalog-bindings", resolveId(id) { if (["cloudflare:workers", "virtual:catalog-auth"].includes(id)) return `\0${id}`; }, load(id) {
  if (id === "\0cloudflare:workers") return "export const env = globalThis.__solisCatalogTests.env;";
  if (id === "\0virtual:catalog-auth") return `export class AuthorizationError extends Error { constructor(message, status) { super(message); this.status=status; } } export const authorizationResponse=e=>e instanceof AuthorizationError?Response.json({error:e.message},{status:e.status}):null; export async function requirePermission(p) { const s=globalThis.__solisCatalogTests;if(!s.permissions.includes(p)) throw new AuthorizationError('Sin permiso',403);return {ownerEmail:s.owner,user:{publicId:'user-test',name:'Test',email:'test@solis.test',role:'administrator'},permissions:s.permissions}; }`;
} }] });
after(async () => { await vite.close(); sqlite.close(); delete globalThis.__solisCatalogTests; });
const load = path => vite.ssrLoadModule(path);
const imports = await load("/app/api/catalog-import/route.ts"), bundles = await load("/app/api/catalog-bundles/route.ts"), comparisons = await load("/app/api/supplier-comparisons/route.ts");
const { previewCatalogImport, parseCsv, tableToImportRows, importTemplateCsv } = await load("/lib/catalog-import.ts");
const { importTemplateXlsx } = await load("/lib/tabular-file.ts");
const { applyBundle } = await load("/lib/catalog-bundles.ts");
const { evaluateOffer } = await load("/lib/supplier-comparison.ts");
const { laborEstimateTotals, LABOR_REFERENCES } = await load("/lib/labor.ts");
const post = (body, method = "POST") => new Request("https://solis.test/api", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const ok = async (response, code = 200) => { const body = await response.json(); assert.equal(response.status, code, JSON.stringify(body)); return body; };
const sample = { codigo: "CODE-A", tipo: "Material", categoria: "Electricidad", nombre: "Cable prueba", descripcion: "Solo prueba", unidad: "m", costo: "1190", venta: "2380", moneda: "CLP", iva: "incluido", tasa_iva: "19", proveedor: "Proveedor", fuente: "https://example.test/precio", fecha: "2026-10-20" };
const quoteId = crypto.randomUUID();
sqlite.prepare("INSERT INTO app_settings(owner_email,company_json,economic_settings_json) VALUES (?,?,?)").run(state.owner, '{"commercial_name":"Mi empresa"}', '{"target_margin_percent":"33"}');
sqlite.prepare("INSERT INTO quotes(public_id,owner_email,number,root_public_id,client_name,project,issue_date,status,locked,payload_json,total) VALUES (?,?,?,?,?,?,?,'Aprobada',1,?,?)").run(quoteId,state.owner,"COT-APPROVED",quoteId,"Cliente","Proyecto","2026-10-20",'{"frozen":true,"items":[{"unitPrice":12345}]}',"12345");
const approvedSnapshot = JSON.stringify(sqlite.prepare("SELECT * FROM quotes WHERE public_id=?").get(quoteId));

test("CSV handles UTF-8, escaped quotes and multiline text; template columns round trip", async () => {
  assert.equal(tableToImportRows(parseCsv(importTemplateCsv())).length,1);
  assert.deepEqual(parseCsv('a;b\r\n"x;\ny";"say ""hi"""'),[["a","b"],["x;\ny","say \"hi\""]]);
  assert.throws(()=>parseCsv('a;b\n"open'),/comillas/);
  assert.throws(()=>tableToImportRows([["codigo"],["A"]]),/plantilla/);
  const bytes=importTemplateXlsx();assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);
  if(process.env.SOLIS_TEMPLATE_TEST_PATH) await writeFile(process.env.SOLIS_TEMPLATE_TEST_PATH,bytes);
});
test("preview rejects duplicates, missing IVA, invalid units, bad currency and negative prices", () => {
  const invalid=[{...sample,codigo:' abc '},{...sample,codigo:'ABC'},{...sample,codigo:'B',unidad:'pieza'},{...sample,codigo:'C',iva:''},{...sample,codigo:'D',moneda:'PEN'},{...sample,codigo:'E',costo:'-2'},{...sample,codigo:'F',costo:''}];
  assert.ok(previewCatalogImport(invalid,[],"add").every(r=>r.action==='error'));
  const valid=previewCatalogImport([{...sample,costo:'1.234,50'}],[],"add")[0];assert.equal(valid.input.costo,1234.5);
});
test("import preview writes nothing; commit preserves company, unrelated data and approved quote", async () => {
  const input={action:'preview',mode:'add',rows:[sample]};const preview=await ok(await imports.POST(post(input)));
  assert.equal(sqlite.prepare('SELECT count(*) n FROM catalog_items').get().n,0);
  await ok(await imports.POST(post({...input,action:'commit',expectedStates:preview.preview.map(r=>r.expectedState)})));
  const row=sqlite.prepare('SELECT * FROM catalog_items WHERE code=?').get(sample.codigo);assert.equal(Number(row.unit_cost),1000);assert.equal(Number(row.unit_price),2000);
  assert.equal(sqlite.prepare('SELECT company_json FROM app_settings').get().company_json,'{"commercial_name":"Mi empresa"}');
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(quoteId)),approvedSnapshot);
});
test("explicit add omits existing codes, update omits new codes, and additional payload survives", async () => {
  sqlite.prepare("UPDATE catalog_items SET payload_json=? WHERE code=?").run('{"customField":"preserve"}',sample.codigo);
  const rows=[{...sample,codigo:' code-a ',venta:'3570'},{...sample,codigo:'NEW-OMITTED'}];
  const add=await ok(await imports.POST(post({action:'preview',mode:'add',rows})));assert.equal(add.summary.skipped,1);
  const preview=await ok(await imports.POST(post({action:'preview',mode:'update',rows})));assert.equal(preview.summary.skipped,1);
  await ok(await imports.POST(post({action:'commit',mode:'update',rows,expectedStates:preview.preview.map(r=>r.expectedState)})));
  const updated=sqlite.prepare('SELECT * FROM catalog_items WHERE code=?').get(sample.codigo);assert.equal(Number(updated.unit_price),3000);assert.equal(JSON.parse(updated.payload_json).customField,'preserve');
  assert.equal(sqlite.prepare('SELECT * FROM catalog_items WHERE code=?').get('NEW-OMITTED'),undefined);
});
test("invalid rows and stale previews cannot partially import", async () => {
  const invalid={action:'commit',mode:'add',rows:[{...sample,codigo:'VALID-BLOCKED'},{...sample,codigo:'INVALID',unidad:'???'}],expectedStates:['missing','missing']};
  assert.equal((await imports.POST(post(invalid))).status,400);assert.equal(sqlite.prepare('SELECT * FROM catalog_items WHERE code=?').get('VALID-BLOCKED'),undefined);
  const preview=await ok(await imports.POST(post({action:'preview',mode:'update',rows:[sample]})));
  sqlite.prepare('UPDATE catalog_items SET updated_at=? WHERE code=?').run('new-version',sample.codigo);
  assert.equal((await imports.POST(post({action:'commit',mode:'update',rows:[sample],expectedStates:preview.preview.map(r=>r.expectedState)}))).status,409);
});
test("transaction rolls back earlier rows on write failure and concurrent CAS failure", async () => {
  const rows=[{...sample,codigo:'TX-ROLLBACK-A'},{...sample,codigo:'TX-ROLLBACK-B'}];state.failInsertCode='TX-ROLLBACK-B';
  assert.equal((await imports.POST(post({action:'commit',mode:'add',rows,expectedStates:['missing','missing']}))).status,400);state.failInsertCode='';
  assert.equal(sqlite.prepare('SELECT * FROM catalog_items WHERE code=?').get('TX-ROLLBACK-A'),undefined);
  const preview=await ok(await imports.POST(post({action:'preview',mode:'update',rows:[sample]})));
  const oldCost=sqlite.prepare('SELECT unit_cost FROM catalog_items WHERE code=?').get(sample.codigo).unit_cost;
  state.beforeBatch=()=>sqlite.prepare('UPDATE catalog_items SET updated_at=? WHERE code=?').run('raced-version',sample.codigo);
  assert.equal((await imports.POST(post({action:'commit',mode:'update',rows:[{...sample,costo:'99999'}],expectedStates:preview.preview.map(r=>r.expectedState)}))).status,409);
  assert.equal(sqlite.prepare('SELECT unit_cost FROM catalog_items WHERE code=?').get(sample.codigo).unit_cost,oldCost);
});
test("200-row import stays within D1 bind limits and permissions isolate accounts", async () => {
  const rows=Array.from({length:200},(_,i)=>({...sample,codigo:`BATCH-${i}`}));
  await ok(await imports.POST(post({action:'commit',mode:'add',rows,expectedStates:rows.map(()=>"missing")})));
  state.permissions=state.permissions.filter(p=>p!=='catalog.write');assert.equal((await imports.POST(post({action:'preview',mode:'add',rows:[sample]}))).status,403);state.permissions.push('catalog.write');
  state.owner='other@solis.test';const preview=await ok(await imports.POST(post({action:'preview',mode:'update',rows:[sample]})));assert.equal(preview.summary.updated,0);state.owner='owner@solis.test';
});
const bundle={publicId:crypto.randomUUID(),expectedUpdatedAt:'',name:'Kit eléctrico',specialty:'Electricidad',currency:'CLP',lines:[{catalogItemPublicId:crypto.randomUUID(),code:'KIT-1',name:'Material kit',detail:'Especificación',type:'Material',unit:'m',quantity:5,unitCost:100,unitPrice:150}]};
test("bundles persist with CAS and stay scoped to their owner", async () => {
  const saved=await ok(await bundles.POST(post(bundle)),201);assert.ok(saved.bundle.updatedAt);
  assert.equal((await bundles.POST(post(bundle))).status,409);
  state.owner='other@solis.test';assert.deepEqual((await ok(await bundles.GET())).bundles,[]);assert.equal((await bundles.POST(post({...bundle,expectedUpdatedAt:saved.bundle.updatedAt}))).status,409);state.owner='owner@solis.test';
});
test("bundle application makes independent copies, edits quantities and excludes double charges", () => {
  const applied=applyBundle(bundle,{[bundle.lines[0].catalogItemPublicId]:7},[],[],'CLP');assert.equal(applied.lines[0].quantity,7);
  bundle.lines[0].unitPrice=999;assert.equal(applied.lines[0].unitPrice,150);
  assert.throws(()=>applyBundle(bundle,{},applied.lines,[],'CLP'),/ya está aplicado/);
  assert.equal(applyBundle(bundle,{},[],[bundle.lines[0].catalogItemPublicId],'CLP').lines.length,0);
  assert.throws(()=>applyBundle(bundle,{},[],[],'USD'),/moneda/);
  assert.throws(()=>applyBundle(bundle,{[bundle.lines[0].catalogItemPublicId]:-1},[],[],'CLP'),/cantidades/);
});
test("labor keeps public sales distinct from internal worker cost and calculates each crew member", () => {
  const totals=laborEstimateTotals({name:'PLC test',specialty:'PLC / HMI',currency:'CLP',scope:'Alcance propio',crew:[{role:'Ingeniero',people:2,hours:8,costRate:100,saleRate:200}],travelHours:2,travelCostRate:50,travelSaleRate:80,transportCost:1000,transportSale:1200,perDiemDays:3,perDiemCost:200,perDiemSale:250});
  assert.equal(totals.cost,4000);assert.equal(totals.sale,6220);assert.equal(totals.hours,16);
  assert.equal(LABOR_REFERENCES.length,9);assert.ok(LABOR_REFERENCES.every(r=>r.sourceUrl.startsWith('https://')&&r.checkedAt==='2026-10-20'&&!('unitCost' in r)));
});
const purchaseId=crypto.randomUUID(),itemId=crypto.randomUUID(),supplierId=crypto.randomUUID(),comparisonId=crypto.randomUUID();
const requirements=[{publicId:itemId,description:'Cable prueba',quantity:12,unit:'m'}];
const offer={id:crypto.randomUUID(),supplierPublicId:supplierId,reference:'OF-1',currency:'CLP',dispatchNet:500,deliveryDays:2,validUntil:'2099-10-30',discountPercent:0,taxPercent:19,confirmed:true,lines:[{itemPublicId:itemId,unit:'m',presentation:'Rollo 10 m',packageQuantity:10,packageNetPrice:1000,availability:'available',availableQuantity:100}]};
sqlite.prepare("INSERT INTO suppliers(public_id,owner_email,code,name,created_by) VALUES (?,?,?,?,?)").run(supplierId,state.owner,'SUP-1','Proveedor 1','Test');
sqlite.prepare("INSERT INTO purchase_requests(public_id,owner_email,number,material_request_public_id,work_order_public_id,warehouse_public_id,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(purchaseId,state.owner,'OC-TEST','request-test','order-test','warehouse-test','Test','purchase-v1');
sqlite.prepare("INSERT INTO purchase_request_items(public_id,owner_email,purchase_request_public_id,material_request_item_public_id,description,quantity,unit) VALUES (?,?,?,?,?,?,?)").run(itemId,state.owner,purchaseId,'item-test','Cable prueba','12','m');
test("comparison counts full packages, surplus and shipping once; rejects stale, unavailable and different currency offers", () => {
  const result=evaluateOffer(offer,requirements,'CLP','2026-10-20');assert.equal(result.eligible,true);assert.equal(result.lines[0].quantity,20);assert.equal(result.lines[0].surplus,8);assert.equal(result.netSubtotal,2500);assert.equal(result.total,2975);
  assert.equal(evaluateOffer({...offer,validUntil:'2020-01-01'},requirements,'CLP','2026-10-20').eligible,false);
  assert.equal(evaluateOffer(offer,requirements,'USD','2026-10-20').eligible,false);
  assert.equal(evaluateOffer({...offer,lines:[{...offer.lines[0],availableQuantity:15}]},requirements,'CLP','2026-10-20').eligible,false);
  assert.equal(evaluateOffer({...offer,lines:[{...offer.lines[0],unit:'un'}]},requirements,'CLP','2026-10-20').eligible,false);
});
let savedComparison;
test("comparison prepares existing purchase with shipping, quantities and approval status preserved", async () => {
  const saved=await ok(await comparisons.POST(post({publicId:comparisonId,purchaseRequestPublicId:purchaseId,expectedUpdatedAt:'',purchaseUpdatedAt:'purchase-v1',offers:[offer],selectedOfferId:offer.id})),201);
  savedComparison=(await ok(await comparisons.PATCH(post({publicId:comparisonId,expectedUpdatedAt:saved.comparison.updatedAt,purchaseUpdatedAt:'purchase-v1'},'PATCH')))).comparison;
  const purchase=sqlite.prepare('SELECT * FROM purchase_requests WHERE public_id=?').get(purchaseId);assert.equal(purchase.status,'Solicitada');assert.equal(Number(purchase.total),2975);assert.equal(Number(purchase.dispatch_net),500);
  assert.equal(Number(sqlite.prepare('SELECT quantity FROM purchase_request_items WHERE public_id=?').get(itemId).quantity),20);
  assert.equal(JSON.stringify(sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(quoteId)),approvedSnapshot);
});
test("comparison preparation is repeatable without adding packages and approved purchases cannot change", async () => {
  const replay=await ok(await comparisons.PATCH(post({publicId:comparisonId,expectedUpdatedAt:savedComparison.updatedAt,purchaseUpdatedAt:savedComparison.purchaseUpdatedAt},'PATCH')));
  assert.equal(Number(sqlite.prepare('SELECT quantity FROM purchase_request_items WHERE public_id=?').get(itemId).quantity),20);
  sqlite.prepare("UPDATE purchase_requests SET status='Aprobada' WHERE public_id=?").run(purchaseId);
  assert.equal((await comparisons.PATCH(post({publicId:comparisonId,expectedUpdatedAt:replay.comparison.updatedAt,purchaseUpdatedAt:replay.comparison.purchaseUpdatedAt},'PATCH'))).status,409);
  state.owner='other@solis.test';assert.equal((await comparisons.GET(new Request(`https://solis.test/api?purchaseRequestPublicId=${purchaseId}`))).status,404);state.owner='owner@solis.test';
});

test("offline save handlers replay receipts without duplicating bundles or comparators", async () => {
  const sync=await load('/app/api/sync/route.ts');
  const operation={id:crypto.randomUUID(),type:'bundle.save',createdAt:new Date().toISOString(),payload:{...bundle,publicId:crypto.randomUUID(),name:'Conjunto offline'}};
  const send=op=>{const request=post(op);request.headers.set('X-Solis-Offline-User','user-test');return sync.POST(request);};
  await ok(await send(operation));assert.equal((await ok(await send(operation))).replayed,true);
  assert.equal(sqlite.prepare('SELECT count(*) n FROM catalog_bundles WHERE public_id=?').get(operation.payload.publicId).n,1);
  const compareRow=sqlite.prepare('SELECT * FROM supplier_comparisons WHERE public_id=?').get(comparisonId);
  sqlite.prepare("UPDATE purchase_requests SET status='Solicitada' WHERE public_id=?").run(purchaseId);
  const payload=JSON.parse(compareRow.payload_json);
  const compareOperation={...operation,id:crypto.randomUUID(),type:'comparison.save',payload:{...payload,expectedUpdatedAt:compareRow.updated_at,purchaseUpdatedAt:sqlite.prepare('SELECT updated_at FROM purchase_requests WHERE public_id=?').get(purchaseId).updated_at}};
  await ok(await send(compareOperation));assert.equal((await ok(await send(compareOperation))).replayed,true);
  state.permissions=state.permissions.filter(p=>p!=='purchases.manage');assert.equal((await send({...compareOperation,id:crypto.randomUUID()})).status,403);state.permissions.push('purchases.manage');
});

test("quote payloads and offline reopening retain bundle identity while snapshots stay independent", async () => {
  const quotes=await load('/app/api/quotes/route.ts');const {cachedQuoteDetail}=await load('/lib/offline-records.ts');
  const copies=applyBundle(bundle,{},[],[],'CLP').lines;
  const created=await ok(await quotes.POST(post({publicId:crypto.randomUUID(),clientName:'Cliente prueba',project:'Copia independiente',issueDate:'2026-10-20',currency:'CLP',items:copies})),201);
  const reopened=await ok(await quotes.GET(new Request(`https://solis.test/api?publicId=${created.quote.publicId}`)));
  assert.equal(reopened.manualItems[0].sourceBundleId,bundle.publicId);
  const offline=cachedQuoteDetail(created.quote);assert.equal(offline.manualItems[0].sourceBundleId,bundle.publicId);
  const old=offline.manualItems[0].unitPrice;bundle.lines[0].unitPrice=123456;assert.equal(offline.manualItems[0].unitPrice,old);
  assert.equal((await quotes.PATCH(post({publicId:quoteId,clientName:'Cliente',project:'Cambio bloqueado',issueDate:'2026-10-20',items:copies},'PATCH'))).status,409);
});

test("purchase PDF includes dispatch and all supplier conditions across pages", async () => {
  const {buildPurchaseOrderPdf}=await load('/lib/pdf-documents.ts');
  const purchase={number:'OC-PDF',status:'Solicitada',currency:'CLP',supplier:'Proveedor',notes:'Condiciones de suministro. '.repeat(500)+'ULTIMA_CONDICION_V36',createdAt:'2026-10-20',subtotal:'2000',discountAmount:'0',discountPercent:'0',dispatchNet:'500',netSubtotal:'2500',taxAmount:'475',taxPercent:'19',total:'2975',approvedBy:'',approvedAt:'',approvalNotes:'',orderedBy:'',orderedAt:''};
  const raw=Buffer.from(buildPurchaseOrderPdf({company:{commercial_name:'SOLIS Prueba'},supplier:{code:'S',name:'Proveedor',taxId:'',contactName:'',email:'',phone:'',address:'',paymentTerms:'',currency:'CLP'},purchase,items:[{description:'Cable',quantity:'20',unit:'m',unitCost:'100',lineTotal:'2000',receivedQuantity:'0'}]})).toString('latin1');
  for(const text of ['Despacho neto','ULTIMA_CONDICION_V36']) assert.ok(raw.includes(Buffer.from(text,'latin1').toString('hex').toUpperCase()));
  assert.match(raw,/\/Count [2-9]\d*/);
});
