import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(() => vite.close());
const materials = await vite.ssrLoadModule("/lib/material-groups.ts");
const pricing = await vite.ssrLoadModule("/lib/pricing.ts");
const economic = { overheadPercent: 10, contingencyPercent: 5, targetMarginPercent: 25, discountPercent: 0, taxPercent: 19, roundingMultiple: 0 };
function group() { const value = materials.emptyMaterialGroup(); value.pricingMode = "manual"; value.salePrice = 100000; value.materials = [ { ...materials.emptyMaterial(), description: "Cable", quantity: 40, unit: "m", unitCost: 1000, priceStatus: "confirmed" }, { ...materials.emptyMaterial(), description: "Canalización", quantity: 6, unitCost: 2000, priceStatus: "confirmed" }, { ...materials.emptyMaterial(), description: "Protecciones", quantity: 3, unitCost: 6000, priceStatus: "confirmed" } ]; return value; }

test("sums internal materials into exactly one commercial global without double counting", () => {
  const list = group();
  const lines = materials.composeQuoteLines([{ name: "Mano de obra", quantity: 1, unit: "gl", unitCost: 30000, unitPrice: 50000 }], [list], economic);
  assert.equal(lines.length, 2);
  assert.deepEqual(lines[1], { name: list.customerTitle, detail: "", quantity: 1, unit: "gl", unitCost: 70000, unitPrice: 100000 });
  const result = pricing.calculateQuote(lines, economic);
  assert.equal(result.directCost, 100000);
  assert.equal(result.grossSubtotal, 150000);
  assert.equal(result.total, 178500);
});

test("distinguishes markup from margin and accounts for indirect costs and discount", () => {
  const list = group(); list.pricingMode = "markup"; list.pricingPercent = 25;
  assert.equal(materials.materialGroupPrice(list, economic), 87500);
  list.pricingMode = "margin";
  const settings = { ...economic, discountPercent: 10 };
  const result = pricing.calculateQuote(materials.composeQuoteLines([], [list], settings), settings);
  assert.equal(result.marginPercent, 25);
  assert.throws(() => materials.materialGroupPrice(list, { ...settings, discountPercent: 100 }), /100%/);
});

test("updates quantities, keeps manual prices and handles decimal quantities", () => {
  const list = group(); list.materials[0].quantity = 41.125;
  assert.equal(materials.materialGroupCost(list), 71125);
  assert.equal(materials.materialGroupPrice(list), 100000);
  assert.equal(materials.materialGroupsSchema.safeParse([list]).success, true);
  list.materials[0].quantity = -1;
  assert.equal(materials.materialGroupsSchema.safeParse([list]).success, false);
});

test("rejects duplicate identities, empty lists, excessive amounts and non-finite values", () => {
  const list = group();
  assert.equal(materials.materialGroupsSchema.safeParse([list, list]).success, false);
  assert.equal(materials.materialGroupsSchema.safeParse([{ ...list, materials: [] }]).success, false);
  assert.throws(() => materials.composeQuoteLines([], [], economic), /partidas/);
  list.materials[0].unitCost = Infinity;
  assert.equal(materials.materialGroupsSchema.safeParse([list]).success, false);
  assert.throws(() => materials.composeQuoteLines([], [list], economic), /monetario/);
});

test("consolidates only identical technical materials and omits confidential properties", () => {
  const a = group(); const b = group(); b.title = "Segunda lista";
  b.materials[0].specification = "Sección diferente";
  const rows = materials.supplierMaterials([a, b], true);
  assert.equal(rows.length, 4);
  assert.equal(rows.find((item) => item.description === "Protecciones").quantity, 6);
  assert.ok(rows.every((item) => !('unitCost' in item) && !('supplier' in item) && !('salePrice' in item)));
  assert.equal(materials.supplierMaterials([a, b], false).length, 6);
});

test("exports Unicode CSV with blank supplier price fields and prevents formula execution", () => {
  const list = group(); list.materials[0].description = '=HYPERLINK("evil")'; list.materials[0].unitCost = 987654321;
  const csv = materials.supplierCsv(materials.supplierMaterials([list]));
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes("' =") === false);
  assert.ok(csv.includes("'=HYPERLINK"));
  assert.ok(csv.includes('"Precio unitario proveedor"'));
  assert.ok(!csv.includes("987654321"));
});

test("supplier PDF paginates and includes full technical specifications without costs", async () => {
  const { buildSupplierInquiryPdf } = await vite.ssrLoadModule("/lib/pdf-documents.ts");
  const list = group(); list.materials = Array.from({ length: 50 }, (_, index) => ({ ...list.materials[0], id: crypto.randomUUID(), description: `Material ${index + 1}`, specification: "Especificación completa de proveedor. ".repeat(12) + "FIN ESPECIFICACION", unitCost: 987654321 }));
  const pdf = Buffer.from(buildSupplierInquiryPdf({ company: {}, number: "SC-001", project: "Proyecto solar", issueDate: "2026-10-20", rows: materials.supplierMaterials([list]) })).toString("latin1");
  assert.ok((pdf.match(/\/Type \/Page /g) || []).length > 2);
  const text = [...pdf.matchAll(/<([0-9A-F]+)> Tj/g)].map((match) => Buffer.from(match[1], "hex").toString("latin1")).join(" ");
  assert.match(text, /FIN ESPECIFICACION/);
  assert.ok(!pdf.includes(Buffer.from("987654321").toString("hex").toUpperCase()));
  assert.ok(pdf.includes(Buffer.from("Material 50").toString("hex").toUpperCase()));
});

test("sharing validates recipients and encodes special characters without exposing private URLs", async () => {
  const { whatsappUrl, mailtoUrl } = await vite.ssrLoadModule("/lib/sharing.ts");
  assert.equal(new URL(whatsappUrl("+56 9 1234 5678", "Cotización & revisión")).searchParams.get("text"), "Cotización & revisión");
  assert.throws(() => whatsappUrl("https://evil.test", "Hola"));
  assert.throws(() => mailtoUrl("a@b.cl\r\nbcc:evil@a.cl", "Asunto", "Mensaje"));
  assert.ok(mailtoUrl("a@b.cl", "A&B", "Hola").includes("subject=A%26B"));
});
