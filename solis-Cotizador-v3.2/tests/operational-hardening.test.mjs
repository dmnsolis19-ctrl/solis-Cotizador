import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("uses the Chilean business date instead of UTC for operational records", async () => {
  const { businessDate, businessYear } = await vite.ssrLoadModule("/lib/dates.ts");
  const instant = new Date("2027-01-01T02:30:00.000Z");
  assert.equal(businessDate(instant), "2026-12-31");
  assert.equal(businessYear(instant), 2026);
});

test("reserves document numbers atomically and ships the sequence migration", async () => {
  const [sequence, migration] = await Promise.all([
    readFile(new URL("../lib/sequences.ts", import.meta.url), "utf8"),
    readFile(new URL("../drizzle/0014_pretty_emma_frost.sql", import.meta.url), "utf8"),
  ]);
  assert.match(sequence, /ON CONFLICT\(owner_email, scope\) DO UPDATE/);
  assert.match(sequence, /RETURNING value/);
  assert.match(migration, /CREATE UNIQUE INDEX `document_sequences_owner_scope_uidx`/);
});

test("edits only unlocked quote drafts with optimistic concurrency", async () => {
  const [route, app] = await Promise.all([
    readFile(new URL("../app/api/quotes/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/cotizador-app.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(route, /export async function PATCH/);
  assert.match(route, /expectedUpdatedAt/);
  assert.match(route, /Solo puede editar una versión en estado Borrador/);
  assert.match(route, /QUOTE_UPDATED/);
  assert.match(app, /executeOrQueue\(quote \? "quote\.update" : "quote\.create"/);
  assert.match(app, /Editar borrador/);
});
