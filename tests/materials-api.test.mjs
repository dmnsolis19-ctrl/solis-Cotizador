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
  if (values.length > 100) throw new Error("D1_ERROR: too many SQL variables");
  const query = sqlite.prepare(sql);
  const returnsRows = /^\s*select\b|\breturning\b/i.test(sql);
  const result = () => { const results = returnsRows ? query.all(...values) : []; const run = returnsRows ? { changes: 0 } : query.run(...values); return { success: true, results, meta: { changes: Number(run.changes), last_row_id: Number(run.lastInsertRowid || 0) } }; };
  return { bind: (...args) => statement(sql, args), all: async () => result(), run: async () => result(), raw: async () => query.all(...values).map((row) => Object.values(row)), first: async () => query.get(...values), _result: result };
}
const DB = { prepare: (sql) => statement(sql), batch: async (statements) => { sqlite.exec("BEGIN"); try { const rows = statements.map((value) => value._result()); sqlite.exec("COMMIT"); return rows; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } } };
const state = globalThis.__solisApi = { env: { DB, BUCKET: { get: async () => ({ size: 20, arrayBuffer: async () => new TextEncoder().encode("%PDF-TEST").buffer }) } }, owner: "owner@solis.test", permissions: ["quotes.read", "quotes.write", "quotes.flow", "quotes.approve", "documents.quote"], emails: 0 };
const vite = await createServer({ appType: "custom", configFile: false, root,
  resolve: { alias: [{ find: "@/lib/auth", replacement: "virtual:solis-auth" }, { find: "@", replacement: root }] },
  plugins: [{ name: "api-test-bindings", resolveId(id) { if (id === "cloudflare:workers" || id === "virtual:solis-auth") return `\0${id}`; }, load(id) {
    if (id === "\0cloudflare:workers") return "export const env = globalThis.__solisApi.env;";
    if (id === "\0virtual:solis-auth") return `
      export class AuthorizationError extends Error { constructor(message, status) { super(message); this.status = status; } }
      export const authorizationResponse = error => error instanceof AuthorizationError ? Response.json({ error: error.message }, { status: error.status }) : null;
      export async function requirePermission(permission) { const s = globalThis.__solisApi; if (!s.permissions.includes(permission)) throw new AuthorizationError('Sin permiso', 403); return { ownerEmail: s.owner, user: { name: 'Cotizador', email: 'user@solis.test', role: 'estimator', publicId: 'test-user' }, permissions: s.permissions }; }
      export async function sha256(value) { const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)); return [...new Uint8Array(bytes)].map(n => n.toString(16).padStart(2, '0')).join(''); }
    `;
  } }], server: { middlewareMode: true } });
after(async () => { await vite.close(); sqlite.close(); delete globalThis.__solisApi; });
const route = await vite.ssrLoadModule("/app/api/quotes/route.ts");
const flow = await vite.ssrLoadModule("/app/api/quote-flow/route.ts");
const exportsRoute = await vite.ssrLoadModule("/app/api/quote-materials/route.ts");
const delivery = await vite.ssrLoadModule("/app/api/document-delivery/route.ts");
const materials = await vite.ssrLoadModule("/lib/material-groups.ts");
const request = (path, body, method = "POST") => new Request(`https://solis.test${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

test("persists global materials, reopens without duplication, guards revisions and isolates tenants", async () => {
  const list = materials.emptyMaterialGroup(); list.materials[0].unitCost = 70000; list.pricingMode = "manual"; list.salePrice = 100000;
  const id = crypto.randomUUID();
  const input = { publicId: id, clientName: "Cliente industrial", project: "Proyecto solar", issueDate: "2026-10-20", items: [], materialGroups: [list] };
  const created = await route.POST(request("/api/quotes", input));
  assert.equal(created.status, 201, JSON.stringify(await created.clone().json()));
  let detail = await (await route.GET(new Request(`https://solis.test/api/quotes?publicId=${id}`))).json();
  assert.equal(detail.items.length, 1); assert.equal(detail.manualItems.length, 0); assert.equal(detail.quote.directCost, "70000");
  const pendingLock = await flow.POST(request("/api/quote-flow", { action: "lock", quotePublicId: id }));
  assert.equal(pendingLock.status, 409);
  list.materials[0].priceStatus = "confirmed";
  const updated = await route.PATCH(request("/api/quotes", { ...input, expectedUpdatedAt: detail.quote.updatedAt }, "PATCH"));
  assert.equal(updated.status, 200, JSON.stringify(await updated.clone().json()));
  const stale = await route.PATCH(request("/api/quotes", { ...input, expectedUpdatedAt: detail.quote.updatedAt }, "PATCH")); assert.equal(stale.status, 409);
  const locked = await flow.POST(request("/api/quote-flow", { action: "lock", quotePublicId: id })); assert.equal(locked.status, 200);
  const frozenEdit = await route.PATCH(request("/api/quotes", input, "PATCH")); assert.equal(frozenEdit.status, 409);
  const exported = await exportsRoute.GET(new Request(`https://solis.test/api/quote-materials?publicId=${id}&format=csv&listIds=${list.id}`));
  assert.equal(exported.status, 200); assert.ok(!(await exported.text()).includes("70000"));
  const wrongList = await exportsRoute.GET(new Request(`https://solis.test/api/quote-materials?publicId=${id}&format=pdf&listIds=${crypto.randomUUID()}`)); assert.equal(wrongList.status, 400);
  const revised = await flow.POST(request("/api/quote-flow", { action: "revision", quotePublicId: id, detail: "Cambio de alcance" })); const revision = await revised.json(); assert.equal(revised.status, 200);
  detail = await (await route.GET(new Request(`https://solis.test/api/quotes?publicId=${revision.publicId}`))).json(); assert.equal(detail.materialGroups.length, 1); assert.equal(detail.manualItems.length, 0); assert.equal(detail.items.length, 1);
  const changed = structuredClone(input); changed.publicId = revision.publicId; changed.materialGroups[0].materials[0].unitCost = 80000;
  assert.equal((await route.PATCH(request("/api/quotes", { ...changed, expectedUpdatedAt: detail.quote.updatedAt }, "PATCH"))).status, 200);
  const original = await (await route.GET(new Request(`https://solis.test/api/quotes?publicId=${id}`))).json(); assert.equal(original.materialGroups[0].materials[0].unitCost, 70000);
  state.owner = "other@solis.test";
  assert.equal((await route.GET(new Request(`https://solis.test/api/quotes?publicId=${id}`))).status, 404);
  assert.equal((await exportsRoute.GET(new Request(`https://solis.test/api/quote-materials?publicId=${id}&format=csv&listIds=${list.id}`))).status, 404);
  state.owner = "owner@solis.test"; state.permissions = [];
  assert.equal((await exportsRoute.GET(new Request(`https://solis.test/api/quote-materials?publicId=${id}&format=csv&listIds=${list.id}`))).status, 403);
  state.permissions = ["quotes.read", "quotes.write", "quotes.flow", "quotes.approve", "documents.quote"];
});

test("direct email rejects internal documents, requires configuration and deduplicates accepted sends", async () => {
  const quote = sqlite.prepare("SELECT * FROM quotes WHERE locked = 1 LIMIT 1").get(); const id = crypto.randomUUID();
  sqlite.prepare("INSERT INTO document_snapshots (public_id, owner_email, entity_type, entity_public_id, document_number, revision, version, storage_key, file_name, security_profile) VALUES (?, ?, 'quote', ?, ?, ?, 1, 'pdf-key', 'Cotizacion.pdf', 'commercial_v2')").run(id, state.owner, quote.public_id, quote.number, quote.revision);
  const input = { documentId: id, deliveryId: crypto.randomUUID(), to: "cliente@example.test", subject: "Oferta solar", body: "Adjuntamos nuestra cotización." };
  assert.equal((await delivery.POST(request("/api/document-delivery", input))).status, 503);
  state.env.EMAIL_FROM = "ventas@solis.test"; state.env.EMAIL = { send: async (message) => { state.emails++; assert.equal(message.attachments[0].filename, "Cotizacion.pdf"); return { messageId: "email-001" }; } };
  assert.equal((await delivery.POST(request("/api/document-delivery", input))).status, 200);
  assert.equal((await delivery.POST(request("/api/document-delivery", input))).status, 200); assert.equal(state.emails, 1);
  assert.equal((await delivery.POST(request("/api/document-delivery", { ...input, to: "other@example.test" }))).status, 409);
  sqlite.prepare("UPDATE document_snapshots SET security_profile = 'closure_internal_v1' WHERE public_id = ?").run(id);
  assert.equal((await delivery.POST(request("/api/document-delivery", { ...input, deliveryId: crypto.randomUUID() }))).status, 404); assert.equal(state.emails, 1);
});


test("creates 500 commercial lines under D1's 100-parameter limit and preserves quoted text, decimals and replay", async () => {
  const publicId = crypto.randomUUID();
  const items = Array.from({ length: 500 }, (_, i) => ({ name: `Partida ${i} - O'Higgins`, detail: 'Texto "cotizado"; SELECT no es código', quantity: 1.25, unit: 'un', unitCost: i + 0.25, unitPrice: i + 10.75 }));
  const input = { publicId, clientName: 'Cliente D1', project: 'Proyecto de 500 partidas', issueDate: '2026-10-28', items };
  const response = await route.POST(request('/api/quotes', input));
  assert.equal(response.status, 201, JSON.stringify(await response.clone().json()));
  const saved = sqlite.prepare('SELECT * FROM quote_items WHERE quote_public_id=? ORDER BY position').all(publicId);
  assert.equal(saved.length, 500);
  for (let i = 0; i < saved.length; i++) { assert.equal(saved[i].name, items[i].name); assert.equal(saved[i].detail, items[i].detail); assert.equal(saved[i].quantity, '1.25'); assert.equal(saved[i].unit_price, String(items[i].unitPrice)); }
  assert.equal((await route.POST(request('/api/quotes', input))).status, 200);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quote_items WHERE quote_public_id=?').get(publicId).n, 500);
});

test('revises 500 existing lines atomically under the D1 limit while retaining groups, source data and tenant isolation', async () => {
  const id = crypto.randomUUID(), owner = state.owner;
  const list = materials.emptyMaterialGroup(); list.materials[0].priceStatus = 'confirmed';
  const payload = JSON.stringify({ materialGroups: [list], custom: 'CONSERVAR' });
  sqlite.prepare("INSERT INTO quotes (public_id,owner_email,number,root_public_id,revision,client_name,project,issue_date,status,locked,payload_json) VALUES (?,?,?,?,0,'Cliente D1','Proyecto solar','2026-10-28','Enviada',1,?)").run(id,owner,'SIS-COT-D1-500',id,payload);
  const insert=sqlite.prepare('INSERT INTO quote_items (public_id,owner_email,quote_public_id,position,name,detail,quantity,unit,unit_cost,unit_price) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for(let i=0;i<500;i++)insert.run(`${id}:item:${i}`,owner,id,i,`Partida ${i}`,"Detalle O'Higgins",'2.5','m','12.75','23.25');
  insert.run(crypto.randomUUID(),'other@solis.test',id,999,'AJENO','No copiar','1','un','1','1');
  const response=await flow.POST(request('/api/quote-flow',{action:'revision',quotePublicId:id,detail:'Cambio de alcance'}));
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()));const result=await response.json();
  const revision=sqlite.prepare('SELECT * FROM quotes WHERE public_id=?').get(result.publicId);
  assert.equal(revision.status,'Borrador');assert.equal(revision.locked,0);assert.equal(revision.parent_public_id,id);assert.equal(revision.root_public_id,id);assert.equal(revision.revision,1);
  assert.deepEqual(JSON.parse(revision.payload_json).materialGroups,[list]);assert.equal(JSON.parse(revision.payload_json).custom,'CONSERVAR');
  const copied=sqlite.prepare('SELECT * FROM quote_items WHERE quote_public_id=? ORDER BY position').all(result.publicId);assert.equal(copied.length,500);
  for(let i=0;i<500;i++){assert.equal(copied[i].public_id,`${result.publicId}:item:${i}`);assert.equal(copied[i].name,`Partida ${i}`);assert.equal(copied[i].quantity,'2.5');assert.equal(copied[i].unit_cost,'12.75');assert.equal(copied[i].unit_price,'23.25');}
  assert.equal(sqlite.prepare('SELECT locked FROM quotes WHERE public_id=?').get(id).locked,1);
});

test('failed item writes roll back the quote header and revision header, with no partial commercial versions', async () => {
  sqlite.exec("CREATE TRIGGER fail_quote_line BEFORE INSERT ON quote_items BEGIN SELECT RAISE(ABORT,'injected line failure'); END;");
  try {
    const id=crypto.randomUUID();const response=await route.POST(request('/api/quotes',{publicId:id,clientName:'Cliente',project:'Fallo controlado',issueDate:'2026-10-28',items:[{name:'Partida',quantity:1,unit:'un',unitCost:1,unitPrice:2}]}));assert.equal(response.status,400);assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quotes WHERE public_id=?').get(id).n,0);
    const source=sqlite.prepare("SELECT public_id FROM quotes WHERE number='SIS-COT-D1-500'").get();
    const before=sqlite.prepare('SELECT COUNT(*) AS n FROM quotes WHERE parent_public_id=?').get(source.public_id).n;
    assert.equal((await flow.POST(request('/api/quote-flow',{action:'revision',quotePublicId:source.public_id,detail:'Fallo controlado'}))).status,400);
    assert.equal(sqlite.prepare('SELECT COUNT(*) AS n FROM quotes WHERE parent_public_id=?').get(source.public_id).n,before);
  } finally {sqlite.exec('DROP TRIGGER fail_quote_line');}
});
