import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });

test.after(async () => { await vite.close(); });

const company = { commercial_name: "SOLIS Ingeniería y Servicios SpA", rut: "77.123.456-7", email: "contacto@solis.cl" };
const quote = {
  number: "SIS-COT-2026-001-R01", revision: 1, status: "Aprobada", issueDate: "2026-08-27", currency: "CLP",
  clientName: "Cliente Industrial SpA", project: "Modernización tablero MCC", grossSubtotal: "1500000", netSubtotal: "1450000",
  tax: "275500", total: "1725500", lockedAt: "2026-08-27T12:00:00Z", approvedAt: "2026-08-27T13:00:00Z",
  approvedBy: "Jefe de proyecto", approvalNotes: "OC-2026-045",
  payloadJson: JSON.stringify({ discountPercent: 3.33, validityDays: 20, paymentTerms: "50% anticipo / 50% entrega", deliveryTerms: "15 días" }),
  directCost: "999999999", internalCost: "999999999", estimatedProfit: "999999999", marginPercent: "99",
};
const items = [{ name: "Armado de tablero", detail: "Suministro, montaje y pruebas", quantity: "1", unit: "gl", unitPrice: "1500000" }];
const hex = (value) => Buffer.from(value, "latin1").toString("hex").toUpperCase();

test("creates a commercial PDF without internal financial labels", async () => {
  const { buildQuotePdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const bytes = buildQuotePdf({ company, client: { name: quote.clientName, taxId: "76.555.444-3", contactName: "Ana Pérez" }, quote, items });
  const raw = Buffer.from(bytes).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(bytes.byteLength > 2000);
  assert.match(raw, new RegExp(hex("COTIZACIÓN"), "i"));
  for (const forbidden of ["COSTO INTERNO", "UTILIDAD", "MARGEN", "COSTO DIRECTO"]) assert.doesNotMatch(raw, new RegExp(hex(forbidden), "i"));
});

test("creates an operational work-order PDF linked to the approved quote", async () => {
  const { buildWorkOrderPdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const bytes = buildWorkOrderPdf({
    company, quote, items,
    order: { number: "SIS-OT-2026-001", createdDate: "2026-08-27", clientName: quote.clientName, project: quote.project, status: "Planificada", responsible: "Jefe de taller", priority: "Alta", dueDate: "2026-09-14", plannedStart: "2026-09-01", plannedEnd: "2026-09-15", notes: "Coordinar ingreso a planta.", currency: "CLP", approvedSale: quote.netSubtotal },
    execution: {
      activities: [{ title: "Verificar bloqueo", required: true, completed: true }],
      entries: [{ type: "hours", description: "Montaje", quantity: 4, unit: "h", entryDate: "2026-09-02" }],
      evidence: [{ caption: "Prueba final", createdAt: "2026-09-02T18:00:00Z" }],
      signoff: { customerName: "Ana Pérez", customerRole: "Supervisora", signedAt: "2026-09-02T18:10:00Z", notes: "Conforme" },
      materialRequests: [{ status: "Entregada", urgency: "Alta", neededDate: "2026-09-02", activityTitle: "Montaje de canalización", requestedBy: "Técnico SOLIS", items: [{ description: "Terminal tubular", quantity: 12, unit: "un" }] }],
    },
  });
  const raw = Buffer.from(bytes).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(bytes.byteLength > 1800);
  assert.match(raw, new RegExp(hex("ORDEN DE TRABAJO"), "i"));
  assert.match(raw, new RegExp(hex("ALCANCE APROBADO"), "i"));
  assert.match(raw, new RegExp(hex("COMPROMISO"), "i"));
  assert.match(raw, new RegExp(hex("INFORME DE EJECUCIÓN"), "i"));
  assert.match(raw, new RegExp(hex("CONFORMIDAD OPERATIVA"), "i"));
  assert.match(raw, new RegExp(hex("SOLICITUDES DE MATERIALES"), "i"));
  assert.doesNotMatch(raw, new RegExp(hex("VENTA APROBADA"), "i"));
});

test("creates an internal purchase-order PDF with approval and totals", async () => {
  const { buildPurchaseOrderPdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const bytes = buildPurchaseOrderPdf({
    company,
    supplier: { code: "PRV-001", name: "Proveedor Industrial SpA", taxId: "76.111.222-3", contactName: "Compras", email: "compras@proveedor.cl", phone: "+56 2 2000 0000", address: "Santiago", paymentTerms: "30 días", currency: "CLP" },
    purchase: { number: "OC-2026-00001", status: "Aprobada", currency: "CLP", supplier: "Proveedor Industrial SpA", notes: "Despachar a bodega central", createdAt: "2026-08-30T10:00:00Z", subtotal: "100000", discountAmount: "0", discountPercent: "0", netSubtotal: "100000", taxAmount: "19000", taxPercent: "19", total: "119000", approvedBy: "Administrador SOLIS", approvedAt: "2026-08-30T11:00:00Z", approvalNotes: "Presupuesto autorizado", orderedBy: "", orderedAt: "", workOrderNumber: "OT-2026-001", project: "Tablero MCC" },
    items: [{ description: "Guardamotor 10 A", quantity: "2", unit: "un", unitCost: "50000", lineTotal: "100000", receivedQuantity: "0" }],
  });
  const raw = Buffer.from(bytes).toString("latin1");
  assert.ok(raw.startsWith("%PDF-1.7"));
  assert.ok(bytes.byteLength > 1800);
  assert.match(raw, new RegExp(hex("ORDEN DE COMPRA"), "i"));
  assert.match(raw, new RegExp(hex("APROBACIÓN INTERNA"), "i"));
  assert.doesNotMatch(raw, new RegExp(hex("MARGEN"), "i"));
});
