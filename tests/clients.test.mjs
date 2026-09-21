import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("normalizes and validates Chilean RUT values", async () => {
  const { isValidChileRut, normalizeChileRut } = await vite.ssrLoadModule("/lib/clients.ts");
  assert.equal(normalizeChileRut("12 345 678 5"), "12.345.678-5");
  assert.equal(normalizeChileRut("6.076.986-9"), "6.076.986-9");
  assert.equal(isValidChileRut("12.345.678-5"), true);
  assert.equal(isValidChileRut("6.076.986-9"), true);
  assert.equal(isValidChileRut("12.345.678-9"), false);
  assert.equal(isValidChileRut(""), true);
});

test("connects client editing across UI, API, audit and offline sync", async () => {
  const [app, route, sync, contract] = await Promise.all([
    readFile(new URL("../app/cotizador-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/clients/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/sync/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/sync-contract.ts", import.meta.url), "utf8"),
  ]);
  assert.match(app, /client\s*\?\s*"client\.update"\s*:\s*"client\.create"/);
  assert.match(app, /<PenLine \/> Editar/);
  assert.match(app, /expectedUpdatedAt/);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /CLIENT_UPDATED/);
  assert.match(route, /eq\(clients\.ownerEmail, ownerEmail\)/);
  assert.match(route, /eq\(clients\.updatedAt,/);
  assert.match(sync, /"client\.update": updateClient/);
  assert.match(contract, /"client\.update"/);
});
