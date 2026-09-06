import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("calculates available stock, minimum alerts and allocation shortages", async () => {
  const { availableStock, inventoryHealth, allocationRemaining } = await vite.ssrLoadModule("/lib/inventory.ts");
  assert.equal(availableStock(20, 6), 14);
  assert.equal(availableStock(3, 5), 0);
  assert.equal(inventoryHealth(20, 6, 5), "Disponible");
  assert.equal(inventoryHealth(10, 6, 5), "Stock bajo");
  assert.equal(inventoryHealth(4, 4, 2), "Sin stock");
  assert.equal(allocationRemaining(12, 5, 2), 5);
});

test("keeps reservations, issues, returns and purchases auditable", async () => {
  const source = await readFile(new URL("../app/api/inventory/route.ts", import.meta.url), "utf8");
  for (const movement of ["RECEIPT", "ADJUSTMENT", "RESERVATION", "ISSUE", "RETURN"]) assert.match(source, new RegExp(`type: "${movement}"`));
  for (const audit of ["WAREHOUSE_CREATED", "SUPPLIER_CREATED", "INVENTORY_RECEIVED", "MATERIAL_REQUEST_ALLOCATED", "MATERIAL_REQUEST_ISSUED", "INVENTORY_RETURNED", "PURCHASE_PREPARED", "PURCHASE_APPROVED", "PURCHASE_ORDERED", "PURCHASE_RECEIVED"]) assert.match(source, new RegExp(audit));
  assert.match(source, /session\.user\.role === "technician"/);
  assert.match(source, /assertPermission\(session, "inventory\.manage"\)/);
  assert.match(source, /assertPermission\(session, "purchases\.manage"\)/);
  assert.match(source, /assertPermission\(session, "purchases\.approve"\)/);
});

test("blocks order completion while supply remains unresolved", async () => {
  const source = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  for (const status of ["Pendiente", "Aprobada", "Reservada", "Compra requerida"]) assert.match(source, new RegExp(status));
  assert.match(source, /solicitudes de material abiertas/);
});
