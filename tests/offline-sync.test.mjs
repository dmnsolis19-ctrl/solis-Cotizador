import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("validates the supported offline operation contracts", async () => {
  const { SYNC_OPERATION_TYPES, syncOperationSchema, syncOperationLabel } = await vite.ssrLoadModule("/lib/sync-contract.ts");
  assert.deepEqual(SYNC_OPERATION_TYPES, ["client.create", "catalog.create", "quote.create", "order.update", "activity.create", "activity.update", "entry.create", "material_request.create"]);
  for (const type of SYNC_OPERATION_TYPES) {
    const parsed = syncOperationSchema.parse({ id: "1a784adf-f37c-4f4e-aeca-953eff2dfb20", type, payload: { sample: true }, createdAt: "2026-08-28T01:00:00.000Z" });
    assert.equal(parsed.type, type);
    assert.ok(syncOperationLabel(type).length > 4);
  }
  assert.throws(() => syncOperationSchema.parse({ id: "not-a-uuid", type: "quote.delete", payload: {}, createdAt: "today" }));
});

test("uses IndexedDB and only reads localStorage to migrate legacy drafts", async () => {
  const [queue, app, worker] = await Promise.all([
    readFile(new URL("../lib/offline-queue.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/cotizador-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(queue, /indexedDB\.open/);
  assert.match(queue, /solis-cotizador-sync/);
  assert.doesNotMatch(app, /solis\.quote\.draft\.v1/);
  assert.doesNotMatch(app, /localStorage/);
  assert.match(queue, /migrateLegacyQuoteDraft/);
  assert.doesNotMatch(queue, /localStorage\.setItem/);
  const apiBranch = worker.slice(worker.indexOf('url.pathname.startsWith("/api/")'), worker.indexOf("  event.respondWith(caches.match", worker.indexOf('url.pathname.startsWith("/api/")')));
  assert.doesNotMatch(apiBranch, /cache\.put/);
});
