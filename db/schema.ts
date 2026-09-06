import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const appSettings = sqliteTable("app_settings", {
  ownerEmail: text("owner_email").primaryKey(),
  companyJson: text("company_json").notNull().default("{}"),
  economicSettingsJson: text("economic_settings_json").notNull().default("{}"),
  sourceSchemaVersion: integer("source_schema_version").notNull().default(0),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const appUsers = sqliteTable("app_users", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  email: text("email").notNull(),
  name: text("name").notNull().default(""),
  role: text("role").notNull().default("technician"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("app_users_owner_email_uidx").on(table.ownerEmail, table.email),
  index("app_users_owner_role_idx").on(table.ownerEmail, table.role, table.active),
]);

export const authCredentials = sqliteTable("auth_credentials", {
  userPublicId: text("user_public_id").primaryKey(),
  passwordHash: text("password_hash").notNull(),
  passwordSalt: text("password_salt").notNull(),
  iterations: integer("iterations").notNull().default(210000),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const authSessions = sqliteTable("auth_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  userPublicId: text("user_public_id").notNull(),
  expiresAt: text("expires_at").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("auth_sessions_user_idx").on(table.userPublicId),
  index("auth_sessions_expiry_idx").on(table.expiresAt),
]);

export const authAttempts = sqliteTable("auth_attempts", {
  email: text("email").primaryKey(),
  failures: integer("failures").notNull().default(0),
  blockedUntil: text("blocked_until").notNull().default(""),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const auditEvents = sqliteTable("audit_events", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  actorEmail: text("actor_email").notNull(),
  actorName: text("actor_name").notNull().default(""),
  actorRole: text("actor_role").notNull(),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityPublicId: text("entity_public_id").notNull().default(""),
  detailJson: text("detail_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_events_owner_date_idx").on(table.ownerEmail, table.createdAt)]);

export const clients = sqliteTable("clients", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  payloadJson: text("payload_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("clients_owner_idx").on(table.ownerEmail, table.name)]);

export const catalogItems = sqliteTable("catalog_items", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  code: text("code").notNull(),
  type: text("type").notNull().default("Material"),
  category: text("category").notNull().default("General"),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  unit: text("unit").notNull().default("un"),
  unitCost: text("unit_cost").notNull().default("0"),
  unitPrice: text("unit_price").notNull().default("0"),
  currency: text("currency").notNull().default("CLP"),
  supplier: text("supplier").notNull().default(""),
  reference: text("reference").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  payloadJson: text("payload_json").notNull().default("{}"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("catalog_owner_code_uidx").on(table.ownerEmail, table.code),
  index("catalog_owner_type_idx").on(table.ownerEmail, table.type),
]);

export const quoteTemplates = sqliteTable("quote_templates", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  payloadJson: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("templates_owner_idx").on(table.ownerEmail, table.name)]);

export const quotes = sqliteTable("quotes", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  number: text("number").notNull(),
  rootPublicId: text("root_public_id").notNull(),
  parentPublicId: text("parent_public_id").notNull().default(""),
  revision: integer("revision").notNull().default(0),
  clientPublicId: text("client_public_id").notNull().default(""),
  clientName: text("client_name").notNull(),
  project: text("project").notNull(),
  issueDate: text("issue_date").notNull(),
  status: text("status").notNull().default("Borrador"),
  currency: text("currency").notNull().default("CLP"),
  locked: integer("locked", { mode: "boolean" }).notNull().default(false),
  lockedAt: text("locked_at").notNull().default(""),
  approvedAt: text("approved_at").notNull().default(""),
  approvedBy: text("approved_by").notNull().default(""),
  approvalNotes: text("approval_notes").notNull().default(""),
  grossSubtotal: text("gross_subtotal").notNull().default("0"),
  netSubtotal: text("net_subtotal").notNull().default("0"),
  tax: text("tax").notNull().default("0"),
  total: text("total").notNull().default("0"),
  directCost: text("direct_cost").notNull().default("0"),
  internalCost: text("internal_cost").notNull().default("0"),
  estimatedProfit: text("estimated_profit").notNull().default("0"),
  marginPercent: text("margin_percent").notNull().default("0"),
  payloadJson: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("quotes_owner_number_uidx").on(table.ownerEmail, table.number),
  index("quotes_owner_date_idx").on(table.ownerEmail, table.issueDate),
]);

export const quoteEvents = sqliteTable("quote_events", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  quotePublicId: text("quote_public_id").notNull(),
  eventType: text("event_type").notNull(),
  actor: text("actor").notNull().default(""),
  detail: text("detail").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("quote_events_quote_idx").on(table.ownerEmail, table.quotePublicId, table.createdAt)]);

export const quoteItems = sqliteTable("quote_items", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  quotePublicId: text("quote_public_id").notNull(),
  position: integer("position").notNull(),
  name: text("name").notNull(),
  detail: text("detail").notNull().default(""),
  quantity: text("quantity").notNull().default("1"),
  unit: text("unit").notNull().default("un"),
  unitCost: text("unit_cost").notNull().default("0"),
  unitPrice: text("unit_price").notNull().default("0"),
}, (table) => [index("quote_items_quote_idx").on(table.ownerEmail, table.quotePublicId, table.position)]);

export const workOrders = sqliteTable("work_orders", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  number: text("number").notNull(),
  quotePublicId: text("quote_public_id").notNull(),
  clientName: text("client_name").notNull(),
  project: text("project").notNull(),
  status: text("status").notNull(),
  responsible: text("responsible").notNull().default(""),
  assignedUserPublicId: text("assigned_user_public_id").notNull().default(""),
  assignedUserEmail: text("assigned_user_email").notNull().default(""),
  priority: text("priority").notNull().default("Normal"),
  dueDate: text("due_date").notNull().default(""),
  assignmentUpdatedAt: text("assignment_updated_at").notNull().default(""),
  createdDate: text("created_date").notNull().default(""),
  currency: text("currency").notNull().default("CLP"),
  approvedSale: text("approved_sale").notNull().default("0"),
  plannedStart: text("planned_start").notNull().default(""),
  plannedEnd: text("planned_end").notNull().default(""),
  notes: text("notes").notNull().default(""),
  closedAt: text("closed_at").notNull().default(""),
  closedBy: text("closed_by").notNull().default(""),
  closureNotes: text("closure_notes").notNull().default(""),
  budgetedCost: text("budgeted_cost").notNull().default("0"),
  actualCost: text("actual_cost").notNull().default("0"),
  actualProfit: text("actual_profit").notNull().default("0"),
  actualMarginPercent: text("actual_margin_percent").notNull().default("0"),
  closureSnapshotJson: text("closure_snapshot_json").notNull().default("{}"),
  payloadJson: text("payload_json").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("work_orders_owner_number_uidx").on(table.ownerEmail, table.number),
  index("work_orders_owner_assignee_idx").on(table.ownerEmail, table.assignedUserPublicId, table.status),
]);

export const billingDocuments = sqliteTable("billing_documents", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  number: text("number").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  quotePublicId: text("quote_public_id").notNull(),
  clientName: text("client_name").notNull(),
  project: text("project").notNull(),
  concept: text("concept").notNull().default("Anticipo"),
  status: text("status").notNull().default("Borrador"),
  currency: text("currency").notNull().default("CLP"),
  issueDate: text("issue_date").notNull().default(""),
  dueDate: text("due_date").notNull().default(""),
  netAmount: text("net_amount").notNull().default("0"),
  taxPercent: text("tax_percent").notNull().default("19"),
  taxAmount: text("tax_amount").notNull().default("0"),
  totalAmount: text("total_amount").notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull().default(""),
  issuedAt: text("issued_at").notNull().default(""),
  voidedAt: text("voided_at").notNull().default(""),
  voidedBy: text("voided_by").notNull().default(""),
  voidReason: text("void_reason").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("billing_owner_number_uidx").on(table.ownerEmail, table.number),
  index("billing_owner_order_status_idx").on(table.ownerEmail, table.workOrderPublicId, table.status),
  index("billing_owner_due_idx").on(table.ownerEmail, table.dueDate, table.status),
]);

export const billingPayments = sqliteTable("billing_payments", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  billingDocumentPublicId: text("billing_document_public_id").notNull(),
  paymentDate: text("payment_date").notNull(),
  amount: text("amount").notNull().default("0"),
  method: text("method").notNull().default("Transferencia"),
  reference: text("reference").notNull().default(""),
  notes: text("notes").notNull().default(""),
  recordedBy: text("recorded_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("billing_payments_document_idx").on(table.ownerEmail, table.billingDocumentPublicId, table.paymentDate)]);

export const userNotifications = sqliteTable("user_notifications", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  recipientUserPublicId: text("recipient_user_public_id").notNull(),
  recipientEmail: text("recipient_email").notNull(),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull().default(""),
  entityType: text("entity_type").notNull().default(""),
  entityPublicId: text("entity_public_id").notNull().default(""),
  readAt: text("read_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("notifications_recipient_idx").on(table.ownerEmail, table.recipientUserPublicId, table.createdAt),
  index("notifications_unread_idx").on(table.ownerEmail, table.recipientUserPublicId, table.readAt),
]);

export const workOrderActivities = sqliteTable("work_order_activities", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  position: integer("position").notNull().default(0),
  payloadJson: text("payload_json").notNull(),
}, (table) => [index("activities_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.position)]);

export const workOrderCosts = sqliteTable("work_order_costs", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  entryDate: text("entry_date").notNull().default(""),
  payloadJson: text("payload_json").notNull(),
}, (table) => [index("costs_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.entryDate)]);

export const workOrderEvidence = sqliteTable("work_order_evidence", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull(),
  byteSize: integer("byte_size").notNull().default(0),
  caption: text("caption").notNull().default(""),
  createdByUserPublicId: text("created_by_user_public_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("evidence_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.createdAt)]);

export const workOrderSignoffs = sqliteTable("work_order_signoffs", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  customerName: text("customer_name").notNull(),
  customerRole: text("customer_role").notNull().default(""),
  notes: text("notes").notNull().default(""),
  storageKey: text("storage_key").notNull(),
  signedAt: text("signed_at").notNull(),
  createdByUserPublicId: text("created_by_user_public_id").notNull(),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("signoffs_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.signedAt)]);

export const fieldWorkTemplates = sqliteTable("field_work_templates", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull().default("General"),
  description: text("description").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("field_templates_owner_name_uidx").on(table.ownerEmail, table.name),
  index("field_templates_owner_category_idx").on(table.ownerEmail, table.category, table.active),
]);

export const fieldWorkTemplateActivities = sqliteTable("field_work_template_activities", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  templatePublicId: text("template_public_id").notNull(),
  position: integer("position").notNull().default(0),
  title: text("title").notNull(),
  required: integer("required", { mode: "boolean" }).notNull().default(true),
  defaultNotes: text("default_notes").notNull().default(""),
}, (table) => [index("field_template_activities_idx").on(table.ownerEmail, table.templatePublicId, table.position)]);

export const materialRequests = sqliteTable("material_requests", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  activityPublicId: text("activity_public_id").notNull(),
  status: text("status").notNull().default("Pendiente"),
  urgency: text("urgency").notNull().default("Normal"),
  neededDate: text("needed_date").notNull().default(""),
  justification: text("justification").notNull().default(""),
  requestedByUserPublicId: text("requested_by_user_public_id").notNull(),
  requestedBy: text("requested_by").notNull(),
  reviewedBy: text("reviewed_by").notNull().default(""),
  reviewedAt: text("reviewed_at").notNull().default(""),
  responseNotes: text("response_notes").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("material_requests_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.createdAt),
  index("material_requests_status_idx").on(table.ownerEmail, table.status, table.neededDate),
]);

export const materialRequestItems = sqliteTable("material_request_items", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  requestPublicId: text("request_public_id").notNull(),
  position: integer("position").notNull().default(0),
  catalogItemPublicId: text("catalog_item_public_id").notNull().default(""),
  code: text("code").notNull().default(""),
  description: text("description").notNull(),
  quantity: text("quantity").notNull().default("1"),
  unit: text("unit").notNull().default("un"),
}, (table) => [index("material_request_items_idx").on(table.ownerEmail, table.requestPublicId, table.position)]);

export const warehouses = sqliteTable("warehouses", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  location: text("location").notNull().default(""),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("warehouses_owner_code_uidx").on(table.ownerEmail, table.code),
  index("warehouses_owner_active_idx").on(table.ownerEmail, table.active),
]);

export const inventoryBalances = sqliteTable("inventory_balances", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  warehousePublicId: text("warehouse_public_id").notNull(),
  catalogItemPublicId: text("catalog_item_public_id").notNull(),
  itemCode: text("item_code").notNull().default(""),
  itemName: text("item_name").notNull(),
  unit: text("unit").notNull().default("un"),
  quantity: text("quantity").notNull().default("0"),
  reservedQuantity: text("reserved_quantity").notNull().default("0"),
  minimumQuantity: text("minimum_quantity").notNull().default("0"),
  averageUnitCost: text("average_unit_cost").notNull().default("0"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("inventory_balance_item_uidx").on(table.ownerEmail, table.warehousePublicId, table.catalogItemPublicId),
  index("inventory_balance_owner_item_idx").on(table.ownerEmail, table.catalogItemPublicId),
]);

export const inventoryMovements = sqliteTable("inventory_movements", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  warehousePublicId: text("warehouse_public_id").notNull(),
  catalogItemPublicId: text("catalog_item_public_id").notNull(),
  movementType: text("movement_type").notNull(),
  quantity: text("quantity").notNull(),
  stockBefore: text("stock_before").notNull(),
  stockAfter: text("stock_after").notNull(),
  reservedBefore: text("reserved_before").notNull().default("0"),
  reservedAfter: text("reserved_after").notNull().default("0"),
  workOrderPublicId: text("work_order_public_id").notNull().default(""),
  activityPublicId: text("activity_public_id").notNull().default(""),
  materialRequestPublicId: text("material_request_public_id").notNull().default(""),
  reference: text("reference").notNull().default(""),
  reason: text("reason").notNull().default(""),
  actor: text("actor").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  index("inventory_movements_item_idx").on(table.ownerEmail, table.warehousePublicId, table.catalogItemPublicId, table.createdAt),
  index("inventory_movements_order_idx").on(table.ownerEmail, table.workOrderPublicId, table.createdAt),
]);

export const materialAllocations = sqliteTable("material_allocations", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  materialRequestPublicId: text("material_request_public_id").notNull(),
  materialRequestItemPublicId: text("material_request_item_public_id").notNull(),
  warehousePublicId: text("warehouse_public_id").notNull(),
  catalogItemPublicId: text("catalog_item_public_id").notNull(),
  requestedQuantity: text("requested_quantity").notNull(),
  reservedQuantity: text("reserved_quantity").notNull().default("0"),
  issuedQuantity: text("issued_quantity").notNull().default("0"),
  returnedQuantity: text("returned_quantity").notNull().default("0"),
  issueUnitCost: text("issue_unit_cost").notNull().default("0"),
  status: text("status").notNull().default("Reservada"),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("material_allocation_item_uidx").on(table.ownerEmail, table.materialRequestItemPublicId),
  index("material_allocations_request_idx").on(table.ownerEmail, table.materialRequestPublicId),
]);

export const suppliers = sqliteTable("suppliers", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  code: text("code").notNull(),
  name: text("name").notNull(),
  taxId: text("tax_id").notNull().default(""),
  contactName: text("contact_name").notNull().default(""),
  email: text("email").notNull().default(""),
  phone: text("phone").notNull().default(""),
  address: text("address").notNull().default(""),
  paymentTerms: text("payment_terms").notNull().default(""),
  currency: text("currency").notNull().default("CLP"),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("suppliers_owner_code_uidx").on(table.ownerEmail, table.code),
  index("suppliers_owner_name_idx").on(table.ownerEmail, table.name, table.active),
]);

export const purchaseRequests = sqliteTable("purchase_requests", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  number: text("number").notNull(),
  materialRequestPublicId: text("material_request_public_id").notNull(),
  workOrderPublicId: text("work_order_public_id").notNull(),
  warehousePublicId: text("warehouse_public_id").notNull(),
  status: text("status").notNull().default("Solicitada"),
  supplierPublicId: text("supplier_public_id"),
  supplier: text("supplier").notNull().default(""),
  currency: text("currency").notNull().default("CLP"),
  discountPercent: text("discount_percent").notNull().default("0"),
  taxPercent: text("tax_percent").notNull().default("19"),
  subtotal: text("subtotal").notNull().default("0"),
  discountAmount: text("discount_amount").notNull().default("0"),
  netSubtotal: text("net_subtotal").notNull().default("0"),
  taxAmount: text("tax_amount").notNull().default("0"),
  total: text("total").notNull().default("0"),
  notes: text("notes").notNull().default(""),
  createdBy: text("created_by").notNull(),
  approvedBy: text("approved_by").notNull().default(""),
  approvedAt: text("approved_at").notNull().default(""),
  approvalNotes: text("approval_notes").notNull().default(""),
  orderedBy: text("ordered_by").notNull().default(""),
  orderedAt: text("ordered_at").notNull().default(""),
  receivedAt: text("received_at").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("purchase_requests_owner_number_uidx").on(table.ownerEmail, table.number),
  index("purchase_requests_status_idx").on(table.ownerEmail, table.status, table.createdAt),
]);

export const purchaseRequestItems = sqliteTable("purchase_request_items", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  purchaseRequestPublicId: text("purchase_request_public_id").notNull(),
  materialRequestItemPublicId: text("material_request_item_public_id").notNull(),
  catalogItemPublicId: text("catalog_item_public_id").notNull().default(""),
  description: text("description").notNull(),
  quantity: text("quantity").notNull(),
  unit: text("unit").notNull().default("un"),
  unitCost: text("unit_cost").notNull().default("0"),
  lineTotal: text("line_total").notNull().default("0"),
  receivedQuantity: text("received_quantity").notNull().default("0"),
}, (table) => [index("purchase_request_items_idx").on(table.ownerEmail, table.purchaseRequestPublicId)]);

export const documentSnapshots = sqliteTable("document_snapshots", {
  publicId: text("public_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  entityType: text("entity_type").notNull(),
  entityPublicId: text("entity_public_id").notNull(),
  documentNumber: text("document_number").notNull(),
  revision: integer("revision").notNull().default(0),
  version: integer("version").notNull().default(1),
  storageKey: text("storage_key").notNull(),
  fileName: text("file_name").notNull(),
  contentType: text("content_type").notNull().default("application/pdf"),
  byteSize: integer("byte_size").notNull().default(0),
  sha256: text("sha256").notNull().default(""),
  securityProfile: text("security_profile").notNull().default("legacy"),
  createdBy: text("created_by").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("documents_owner_entity_version_uidx").on(table.ownerEmail, table.entityType, table.entityPublicId, table.version),
  index("documents_owner_entity_idx").on(table.ownerEmail, table.entityType, table.entityPublicId, table.createdAt),
]);

export const syncReceipts = sqliteTable("sync_receipts", {
  operationId: text("operation_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  operationType: text("operation_type").notNull(),
  payloadHash: text("payload_hash").notNull(),
  resultJson: text("result_json").notNull().default("{}"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("sync_receipts_owner_idx").on(table.ownerEmail, table.createdAt)]);

export const importHistory = sqliteTable("import_history", {
  exportId: text("export_id").primaryKey(),
  ownerEmail: text("owner_email").notNull(),
  contract: text("contract").notNull(),
  schemaVersion: integer("schema_version").notNull(),
  exportedAt: text("exported_at").notNull().default(""),
  importedAt: text("imported_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  summaryJson: text("summary_json").notNull().default("{}"),
});
