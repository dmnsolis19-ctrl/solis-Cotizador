import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { createServer } from "vite";

const root = new URL("..", import.meta.url).pathname;
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true } });
after(async () => { await vite.close(); });

test("enforces the intended permission matrix for the four roles", async () => {
  const { permissionsForRole, roleHasPermission } = await vite.ssrLoadModule("/lib/permissions.ts");
  assert.equal(roleHasPermission("administrator", "users.manage"), true);
  assert.equal(roleHasPermission("estimator", "quotes.write"), true);
  assert.equal(roleHasPermission("estimator", "quotes.approve"), false);
  assert.equal(roleHasPermission("supervisor", "quotes.approve"), true);
  assert.equal(roleHasPermission("supervisor", "audit.read"), true);
  assert.equal(roleHasPermission("supervisor", "orders.assign"), true);
  assert.equal(roleHasPermission("supervisor", "field_templates.manage"), true);
  assert.equal(roleHasPermission("supervisor", "materials.approve"), true);
  assert.equal(roleHasPermission("supervisor", "inventory.manage"), true);
  assert.equal(roleHasPermission("supervisor", "purchases.manage"), true);
  assert.equal(roleHasPermission("supervisor", "purchases.approve"), false);
  assert.equal(roleHasPermission("supervisor", "documents.purchase"), true);
  assert.equal(roleHasPermission("technician", "orders.write"), true);
  assert.equal(roleHasPermission("technician", "orders.execute"), true);
  assert.equal(roleHasPermission("technician", "orders.assign"), false);
  assert.equal(roleHasPermission("technician", "materials.approve"), false);
  assert.equal(roleHasPermission("technician", "inventory.read"), true);
  assert.equal(roleHasPermission("technician", "inventory.manage"), false);
  assert.equal(roleHasPermission("technician", "documents.purchase"), false);
  assert.equal(roleHasPermission("technician", "notifications.read"), true);
  assert.equal(roleHasPermission("technician", "catalog.read"), false);
  assert.equal(roleHasPermission("technician", "quotes.read"), false);
  assert.deepEqual(permissionsForRole("technician"), ["dashboard.view", "orders.read", "orders.write", "orders.execute", "inventory.read", "documents.order", "notifications.read"]);
});

test("requires authenticated roles and audits every mutable business endpoint", async () => {
  const auth = await readFile(new URL("../lib/auth.ts", import.meta.url), "utf8");
  assert.doesNotMatch(auth, /owner@solis\.local/);
  assert.match(auth, /solis_session/);
  assert.match(auth, /authSessions/);
  assert.match(auth, /AuthorizationError/);

  for (const route of ["clients", "catalog", "quotes", "orders", "quote-flow", "documents", "import", "order-execution", "order-evidence", "order-signoff", "field-templates", "material-requests", "inventory"]) {
    const source = await readFile(new URL(`../app/api/${route}/route.ts`, import.meta.url), "utf8");
    assert.match(source, /requirePermission\(/, `${route} must enforce a server permission`);
    assert.match(source, /writeAuditEvent\(/, `${route} must create an audit event`);
  }
  const dashboard = await readFile(new URL("../app/api/dashboard/route.ts", import.meta.url), "utf8");
  const download = await readFile(new URL("../app/api/documents/[publicId]/route.ts", import.meta.url), "utf8");
  assert.match(dashboard, /approvedSale:\s*"0",\s*payloadJson:\s*"\{\}"/);
  assert.match(download, /securityProfile !== "operational_v2"/);
  assert.match(dashboard, /assignedUserPublicId/);
  assert.match(download, /canAccessWorkOrder/);
});

test("protects assignment and writes a notification for the selected technician", async () => {
  const orders = await readFile(new URL("../app/api/orders/route.ts", import.meta.url), "utf8");
  const notifications = await readFile(new URL("../app/api/notifications/route.ts", import.meta.url), "utf8");
  assert.match(orders, /session\.permissions\.includes\("orders\.assign"\)/);
  assert.match(orders, /WORK_ORDER_ASSIGNED/);
  assert.match(orders, /userNotifications/);
  assert.match(notifications, /recipientUserPublicId, session\.user\.publicId/);
});
