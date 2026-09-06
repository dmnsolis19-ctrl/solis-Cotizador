import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("calculates checklist progress, hours, materials and real cost", async () => {
  const { executionMetrics, canCompleteExecution, pendingMaterialRequests } = await vite.ssrLoadModule("/lib/order-execution.ts");
  const activities = [
    { publicId: "a1", position: 0, title: "Bloqueo", required: true, completed: true, notes: "", completedAt: "", completedBy: "" },
    { publicId: "a2", position: 1, title: "Prueba", required: true, completed: false, notes: "", completedAt: "", completedBy: "" },
    { publicId: "a3", position: 2, title: "Fotografía", required: false, completed: false, notes: "", completedAt: "", completedBy: "" },
  ];
  const entries = [
    { publicId: "e1", entryType: "hours", description: "Montaje", quantity: 4.5, unit: "h", unitCost: 10000, total: 45000, entryDate: "2026-08-29", recordedBy: "Técnico" },
    { publicId: "e2", entryType: "material", description: "Terminal", quantity: 12, unit: "un", unitCost: 500, total: 6000, entryDate: "2026-08-29", recordedBy: "Técnico" },
  ];
  assert.deepEqual(executionMetrics(activities, entries), { progressPercent: 50, requiredActivities: 2, completedRequired: 1, hours: 4.5, materialEntries: 1, realCost: 51000 });
  assert.equal(canCompleteExecution(activities), false);
  assert.equal(canCompleteExecution(activities.map((item) => ({ ...item, completed: true }))), true);
  assert.equal(pendingMaterialRequests([{ status: "Pendiente" }, { status: "Aprobada" }, { status: "Pendiente" }]), 3);
});

test("protects field evidence and sign-offs behind order assignment", async () => {
  for (const route of ["order-execution", "order-evidence", "order-signoff", "material-requests", "field-templates"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /requirePermission\("orders\.execute"\)/);
    assert.match(source, /canAccessWorkOrder/);
  }
  const evidence = await readFile(new URL("../app/api/order-evidence/route.ts", import.meta.url), "utf8");
  assert.match(evidence, /8 \* 1024 \* 1024/);
  assert.match(evidence, /image\/jpeg/);
  const signoff = await readFile(new URL("../app/api/order-signoff/route.ts", import.meta.url), "utf8");
  assert.match(signoff, /data:image\/png;base64/);
  assert.match(signoff, /WORK_ORDER_SIGNED_OFF/);
});

test("keeps material requests linked to activities and separates approval", async () => {
  const source = await readFile(new URL("../app/api/material-requests/route.ts", import.meta.url), "utf8");
  assert.match(source, /activityPublicId/);
  assert.match(source, /materials\.approve/);
  assert.match(source, /MATERIAL_REQUEST_CREATED/);
  assert.match(source, /MATERIAL_REQUEST_REVIEWED/);
  const templates = await readFile(new URL("../app/api/field-templates/route.ts", import.meta.url), "utf8");
  assert.match(templates, /FIELD_TEMPLATE_APPLIED/);
  assert.match(templates, /template_public_id/);
  const orders = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  assert.match(orders, /solicitudes de material abiertas/);
});
