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
