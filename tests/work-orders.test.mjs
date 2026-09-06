import assert from "node:assert/strict";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("restricts technicians to their assigned work orders", async () => {
  const { canAccessWorkOrder } = await vite.ssrLoadModule("/lib/work-orders.ts");
  const user = { publicId: "user-tech-1", email: "tecnico@solis.cl" };
  assert.equal(canAccessWorkOrder("technician", user, { assignedUserPublicId: "user-tech-1", assignedUserEmail: "tecnico@solis.cl" }), true);
  assert.equal(canAccessWorkOrder("technician", user, { assignedUserPublicId: "user-tech-2", assignedUserEmail: "otro@solis.cl" }), false);
  assert.equal(canAccessWorkOrder("technician", user, { assignedUserPublicId: "", assignedUserEmail: "" }), false);
  assert.equal(canAccessWorkOrder("supervisor", user, { assignedUserPublicId: "", assignedUserEmail: "" }), true);
});

test("classifies overdue and near-due work without closing completed orders", async () => {
  const { isOrderDueSoon, isOrderOverdue } = await vite.ssrLoadModule("/lib/work-orders.ts");
  assert.equal(isOrderOverdue("2026-08-28", "En ejecución", "2026-08-29"), true);
  assert.equal(isOrderOverdue("2026-08-28", "Completada", "2026-08-29"), false);
  assert.equal(isOrderDueSoon("2026-09-01", "Planificada", "2026-08-29", 3), true);
  assert.equal(isOrderDueSoon("2026-09-05", "Planificada", "2026-08-29", 3), false);
});
