import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("calculates actual profit, margin, variance and cost breakdown", async () => {
  const { profitabilityMetrics, parseCostPayload } = await vite.ssrLoadModule("/lib/profitability.ts");
  const entries = [
    parseCostPayload(JSON.stringify({ entry_type: "hours", quantity: 5, unit_cost: 10000 })),
    parseCostPayload(JSON.stringify({ entry_type: "material", total: 30000 })),
  ];
  const result = profitabilityMetrics(200000, 100000, entries);
  assert.equal(result.actualCost, 80000);
  assert.equal(result.actualProfit, 120000);
  assert.equal(result.actualMarginPercent, 60);
  assert.equal(result.budgetVariance, -20000);
  assert.deepEqual(result.breakdown, { hours: 50000, material: 30000 });
});

test("blocks closure until execution, materials, purchases and sign-off are complete", async () => {
  const { closureBlockers } = await vite.ssrLoadModule("/lib/profitability.ts");
  const blockers = closureBlockers({ status: "En ejecución", activities: [{ required: true, completed: false }], materialStatuses: ["Reservada"], purchaseStatuses: ["Recepción parcial"], signoffs: 0 });
  assert.equal(blockers.length, 5);
  assert.deepEqual(closureBlockers({ status: "Completada", activities: [{ required: true, completed: true }], materialStatuses: ["Entregada"], purchaseStatuses: ["Recibida"], signoffs: 1 }), []);
});

test("freezes closed orders and protects closure documents by permission", async () => {
  for (const route of ["orders", "order-execution", "order-evidence", "order-signoff", "material-requests"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /isWorkOrderClosed/);
  }
  const profitability = await readFile(new URL("../app/api/profitability/route.ts", import.meta.url), "utf8");
  assert.match(profitability, /requirePermission\("orders\.close"\)/);
  assert.match(profitability, /WORK_ORDER_CLOSED/);
  const documents = await readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8");
  assert.match(documents, /documents\.closure/);
  assert.match(documents, /buildClosureReportPdf/);
});

test("creates the internal closure PDF with frozen financial result", async () => {
  const { buildClosureReportPdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const bytes = buildClosureReportPdf({ company: { commercial_name: "SOLIS" }, closure: {
    number: "OT-2026-001", clientName: "Cliente SpA", project: "Tablero MCC", currency: "CLP",
    closedAt: "2026-08-31T12:00:00Z", closedBy: "Supervisor", closureNotes: "Trabajo terminado y recibido conforme.",
    sale: 200000, budgetedCost: 100000, actualCost: 80000, actualProfit: 120000, actualMarginPercent: 60,
    budgetVariance: -20000, breakdown: { hours: 50000, material: 30000 }, counts: { activities: 2, signoffs: 1, materialRequests: 1, purchases: 1 },
  }});
  const raw = Buffer.from(bytes).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(bytes.byteLength > 1800);
});
