export const ROLES = ["administrator", "estimator", "supervisor", "technician"] as const;
export type AppRole = (typeof ROLES)[number];

export const PERMISSIONS = [
  "dashboard.view",
  "clients.read", "clients.write",
  "catalog.read", "catalog.write",
  "quotes.read", "quotes.write", "quotes.flow", "quotes.approve",
  "orders.read", "orders.write", "orders.assign", "orders.execute", "orders.profitability", "orders.close",
  "field_templates.manage", "materials.approve",
  "inventory.read", "inventory.manage", "purchases.manage", "purchases.approve",
  "billing.read", "billing.manage", "billing.payments",
  "documents.quote", "documents.order", "documents.purchase", "documents.closure", "documents.collection",
  "notifications.read", "imports.execute", "users.manage", "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export const ROLE_LABELS: Record<AppRole, string> = {
  administrator: "Administrador",
  estimator: "Cotizador",
  supervisor: "Supervisor",
  technician: "Técnico",
};

const ROLE_PERMISSIONS: Record<AppRole, readonly Permission[]> = {
  administrator: PERMISSIONS,
  estimator: [
    "dashboard.view", "clients.read", "clients.write", "catalog.read", "catalog.write",
    "quotes.read", "quotes.write", "quotes.flow", "billing.read", "billing.manage", "billing.payments", "documents.quote", "documents.collection",
  ],
  supervisor: [
    "dashboard.view", "clients.read", "clients.write", "catalog.read", "catalog.write",
    "quotes.read", "quotes.write", "quotes.flow", "quotes.approve",
    "orders.read", "orders.write", "orders.assign", "orders.execute", "orders.profitability", "orders.close", "documents.quote", "documents.order", "documents.closure",
    "field_templates.manage", "materials.approve", "inventory.read", "inventory.manage", "purchases.manage", "billing.read", "billing.payments", "documents.purchase", "documents.collection", "notifications.read", "audit.read",
  ],
  technician: ["dashboard.view", "orders.read", "orders.write", "orders.execute", "inventory.read", "documents.order", "notifications.read"],
};

export function permissionsForRole(role: AppRole): Permission[] {
  return [...ROLE_PERMISSIONS[role]];
}

export function roleHasPermission(role: AppRole, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function isAppRole(value: unknown): value is AppRole {
  return typeof value === "string" && ROLES.includes(value as AppRole);
}
