import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("calculates purchase totals and weighted inventory cost", async () => {
  const { purchaseTotals, weightedAverageCost } = await vite.ssrLoadModule("/lib/procurement.ts");
  assert.deepEqual(purchaseTotals([{ quantity: 2, unitCost: 1000 }, { quantity: 3, unitCost: 500 }], 10, 19), {
    subtotal: 3500, discountAmount: 350, netSubtotal: 3150, taxAmount: 598.5, total: 3748.5,
  });
  assert.equal(weightedAverageCost(10, 100, 10, 200), 150);
  assert.equal(weightedAverageCost(0, 0, 4, 250), 250);
});

test("tracks partial and complete purchase receipts", async () => {
  const { purchaseReceiptStatus } = await vite.ssrLoadModule("/lib/procurement.ts");
  assert.equal(purchaseReceiptStatus([{ quantity: 10, receivedQuantity: 0 }]), "Ordenada");
  assert.equal(purchaseReceiptStatus([{ quantity: 10, receivedQuantity: 4 }]), "Recepción parcial");
  assert.equal(purchaseReceiptStatus([{ quantity: 10, receivedQuantity: 10 }]), "Recibida");
});

test("charges projects only on issue and reverses returned material", async () => {
  const source = await readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8");
  assert.match(source, /source: "inventory_issue"/);
  assert.match(source, /source: "inventory_return"/);
  assert.match(source, /total: -input\.quantity \* unitCost/);
  assert.match(source, /weightedAverageCost/);
  assert.doesNotMatch(source, /source: "purchase_receipt"/);
});

test("requires approval before ordering and ordering before receipt", async () => {
  const source = await readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8");
  assert.match(source, /purchase\.status !== "Aprobada"/);
  assert.match(source, /\["Ordenada", "Recepción parcial"\]/);
  assert.match(source, /assertPermission\(session, "purchases\.approve"\)/);
});
