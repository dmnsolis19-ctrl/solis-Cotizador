import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("calculates net, tax and total without rounding away payment precision", async () => {
  const { billingAmounts } = await vite.ssrLoadModule("/lib/billing.ts");
  assert.deepEqual(billingAmounts(100000, 19), { netAmount: 100000, taxAmount: 19000, totalAmount: 119000 });
  assert.deepEqual(billingAmounts(100.5, 0), { netAmount: 100.5, taxAmount: 0, totalAmount: 100.5 });
});

test("derives issued, partial, overdue, paid and void states", async () => {
  const { collectionStatus } = await vite.ssrLoadModule("/lib/billing.ts");
  const base = { totalAmount: 1000, dueDate: "2026-08-30" };
  assert.equal(collectionStatus({ ...base, status: "Emitida", paidAmount: 0 }, "2026-08-29"), "Emitida");
  assert.equal(collectionStatus({ ...base, status: "Emitida", paidAmount: 500 }, "2026-08-29"), "Parcial");
  assert.equal(collectionStatus({ ...base, status: "Emitida", paidAmount: 500 }, "2026-08-31"), "Vencida");
  assert.equal(collectionStatus({ ...base, status: "Emitida", paidAmount: 1000 }, "2026-08-31"), "Pagada");
  assert.equal(collectionStatus({ ...base, status: "Anulada", paidAmount: 0 }, "2026-08-31"), "Anulada");
});

test("summarizes cash without counting drafts or void documents", async () => {
  const { collectionSummary } = await vite.ssrLoadModule("/lib/billing.ts");
  const result = collectionSummary([
    { status: "Emitida", totalAmount: 1000, paidAmount: 200 },
    { status: "Vencida", totalAmount: 500, paidAmount: 100 },
    { status: "Borrador", totalAmount: 900, paidAmount: 0 },
    { status: "Anulada", totalAmount: 700, paidAmount: 0 },
  ]);
  assert.deepEqual(result, { billed: 1500, collected: 300, receivable: 1200, overdue: 400 });
});

test("keeps collection documents non-fiscal and auditable", async () => {
  const route = await readFile(new URL("../app/api/billing/route.ts", import.meta.url), "utf8");
  assert.match(route, /billing\.manage/);
  assert.match(route, /billing\.payments/);
  assert.match(route, /PAYMENT_RECORDED/);
  assert.match(route, /supera el saldo comercial disponible/);
  const documents = await readFile(new URL("../app/api/documents/route.ts", import.meta.url), "utf8");
  assert.match(documents, /documents\.collection/);
  assert.match(documents, /buildCollectionDocumentPdf/);
});

test("creates a collection PDF that explicitly does not replace an SII DTE", async () => {
  const { buildCollectionDocumentPdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const bytes = buildCollectionDocumentPdf({ company: { commercial_name: "SOLIS" }, document: {
    number: "COB-2026-00001", clientName: "Cliente SpA", project: "Tablero MCC", concept: "Anticipo", status: "Parcial", currency: "CLP",
    issueDate: "2026-08-31", dueDate: "2026-09-15", netAmount: 100000, taxPercent: 19, taxAmount: 19000, totalAmount: 119000,
    paidAmount: 50000, balance: 69000, notes: "Anticipo contractual", payments: [{ paymentDate: "2026-09-01", amount: 50000, method: "Transferencia", reference: "TRX-001" }],
  }});
  const raw = Buffer.from(bytes).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(bytes.byteLength > 1800);
});
