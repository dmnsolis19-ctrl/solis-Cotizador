"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import Image from "next/image";
import {
  BarChart3,
  Bell,
  BellRing,
  BookOpen,
  BriefcaseBusiness,
  Camera,
  ChevronRight,
  CircleDollarSign,
  ClipboardCheck,
  Cloud,
  CloudOff,
  Download,
  FileCheck2,
  FileJson,
  FilePlus2,
  FileText,
  GitBranch,
  HardHat,
  ImageIcon,
  LibraryBig,
  ListChecks,
  Loader2,
  LockKeyhole,
  LogOut,
  Menu,
  PackagePlus,
  PackageCheck,
  Boxes,
  Warehouse,
  ShoppingCart,
  RotateCcw,
  AlertTriangle,
  PenLine,
  Plus,
  RefreshCw,
  ScrollText,
  Search,
  ShieldCheck,
  Smartphone,
  Stamp,
  UserCog,
  Users,
  Wrench,
  WifiOff,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Toaster } from "@/components/ui/sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  executeOrQueue,
  flushOfflineQueue,
  getQueueStatus,
  listOperations,
  migrateLegacyQuoteDraft,
  type QueueStatus,
  type StoredOperation,
} from "@/lib/offline-queue";
import { calculateQuote, type QuoteLine } from "@/lib/pricing";
import {
  EXECUTION_ENTRY_TYPES,
  executionMetrics,
  MATERIAL_URGENCIES,
  pendingMaterialRequests,
  type ExecutionActivity,
  type ExecutionEntry,
  type ExecutionEntryType,
  type MaterialRequest,
  type MaterialRequestStatus,
} from "@/lib/order-execution";
import { isOrderDueSoon, isOrderOverdue, ORDER_PRIORITIES } from "@/lib/work-orders";
import { availableStock, inventoryHealth } from "@/lib/inventory";
import { purchaseTotals } from "@/lib/procurement";
import {
  ROLE_LABELS,
  ROLES,
  type AppRole,
  type Permission,
} from "@/lib/permissions";

type Client = {
  publicId: string;
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
};
type CatalogItem = {
  publicId: string;
  code: string;
  type: string;
  category: string;
  name: string;
  description: string;
  unit: string;
  unitCost: string;
  unitPrice: string;
  currency: string;
  supplier: string;
};
type Quote = {
  publicId: string;
  number: string;
  rootPublicId: string;
  parentPublicId: string;
  clientName: string;
  project: string;
  issueDate: string;
  status: string;
  currency: string;
  total: string;
  netSubtotal: string;
  internalCost: string;
  estimatedProfit: string;
  marginPercent: string;
  revision: number;
  locked: boolean;
  lockedAt: string;
  approvedAt: string;
  approvedBy: string;
  approvalNotes: string;
};
type WorkOrder = {
  publicId: string;
  number: string;
  quotePublicId: string;
  clientName: string;
  project: string;
  status: string;
  responsible: string;
  assignedUserPublicId: string;
  assignedUserEmail: string;
  priority: "Baja" | "Normal" | "Alta" | "Urgente";
  dueDate: string;
  assignmentUpdatedAt: string;
  createdDate: string;
  currency: string;
  approvedSale: string;
  plannedStart: string;
  plannedEnd: string;
  notes: string;
  closedAt: string;
  closedBy: string;
  closureNotes: string;
  budgetedCost: string;
  actualCost: string;
  actualProfit: string;
  actualMarginPercent: string;
};
type UserNotification = {
  publicId: string;
  type: string;
  title: string;
  message: string;
  entityType: string;
  entityPublicId: string;
  readAt: string;
  createdAt: string;
};
type WorkEvidence = {
  publicId: string;
  fileName: string;
  contentType: string;
  byteSize: number;
  caption: string;
  createdBy: string;
  createdAt: string;
};
type WorkSignoff = {
  publicId: string;
  customerName: string;
  customerRole: string;
  notes: string;
  signedAt: string;
  createdBy: string;
};
type ExecutionData = {
  activities: ExecutionActivity[];
  entries: ExecutionEntry[];
  evidence: WorkEvidence[];
  signoffs: WorkSignoff[];
  materialRequests: MaterialRequest[];
  requestOptions: MaterialRequestOption[];
  metrics: {
    progressPercent: number;
    requiredActivities: number;
    completedRequired: number;
    hours: number;
    materialEntries: number;
    realCost: number;
  };
  showFinancials: boolean;
  canApproveMaterials: boolean;
  canManageTemplates: boolean;
};
type MaterialRequestOption = { publicId: string; code: string; name: string; unit: string; available: number };
type FieldTemplate = {
  publicId: string;
  name: string;
  category: string;
  description: string;
  activities: Array<{ publicId: string; title: string; required: boolean; defaultNotes: string }>;
};
type InventoryWarehouse = { publicId: string; code: string; name: string; location: string; active: boolean; isDefault: boolean };
type InventoryBalance = { publicId: string; warehousePublicId: string; catalogItemPublicId: string; itemCode: string; itemName: string; unit: string; quantity: number; reservedQuantity: number; minimumQuantity: number; averageUnitCost: number; inventoryValue: number; updatedAt: string };
type InventoryAllocation = { publicId: string; materialRequestPublicId: string; materialRequestItemPublicId: string; warehousePublicId: string; catalogItemPublicId: string; requestedQuantity: number; reservedQuantity: number; issuedQuantity: number; returnedQuantity: number; issueUnitCost: number; status: string };
type InventoryRequest = MaterialRequest & { workOrderPublicId: string; order?: { publicId: string; number: string; clientName: string; project: string }; allocations: InventoryAllocation[] };
type Supplier = { publicId: string; code: string; name: string; taxId: string; contactName: string; email: string; phone: string; address: string; paymentTerms: string; currency: string; active: boolean };
type PurchaseItem = { publicId: string; catalogItemPublicId: string; description: string; quantity: number; unit: string; unitCost: number; lineTotal: number; receivedQuantity: number };
type PurchaseRequest = { publicId: string; number: string; materialRequestPublicId: string; workOrderPublicId: string; warehousePublicId: string; status: string; supplierPublicId: string; supplier: string; currency: string; discountPercent: number; taxPercent: number; subtotal: number; discountAmount: number; netSubtotal: number; taxAmount: number; total: number; notes: string; approvedBy: string; approvedAt: string; orderedAt: string; createdAt: string; order?: { publicId: string; number: string; clientName: string; project: string }; items: PurchaseItem[] };
type InventoryMovement = { publicId: string; warehousePublicId: string; catalogItemPublicId: string; movementType: string; quantity: number; stockBefore: number; stockAfter: number; reservedBefore: number; reservedAfter: number; reference: string; reason: string; actor: string; createdAt: string };
type InventoryCatalogOption = { publicId: string; code: string; name: string; unit: string; type: string; unitCost: number };
type InventoryData = { warehouses: InventoryWarehouse[]; balances: InventoryBalance[]; movements: InventoryMovement[]; materialRequests: InventoryRequest[]; purchases: PurchaseRequest[]; suppliers: Supplier[]; catalogItems: InventoryCatalogOption[]; canManage: boolean; canManagePurchases: boolean; canApprovePurchases: boolean; canDocumentPurchases: boolean };
type BillingPayment = { publicId: string; paymentDate: string; amount: number; method: string; reference: string; notes: string; recordedBy: string; createdAt: string };
type BillingDocument = { publicId: string; number: string; workOrderPublicId: string; quotePublicId: string; clientName: string; project: string; concept: string; status: string; currency: string; issueDate: string; dueDate: string; netAmount: number; taxPercent: number; taxAmount: number; totalAmount: number; paidAmount: number; balance: number; notes: string; issuedAt: string; voidReason: string; payments: BillingPayment[] };
type BillingOrder = { publicId: string; number: string; quotePublicId: string; clientName: string; project: string; currency: string; approvedSale: number; committedNet: number; availableNet: number; status: string };
type BillingSummary = { billed: number; collected: number; receivable: number; overdue: number };
type BillingData = { documents: BillingDocument[]; orders: BillingOrder[]; summaryByCurrency: Record<string, BillingSummary>; canManage: boolean; canRecordPayments: boolean; canDocument: boolean; notice: string };
type QuoteEvent = {
  publicId: string;
  quotePublicId: string;
  eventType: string;
  actor: string;
  detail: string;
  createdAt: string;
};
type DocumentSnapshot = {
  publicId: string;
  entityType: "quote" | "work_order" | "purchase_order" | "closure_report" | "collection_document";
  entityPublicId: string;
  documentNumber: string;
  revision: number;
  version: number;
  fileName: string;
  byteSize: number;
  sha256: string;
  createdBy: string;
  createdAt: string;
};
type AppUser = {
  publicId: string;
  email: string;
  name: string;
  role: AppRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};
type AuditEvent = {
  publicId: string;
  actorEmail: string;
  actorName: string;
  actorRole: AppRole;
  action: string;
  entityType: string;
  entityPublicId: string;
  detailJson: string;
  createdAt: string;
};
type SessionInfo = {
  user: { publicId: string; email: string; name: string; role: AppRole };
  permissions: Permission[];
};
type DashboardData = {
  company: Record<string, unknown>;
  economicSettings: Record<string, unknown>;
  clients: Client[];
  catalogItems: CatalogItem[];
  quotes: Quote[];
  workOrders: WorkOrder[];
  quoteEvents: QuoteEvent[];
  sourceSchemaVersion: number;
  session: SessionInfo;
};
type Section =
  "dashboard" | "quotes" | "clients" | "catalog" | "orders" | "profitability" | "billing" | "inventory" | "users" | "audit";

const EMPTY_DATA: DashboardData = {
  company: {},
  economicSettings: {},
  clients: [],
  catalogItems: [],
  quotes: [],
  workOrders: [],
  quoteEvents: [],
  sourceSchemaVersion: 0,
  session: {
    user: { publicId: "", email: "", name: "", role: "technician" },
    permissions: [
      "dashboard.view",
      "orders.read",
      "orders.write",
      "orders.execute",
      "inventory.read",
      "documents.order",
      "notifications.read",
    ],
  },
};
const today = () => new Date().toISOString().slice(0, 10);
const numberValue = (value: unknown, fallback: number) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;
const money = (value: unknown, currency = "CLP") =>
  new Intl.NumberFormat("es-CL", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "CLP" ? 0 : 2,
  }).format(Number(value || 0));
const statusClass = (status: string) =>
  status === "Aprobada" || status === "Completada" || status === "Entregada"
    ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : status === "Enviada" || status === "En ejecución" || status === "Reservada"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : status === "Rechazada" || status === "Cancelada"
        ? "bg-red-50 text-red-700 border-red-200"
        : "bg-amber-50 text-amber-700 border-amber-200";
const priorityClass = (priority: WorkOrder["priority"]) =>
  priority === "Urgente"
    ? "bg-red-50 text-red-700 border-red-200"
    : priority === "Alta"
      ? "bg-orange-50 text-orange-700 border-orange-200"
      : priority === "Baja"
        ? "bg-slate-50 text-slate-600 border-slate-200"
        : "bg-blue-50 text-blue-700 border-blue-200";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {}),
    },
  });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok)
    throw Object.assign(
      new Error(body.error || "La operación no pudo completarse."),
      { status: response.status },
    );
  return body;
}

async function apiForm<T>(url: string, form: FormData): Promise<T> {
  const response = await fetch(url, { method: "POST", body: form });
  const body = (await response.json()) as T & { error?: string };
  if (!response.ok) throw new Error(body.error || "La carga no pudo completarse.");
  return body;
}

function overlayPendingOperations(
  base: DashboardData,
  operations: StoredOperation[],
): DashboardData {
  const next: DashboardData = {
    ...base,
    clients: [...base.clients],
    catalogItems: [...base.catalogItems],
    quotes: [...base.quotes],
    workOrders: [...base.workOrders],
  };
  for (const operation of operations) {
    const payload = operation.payload as Record<string, unknown>;
    if (operation.type === "client.create") {
      const client: Client = {
        publicId: String(payload.publicId),
        name: String(payload.name || "Cliente pendiente"),
        taxId: String(payload.taxId || ""),
        contactName: String(payload.contactName || ""),
        email: String(payload.email || ""),
        phone: String(payload.phone || ""),
        address: String(payload.address || ""),
      };
      next.clients = [
        ...next.clients.filter((item) => item.publicId !== client.publicId),
        client,
      ];
    } else if (operation.type === "catalog.create") {
      const item: CatalogItem = {
        publicId: String(payload.publicId),
        code: String(payload.code || "PEND"),
        type: String(payload.type || "Material"),
        category: String(payload.category || "General"),
        name: String(payload.name || "Ítem pendiente"),
        description: String(payload.description || ""),
        unit: String(payload.unit || "un"),
        unitCost: String(payload.unitCost || 0),
        unitPrice: String(payload.unitPrice || 0),
        currency: String(payload.currency || "CLP"),
        supplier: String(payload.supplier || ""),
      };
      next.catalogItems = [
        ...next.catalogItems.filter(
          (entry) => entry.publicId !== item.publicId,
        ),
        item,
      ];
    } else if (operation.type === "quote.create") {
      const lines = Array.isArray(payload.items)
        ? (payload.items as QuoteLine[])
        : [];
      const calculated = calculateQuote(lines, {
        overheadPercent: numberValue(payload.overheadPercent, 10),
        contingencyPercent: numberValue(payload.contingencyPercent, 5),
        targetMarginPercent: numberValue(payload.targetMarginPercent, 25),
        discountPercent: numberValue(payload.discountPercent, 0),
        taxPercent: numberValue(payload.taxPercent, 19),
        roundingMultiple: numberValue(payload.roundingMultiple, 1000),
      });
      const publicId = String(payload.publicId);
      const quote: Quote = {
        publicId,
        number: `Pendiente · ${publicId.slice(0, 8)}`,
        rootPublicId: publicId,
        parentPublicId: "",
        clientName: String(payload.clientName || "Cliente"),
        project: String(payload.project || "Proyecto"),
        issueDate: String(payload.issueDate || today()),
        status: "Pendiente de sincronizar",
        currency: String(payload.currency || "CLP"),
        total: String(calculated.total),
        netSubtotal: String(calculated.netSubtotal),
        internalCost: String(calculated.internalCost),
        estimatedProfit: String(calculated.estimatedProfit),
        marginPercent: String(calculated.marginPercent),
        revision: 0,
        locked: false,
        lockedAt: "",
        approvedAt: "",
        approvedBy: "",
        approvalNotes: "",
      };
      next.quotes = [
        quote,
        ...next.quotes.filter((entry) => entry.publicId !== publicId),
      ];
    } else if (operation.type === "order.update") {
      next.workOrders = next.workOrders.map((order) =>
        order.publicId === payload.publicId
          ? {
              ...order,
              responsible: String(payload.responsible || ""),
              status: String(payload.status || order.status),
              plannedStart: String(payload.plannedStart || ""),
              plannedEnd: String(payload.plannedEnd || ""),
              notes: String(payload.notes || ""),
            }
          : order,
      );
    }
  }
  return next;
}

export default function CotizadorApp() {
  const [data, setData] = useState<DashboardData>(EMPTY_DATA);
  const [section, setSection] = useState<Section>("dashboard");
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [query, setQuery] = useState("");
  const [clientOpen, setClientOpen] = useState(false);
  const [catalogOpen, setCatalogOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<Quote | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<WorkOrder | null>(null);
  const [usersData, setUsersData] = useState<AppUser[]>([]);
  const [assignableUsers, setAssignableUsers] = useState<AppUser[]>([]);
  const [auditData, setAuditData] = useState<AuditEvent[]>([]);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [userOpen, setUserOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AppUser | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [queueStatus, setQueueStatus] = useState<QueueStatus>({
    pending: 0,
    failed: 0,
  });
  const syncingRef = useRef(false);
  const importRef = useRef<HTMLInputElement>(null);
  const can = useCallback(
    (permission: Permission) => data.session.permissions.includes(permission),
    [data.session.permissions],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [serverData, operations] = await Promise.all([
        api<DashboardData>("/api/dashboard"),
        listOperations(),
      ]);
      setData(overlayPendingOperations(serverData, operations));
      if (serverData.session.permissions.includes("notifications.read")) {
        const notificationData = await api<{ notifications: UserNotification[]; unreadCount: number }>("/api/notifications").catch(() => null);
        if (notificationData) {
          setNotifications(notificationData.notifications);
          setUnreadNotifications(notificationData.unreadCount);
        }
      }
      setOnline(navigator.onLine);
      setAccessError("");
    } catch (error) {
      const operations = await listOperations().catch(() => []);
      setData((current) => overlayPendingOperations(current, operations));
      setOnline(navigator.onLine);
      const status = Number((error as { status?: number })?.status || 0);
      if (status === 401 || status === 403)
        setAccessError(
          error instanceof Error ? error.message : "Acceso denegado.",
        );
      toast.error(
        error instanceof Error
          ? error.message
          : "Sin conexión con el servidor.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const refreshAssignableUsers = useCallback(async () => {
    try {
      setAssignableUsers((await api<{ users: AppUser[] }>("/api/assignable-users")).users);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar los responsables.");
    }
  }, []);

  useEffect(() => {
    if (!selectedOrder || !can("orders.assign") || !navigator.onLine) return;
    const timer = window.setTimeout(() => void refreshAssignableUsers(), 0);
    return () => window.clearTimeout(timer);
  }, [selectedOrder, can, refreshAssignableUsers]);

  const markNotificationsRead = useCallback(async (publicId?: string) => {
    try {
      await api("/api/notifications", {
        method: "PATCH",
        body: JSON.stringify(publicId ? { publicId } : { markAll: true }),
      });
      setNotifications((current) => current.map((item) =>
        !publicId || item.publicId === publicId ? { ...item, readAt: item.readAt || new Date().toISOString() } : item,
      ));
      setUnreadNotifications((current) => publicId ? Math.max(0, current - 1) : 0);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar las notificaciones.");
    }
  }, []);

  const updateQueueStatus = useCallback(async () => {
    setQueueStatus(await getQueueStatus());
  }, []);

  const syncNow = useCallback(
    async (showFeedback = false) => {
      if (!navigator.onLine || syncingRef.current) return;
      syncingRef.current = true;
      setSyncing(true);
      try {
        const result = await flushOfflineQueue();
        setQueueStatus({ pending: result.pending, failed: result.failed });
        if (result.synced) {
          await refresh();
          if (showFeedback)
            toast.success(
              `${result.synced} operación${result.synced === 1 ? "" : "es"} sincronizada${result.synced === 1 ? "" : "s"}.`,
            );
        } else if (showFeedback && !result.pending)
          toast.success("No existen cambios pendientes.");
        if (result.failed)
          toast.error(
            `${result.failed} operación${result.failed === 1 ? " requiere" : "es requieren"} revisión.`,
          );
      } catch (error) {
        if (showFeedback)
          toast.error(
            error instanceof Error
              ? error.message
              : "No fue posible sincronizar.",
          );
      } finally {
        syncingRef.current = false;
        setSyncing(false);
      }
    },
    [refresh],
  );

  useEffect(() => {
    const initialRefresh = window.setTimeout(() => {
      void (async () => {
        await migrateLegacyQuoteDraft();
        await updateQueueStatus();
        await refresh();
        if (navigator.onLine) await syncNow();
      })();
    }, 0);
    const handleOnline = () => {
      setOnline(true);
      void syncNow(true);
    };
    const handleOffline = () => setOnline(false);
    const handleWorkerMessage = (event: MessageEvent) => {
      if (event.data?.type === "SOLIS_SYNC_REQUEST") void syncNow();
    };
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
      navigator.serviceWorker.addEventListener("message", handleWorkerMessage);
    }
    return () => {
      window.clearTimeout(initialRefresh);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if ("serviceWorker" in navigator)
        navigator.serviceWorker.removeEventListener(
          "message",
          handleWorkerMessage,
        );
    };
  }, [refresh, syncNow, updateQueueStatus]);

  const refreshAdministration = useCallback(
    async (target: "users" | "audit") => {
      if (!navigator.onLine) return;
      setAdminLoading(true);
      try {
        if (target === "users")
          setUsersData((await api<{ users: AppUser[] }>("/api/users")).users);
        else
          setAuditData(
            (await api<{ events: AuditEvent[] }>("/api/audit")).events,
          );
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "No fue posible cargar la administración.",
        );
      } finally {
        setAdminLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (section !== "users" && section !== "audit") return;
    const timer = window.setTimeout(
      () => void refreshAdministration(section),
      0,
    );
    return () => window.clearTimeout(timer);
  }, [section, refreshAdministration]);

  const clientQueued = (client: Client) => {
    setData((current) => ({
      ...current,
      clients: [
        ...current.clients.filter((item) => item.publicId !== client.publicId),
        client,
      ],
    }));
    void updateQueueStatus();
  };
  const catalogQueued = (item: CatalogItem) => {
    setData((current) => ({
      ...current,
      catalogItems: [
        ...current.catalogItems.filter(
          (entry) => entry.publicId !== item.publicId,
        ),
        item,
      ],
    }));
    void updateQueueStatus();
  };
  const operationQueued = () => {
    void updateQueueStatus();
    void refresh();
  };

  const filteredQuotes = useMemo(
    () =>
      data.quotes.filter((q) =>
        `${q.number} ${q.clientName} ${q.project}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data.quotes, query],
  );
  const filteredClients = useMemo(
    () =>
      data.clients.filter((c) =>
        `${c.name} ${c.taxId} ${c.contactName}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data.clients, query],
  );
  const filteredCatalog = useMemo(
    () =>
      data.catalogItems.filter((i) =>
        `${i.code} ${i.name} ${i.type} ${i.category}`
          .toLowerCase()
          .includes(query.toLowerCase()),
      ),
    [data.catalogItems, query],
  );
  const filteredOrders = useMemo(() => {
    const priorityRank: Record<string, number> = { Urgente: 0, Alta: 1, Normal: 2, Baja: 3 };
    return data.workOrders
      .filter((order) => `${order.number} ${order.clientName} ${order.project} ${order.responsible} ${order.status} ${order.priority}`.toLowerCase().includes(query.toLowerCase()))
      .sort((left, right) => {
        const leftOverdue = isOrderOverdue(left.dueDate, left.status) ? 0 : 1;
        const rightOverdue = isOrderOverdue(right.dueDate, right.status) ? 0 : 1;
        return leftOverdue - rightOverdue || (priorityRank[left.priority] ?? 2) - (priorityRank[right.priority] ?? 2) || (left.dueDate || "9999").localeCompare(right.dueDate || "9999");
      });
  }, [data.workOrders, query]);
  const totalQuoted = data.quotes.reduce(
    (sum, quote) => sum + Number(quote.netSubtotal || 0),
    0,
  );
  const pending = data.quotes.filter((quote) =>
    ["Borrador", "Enviada", "Pendiente"].includes(quote.status),
  ).length;
  const companyName = String(
    data.company.commercial_name || data.company.name || "SOLIS",
  );

  const importBackup = async (file?: File) => {
    if (!file) return;
    setImporting(true);
    try {
      const result = await api<{ summary: Record<string, number> }>(
        "/api/import",
        { method: "POST", body: JSON.stringify(JSON.parse(await file.text())) },
      );
      toast.success(
        `Migración completada: ${result.summary.quotes} cotizaciones y ${result.summary.workOrders} órdenes.`,
      );
      await refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "El respaldo no es válido.",
      );
    } finally {
      setImporting(false);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const allNav: Array<{
    id: Section;
    label: string;
    icon: typeof BarChart3;
    permission: Permission;
  }> = [
    {
      id: "dashboard",
      label: "Resumen",
      icon: BarChart3,
      permission: "dashboard.view",
    },
    {
      id: "quotes",
      label: "Cotizaciones",
      icon: FilePlus2,
      permission: "quotes.read",
    },
    {
      id: "clients",
      label: "Clientes",
      icon: Users,
      permission: "clients.read",
    },
    {
      id: "catalog",
      label: "Biblioteca de precios",
      icon: LibraryBig,
      permission: "catalog.read",
    },
    {
      id: "orders",
      label: data.session.user.role === "technician" ? "Mis trabajos" : "Órdenes de trabajo",
      icon: HardHat,
      permission: "orders.read",
    },
    {
      id: "profitability",
      label: "Rentabilidad y cierre",
      icon: CircleDollarSign,
      permission: "orders.profitability",
    },
    {
      id: "billing",
      label: "Cobranza y caja",
      icon: CircleDollarSign,
      permission: "billing.read",
    },
    {
      id: "inventory",
      label: "Inventario y compras",
      icon: Warehouse,
      permission: "inventory.read",
    },
    {
      id: "users",
      label: "Usuarios y roles",
      icon: UserCog,
      permission: "users.manage",
    },
    {
      id: "audit",
      label: "Auditoría",
      icon: ScrollText,
      permission: "audit.read",
    },
  ];
  const nav = allNav.filter((item) => can(item.permission));

  return (
    <SidebarProvider>
      <Sidebar
        collapsible="offcanvas"
        className="border-r-0 bg-slate-950 text-white"
      >
        <SidebarHeader className="border-b border-white/10 p-5">
          <div className="flex items-center gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-amber-400 font-black text-slate-950">
              S
            </div>
            <div>
              <div className="text-sm font-bold tracking-wide">
                {companyName}
              </div>
              <div className="text-xs text-slate-400">Cotizador PWA · v3.1</div>
            </div>
          </div>
        </SidebarHeader>
        <SidebarContent className="bg-slate-950 px-3 py-4">
          <SidebarGroup>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-[.16em] text-slate-500">
              Operación comercial
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {nav.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={section === item.id}
                      onClick={() => {
                        setSection(item.id);
                        setQuery("");
                      }}
                      className="text-slate-300 hover:bg-white/10 hover:text-white data-[active=true]:bg-amber-400 data-[active=true]:font-semibold data-[active=true]:text-slate-950"
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter className="border-t border-white/10 bg-slate-950 p-4">
          <div className="mb-3 rounded-xl border border-white/10 p-3">
            <div className="truncate text-xs font-semibold text-white">
              {data.session.user.name || "Usuario SOLIS"}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-slate-400">
              <span className="truncate">{data.session.user.email}</span>
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-amber-300">
                {ROLE_LABELS[data.session.user.role]}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="mb-3 w-full justify-start text-slate-300 hover:bg-white/10 hover:text-white"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              window.location.replace("/login");
            }}
          >
            <LogOut /> Cerrar sesión
          </Button>
          <div className="rounded-xl bg-white/5 p-3 text-xs text-slate-300">
            <div className="flex items-center gap-2">
              {online ? (
                <Cloud className="size-4 text-emerald-400" />
              ) : (
                <CloudOff className="size-4 text-amber-400" />
              )}
              <span>
                {queueStatus.pending
                  ? `${queueStatus.pending} cambio${queueStatus.pending === 1 ? "" : "s"} pendiente${queueStatus.pending === 1 ? "" : "s"}`
                  : online
                    ? "Datos sincronizados"
                    : "Modo sin conexión"}
              </span>
            </div>
            {queueStatus.failed > 0 && (
              <div className="mt-1 text-red-300">
                {queueStatus.failed} con error de validación
              </div>
            )}
            {queueStatus.pending > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!online || syncing}
                onClick={() => void syncNow(true)}
                className="mt-2 h-7 w-full justify-start px-2 text-xs text-amber-300 hover:bg-white/10 hover:text-amber-200"
              >
                <RefreshCw className={syncing ? "animate-spin" : ""} />{" "}
                Sincronizar ahora
              </Button>
            )}
            <div className="mt-2 text-slate-500">
              Cola persistente · IndexedDB
            </div>
          </div>
        </SidebarFooter>
      </Sidebar>
      <SidebarInset className="min-w-0 bg-[#f4f6f8]">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-white/95 px-4 backdrop-blur md:px-7">
          <div className="flex items-center gap-3">
            <SidebarTrigger>
              <Menu />
            </SidebarTrigger>
            <div>
              <div className="text-sm font-semibold text-slate-900">
                {nav.find((item) => item.id === section)?.label}
              </div>
              <div className="hidden text-xs text-slate-500 sm:block">
                {ROLE_LABELS[data.session.user.role]} · SOLIS Ingeniería y
                Servicios SpA
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {can("notifications.read") && (
              <Button
                variant="outline"
                size="icon-sm"
                className="relative"
                onClick={() => setNotificationsOpen(true)}
                aria-label={`${unreadNotifications} notificaciones sin leer`}
              >
                {unreadNotifications ? <BellRing /> : <Bell />}
                {unreadNotifications > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-600 px-1 text-[10px] font-bold leading-5 text-white">
                    {unreadNotifications > 9 ? "9+" : unreadNotifications}
                  </span>
                )}
              </Button>
            )}
            <Badge
              variant="outline"
              className={
                queueStatus.failed
                  ? "border-red-200 bg-red-50 text-red-700"
                  : online
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-amber-200 bg-amber-50 text-amber-700"
              }
            >
              {online ? <Cloud /> : <WifiOff />}
              {queueStatus.pending
                ? `${queueStatus.pending} pendiente${queueStatus.pending === 1 ? "" : "s"}`
                : online
                  ? "En línea"
                  : "Offline"}
            </Badge>
            <Button
              variant="outline"
              size="icon-sm"
              onClick={() =>
                queueStatus.pending ? void syncNow(true) : void refresh()
              }
              aria-label={queueStatus.pending ? "Sincronizar" : "Actualizar"}
            >
              <RefreshCw className={loading || syncing ? "animate-spin" : ""} />
            </Button>
            {can("quotes.write") && (
              <Button
                onClick={() => setQuoteOpen(true)}
                className="bg-amber-400 text-slate-950 hover:bg-amber-300"
              >
                <Plus />
                <span className="hidden sm:inline">Nueva cotización</span>
              </Button>
            )}
          </div>
        </header>
        <main className="p-4 md:p-7">
          {accessError ? (
            <AccessDenied message={accessError} />
          ) : loading && !data.session.user.email ? (
            <LoadingState />
          ) : section === "dashboard" ? (
            <Dashboard
              data={data}
              totalQuoted={totalQuoted}
              pending={pending}
              onSection={setSection}
              onNewQuote={() => setQuoteOpen(true)}
              onImport={() => importRef.current?.click()}
              importing={importing}
              canCreateQuote={can("quotes.write")}
              canImport={can("imports.execute")}
            />
          ) : section === "profitability" ? (
            <ProfitabilityPanel online={online} actor={data.session.user.name || data.session.user.email} onClosed={refresh} />
          ) : section === "billing" ? (
            <BillingPanel online={online} actor={data.session.user.name || data.session.user.email} />
          ) : section === "users" ? (
            <UsersPanel
              users={usersData}
              loading={adminLoading}
              currentUserId={data.session.user.publicId}
              onNew={() => {
                setSelectedUser(null);
                setUserOpen(true);
              }}
              onEdit={(user) => {
                setSelectedUser(user);
                setUserOpen(true);
              }}
            />
          ) : section === "audit" ? (
            <AuditPanel events={auditData} loading={adminLoading} />
          ) : (
            <section className="space-y-5">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-slate-950">
                    {nav.find((item) => item.id === section)?.label}
                  </h1>
                  <p className="mt-1 text-sm text-slate-500">
                    {section === "catalog"
                      ? "Costos internos y precios de venta separados."
                      : section === "clients"
                        ? "Contactos reutilizables para completar cotizaciones."
                        : section === "quotes"
                          ? "Congelamiento, revisiones y aprobación con trazabilidad."
                          : data.session.user.role === "technician"
                            ? "Bandeja personal ordenada por vencimiento y prioridad."
                            : "Asigne responsables, prioridad y compromiso a cada orden."}
                  </p>
                </div>
                <div className="flex gap-2">
                  {["quotes", "clients", "catalog", "orders"].includes(section) && (
                    <div className="relative">
                      <Search className="absolute left-3 top-2.5 size-4 text-slate-400" />
                      <Input
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Buscar…"
                        className="w-full bg-white pl-9 sm:w-72"
                      />
                    </div>
                  )}
                  {section === "clients" && can("clients.write") && (
                    <Button onClick={() => setClientOpen(true)}>
                      <Plus /> Cliente
                    </Button>
                  )}
                  {section === "catalog" && can("catalog.write") && (
                    <Button onClick={() => setCatalogOpen(true)}>
                      <Plus /> Ítem
                    </Button>
                  )}
                </div>
              </div>
              {section === "quotes" && (
                <QuotesTable
                  quotes={filteredQuotes}
                  onManage={
                    can("quotes.flow") || can("documents.quote")
                      ? setSelectedQuote
                      : undefined
                  }
                />
              )}
              {section === "clients" && (
                <ClientsTable clients={filteredClients} />
              )}
              {section === "catalog" && (
                <CatalogTable items={filteredCatalog} />
              )}
              {section === "orders" && (
                <OrdersTable
                  orders={filteredOrders}
                  onManage={
                    can("orders.write") || can("documents.order")
                      ? setSelectedOrder
                      : undefined
                  }
                />
              )}
              {section === "inventory" && <InventoryPanel online={online} />}
            </section>
          )}
        </main>
      </SidebarInset>
      <input
        ref={importRef}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(event) => importBackup(event.target.files?.[0])}
      />
      {can("clients.write") && (
        <ClientDialog
          open={clientOpen}
          onOpenChange={setClientOpen}
          onSaved={refresh}
          onQueued={clientQueued}
        />
      )}
      {can("catalog.write") && (
        <CatalogDialog
          open={catalogOpen}
          onOpenChange={setCatalogOpen}
          onSaved={refresh}
          onQueued={catalogQueued}
        />
      )}
      {can("quotes.write") && (
        <QuoteDialog
          key={`quote-${String(data.economicSettings.discount_percent ?? 0)}`}
          open={quoteOpen}
          onOpenChange={setQuoteOpen}
          data={data}
          online={online}
          onSaved={() => {
            refresh();
            setSection("quotes");
          }}
          onQueued={() => {
            operationQueued();
            setSection("quotes");
          }}
        />
      )}
      <QuoteFlowDialog
        key={selectedQuote?.publicId || "quote-flow"}
        quote={selectedQuote}
        events={data.quoteEvents.filter(
          (event) => event.quotePublicId === selectedQuote?.publicId,
        )}
        actor={data.session.user.name || data.session.user.email}
        canFlow={can("quotes.flow")}
        canApprove={can("quotes.approve")}
        canDocument={can("documents.quote")}
        onOpenChange={(open) => {
          if (!open) setSelectedQuote(null);
        }}
        onSaved={refresh}
      />
      <OrderDialog
        key={selectedOrder?.publicId || "order-flow"}
        order={selectedOrder}
        actor={data.session.user.name || data.session.user.email}
        canEdit={can("orders.write")}
        canAssign={can("orders.assign")}
        canExecute={can("orders.execute")}
        canDocument={can("documents.order")}
        showFinancials={data.session.user.role !== "technician"}
        assignableUsers={assignableUsers}
        online={online}
        onOpenChange={(open) => {
          if (!open) setSelectedOrder(null);
        }}
        onSaved={refresh}
        onQueued={operationQueued}
        onExecutionQueued={() => void updateQueueStatus()}
      />
      <NotificationDialog
        open={notificationsOpen}
        notifications={notifications}
        onOpenChange={setNotificationsOpen}
        onMarkAll={() => void markNotificationsRead()}
        onOpenNotification={(notification) => {
          if (!notification.readAt) void markNotificationsRead(notification.publicId);
          if (notification.entityType === "work_order") {
            const order = data.workOrders.find((item) => item.publicId === notification.entityPublicId);
            if (order) {
              setSelectedOrder(order);
              setSection("orders");
              setNotificationsOpen(false);
            }
          }
        }}
      />
      <UserDialog
        key={selectedUser?.publicId || "new-user"}
        open={userOpen}
        user={selectedUser}
        currentUserId={data.session.user.publicId}
        onOpenChange={(open) => {
          setUserOpen(open);
          if (!open) setSelectedUser(null);
        }}
        onSaved={async () => {
          setUserOpen(false);
          setSelectedUser(null);
          await refreshAdministration("users");
          await refresh();
        }}
      />
      <Toaster richColors position="top-right" />
    </SidebarProvider>
  );
}

function LoadingState() {
  return (
    <div className="grid min-h-[65vh] place-items-center">
      <div className="flex items-center gap-3 text-sm text-slate-500">
        <Loader2 className="animate-spin text-amber-500" /> Preparando el
        espacio de trabajo…
      </div>
    </div>
  );
}

function AccessDenied({ message }: { message: string }) {
  return (
    <div className="grid min-h-[65vh] place-items-center">
      <Card className="w-full max-w-lg border-red-200 shadow-sm">
        <CardHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-xl bg-red-50 text-red-700">
            <LockKeyhole className="size-5" />
          </div>
          <CardTitle>Acceso no habilitado</CardTitle>
          <CardDescription>{message}</CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-slate-600">
          Un administrador debe activar este correo en Usuarios y roles, además
          de autorizarlo en el acceso privado del sitio.
        </CardContent>
      </Card>
    </div>
  );
}

function Dashboard({
  data,
  totalQuoted,
  pending,
  onSection,
  onNewQuote,
  onImport,
  importing,
  canCreateQuote,
  canImport,
}: {
  data: DashboardData;
  totalQuoted: number;
  pending: number;
  onSection: (s: Section) => void;
  onNewQuote: () => void;
  onImport: () => void;
  importing: boolean;
  canCreateQuote: boolean;
  canImport: boolean;
}) {
  const technician = data.session.user.role === "technician";
  const cards = technician
    ? [
        {
          label: "Trabajos asignados",
          value: String(data.workOrders.length),
          note: "Bandeja personal",
          icon: HardHat,
          accent: "text-blue-600 bg-blue-50",
        },
        {
          label: "Vencidos",
          value: String(data.workOrders.filter((item) => isOrderOverdue(item.dueDate, item.status)).length),
          note: "Requieren atención",
          icon: BriefcaseBusiness,
          accent: "text-red-600 bg-red-50",
        },
        {
          label: "Próximos 3 días",
          value: String(data.workOrders.filter((item) => isOrderDueSoon(item.dueDate, item.status)).length),
          note: "Fechas de compromiso",
          icon: BellRing,
          accent: "text-amber-600 bg-amber-50",
        },
        {
          label: "En ejecución",
          value: String(
            data.workOrders.filter((item) => item.status === "En ejecución")
              .length,
          ),
          note: "Trabajo activo",
          icon: ClipboardCheck,
          accent: "text-violet-600 bg-violet-50",
        },
      ]
    : [
        {
          label: "Venta cotizada",
          value: money(totalQuoted),
          note: `${data.quotes.length} documentos`,
          icon: CircleDollarSign,
          accent: "text-emerald-600 bg-emerald-50",
        },
        {
          label: "Pendientes",
          value: String(pending),
          note: "Borradores y enviadas",
          icon: BriefcaseBusiness,
          accent: "text-blue-600 bg-blue-50",
        },
        {
          label: "Clientes",
          value: String(data.clients.length),
          note: "Activos en la base",
          icon: Users,
          accent: "text-violet-600 bg-violet-50",
        },
        {
          label: "Biblioteca",
          value: String(data.catalogItems.length),
          note: "Ítems disponibles",
          icon: BookOpen,
          accent: "text-amber-600 bg-amber-50",
        },
      ];
  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-2xl bg-slate-950 p-6 text-white shadow-sm md:p-8">
        <div className="absolute -right-16 -top-20 size-64 rounded-full border-[38px] border-amber-400/10" />
        <div className="relative flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <Badge className="mb-3 bg-amber-400 text-slate-950">
              PWA v3.1 · Cobranza y flujo de caja
            </Badge>
            <h1 className="max-w-2xl text-2xl font-bold tracking-tight md:text-3xl">
              Del presupuesto aprobado a la evidencia real del trabajo ejecutado.
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">
              Checklist, horas, materiales, fotografías y recepción del cliente
              protegidos por usuario en Cloudflare D1 y R2.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canCreateQuote && (
              <Button
                onClick={onNewQuote}
                className="bg-amber-400 text-slate-950 hover:bg-amber-300"
              >
                <FilePlus2 /> Crear cotización
              </Button>
            )}
            {canImport && (
              <Button
                onClick={onImport}
                variant="outline"
                disabled={importing}
                className="border-white/20 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                {importing ? (
                  <Loader2 className="animate-spin" />
                ) : (
                  <FileJson />
                )}{" "}
                Migrar respaldo v1.9
              </Button>
            )}
          </div>
        </div>
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label} className="border-0 shadow-sm">
            <CardContent className="flex items-start justify-between p-5">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {card.label}
                </p>
                <p className="mt-2 text-2xl font-bold text-slate-950">
                  {card.value}
                </p>
                <p className="mt-1 text-xs text-slate-500">{card.note}</p>
              </div>
              <div className={`rounded-xl p-2.5 ${card.accent}`}>
                <card.icon className="size-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </section>
      <section className="grid gap-5 xl:grid-cols-[1.55fr_.8fr]">
        <Card className="border-0 shadow-sm">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">
                {technician ? "Órdenes de trabajo" : "Cotizaciones recientes"}
              </CardTitle>
              <CardDescription>
                {technician
                  ? "Planificación y estado operativo"
                  : "Últimos documentos guardados"}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onSection(technician ? "orders" : "quotes")}
            >
              Ver todas <ChevronRight />
            </Button>
          </CardHeader>
          <CardContent>
            {technician ? (
              <OrdersTable orders={data.workOrders.slice(0, 6)} />
            ) : (
              <QuotesTable quotes={data.quotes.slice(0, 6)} compact />
            )}
          </CardContent>
        </Card>
        <Card className="border-0 shadow-sm">
          <CardHeader>
            <CardTitle className="text-base">Identidad y seguridad</CardTitle>
            <CardDescription>Cloudflare D1 + R2 + IndexedDB</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border bg-slate-50 p-4">
              <div className="flex items-center gap-3">
                <ShieldCheck className="size-5 text-emerald-600" />
                <div>
                  <div className="text-sm font-semibold">
                    Permisos en servidor
                  </div>
                  <div className="text-xs text-slate-500">
                    {ROLE_LABELS[data.session.user.role]} ·{" "}
                    {data.session.permissions.length} permisos
                  </div>
                </div>
              </div>
              <Badge variant="outline">Activo</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-center">
              <div className="rounded-xl border p-3">
                <div className="text-xl font-bold">
                  {data.sourceSchemaVersion || "—"}
                </div>
                <div className="text-xs text-slate-500">Esquema origen</div>
              </div>
              <div className="rounded-xl border p-3">
                <div className="text-xl font-bold">
                  {data.workOrders.length}
                </div>
                <div className="text-xs text-slate-500">Órdenes de trabajo</div>
              </div>
            </div>
            {canImport && (
              <Button variant="outline" className="w-full" onClick={onImport}>
                <FileJson /> Importar respaldo JSON
              </Button>
            )}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function QuotesTable({
  quotes,
  compact = false,
  onManage,
}: {
  quotes: Quote[];
  compact?: boolean;
  onManage?: (quote: Quote) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Número</TableHead>
            <TableHead>Cliente / proyecto</TableHead>
            <TableHead>Estado</TableHead>
            {!compact && <TableHead className="text-right">Margen</TableHead>}
            <TableHead className="text-right">Total</TableHead>
            {!compact && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {quotes.length ? (
            quotes.map((q) => (
              <TableRow key={q.publicId}>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">
                      {q.number}
                    </span>
                    {q.locked && (
                      <LockKeyhole className="size-3.5 text-slate-400" />
                    )}
                  </div>
                  <div className="text-xs text-slate-400">
                    {q.issueDate}
                    {q.revision
                      ? ` · R${String(q.revision).padStart(2, "0")}`
                      : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{q.clientName}</div>
                  <div className="max-w-[260px] truncate text-xs text-slate-500">
                    {q.project}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusClass(q.status)}>
                    {q.status}
                  </Badge>
                </TableCell>
                {!compact && (
                  <TableCell
                    className={`text-right font-semibold ${Number(q.marginPercent) < 0 ? "text-red-600" : "text-slate-700"}`}
                  >
                    {Number(q.marginPercent).toFixed(1)}%
                  </TableCell>
                )}
                <TableCell className="text-right font-semibold">
                  {money(q.total, q.currency)}
                </TableCell>
                {!compact && (
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onManage?.(q)}
                    >
                      Gestionar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-28 text-center text-slate-500"
              >
                Aún no hay cotizaciones.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
function ClientsTable({ clients }: { clients: Client[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Cliente</TableHead>
            <TableHead>RUT</TableHead>
            <TableHead>Contacto</TableHead>
            <TableHead>Correo</TableHead>
            <TableHead>Teléfono</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clients.length ? (
            clients.map((c) => (
              <TableRow key={c.publicId}>
                <TableCell className="font-semibold">{c.name}</TableCell>
                <TableCell>{c.taxId || "—"}</TableCell>
                <TableCell>{c.contactName || "—"}</TableCell>
                <TableCell>{c.email || "—"}</TableCell>
                <TableCell>{c.phone || "—"}</TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={5}
                className="h-28 text-center text-slate-500"
              >
                Agregue su primer cliente o importe el respaldo v1.9.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
function CatalogTable({ items }: { items: CatalogItem[] }) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Código</TableHead>
            <TableHead>Descripción</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead>Unidad</TableHead>
            <TableHead className="text-right">Costo interno</TableHead>
            <TableHead className="text-right">Precio venta</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {items.length ? (
            items.map((i) => (
              <TableRow key={i.publicId}>
                <TableCell className="font-mono text-xs font-semibold">
                  {i.code}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{i.name}</div>
                  <div className="text-xs text-slate-500">
                    {i.category}
                    {i.supplier ? ` · ${i.supplier}` : ""}
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{i.type}</Badge>
                </TableCell>
                <TableCell>{i.unit}</TableCell>
                <TableCell className="bg-blue-50/60 text-right font-medium text-blue-800">
                  {money(i.unitCost, i.currency)}
                </TableCell>
                <TableCell className="text-right font-semibold">
                  {money(i.unitPrice, i.currency)}
                </TableCell>
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={6}
                className="h-28 text-center text-slate-500"
              >
                La biblioteca está vacía.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
function OrdersTable({
  orders,
  onManage,
}: {
  orders: WorkOrder[];
  onManage?: (order: WorkOrder) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
      <Table>
        <TableHeader>
          <TableRow className="bg-slate-50">
            <TableHead>Orden</TableHead>
            <TableHead>Cliente / proyecto</TableHead>
            <TableHead>Responsable</TableHead>
            <TableHead>Prioridad</TableHead>
            <TableHead>Compromiso</TableHead>
            <TableHead>Estado</TableHead>
            {onManage && <TableHead />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {orders.length ? (
            orders.map((o) => (
              <TableRow key={o.publicId}>
                <TableCell>
                  <div className="font-semibold">{o.number}</div>
                  <div className="text-xs text-slate-400">
                    {o.createdDate || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">{o.clientName}</div>
                  <div className="text-xs text-slate-500">{o.project}</div>
                </TableCell>
                <TableCell>{o.responsible || "Sin asignar"}</TableCell>
                <TableCell>
                  <Badge variant="outline" className={priorityClass(o.priority || "Normal")}>
                    {o.priority || "Normal"}
                  </Badge>
                </TableCell>
                <TableCell className={isOrderOverdue(o.dueDate, o.status) ? "text-xs font-semibold text-red-700" : "text-xs"}>
                  {o.dueDate || o.plannedEnd || "Sin fecha"}
                  {isOrderOverdue(o.dueDate, o.status) && <div>Vencida</div>}
                </TableCell>
                <TableCell>
                  <Badge variant="outline" className={statusClass(o.status)}>
                    {o.status}
                  </Badge>
                </TableCell>
                {onManage && (
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onManage(o)}
                    >
                      Gestionar
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell
                colSpan={7}
                className="h-28 text-center text-slate-500"
              >
                No hay trabajos asignados en esta bandeja.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function UsersPanel({
  users,
  loading,
  currentUserId,
  onNew,
  onEdit,
}: {
  users: AppUser[];
  loading: boolean;
  currentUserId: string;
  onNew: () => void;
  onEdit: (user: AppUser) => void;
}) {
  return (
    <section className="space-y-5">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-950">
            Usuarios y roles
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Cuentas de acceso y permisos internos de cada persona.
          </p>
        </div>
        <Button onClick={onNew}>
          <Plus /> Agregar usuario
        </Button>
      </div>
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Importante:</strong> entregue la contraseña inicial de forma privada. El usuario podrá ingresar inmediatamente mientras su cuenta permanezca activa.
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Persona</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Actualizado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-slate-500"
                >
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : users.length ? (
              users.map((user) => (
                <TableRow key={user.publicId}>
                  <TableCell className="font-semibold">
                    {user.name}
                    {user.publicId === currentUserId && (
                      <span className="ml-2 text-xs font-normal text-slate-400">
                        Usted
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{user.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{ROLE_LABELS[user.role]}</Badge>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={
                        user.active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }
                    >
                      {user.active ? "Activo" : "Desactivado"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {user.updatedAt.slice(0, 16).replace("T", " ")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onEdit(user)}
                    >
                      Editar
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={6}
                  className="h-28 text-center text-slate-500"
                >
                  No existen usuarios registrados.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

const AUDIT_LABELS: Record<string, string> = {
  USER_CREATED: "Usuario creado",
  USER_UPDATED: "Usuario actualizado",
  CLIENT_CREATED: "Cliente creado",
  CLIENT_UPDATED: "Cliente actualizado",
  CATALOG_CREATED: "Ítem creado",
  CATALOG_UPDATED: "Ítem actualizado",
  QUOTE_CREATED: "Cotización creada",
  QUOTE_LOCKED: "Cotización congelada",
  QUOTE_REVISION_CREATED: "Revisión creada",
  QUOTE_APPROVED: "Cotización aprobada",
  WORK_ORDER_CREATED: "Orden creada",
  WORK_ORDER_UPDATED: "Orden actualizada",
  QUOTE_PDF_GENERATED: "PDF de cotización",
  WORK_ORDER_PDF_GENERATED: "PDF de orden",
  BACKUP_IMPORTED: "Respaldo importado",
};

function AuditPanel({
  events,
  loading,
}: {
  events: AuditEvent[];
  loading: boolean;
}) {
  return (
    <section className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          Auditoría
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Quién realizó cada cambio sensible, cuándo y sobre qué registro.
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
        <Table>
          <TableHeader>
            <TableRow className="bg-slate-50">
              <TableHead>Fecha UTC</TableHead>
              <TableHead>Usuario</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Acción</TableHead>
              <TableHead>Registro</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-28 text-center text-slate-500"
                >
                  <Loader2 className="mx-auto size-5 animate-spin" />
                </TableCell>
              </TableRow>
            ) : events.length ? (
              events.map((event) => (
                <TableRow key={event.publicId}>
                  <TableCell className="whitespace-nowrap text-xs text-slate-500">
                    {event.createdAt.slice(0, 19).replace("T", " ")}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">{event.actorName}</div>
                    <div className="text-xs text-slate-500">
                      {event.actorEmail}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {ROLE_LABELS[event.actorRole] || event.actorRole}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-medium">
                    {AUDIT_LABELS[event.action] ||
                      event.action.replaceAll("_", " ")}
                  </TableCell>
                  <TableCell>
                    <div className="text-sm">{event.entityType}</div>
                    <div className="max-w-48 truncate font-mono text-[10px] text-slate-400">
                      {event.entityPublicId || "—"}
                    </div>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="h-28 text-center text-slate-500"
                >
                  La auditoría comenzará a registrar acciones con esta versión.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  );
}

function UserDialog({
  open,
  user,
  currentUserId,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  user: AppUser | null;
  currentUserId: string;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void | Promise<void>;
}) {
  const [saving, setSaving] = useState(false);
  const isSelf = user?.publicId === currentUserId;
  const save = async (form: FormData) => {
    setSaving(true);
    try {
      const payload = user
        ? {
            publicId: user.publicId,
            name: String(form.get("name") || ""),
            role: isSelf ? user.role : String(form.get("role")),
            active: isSelf ? user.active : form.get("active") === "on",
          }
          : {
            name: String(form.get("name") || ""),
            email: String(form.get("email") || ""),
            role: String(form.get("role")),
            password: String(form.get("password") || ""),
          };
      await api("/api/users", {
        method: user ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      toast.success(
        user
          ? "Usuario actualizado."
          : "Usuario creado y listo para iniciar sesión.",
      );
      await onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible guardar el usuario.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{user ? "Editar usuario" : "Nuevo usuario"}</DialogTitle>
          <DialogDescription>
            El rol se valida en cada operación del servidor.
          </DialogDescription>
        </DialogHeader>
        <form action={save} className="space-y-4">
          <Field
            name="name"
            label="Nombre completo"
            defaultValue={user?.name || ""}
            required
          />
          {user ? (
            <div className="space-y-2">
              <Label>Correo autenticado</Label>
              <Input value={user.email} disabled />
            </div>
          ) : (
            <>
              <Field name="email" label="Correo electrónico" type="email" required />
              <Field name="password" label="Contraseña inicial" type="password" required minLength={10} maxLength={128} />
            </>
          )}
          <div className="space-y-2">
            <Label htmlFor="role">Rol</Label>
            <select
              id="role"
              name="role"
              defaultValue={user?.role || "technician"}
              disabled={isSelf}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {ROLE_LABELS[role]}
                </option>
              ))}
            </select>
          </div>
          {user && (
            <label className="flex items-center gap-3 rounded-xl border p-3 text-sm">
              <input
                type="checkbox"
                name="active"
                defaultChecked={user.active}
                disabled={isSelf}
                className="size-4"
              />
              <span>
                <strong>Usuario activo</strong>
                <span className="block text-xs text-slate-500">
                  Al desactivarlo, las operaciones pendientes serán rechazadas
                  al sincronizar.
                </span>
              </span>
            </label>
          )}
          {isSelf && (
            <div className="rounded-lg bg-slate-100 px-3 py-2 text-xs text-slate-600">
              Por seguridad, no puede cambiar ni desactivar su propio rol.
            </div>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar usuario
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ClientDialog({
  open,
  onOpenChange,
  onSaved,
  onQueued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  onQueued: (client: Client) => void;
}) {
  const [saving, setSaving] = useState(false);
  const save = async (form: FormData) => {
    setSaving(true);
    try {
      const payload = {
        publicId: crypto.randomUUID(),
        ...Object.fromEntries(form),
      } as Record<string, string>;
      const result = await executeOrQueue("client.create", payload);
      if (result.queued) {
        onQueued({
          publicId: payload.publicId,
          name: payload.name,
          taxId: payload.taxId || "",
          contactName: payload.contactName || "",
          email: payload.email || "",
          phone: payload.phone || "",
          address: payload.address || "",
        });
        toast.warning("Cliente guardado en la cola offline.");
      } else {
        toast.success("Cliente guardado.");
        onSaved();
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible guardar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nuevo cliente</DialogTitle>
          <DialogDescription>
            Estos datos se reutilizarán en futuras cotizaciones.
          </DialogDescription>
        </DialogHeader>
        <form action={save} className="grid gap-4">
          <Field name="name" label="Razón social o nombre" required />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="taxId" label="RUT" />
            <Field name="contactName" label="Contacto" />
          </div>
          <Field name="email" label="Correo" type="email" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="phone" label="Teléfono" />
            <Field name="address" label="Dirección" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar cliente
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CatalogDialog({
  open,
  onOpenChange,
  onSaved,
  onQueued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved: () => void;
  onQueued: (item: CatalogItem) => void;
}) {
  const [saving, setSaving] = useState(false);
  const save = async (form: FormData) => {
    setSaving(true);
    try {
      const payload = {
        publicId: crypto.randomUUID(),
        description: "",
        ...Object.fromEntries(form),
      } as Record<string, string>;
      const result = await executeOrQueue("catalog.create", payload);
      if (result.queued) {
        onQueued({
          publicId: payload.publicId,
          code: payload.code,
          type: payload.type,
          category: payload.category || "General",
          name: payload.name,
          description: payload.description || "",
          unit: payload.unit,
          unitCost: payload.unitCost,
          unitPrice: payload.unitPrice,
          currency: payload.currency,
          supplier: payload.supplier || "",
        });
        toast.warning("Ítem guardado en la cola offline.");
      } else {
        toast.success("Ítem agregado a la biblioteca.");
        onSaved();
      }
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible guardar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Nuevo ítem de biblioteca</DialogTitle>
          <DialogDescription>
            El costo interno nunca se mostrará al cliente.
          </DialogDescription>
        </DialogHeader>
        <form action={save} className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field name="code" label="Código" required />
            <SelectField
              name="type"
              label="Tipo"
              options={["Material", "Mano de obra", "Servicio"]}
            />
            <Field name="category" label="Categoría" defaultValue="General" />
          </div>
          <Field name="name" label="Descripción corta" required />
          <div className="grid gap-4 sm:grid-cols-4">
            <Field name="unit" label="Unidad" defaultValue="un" required />
            <Field
              name="unitCost"
              label="Costo interno"
              type="number"
              defaultValue="0"
              required
            />
            <Field
              name="unitPrice"
              label="Precio venta"
              type="number"
              defaultValue="0"
              required
            />
            <SelectField
              name="currency"
              label="Moneda"
              options={["CLP", "USD", "EUR", "UF"]}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field name="supplier" label="Proveedor" />
            <Field name="reference" label="Referencia" />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar ítem
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QuoteDialog({
  open,
  onOpenChange,
  data,
  online,
  onSaved,
  onQueued,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  data: DashboardData;
  online: boolean;
  onSaved: () => void;
  onQueued: () => void;
}) {
  const settings = data.economicSettings;
  const [clientId, setClientId] = useState("");
  const [project, setProject] = useState("");
  const [quoteCurrency, setQuoteCurrency] = useState("CLP");
  const [lines, setLines] = useState<QuoteLine[]>([]);
  const [catalogId, setCatalogId] = useState("");
  const [saving, setSaving] = useState(false);
  const [discount, setDiscount] = useState(() =>
    numberValue(settings.discount_percent, 0),
  );
  const client = data.clients.find((item) => item.publicId === clientId);
  const economic = {
    overheadPercent: numberValue(settings.overhead_percent, 10),
    contingencyPercent: numberValue(settings.contingency_percent, 5),
    targetMarginPercent: numberValue(settings.target_margin_percent, 25),
    discountPercent: discount,
    taxPercent: 19,
    roundingMultiple: numberValue(settings.rounding_multiple, 1000),
  };
  const calculated = calculateQuote(lines, economic);
  const addCatalog = () => {
    const item = data.catalogItems.find(
      (entry) => entry.publicId === catalogId,
    );
    if (!item) return;
    if (item.currency !== quoteCurrency) {
      toast.error(
        `El ítem está en ${item.currency}; la cotización está en ${quoteCurrency}. No se realizará una conversión automática.`,
      );
      return;
    }
    setLines((current) => [
      ...current,
      {
        name: item.name,
        detail: item.description,
        quantity: 1,
        unit: item.unit,
        unitCost: Number(item.unitCost),
        unitPrice: Number(item.unitPrice),
      },
    ]);
    setCatalogId("");
  };
  const save = async () => {
    if (!client || !project.trim() || !lines.length) {
      toast.error("Seleccione cliente, proyecto y al menos una partida.");
      return;
    }
    const payload = {
      publicId: crypto.randomUUID(),
      clientPublicId: client.publicId,
      clientName: client.name,
      project,
      issueDate: today(),
      currency: quoteCurrency,
      ...economic,
      validityDays: 20,
      paymentTerms: "50% anticipo / 50% contra entrega",
      deliveryTerms: "Por definir",
      items: lines,
    };
    setSaving(true);
    try {
      const result = await executeOrQueue("quote.create", payload);
      if (result.queued) {
        toast.warning(
          "Cotización guardada en la cola offline; recibirá su número al sincronizar.",
        );
        onQueued();
      } else {
        toast.success("Cotización guardada en la base compartida.");
        onSaved();
      }
      setLines([]);
      setProject("");
      setClientId("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No fue posible guardar.");
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Nueva cotización</DialogTitle>
          <DialogDescription>
            Los valores azules son internos; no se mostrarán al cliente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_130px]">
          <div className="space-y-2">
            <Label>Cliente</Label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            >
              <option value="">Seleccione un cliente</option>
              {data.clients.map((i) => (
                <option key={i.publicId} value={i.publicId}>
                  {i.name}
                </option>
              ))}
            </select>
          </div>
          <FieldControlled
            label="Proyecto"
            value={project}
            onChange={setProject}
            placeholder="Ej.: Modernización tablero MCC"
          />
          <div className="space-y-2">
            <Label>Moneda</Label>
            <select
              value={quoteCurrency}
              onChange={(event) => {
                if (!lines.length) setQuoteCurrency(event.target.value);
                else
                  toast.error("Quite las partidas antes de cambiar la moneda.");
              }}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm"
            >
              {["CLP", "USD", "EUR", "UF"].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="rounded-xl border bg-slate-50 p-4">
          <div className="mb-3 flex flex-col gap-2 sm:flex-row">
            <select
              value={catalogId}
              onChange={(e) => setCatalogId(e.target.value)}
              className="h-10 flex-1 rounded-md border bg-white px-3 text-sm"
            >
              <option value="">Agregar desde biblioteca…</option>
              {data.catalogItems.map((i) => (
                <option key={i.publicId} value={i.publicId}>
                  {i.code} · {i.name} ({i.currency})
                </option>
              ))}
            </select>
            <Button
              type="button"
              variant="outline"
              onClick={addCatalog}
              disabled={!catalogId}
            >
              <PackagePlus /> Agregar partida
            </Button>
          </div>
          {lines.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Partida</TableHead>
                  <TableHead>Cant.</TableHead>
                  <TableHead className="text-right">Costo</TableHead>
                  <TableHead className="text-right">Venta</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line, index) => (
                  <TableRow key={`${line.name}-${index}`}>
                    <TableCell>
                      <div className="font-medium">{line.name}</div>
                      <div className="text-xs text-slate-500">{line.unit}</div>
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        onChange={(e) =>
                          setLines((current) =>
                            current.map((item, p) =>
                              p === index
                                ? { ...item, quantity: Number(e.target.value) }
                                : item,
                            ),
                          )
                        }
                        className="w-20 bg-white"
                      />
                    </TableCell>
                    <TableCell className="bg-blue-50 text-right text-blue-800">
                      {money(line.quantity * line.unitCost, quoteCurrency)}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {money(line.quantity * line.unitPrice, quoteCurrency)}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() =>
                          setLines((current) =>
                            current.filter((_, p) => p !== index),
                          )
                        }
                        aria-label="Quitar"
                      >
                        <X />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <div className="py-8 text-center text-sm text-slate-500">
              Agregue partidas desde la biblioteca de precios.
            </div>
          )}
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric
              label="Costo directo"
              value={money(calculated.directCost, quoteCurrency)}
            />
            <Metric
              label="Costo interno"
              value={money(calculated.internalCost, quoteCurrency)}
            />
            <Metric
              label="Utilidad"
              value={money(calculated.estimatedProfit, quoteCurrency)}
            />
            <Metric
              label="Margen"
              value={`${calculated.marginPercent.toFixed(1)}%`}
              negative={calculated.marginPercent < 0}
            />
          </div>
          <div className="rounded-xl bg-slate-950 p-4 text-white">
            <div className="flex items-end justify-between gap-3">
              <div>
                <div className="text-xs uppercase tracking-wider text-slate-400">
                  Total con IVA
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {money(calculated.total, quoteCurrency)}
                </div>
              </div>
              <div className="w-24">
                <Label className="text-xs text-slate-400">Descuento %</Label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  value={discount}
                  onChange={(e) => setDiscount(Number(e.target.value))}
                  className="mt-1 border-white/20 bg-white/10 text-white"
                />
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={save}
            disabled={saving || !lines.length}
            className="bg-amber-400 text-slate-950 hover:bg-amber-300"
          >
            {saving ? (
              <Loader2 className="animate-spin" />
            ) : online ? (
              <Cloud />
            ) : (
              <Smartphone />
            )}
            {online ? "Guardar cotización" : "Guardar para sincronizar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function QuoteFlowDialog({
  quote,
  events,
  actor,
  canFlow,
  canApprove,
  canDocument,
  onOpenChange,
  onSaved,
}: {
  quote: Quote | null;
  events: QuoteEvent[];
  actor: string;
  canFlow: boolean;
  canApprove: boolean;
  canDocument: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [detail, setDetail] = useState("");
  const [responsible, setResponsible] = useState("");
  const [working, setWorking] = useState<string | null>(null);
  if (!quote) return null;
  const orderCreated = events.some(
    (event) => event.eventType === "ORDEN_TRABAJO_CREADA",
  );
  const run = async (
    action: "lock" | "revision" | "approve" | "create_order",
  ) => {
    if (action === "revision" && !detail.trim()) {
      toast.error("Indique el motivo de la revisión.");
      return;
    }
    setWorking(action);
    try {
      const result = await api<{ message: string }>("/api/quote-flow", {
        method: "POST",
        body: JSON.stringify({
          action,
          quotePublicId: quote.publicId,
          actor,
          detail,
          responsible,
        }),
      });
      toast.success(result.message);
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible completar la acción.",
      );
    } finally {
      setWorking(null);
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Flujo comercial · {quote.number}</DialogTitle>
          <DialogDescription>
            {quote.clientName} · {quote.project}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-4">
          <FlowStep icon={FilePlus2} label="Borrador" active />
          <FlowStep
            icon={LockKeyhole}
            label="Congelada"
            active={quote.locked}
          />
          <FlowStep
            icon={Stamp}
            label="Aprobada"
            active={quote.status === "Aprobada"}
          />
          <FlowStep
            icon={ClipboardCheck}
            label="Orden creada"
            active={orderCreated}
          />
        </div>
        <div className="grid gap-4 md:grid-cols-[1fr_280px]">
          <div className="space-y-4">
            <div className="rounded-xl border bg-slate-50 p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Usuario que ejecuta la acción</Label>
                  <Input value={actor} disabled className="bg-slate-100" />
                </div>
                <FieldControlled
                  label="Referencia operativa (opcional)"
                  value={responsible}
                  onChange={setResponsible}
                  placeholder="Ej.: Taller eléctrico"
                />
              </div>
              {quote.status === "Aprobada" && !orderCreated && (
                <p className="mt-3 text-xs text-slate-500">Después de crear la orden, asígnela a un usuario activo desde Órdenes de trabajo.</p>
              )}
              <div className="mt-4 space-y-2">
                <Label>Motivo, referencia u observación</Label>
                <textarea
                  value={detail}
                  onChange={(event) => setDetail(event.target.value)}
                  placeholder="Ej.: OC-2026-045 o cambios solicitados por el cliente"
                  className="min-h-20 w-full rounded-md border bg-white px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {canFlow && !quote.locked && (
                <ActionButton
                  icon={LockKeyhole}
                  title="Congelar versión"
                  note="Bloquea el documento enviado."
                  working={working === "lock"}
                  onClick={() => run("lock")}
                />
              )}
              {canFlow && quote.locked && (
                <ActionButton
                  icon={GitBranch}
                  title="Crear revisión"
                  note="Genera una copia R01, R02…"
                  working={working === "revision"}
                  onClick={() => run("revision")}
                />
              )}
              {canApprove && quote.locked && quote.status !== "Aprobada" && (
                <ActionButton
                  icon={Stamp}
                  title="Registrar aprobación"
                  note="Guarda identidad y referencia."
                  working={working === "approve"}
                  onClick={() => run("approve")}
                />
              )}
              {canApprove && quote.status === "Aprobada" && !orderCreated && (
                <ActionButton
                  icon={ClipboardCheck}
                  title="Crear orden de trabajo"
                  note="Usa esta revisión aprobada."
                  working={working === "create_order"}
                  onClick={() => run("create_order")}
                />
              )}
            </div>
          </div>
          <div className="space-y-4">
            <div className="rounded-xl border p-4">
              <div className="mb-3 text-sm font-semibold">Trazabilidad</div>
              <div className="space-y-3">
                {events.length ? (
                  events.map((event) => (
                    <div key={event.publicId} className="flex gap-3 text-sm">
                      <div className="mt-1 size-2 shrink-0 rounded-full bg-amber-400" />
                      <div>
                        <div className="font-medium">
                          {event.eventType.replaceAll("_", " ")}
                        </div>
                        <div className="text-xs text-slate-500">
                          {event.actor || "Sistema"} ·{" "}
                          {event.createdAt.slice(0, 16).replace("T", " ")}
                        </div>
                        {event.detail && (
                          <div className="mt-1 text-xs text-slate-600">
                            {event.detail}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-sm text-slate-500">
                    Aún no existen eventos para esta versión.
                  </div>
                )}
              </div>
            </div>
            {canDocument && (
              <DocumentsPanel
                entityType="quote"
                entityPublicId={quote.publicId}
                actor={actor}
                canGenerate={quote.locked}
                blockedMessage="Congele la versión para emitir un PDF controlado."
              />
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NotificationDialog({
  open,
  notifications,
  onOpenChange,
  onMarkAll,
  onOpenNotification,
}: {
  open: boolean;
  notifications: UserNotification[];
  onOpenChange: (open: boolean) => void;
  onMarkAll: () => void;
  onOpenNotification: (notification: UserNotification) => void;
}) {
  const unread = notifications.filter((item) => !item.readAt).length;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><BellRing className="size-5 text-amber-600" /> Notificaciones</DialogTitle>
          <DialogDescription>Avisos internos de asignaciones y trabajo pendiente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {notifications.length ? notifications.map((notification) => (
            <button
              key={notification.publicId}
              type="button"
              onClick={() => onOpenNotification(notification)}
              className={`w-full rounded-xl border p-4 text-left transition hover:border-amber-300 hover:bg-amber-50/40 ${notification.readAt ? "bg-white" : "border-amber-200 bg-amber-50"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-slate-900">{notification.title}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-600">{notification.message}</div>
                  <div className="mt-2 text-[11px] text-slate-400">{notification.createdAt.slice(0, 16).replace("T", " ")}</div>
                </div>
                {!notification.readAt && <span className="mt-1 size-2 shrink-0 rounded-full bg-amber-500" />}
              </div>
            </button>
          )) : (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">No hay notificaciones todavía.</div>
          )}
        </div>
        <DialogFooter>
          {unread > 0 && <Button variant="outline" onClick={onMarkAll}>Marcar todas como leídas</Button>}
          <Button onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function InventoryPanel({ online }: { online: boolean }) {
  const [data, setData] = useState<InventoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [tab, setTab] = useState("stock");
  const [warehouseCode, setWarehouseCode] = useState("");
  const [warehouseName, setWarehouseName] = useState("");
  const [warehouseLocation, setWarehouseLocation] = useState("");
  const [receiptWarehouse, setReceiptWarehouse] = useState("");
  const [receiptItem, setReceiptItem] = useState("");
  const [receiptQuantity, setReceiptQuantity] = useState("1");
  const [receiptUnitCost, setReceiptUnitCost] = useState("0");
  const [receiptMinimum, setReceiptMinimum] = useState("0");
  const [receiptReference, setReceiptReference] = useState("");
  const [allocationWarehouses, setAllocationWarehouses] = useState<Record<string, string>>({});
  const [supplierCode, setSupplierCode] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierTaxId, setSupplierTaxId] = useState("");
  const [supplierContact, setSupplierContact] = useState("");
  const [supplierEmail, setSupplierEmail] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [supplierAddress, setSupplierAddress] = useState("");
  const [supplierTerms, setSupplierTerms] = useState("");
  const [supplierCurrency, setSupplierCurrency] = useState("CLP");
  const [editingPurchase, setEditingPurchase] = useState<PurchaseRequest | null>(null);
  const [purchaseSupplier, setPurchaseSupplier] = useState("");
  const [purchaseCurrency, setPurchaseCurrency] = useState("CLP");
  const [purchaseDiscount, setPurchaseDiscount] = useState("0");
  const [purchaseTax, setPurchaseTax] = useState("19");
  const [purchaseNotes, setPurchaseNotes] = useState("");
  const [purchaseCosts, setPurchaseCosts] = useState<Record<string, string>>({});
  const [receivingPurchase, setReceivingPurchase] = useState<PurchaseRequest | null>(null);
  const [documentingPurchase, setDocumentingPurchase] = useState<PurchaseRequest | null>(null);
  const [receiptDocument, setReceiptDocument] = useState("");
  const [receiptLines, setReceiptLines] = useState<Record<string, string>>({});
  const [adjusting, setAdjusting] = useState<InventoryBalance | null>(null);
  const [adjustQuantity, setAdjustQuantity] = useState("0");
  const [adjustMinimum, setAdjustMinimum] = useState("0");
  const [adjustReason, setAdjustReason] = useState("");
  const [returning, setReturning] = useState<InventoryAllocation | null>(null);
  const [returnQuantity, setReturnQuantity] = useState("1");
  const [returnReason, setReturnReason] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<InventoryData>("/api/inventory");
      setData(result);
      const defaultWarehouse = result.warehouses.find((warehouse) => warehouse.isDefault)?.publicId || result.warehouses[0]?.publicId || "";
      setReceiptWarehouse((current) => current || defaultWarehouse);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible cargar el inventario.");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);

  const perform = async (payload: Record<string, unknown>, success: string) => {
    if (!online) { toast.error("Conéctese para confirmar movimientos de inventario."); return false; }
    setWorking(true);
    try {
      await api("/api/inventory", { method: "POST", body: JSON.stringify(payload) });
      await load();
      toast.success(success);
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar el inventario.");
      return false;
    } finally { setWorking(false); }
  };

  const createWarehouse = async () => {
    if (!warehouseCode.trim() || !warehouseName.trim()) return toast.error("Ingrese código y nombre de la bodega.");
    const saved = await perform({ action: "create_warehouse", code: warehouseCode, name: warehouseName, location: warehouseLocation, isDefault: !data?.warehouses.length }, "Bodega creada.");
    if (saved) {
      setWarehouseCode(""); setWarehouseName(""); setWarehouseLocation("");
    }
  };

  const receiveStock = async () => {
    const quantity = Number(receiptQuantity); const unitCost = Number(receiptUnitCost || 0); const minimumQuantity = Number(receiptMinimum || 0);
    if (!receiptWarehouse || !receiptItem || !Number.isFinite(quantity) || quantity <= 0) return toast.error("Seleccione bodega, material y cantidad.");
    if (!Number.isFinite(unitCost) || unitCost < 0) return toast.error("Revise el costo unitario.");
    const saved = await perform({ action: "receive_stock", warehousePublicId: receiptWarehouse, catalogItemPublicId: receiptItem, quantity, unitCost, minimumQuantity, reference: receiptReference, reason: "Recepción de material" }, "Entrada de stock valorizada.");
    if (saved) {
      setReceiptQuantity("1"); setReceiptUnitCost("0"); setReceiptReference("");
    }
  };

  const createSupplier = async () => {
    if (!supplierCode.trim() || !supplierName.trim()) return toast.error("Ingrese código y nombre del proveedor.");
    const saved = await perform({ action: "create_supplier", code: supplierCode, name: supplierName, taxId: supplierTaxId, contactName: supplierContact, email: supplierEmail, phone: supplierPhone, address: supplierAddress, paymentTerms: supplierTerms, currency: supplierCurrency }, "Proveedor guardado.");
    if (saved) {
      setSupplierCode(""); setSupplierName(""); setSupplierTaxId(""); setSupplierContact(""); setSupplierEmail(""); setSupplierPhone(""); setSupplierAddress(""); setSupplierTerms("");
    }
  };

  const openPurchase = (purchase: PurchaseRequest) => {
    setEditingPurchase(purchase); setPurchaseSupplier(purchase.supplierPublicId || ""); setPurchaseCurrency(purchase.currency || "CLP"); setPurchaseDiscount(String(purchase.discountPercent || 0)); setPurchaseTax(String(purchase.taxPercent ?? 19)); setPurchaseNotes(purchase.notes || "");
    setPurchaseCosts(Object.fromEntries(purchase.items.map((item) => [item.publicId, String(item.unitCost || data?.catalogItems.find((catalog) => catalog.publicId === item.catalogItemPublicId)?.unitCost || 0)])));
  };

  const savePurchase = async () => {
    if (!editingPurchase || !purchaseSupplier) return toast.error("Seleccione un proveedor.");
    const items = editingPurchase.items.map((item) => ({ publicId: item.publicId, unitCost: Number(purchaseCosts[item.publicId] || 0) }));
    if (items.some((item) => !Number.isFinite(item.unitCost) || item.unitCost < 0)) return toast.error("Revise los costos unitarios.");
    const saved = await perform({ action: "prepare_purchase", purchaseRequestPublicId: editingPurchase.publicId, supplierPublicId: purchaseSupplier, currency: purchaseCurrency, discountPercent: Number(purchaseDiscount || 0), taxPercent: Number(purchaseTax || 0), notes: purchaseNotes, items }, "Orden de compra preparada para aprobación.");
    if (saved) setEditingPurchase(null);
  };

  const openReceipt = (purchase: PurchaseRequest) => {
    setReceivingPurchase(purchase); setReceiptDocument("");
    setReceiptLines(Object.fromEntries(purchase.items.filter((item) => item.receivedQuantity < item.quantity).map((item) => [item.publicId, String(item.quantity - item.receivedQuantity)])));
  };

  const receivePurchase = async () => {
    if (!receivingPurchase || !receiptDocument.trim()) return toast.error("Ingrese la factura o guía de recepción.");
    const receipts = receivingPurchase.items.map((item) => ({ itemPublicId: item.publicId, quantity: Number(receiptLines[item.publicId] || 0) })).filter((item) => item.quantity > 0);
    if (!receipts.length) return toast.error("Ingrese al menos una cantidad recibida.");
    const saved = await perform({ action: "receive_purchase", purchaseRequestPublicId: receivingPurchase.publicId, reference: receiptDocument, receipts }, "Recepción registrada y stock actualizado.");
    if (saved) setReceivingPurchase(null);
  };

  const saveAdjustment = async () => {
    if (!adjusting) return;
    const newQuantity = Number(adjustQuantity); const minimumQuantity = Number(adjustMinimum);
    if (!Number.isFinite(newQuantity) || newQuantity < 0 || !adjustReason.trim()) return toast.error("Revise el saldo y escriba el motivo del ajuste.");
    const saved = await perform({ action: "adjust_stock", balancePublicId: adjusting.publicId, newQuantity, minimumQuantity, reason: adjustReason }, "Saldo ajustado con trazabilidad.");
    if (saved) {
      setAdjusting(null); setAdjustReason("");
    }
  };

  const returnMaterial = async () => {
    if (!returning) return;
    const quantity = Number(returnQuantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || !returnReason.trim()) return toast.error("Revise la cantidad y el motivo de devolución.");
    const saved = await perform({ action: "return_allocation", allocationPublicId: returning.publicId, quantity, reason: returnReason }, "Devolución ingresada a la bodega.");
    if (saved) {
      setReturning(null); setReturnReason(""); setReturnQuantity("1");
    }
  };

  if (loading && !data) return <div className="flex items-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="animate-spin" /> Cargando inventario y abastecimiento…</div>;
  if (!data) return null;
  const availableItems = data.balances.filter((balance) => availableStock(balance.quantity, balance.reservedQuantity) > 0).length;
  const reservedItems = data.balances.filter((balance) => balance.reservedQuantity > 0).length;
  const lowStock = data.balances.filter((balance) => inventoryHealth(balance.quantity, balance.reservedQuantity, balance.minimumQuantity) !== "Disponible").length;
  const warehouseNameById = new Map(data.warehouses.map((warehouse) => [warehouse.publicId, warehouse.name]));
  const balanceNameByKey = new Map(data.balances.map((balance) => [`${balance.warehousePublicId}:${balance.catalogItemPublicId}`, balance.itemName]));
  const movementLabels: Record<string, string> = { RECEIPT: "Entrada", ADJUSTMENT: "Ajuste", RESERVATION: "Reserva", RELEASE: "Liberación", ISSUE: "Entrega", RETURN: "Devolución" };
  const editingTotals = purchaseTotals(editingPurchase?.items.map((item) => ({ quantity: item.quantity, unitCost: Number(purchaseCosts[item.publicId] || 0) })) || [], Number(purchaseDiscount || 0), Number(purchaseTax || 0));

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <ExecutionMetric label="Materiales controlados" value={String(data.balances.length)} icon={Boxes} />
        <ExecutionMetric label="Ítems disponibles" value={String(availableItems)} icon={PackageCheck} />
        <ExecutionMetric label="Ítems con reserva" value={String(reservedItems)} icon={ClipboardCheck} />
        <ExecutionMetric label="Alertas de stock" value={String(lowStock)} icon={AlertTriangle} />
      </div>
      {!online && <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">El inventario se muestra en modo consulta. Reservas, entregas, devoluciones y compras requieren conexión para evitar saldos duplicados.</div>}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 lg:grid-cols-5">
          <TabsTrigger value="stock"><Warehouse /> Existencias</TabsTrigger>
          <TabsTrigger value="requests"><ClipboardCheck /> Solicitudes</TabsTrigger>
          <TabsTrigger value="purchases"><ShoppingCart /> Compras</TabsTrigger>
          <TabsTrigger value="suppliers"><BriefcaseBusiness /> Proveedores</TabsTrigger>
          <TabsTrigger value="movements"><GitBranch /> Movimientos</TabsTrigger>
        </TabsList>
        <TabsContent value="stock" className="mt-4 space-y-4">
          {data.canManage && <div className="grid gap-4 xl:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-base">Nueva bodega</CardTitle><CardDescription>Ubicación física independiente para controlar existencias.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><FieldControlled label="Código" value={warehouseCode} onChange={setWarehouseCode} placeholder="BOD-CEN" /><FieldControlled label="Nombre" value={warehouseName} onChange={setWarehouseName} placeholder="Bodega central" /><div className="sm:col-span-2"><FieldControlled label="Ubicación" value={warehouseLocation} onChange={setWarehouseLocation} placeholder="Dirección o sector" /></div><div className="sm:col-span-2 flex justify-end"><Button onClick={() => void createWarehouse()} disabled={working || !online}><Warehouse /> Crear bodega</Button></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-base">Entrada de material</CardTitle><CardDescription>Registra inventario inicial o reposiciones con su costo real.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Bodega</Label><select value={receiptWarehouse} onChange={(event) => setReceiptWarehouse(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccione</option>{data.warehouses.filter((warehouse) => warehouse.active).map((warehouse) => <option key={warehouse.publicId} value={warehouse.publicId}>{warehouse.code} · {warehouse.name}</option>)}</select></div><div className="space-y-2"><Label>Material de la biblioteca</Label><select value={receiptItem} onChange={(event) => { setReceiptItem(event.target.value); const item = data.catalogItems.find((candidate) => candidate.publicId === event.target.value); if (item) setReceiptUnitCost(String(item.unitCost)); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccione</option>{data.catalogItems.map((item) => <option key={item.publicId} value={item.publicId}>{item.code} · {item.name}</option>)}</select></div><FieldControlled label="Cantidad" value={receiptQuantity} onChange={setReceiptQuantity} type="number" /><FieldControlled label="Costo unitario" value={receiptUnitCost} onChange={setReceiptUnitCost} type="number" /><FieldControlled label="Stock mínimo" value={receiptMinimum} onChange={setReceiptMinimum} type="number" /><FieldControlled label="Referencia" value={receiptReference} onChange={setReceiptReference} placeholder="Factura, guía o inventario inicial" /><div className="sm:col-span-2 flex justify-end"><Button onClick={() => void receiveStock()} disabled={working || !online}><PackagePlus /> Registrar entrada</Button></div></CardContent></Card>
          </div>}
          <div className="overflow-x-auto rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>Material</TableHead><TableHead>Bodega</TableHead><TableHead className="text-right">Físico</TableHead><TableHead className="text-right">Reservado</TableHead><TableHead className="text-right">Disponible</TableHead><TableHead className="text-right">Costo prom.</TableHead><TableHead className="text-right">Valor</TableHead><TableHead>Estado</TableHead>{data.canManage && <TableHead />}</TableRow></TableHeader><TableBody>{data.balances.length ? data.balances.map((balance) => { const health = inventoryHealth(balance.quantity, balance.reservedQuantity, balance.minimumQuantity); return <TableRow key={balance.publicId}><TableCell><div className="font-medium">{balance.itemCode || "SIN-CÓDIGO"} · {balance.itemName}</div><div className="text-xs text-slate-500">Unidad: {balance.unit} · mínimo {balance.minimumQuantity}</div></TableCell><TableCell>{warehouseNameById.get(balance.warehousePublicId) || "Bodega"}</TableCell><TableCell className="text-right">{balance.quantity}</TableCell><TableCell className="text-right">{balance.reservedQuantity}</TableCell><TableCell className="text-right font-semibold">{availableStock(balance.quantity, balance.reservedQuantity)}</TableCell><TableCell className="text-right">{money(balance.averageUnitCost, "CLP")}</TableCell><TableCell className="text-right font-semibold">{money(balance.inventoryValue, "CLP")}</TableCell><TableCell><Badge variant="outline" className={health === "Disponible" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : health === "Stock bajo" ? "border-amber-200 bg-amber-50 text-amber-700" : "border-red-200 bg-red-50 text-red-700"}>{health}</Badge></TableCell>{data.canManage && <TableCell><Button variant="ghost" size="sm" onClick={() => { setAdjusting(balance); setAdjustQuantity(String(balance.quantity)); setAdjustMinimum(String(balance.minimumQuantity)); }}>Ajustar</Button></TableCell>}</TableRow>; }) : <TableRow><TableCell colSpan={data.canManage ? 9 : 8} className="h-28 text-center text-slate-500">Aún no hay existencias. Cree una bodega y registre la primera entrada.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>
        <TabsContent value="requests" className="mt-4 space-y-3">
          {data.materialRequests.length ? data.materialRequests.map((request) => {
            const warehouse = allocationWarehouses[request.publicId] || data.warehouses.find((item) => item.isDefault)?.publicId || data.warehouses[0]?.publicId || "";
            return <Card key={request.publicId}><CardContent className="pt-5"><div className="flex flex-col justify-between gap-4 xl:flex-row"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{request.order?.number || request.workOrderPublicId.slice(0, 8)} · {request.order?.project || "Orden de trabajo"}</span><Badge variant="outline" className={statusClass(request.status)}>{request.status}</Badge><Badge variant="outline">{request.urgency}</Badge></div><div className="mt-2 text-sm text-slate-700">{request.items.map((item) => `${item.quantity} ${item.unit} · ${item.description}`).join("; ")}</div><div className="mt-1 text-xs text-slate-500">Actividad: {request.activityTitle || request.activityPublicId.slice(0, 8)} · Solicitó {request.requestedBy}{request.neededDate ? ` · requerido ${request.neededDate}` : ""}</div>{request.justification && <div className="mt-2 text-xs text-slate-600">{request.justification}</div>}</div>{data.canManage && <div className="flex min-w-64 flex-col gap-2 sm:flex-row xl:justify-end">{["Pendiente", "Aprobada", "Compra requerida"].includes(request.status) && <><select value={warehouse} onChange={(event) => setAllocationWarehouses((current) => ({ ...current, [request.publicId]: event.target.value }))} className="h-9 rounded-md border bg-white px-2 text-sm">{data.warehouses.filter((item) => item.active).map((item) => <option key={item.publicId} value={item.publicId}>{item.name}</option>)}</select><Button size="sm" onClick={() => void perform({ action: "allocate_request", materialRequestPublicId: request.publicId, warehousePublicId: warehouse }, "Solicitud reservada o enviada a compra.")} disabled={working || !online || !warehouse}><PackageCheck /> Reservar</Button></>}{request.status === "Reservada" && <Button size="sm" onClick={() => void perform({ action: "issue_request", materialRequestPublicId: request.publicId }, "Material entregado al técnico.")} disabled={working || !online}><PackagePlus /> Entregar</Button>}</div>}</div>{request.allocations.length > 0 && <div className="mt-4 grid gap-2 sm:grid-cols-2">{request.allocations.map((allocation) => <div key={allocation.publicId} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 p-3 text-xs"><div><div className="font-semibold">{balanceNameByKey.get(`${allocation.warehousePublicId}:${allocation.catalogItemPublicId}`) || request.items.find((item) => item.publicId === allocation.materialRequestItemPublicId)?.description || "Material"}</div><div className="text-slate-500">Reservado {allocation.reservedQuantity} · entregado {allocation.issuedQuantity} · devuelto {allocation.returnedQuantity}</div></div>{data.canManage && allocation.issuedQuantity > allocation.returnedQuantity && <Button variant="ghost" size="sm" onClick={() => { setReturning(allocation); setReturnQuantity(String(allocation.issuedQuantity - allocation.returnedQuantity)); }}><RotateCcw /> Devolver</Button>}</div>)}</div>}</CardContent></Card>;
          }) : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No existen solicitudes de materiales.</div>}
        </TabsContent>
        <TabsContent value="purchases" className="mt-4 space-y-3">
          {data.purchases.length ? data.purchases.map((purchase) => (
            <Card key={purchase.publicId}>
              <CardContent className="space-y-4 pt-5">
                <div className="flex flex-col justify-between gap-4 xl:flex-row">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{purchase.number}</span><Badge variant="outline" className={purchase.status === "Recibida" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : purchase.status === "Cancelada" ? "border-red-200 bg-red-50 text-red-700" : purchase.status === "Aprobada" ? "border-blue-200 bg-blue-50 text-blue-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{purchase.status}</Badge>{purchase.total > 0 && <Badge variant="outline">{money(purchase.total, purchase.currency)}</Badge>}</div>
                    <div className="mt-1 text-xs text-slate-500">{purchase.order?.number || "Orden"} · {purchase.order?.project || "Abastecimiento"}{purchase.supplier ? ` · ${purchase.supplier}` : " · proveedor pendiente"}</div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.canManagePurchases && purchase.status === "Solicitada" && <Button size="sm" variant="outline" onClick={() => openPurchase(purchase)} disabled={working || !online}><PenLine /> Preparar</Button>}
                    {data.canApprovePurchases && purchase.status === "Solicitada" && Boolean(purchase.supplierPublicId) && <Button size="sm" onClick={() => void perform({ action: "approve_purchase", purchaseRequestPublicId: purchase.publicId, approvalNotes: "Aprobación registrada en SOLIS Cotizador PWA" }, "Orden de compra aprobada.")} disabled={working || !online}><ShieldCheck /> Aprobar</Button>}
                    {data.canManagePurchases && purchase.status === "Aprobada" && <Button size="sm" onClick={() => void perform({ action: "order_purchase", purchaseRequestPublicId: purchase.publicId }, "Orden de compra marcada como enviada.")} disabled={working || !online}><ShoppingCart /> Marcar enviada</Button>}
                    {data.canManagePurchases && ["Ordenada", "Recepción parcial"].includes(purchase.status) && <Button size="sm" onClick={() => openReceipt(purchase)} disabled={working || !online}><PackageCheck /> Recibir</Button>}
                  </div>
                </div>
                <div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Partida</TableHead><TableHead className="text-right">Ordenado</TableHead><TableHead className="text-right">Recibido</TableHead><TableHead className="text-right">Costo unit.</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{purchase.items.map((item) => <TableRow key={item.publicId}><TableCell>{item.description}<div className="text-xs text-slate-500">{item.unit}</div></TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell className="text-right">{item.receivedQuantity}</TableCell><TableCell className="text-right">{purchase.total > 0 ? money(item.unitCost, purchase.currency) : "Pendiente"}</TableCell><TableCell className="text-right font-medium">{purchase.total > 0 ? money(item.lineTotal, purchase.currency) : "-"}</TableCell></TableRow>)}</TableBody></Table></div>
                {purchase.approvedBy && <div className="text-xs text-slate-500">Aprobó {purchase.approvedBy} · {purchase.approvedAt.slice(0, 16).replace("T", " ")}</div>}
                {data.canDocumentPurchases && ["Aprobada", "Ordenada", "Recepción parcial", "Recibida"].includes(purchase.status) && <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setDocumentingPurchase(purchase)}><FileText /> PDF y versiones</Button></div>}
              </CardContent>
            </Card>
          )) : <div className="rounded-xl border border-dashed bg-white p-8 text-center text-sm text-slate-500">No hay solicitudes de compra. Se crearán automáticamente cuando una reserva no tenga stock suficiente.</div>}
        </TabsContent>
        <TabsContent value="suppliers" className="mt-4 space-y-4">
          {data.canManagePurchases && <Card><CardHeader><CardTitle className="text-base">Nuevo proveedor</CardTitle><CardDescription>Base reutilizable para preparar órdenes de compra sin volver a escribir los datos.</CardDescription></CardHeader><CardContent className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"><FieldControlled label="Código" value={supplierCode} onChange={setSupplierCode} placeholder="PRV-001" /><FieldControlled label="Razón social" value={supplierName} onChange={setSupplierName} /><FieldControlled label="RUT" value={supplierTaxId} onChange={setSupplierTaxId} /><FieldControlled label="Contacto" value={supplierContact} onChange={setSupplierContact} /><FieldControlled label="Correo" value={supplierEmail} onChange={setSupplierEmail} type="email" /><FieldControlled label="Teléfono" value={supplierPhone} onChange={setSupplierPhone} /><FieldControlled label="Dirección" value={supplierAddress} onChange={setSupplierAddress} /><FieldControlled label="Condición de pago" value={supplierTerms} onChange={setSupplierTerms} placeholder="30 días" /><div className="space-y-2"><Label>Moneda habitual</Label><select value={supplierCurrency} onChange={(event) => setSupplierCurrency(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{["CLP", "USD", "EUR", "UF"].map((currency) => <option key={currency}>{currency}</option>)}</select></div><div className="sm:col-span-2 xl:col-span-3 flex justify-end"><Button onClick={() => void createSupplier()} disabled={working || !online}><BriefcaseBusiness /> Guardar proveedor</Button></div></CardContent></Card>}
          <div className="overflow-x-auto rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>Proveedor</TableHead><TableHead>RUT</TableHead><TableHead>Contacto</TableHead><TableHead>Condición</TableHead><TableHead>Moneda</TableHead></TableRow></TableHeader><TableBody>{data.suppliers.length ? data.suppliers.map((supplier) => <TableRow key={supplier.publicId}><TableCell><div className="font-medium">{supplier.code} · {supplier.name}</div><div className="text-xs text-slate-500">{supplier.address || "Sin dirección"}</div></TableCell><TableCell>{supplier.taxId || "-"}</TableCell><TableCell><div>{supplier.contactName || "-"}</div><div className="text-xs text-slate-500">{supplier.email || supplier.phone}</div></TableCell><TableCell>{supplier.paymentTerms || "Por definir"}</TableCell><TableCell>{supplier.currency}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-slate-500">Aún no hay proveedores registrados.</TableCell></TableRow>}</TableBody></Table></div>
        </TabsContent>
        <TabsContent value="movements" className="mt-4"><div className="overflow-hidden rounded-xl border bg-white"><Table><TableHeader><TableRow><TableHead>Fecha</TableHead><TableHead>Movimiento</TableHead><TableHead>Material / bodega</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead>Responsable</TableHead></TableRow></TableHeader><TableBody>{data.movements.length ? data.movements.map((movement) => <TableRow key={movement.publicId}><TableCell className="text-xs">{movement.createdAt.slice(0, 16).replace("T", " ")}</TableCell><TableCell><Badge variant="outline">{movementLabels[movement.movementType] || movement.movementType}</Badge></TableCell><TableCell><div className="font-medium">{balanceNameByKey.get(`${movement.warehousePublicId}:${movement.catalogItemPublicId}`) || movement.catalogItemPublicId.slice(0, 8)}</div><div className="text-xs text-slate-500">{warehouseNameById.get(movement.warehousePublicId)} · {movement.reference || movement.reason}</div></TableCell><TableCell className="text-right">{movement.quantity}</TableCell><TableCell className="text-xs">{movement.actor}</TableCell></TableRow>) : <TableRow><TableCell colSpan={5} className="h-28 text-center text-slate-500">Sin movimientos registrados.</TableCell></TableRow>}</TableBody></Table></div></TabsContent>
      </Tabs>
      <Dialog open={Boolean(adjusting)} onOpenChange={(open) => { if (!open) setAdjusting(null); }}><DialogContent><DialogHeader><DialogTitle>Ajustar existencia</DialogTitle><DialogDescription>El ajuste queda registrado; no reemplaza ni elimina movimientos anteriores.</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-2"><FieldControlled label="Saldo físico" value={adjustQuantity} onChange={setAdjustQuantity} type="number" /><FieldControlled label="Stock mínimo" value={adjustMinimum} onChange={setAdjustMinimum} type="number" /><div className="sm:col-span-2"><FieldControlled label="Motivo obligatorio" value={adjustReason} onChange={setAdjustReason} placeholder="Conteo físico, merma o corrección documentada" /></div></div><DialogFooter><Button variant="outline" onClick={() => setAdjusting(null)}>Cancelar</Button><Button onClick={() => void saveAdjustment()} disabled={working || !online}>Guardar ajuste</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(returning)} onOpenChange={(open) => { if (!open) setReturning(null); }}><DialogContent><DialogHeader><DialogTitle>Devolver material</DialogTitle><DialogDescription>La devolución repone existencias y conserva el vínculo con la orden.</DialogDescription></DialogHeader><div className="space-y-3"><FieldControlled label="Cantidad" value={returnQuantity} onChange={setReturnQuantity} type="number" /><FieldControlled label="Motivo" value={returnReason} onChange={setReturnReason} placeholder="Sobrante sin uso, cambio de alcance…" /></div><DialogFooter><Button variant="outline" onClick={() => setReturning(null)}>Cancelar</Button><Button onClick={() => void returnMaterial()} disabled={working || !online}><RotateCcw /> Confirmar devolución</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(editingPurchase)} onOpenChange={(open) => { if (!open) setEditingPurchase(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Preparar orden de compra · {editingPurchase?.number}</DialogTitle><DialogDescription>Seleccione el proveedor e ingrese los costos cotizados. La aprobación congelará estos valores.</DialogDescription></DialogHeader>{editingPurchase && <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-3"><div className="space-y-2 sm:col-span-2"><Label>Proveedor</Label><select value={purchaseSupplier} onChange={(event) => { setPurchaseSupplier(event.target.value); const supplier = data.suppliers.find((item) => item.publicId === event.target.value); if (supplier) setPurchaseCurrency(supplier.currency); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccione</option>{data.suppliers.filter((supplier) => supplier.active).map((supplier) => <option key={supplier.publicId} value={supplier.publicId}>{supplier.code} · {supplier.name}</option>)}</select></div><div className="space-y-2"><Label>Moneda</Label><select value={purchaseCurrency} onChange={(event) => setPurchaseCurrency(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{["CLP", "USD", "EUR", "UF"].map((currency) => <option key={currency}>{currency}</option>)}</select></div></div><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Partida</TableHead><TableHead className="text-right">Cantidad</TableHead><TableHead className="text-right">Costo unitario</TableHead><TableHead className="text-right">Total</TableHead></TableRow></TableHeader><TableBody>{editingPurchase.items.map((item) => { const unitCost = Number(purchaseCosts[item.publicId] || 0); return <TableRow key={item.publicId}><TableCell>{item.description}<div className="text-xs text-slate-500">{item.unit}</div></TableCell><TableCell className="text-right">{item.quantity}</TableCell><TableCell><Input type="number" min="0" step="0.01" value={purchaseCosts[item.publicId] || "0"} onChange={(event) => setPurchaseCosts((current) => ({ ...current, [item.publicId]: event.target.value }))} className="ml-auto w-36 text-right" /></TableCell><TableCell className="text-right font-medium">{money(item.quantity * unitCost, purchaseCurrency)}</TableCell></TableRow>; })}</TableBody></Table></div><div className="grid gap-3 sm:grid-cols-3"><FieldControlled label="Descuento %" value={purchaseDiscount} onChange={setPurchaseDiscount} type="number" /><FieldControlled label="Impuesto %" value={purchaseTax} onChange={setPurchaseTax} type="number" /><div className="rounded-xl bg-slate-950 p-3 text-white"><div className="text-xs text-slate-400">Total orden</div><div className="text-xl font-bold text-amber-300">{money(editingTotals.total, purchaseCurrency)}</div></div></div><FieldControlled label="Notas al proveedor" value={purchaseNotes} onChange={setPurchaseNotes} placeholder="Plazo, despacho, referencia de oferta…" /></div>}<DialogFooter><Button variant="outline" onClick={() => setEditingPurchase(null)}>Cancelar</Button><Button onClick={() => void savePurchase()} disabled={working || !online || !purchaseSupplier}>Guardar para aprobación</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(receivingPurchase)} onOpenChange={(open) => { if (!open) setReceivingPurchase(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Recepción parcial · {receivingPurchase?.number}</DialogTitle><DialogDescription>Registre solamente lo recibido físicamente. El saldo pendiente quedará abierto.</DialogDescription></DialogHeader>{receivingPurchase && <div className="space-y-4"><FieldControlled label="Factura o guía" value={receiptDocument} onChange={setReceiptDocument} placeholder="F-12345 / GD-456" /><div className="overflow-x-auto rounded-lg border"><Table><TableHeader><TableRow><TableHead>Partida</TableHead><TableHead className="text-right">Pendiente</TableHead><TableHead className="text-right">Recibir ahora</TableHead></TableRow></TableHeader><TableBody>{receivingPurchase.items.filter((item) => item.receivedQuantity < item.quantity).map((item) => { const pending = item.quantity - item.receivedQuantity; return <TableRow key={item.publicId}><TableCell>{item.description}<div className="text-xs text-slate-500">{item.unit}</div></TableCell><TableCell className="text-right">{pending}</TableCell><TableCell><Input type="number" min="0" max={pending} step="0.01" value={receiptLines[item.publicId] || "0"} onChange={(event) => setReceiptLines((current) => ({ ...current, [item.publicId]: event.target.value }))} className="ml-auto w-32 text-right" /></TableCell></TableRow>; })}</TableBody></Table></div></div>}<DialogFooter><Button variant="outline" onClick={() => setReceivingPurchase(null)}>Cancelar</Button><Button onClick={() => void receivePurchase()} disabled={working || !online}><PackageCheck /> Confirmar recepción</Button></DialogFooter></DialogContent></Dialog>
      <Dialog open={Boolean(documentingPurchase)} onOpenChange={(open) => { if (!open) setDocumentingPurchase(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle>Documentos · {documentingPurchase?.number}</DialogTitle><DialogDescription>Emisiones internas versionadas de la orden de compra.</DialogDescription></DialogHeader>{documentingPurchase && <DocumentsPanel entityType="purchase_order" entityPublicId={documentingPurchase.publicId} actor="SOLIS" canGenerate={online} blockedMessage="Conéctese para emitir la orden de compra." />}</DialogContent></Dialog>
    </div>
  );
}

function OrderDialog({
  order,
  actor,
  canEdit,
  canAssign,
  canExecute,
  canDocument,
  showFinancials,
  assignableUsers,
  online,
  onOpenChange,
  onSaved,
  onQueued,
  onExecutionQueued,
}: {
  order: WorkOrder | null;
  actor: string;
  canEdit: boolean;
  canAssign: boolean;
  canExecute: boolean;
  canDocument: boolean;
  showFinancials: boolean;
  assignableUsers: AppUser[];
  online: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  onQueued: () => void;
  onExecutionQueued: () => void;
}) {
  const [assignedUserPublicId, setAssignedUserPublicId] = useState(order?.assignedUserPublicId || "");
  const [priority, setPriority] = useState<WorkOrder["priority"]>(order?.priority || "Normal");
  const [dueDate, setDueDate] = useState(order?.dueDate || "");
  const [status, setStatus] = useState(order?.status || "Pendiente");
  const [plannedStart, setPlannedStart] = useState(order?.plannedStart || "");
  const [plannedEnd, setPlannedEnd] = useState(order?.plannedEnd || "");
  const [notes, setNotes] = useState(order?.notes || "");
  const [saving, setSaving] = useState(false);
  if (!order) return null;
  const locked = Boolean(order.closedAt || order.status === "Cerrada");
  const editable = canEdit && !locked;
  const assignmentChanged =
    assignedUserPublicId !== (order.assignedUserPublicId || "") ||
    priority !== (order.priority || "Normal") ||
    dueDate !== (order.dueDate || "");
  const hasUnsavedChanges =
    assignmentChanged ||
    status !== order.status ||
    plannedStart !== order.plannedStart ||
    plannedEnd !== order.plannedEnd ||
    notes !== order.notes;
  const save = async () => {
    if (!editable) return;
    setSaving(true);
    try {
      const payload = {
        publicId: order.publicId,
        responsible: order.responsible,
        status,
        plannedStart,
        plannedEnd,
        notes,
      };
      if (assignmentChanged && !online) {
        throw new Error("La asignación, prioridad y fecha de compromiso requieren conexión.");
      }
      if (status === "Completada" && !online) {
        throw new Error("Conéctese para validar el checklist antes de cerrar la orden.");
      }
      const result = assignmentChanged
        ? await api<{ ok: true }>("/api/orders", {
            method: "PATCH",
            body: JSON.stringify({ ...payload, assignedUserPublicId, priority, dueDate }),
          }).then(() => ({ queued: false }))
        : await executeOrQueue("order.update", payload);
      if (result.queued) {
        toast.warning("Cambios de la orden guardados en la cola offline.");
        onQueued();
      } else {
        toast.success("Orden actualizada.");
        await onSaved();
      }
      onOpenChange(false);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible actualizar la orden.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>Orden de trabajo · {order.number}</DialogTitle>
          <DialogDescription>
            {order.clientName} · {order.project}
          </DialogDescription>
        </DialogHeader>
        {locked && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800"><LockKeyhole className="mr-2 inline size-4" />Orden cerrada por {order.closedBy || "SOLIS"}. Su ejecución y costos están congelados.</div>}
        <div className="grid gap-4 sm:grid-cols-2">
          {canAssign ? (
            <div className="space-y-2">
              <Label>Asignar a</Label>
              <select
                value={assignedUserPublicId}
                onChange={(event) => setAssignedUserPublicId(event.target.value)}
                disabled={!editable || !online}
                className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100"
              >
                <option value="">Sin asignar</option>
                {order.assignedUserPublicId && !assignableUsers.some((user) => user.publicId === order.assignedUserPublicId) && (
                  <option value={order.assignedUserPublicId}>{order.responsible || order.assignedUserEmail}</option>
                )}
                {assignableUsers.map((user) => (
                  <option key={user.publicId} value={user.publicId}>{user.name} · {ROLE_LABELS[user.role]}</option>
                ))}
              </select>
              {!online && <p className="text-xs text-amber-700">Conéctese para reasignar.</p>}
            </div>
          ) : (
            <div className="space-y-2">
              <Label>Asignado a</Label>
              <Input value={order.responsible || actor} disabled className="bg-slate-100" />
            </div>
          )}
          <div className="space-y-2">
            <Label>Estado</Label>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              disabled={!editable}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100"
            >
              {[
                "Pendiente",
                "Planificada",
                "En ejecución",
                "Completada",
                ...(locked ? ["Cerrada"] : []),
                "Cancelada",
              ].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Prioridad</Label>
            <select
              value={priority}
              onChange={(event) => setPriority(event.target.value as WorkOrder["priority"])}
              disabled={!canAssign || !editable || !online}
              className="h-10 w-full rounded-md border bg-white px-3 text-sm disabled:bg-slate-100"
            >
              {ORDER_PRIORITIES.map((value) => <option key={value}>{value}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Fecha de compromiso</Label>
            <Input
              type="date"
              value={dueDate}
              onChange={(event) => setDueDate(event.target.value)}
              disabled={!canAssign || !editable || !online}
            />
          </div>
          <div className="space-y-2">
            <Label>Inicio planificado</Label>
            <Input
              type="date"
              value={plannedStart}
              onChange={(event) => setPlannedStart(event.target.value)}
              disabled={!editable}
            />
          </div>
          <div className="space-y-2">
            <Label>Fin planificado</Label>
            <Input
              type="date"
              value={plannedEnd}
              onChange={(event) => setPlannedEnd(event.target.value)}
              disabled={!editable}
            />
          </div>
        </div>
        {showFinancials && (
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-700">
              Venta aprobada
            </div>
            <div className="mt-1 text-xl font-bold text-blue-950">
              {money(order.approvedSale, order.currency)}
            </div>
          </div>
        )}
        <div className="space-y-2">
          <Label>Instrucciones operativas</Label>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            disabled={!editable}
            className="min-h-24 w-full rounded-md border px-3 py-2 text-sm disabled:bg-slate-100"
          />
        </div>
        {canExecute && (
          <FieldExecutionPanel
            order={order}
            online={online}
            canWrite={editable}
            showFinancials={showFinancials}
            onQueued={onExecutionQueued}
          />
        )}
        {canDocument && (
          <DocumentsPanel
            entityType="work_order"
            entityPublicId={order.publicId}
            actor={actor}
            canGenerate={!editable || !hasUnsavedChanges}
            blockedMessage="Guarde los cambios de la orden antes de emitir el PDF."
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {editable ? "Cancelar" : "Cerrar"}
          </Button>
          {editable && (
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="animate-spin" />} Guardar cambios
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const ENTRY_LABELS: Record<ExecutionEntryType, string> = {
  hours: "Horas trabajadas",
  material: "Material utilizado",
  service: "Servicio externo",
  expense: "Otro gasto",
  note: "Observación técnica",
};

function FieldExecutionPanel({
  order,
  online,
  canWrite,
  showFinancials,
  onQueued,
}: {
  order: WorkOrder;
  online: boolean;
  canWrite: boolean;
  showFinancials: boolean;
  onQueued: () => void;
}) {
  const [data, setData] = useState<ExecutionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [activityTitle, setActivityTitle] = useState("");
  const [activityRequired, setActivityRequired] = useState(true);
  const [entryType, setEntryType] = useState<ExecutionEntryType>("hours");
  const [entryDescription, setEntryDescription] = useState("");
  const [entryQuantity, setEntryQuantity] = useState("1");
  const [entryUnit, setEntryUnit] = useState("h");
  const [entryUnitCost, setEntryUnitCost] = useState("0");
  const [entryDate, setEntryDate] = useState(today());
  const [evidenceCaption, setEvidenceCaption] = useState("");
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerRole, setCustomerRole] = useState("");
  const [signoffNotes, setSignoffNotes] = useState("");
  const [signature, setSignature] = useState("");
  const [activeTab, setActiveTab] = useState("checklist");
  const [templates, setTemplates] = useState<FieldTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("Mantenimiento");
  const [requestActivityId, setRequestActivityId] = useState("");
  const [requestDescription, setRequestDescription] = useState("");
  const [requestCatalogItem, setRequestCatalogItem] = useState("");
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [requestUnit, setRequestUnit] = useState("un");
  const [requestUrgency, setRequestUrgency] = useState<(typeof MATERIAL_URGENCIES)[number]>("Normal");
  const [requestNeededDate, setRequestNeededDate] = useState("");
  const [requestJustification, setRequestJustification] = useState("");
  const evidenceInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [execution, materialResult, templateResult] = await Promise.all([
        api<Omit<ExecutionData, "materialRequests" | "requestOptions" | "canApproveMaterials" | "canManageTemplates">>(`/api/order-execution?workOrderPublicId=${encodeURIComponent(order.publicId)}`),
        api<{ requests: MaterialRequest[]; requestOptions: MaterialRequestOption[]; canApprove: boolean }>(`/api/material-requests?workOrderPublicId=${encodeURIComponent(order.publicId)}`),
        api<{ templates: FieldTemplate[]; canManage: boolean }>("/api/field-templates"),
      ]);
      setData({ ...execution, materialRequests: materialResult.requests, requestOptions: materialResult.requestOptions, canApproveMaterials: materialResult.canApprove, canManageTemplates: templateResult.canManage });
      setTemplates(templateResult.templates);
      if (templateResult.templates[0]) setSelectedTemplate((current) => current || templateResult.templates[0].publicId);
    } catch (error) {
      if (online) toast.error(error instanceof Error ? error.message : "No fue posible cargar el control de terreno.");
    } finally {
      setLoading(false);
    }
  }, [online, order.publicId]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);

  const addActivity = async () => {
    if (!activityTitle.trim()) return toast.error("Escriba el nombre de la actividad.");
    setWorking(true);
    try {
      const payload = { action: "add_activity", workOrderPublicId: order.publicId, title: activityTitle, required: activityRequired, notes: "" };
      const result = await executeOrQueue("activity.create", payload);
      if (result.queued) {
        const pending: ExecutionActivity = { publicId: `pending:${crypto.randomUUID()}`, position: data?.activities.length || 0, title: activityTitle, required: activityRequired, completed: false, notes: "", completedAt: "", completedBy: "" };
        setData((current) => current ? { ...current, activities: [...current.activities, pending] } : current);
        onQueued();
        toast.warning("Actividad guardada para sincronizar.");
      } else {
        await load();
        toast.success("Actividad agregada.");
      }
      setActivityTitle("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible agregar la actividad.");
    } finally {
      setWorking(false);
    }
  };

  const updateActivity = async (activity: ExecutionActivity, completed: boolean) => {
    if (activity.publicId.startsWith("pending:")) return toast.error("Sincronice primero esta actividad para poder marcarla.");
    setData((current) => current ? { ...current, activities: current.activities.map((item) => item.publicId === activity.publicId ? { ...item, completed } : item) } : current);
    try {
      const result = await executeOrQueue("activity.update", {
        action: "update_activity",
        workOrderPublicId: order.publicId,
        activityPublicId: activity.publicId,
        completed,
        notes: activity.notes,
      });
      if (result.queued) {
        onQueued();
        toast.warning("Cambio de checklist guardado para sincronizar.");
      } else await load();
    } catch (error) {
      setData((current) => current ? { ...current, activities: current.activities.map((item) => item.publicId === activity.publicId ? activity : item) } : current);
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar la actividad.");
    }
  };

  const addEntry = async () => {
    const quantity = Number(entryQuantity);
    const unitCost = Number(entryUnitCost || 0);
    if (!entryDescription.trim() || !Number.isFinite(quantity) || quantity <= 0) return toast.error("Revise la descripción y la cantidad.");
    setWorking(true);
    try {
      const payload = { action: "add_entry", workOrderPublicId: order.publicId, entryType, description: entryDescription, quantity, unit: entryUnit, unitCost, entryDate };
      const result = await executeOrQueue("entry.create", payload);
      if (result.queued) {
        const pending: ExecutionEntry = { publicId: `pending:${crypto.randomUUID()}`, entryType, description: entryDescription, quantity, unit: entryUnit, unitCost: showFinancials ? unitCost : 0, total: showFinancials ? quantity * unitCost : 0, entryDate, recordedBy: "Pendiente" };
        setData((current) => current ? { ...current, entries: [pending, ...current.entries] } : current);
        onQueued();
        toast.warning("Registro guardado para sincronizar.");
      } else {
        await load();
        toast.success("Registro agregado.");
      }
      setEntryDescription("");
      setEntryQuantity("1");
      setEntryUnitCost("0");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible agregar el registro.");
    } finally {
      setWorking(false);
    }
  };

  const createFieldTemplate = async () => {
    if (!online) return toast.error("Conéctese para guardar una plantilla compartida.");
    if (!templateName.trim() || !data?.activities.length) return toast.error("Ingrese un nombre y agregue al menos una actividad.");
    setWorking(true);
    try {
      await api("/api/field-templates", { method: "POST", body: JSON.stringify({
        action: "create", name: templateName, category: templateCategory, description: `Creada desde ${order.number}`,
        activities: data.activities.map((activity) => ({ title: activity.title, required: activity.required, notes: activity.notes })),
      }) });
      setTemplateName("");
      await load();
      toast.success("Plantilla de terreno guardada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la plantilla.");
    } finally { setWorking(false); }
  };

  const applyFieldTemplate = async () => {
    if (!online) return toast.error("Conéctese para aplicar la plantilla de forma segura.");
    if (!selectedTemplate) return toast.error("Seleccione una plantilla.");
    setWorking(true);
    try {
      const result = await api<{ added: number }>("/api/field-templates", { method: "POST", body: JSON.stringify({ action: "apply", templatePublicId: selectedTemplate, workOrderPublicId: order.publicId }) });
      await load();
      toast.success(`${result.added} actividades agregadas a la orden.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible aplicar la plantilla.");
    } finally { setWorking(false); }
  };

  const createMaterialRequest = async () => {
    const quantity = Number(requestQuantity);
    const activity = data?.activities.find((item) => item.publicId === requestActivityId);
    if (!activity || activity.publicId.startsWith("pending:")) return toast.error("Seleccione una actividad sincronizada.");
    if (!requestDescription.trim() || !Number.isFinite(quantity) || quantity <= 0) return toast.error("Revise el material y la cantidad.");
    const payload = {
      action: "create", workOrderPublicId: order.publicId, activityPublicId: activity.publicId,
      urgency: requestUrgency, neededDate: requestNeededDate, justification: requestJustification,
      items: [{ description: requestDescription, quantity, unit: requestUnit, code: data?.requestOptions.find((item) => item.publicId === requestCatalogItem)?.code || "", catalogItemPublicId: requestCatalogItem }],
    };
    setWorking(true);
    try {
      const result = await executeOrQueue("material_request.create", payload);
      if (result.queued) {
        const pending: MaterialRequest = {
          publicId: `pending:${crypto.randomUUID()}`, activityPublicId: activity.publicId, activityTitle: activity.title,
          status: "Pendiente", urgency: requestUrgency, neededDate: requestNeededDate, justification: requestJustification,
          requestedBy: "Pendiente de sincronización", reviewedBy: "", reviewedAt: "", responseNotes: "", createdAt: new Date().toISOString(),
          items: [{ publicId: `pending:${crypto.randomUUID()}`, catalogItemPublicId: requestCatalogItem, description: requestDescription, quantity, unit: requestUnit, code: data?.requestOptions.find((item) => item.publicId === requestCatalogItem)?.code || "" }],
        };
        setData((current) => current ? { ...current, materialRequests: [pending, ...current.materialRequests] } : current);
        onQueued();
        toast.warning("Solicitud guardada para sincronizar.");
      } else {
        await load();
        toast.success("Solicitud enviada al supervisor.");
      }
      setRequestCatalogItem(""); setRequestDescription(""); setRequestQuantity("1"); setRequestJustification(""); setRequestNeededDate("");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible crear la solicitud.");
    } finally { setWorking(false); }
  };

  const reviewMaterialRequest = async (request: MaterialRequest, status: MaterialRequestStatus) => {
    if (!online) return toast.error("Conéctese para confirmar la decisión.");
    if (request.publicId.startsWith("pending:")) return toast.error("La solicitud aún no se ha sincronizado.");
    setWorking(true);
    try {
      await api("/api/material-requests", { method: "PATCH", body: JSON.stringify({ publicId: request.publicId, status, responseNotes: "" }) });
      await load();
      toast.success(`Solicitud marcada como ${status.toLowerCase()}.`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible actualizar la solicitud.");
    } finally { setWorking(false); }
  };

  const uploadEvidence = async () => {
    if (!online) return toast.error("Conéctese para subir fotografías.");
    if (!evidenceFile) return toast.error("Seleccione una fotografía.");
    setWorking(true);
    try {
      const form = new FormData();
      form.set("workOrderPublicId", order.publicId);
      form.set("caption", evidenceCaption);
      form.set("file", evidenceFile);
      await apiForm("/api/order-evidence", form);
      setEvidenceFile(null);
      setEvidenceCaption("");
      if (evidenceInput.current) evidenceInput.current.value = "";
      await load();
      toast.success("Evidencia guardada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible subir la evidencia.");
    } finally {
      setWorking(false);
    }
  };

  const saveSignoff = async () => {
    if (!online) return toast.error("Conéctese para guardar la conformidad firmada.");
    if (!customerName.trim() || !signature) return toast.error("Ingrese el nombre del receptor y su firma.");
    setWorking(true);
    try {
      await api("/api/order-signoff", { method: "POST", body: JSON.stringify({ workOrderPublicId: order.publicId, customerName, customerRole, notes: signoffNotes, signatureDataUrl: signature }) });
      setCustomerName("");
      setCustomerRole("");
      setSignoffNotes("");
      setSignature("");
      await load();
      toast.success("Conformidad registrada.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No fue posible guardar la conformidad.");
    } finally {
      setWorking(false);
    }
  };

  const metrics = data ? executionMetrics(data.activities, data.entries) : null;
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 sm:p-5">
      <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-slate-950"><Wrench className="size-4 text-amber-600" /> Control de ejecución en terreno</div>
          <div className="mt-1 text-xs text-slate-500">Checklist, recursos, evidencias y recepción del trabajo.</div>
        </div>
        {!online && <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700">Checklist y registros en cola offline</Badge>}
      </div>
      {loading && !data ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500"><Loader2 className="animate-spin" /> Cargando control de terreno…</div>
      ) : (
        <>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <ExecutionMetric label="Avance obligatorio" value={`${metrics?.progressPercent || 0}%`} icon={ListChecks} />
            <ExecutionMetric label="Horas registradas" value={String(metrics?.hours || 0)} icon={BriefcaseBusiness} />
            <ExecutionMetric label="Materiales" value={String(metrics?.materialEntries || 0)} icon={PackagePlus} />
            <ExecutionMetric label="Solicitudes pendientes" value={String(pendingMaterialRequests(data?.materialRequests || []))} icon={ClipboardCheck} />
            <ExecutionMetric label="Evidencias" value={String(data?.evidence.length || 0)} icon={Camera} />
          </div>
          <Progress value={metrics?.progressPercent || 0} className="mb-5 h-2.5" />
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-5">
              <TabsTrigger value="checklist"><ListChecks /> Checklist</TabsTrigger>
              <TabsTrigger value="resources"><PackagePlus /> Recursos</TabsTrigger>
              <TabsTrigger value="requests"><ClipboardCheck /> Solicitudes</TabsTrigger>
              <TabsTrigger value="evidence"><Camera /> Evidencias</TabsTrigger>
              <TabsTrigger value="signoff"><PenLine /> Conformidad</TabsTrigger>
            </TabsList>
            <TabsContent value="checklist" className="mt-4 space-y-3">
              <div className="grid gap-3 rounded-xl border border-blue-100 bg-blue-50/60 p-3 md:grid-cols-[1fr_auto] md:items-end">
                <div className="space-y-2">
                  <Label>Plantilla de trabajo en terreno</Label>
                  <select value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">
                    <option value="">Seleccione una plantilla</option>
                    {templates.map((template) => <option key={template.publicId} value={template.publicId}>{template.category} · {template.name} ({template.activities.length})</option>)}
                  </select>
                </div>
                <Button variant="outline" onClick={() => void applyFieldTemplate()} disabled={!canWrite || working || !selectedTemplate || !online}><BookOpen /> Agregar a la orden</Button>
                {!templates.length && <div className="text-xs text-slate-500 md:col-span-2">Todavía no existen plantillas. Un supervisor puede guardar el checklist actual como plantilla reutilizable.</div>}
              </div>
              {data?.activities.length ? data.activities.map((activity) => (
                <div key={activity.publicId} className="flex items-start gap-3 rounded-xl border bg-white p-3">
                  <Checkbox checked={activity.completed} disabled={!canWrite} onCheckedChange={(checked) => void updateActivity(activity, checked === true)} className="mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className={`text-sm font-medium ${activity.completed ? "text-slate-400 line-through" : "text-slate-900"}`}>{activity.title}</div>
                    <div className="mt-1 text-xs text-slate-500">{activity.required ? "Obligatoria" : "Opcional"}{activity.completedAt ? ` · ${activity.completedAt.slice(0, 16).replace("T", " ")} · ${activity.completedBy}` : ""}</div>
                    {activity.notes && <div className="mt-1 text-xs text-slate-600">{activity.notes}</div>}
                  </div>
                  {canWrite && !activity.publicId.startsWith("pending:") && <Button type="button" variant="ghost" size="sm" onClick={() => { setRequestActivityId(activity.publicId); setActiveTab("requests"); }}><PackagePlus /> Solicitar</Button>}
                </div>
              )) : <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">Agregue las actividades que debe comprobar el técnico.</div>}
              {canWrite && (
                <div className="grid gap-2 rounded-xl border bg-white p-3 sm:grid-cols-[1fr_auto_auto] sm:items-center">
                  <Input value={activityTitle} onChange={(event) => setActivityTitle(event.target.value)} placeholder="Nueva actividad o comprobación" />
                  <label className="flex items-center gap-2 text-xs text-slate-600"><Checkbox checked={activityRequired} onCheckedChange={(checked) => setActivityRequired(checked === true)} /> Obligatoria</label>
                  <Button size="sm" onClick={() => void addActivity()} disabled={working}><Plus /> Agregar</Button>
                </div>
              )}
              {data?.canManageTemplates && canWrite && data.activities.length > 0 && (
                <div className="grid gap-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3 md:grid-cols-[1fr_180px_auto] md:items-end">
                  <div className="space-y-2"><Label>Guardar checklist actual como plantilla</Label><Input value={templateName} onChange={(event) => setTemplateName(event.target.value)} placeholder="Ej.: Mantenimiento preventivo de tablero" /></div>
                  <div className="space-y-2"><Label>Categoría</Label><select value={templateCategory} onChange={(event) => setTemplateCategory(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option>Mantenimiento</option><option>Visita técnica</option><option>Levantamiento</option><option>Diagnóstico</option><option>Instrumentación</option><option>Automatización</option><option>General</option></select></div>
                  <Button onClick={() => void createFieldTemplate()} disabled={working || !online}><BookOpen /> Guardar plantilla</Button>
                </div>
              )}
            </TabsContent>
            <TabsContent value="resources" className="mt-4 space-y-4">
              {canWrite && (
                <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-3">
                  <div className="space-y-2"><Label>Tipo</Label><select value={entryType} onChange={(event) => { const value = event.target.value as ExecutionEntryType; setEntryType(value); setEntryUnit(value === "hours" ? "h" : value === "note" ? "reg" : "un"); if (value === "note") setEntryQuantity("1"); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{EXECUTION_ENTRY_TYPES.map((value) => <option key={value} value={value}>{ENTRY_LABELS[value]}</option>)}</select></div>
                  <div className="space-y-2 md:col-span-2"><Label>Descripción</Label><Input value={entryDescription} onChange={(event) => setEntryDescription(event.target.value)} placeholder={entryType === "hours" ? "Trabajo realizado" : "Material o servicio utilizado"} /></div>
                  <div className="space-y-2"><Label>Cantidad</Label><Input type="number" min="0.01" step="0.01" value={entryQuantity} onChange={(event) => setEntryQuantity(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Unidad</Label><Input value={entryUnit} onChange={(event) => setEntryUnit(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Fecha</Label><Input type="date" value={entryDate} onChange={(event) => setEntryDate(event.target.value)} /></div>
                  {showFinancials && <div className="space-y-2"><Label>Costo unitario interno</Label><Input type="number" min="0" value={entryUnitCost} onChange={(event) => setEntryUnitCost(event.target.value)} /></div>}
                  <div className="flex items-end"><Button onClick={() => void addEntry()} disabled={working} className="w-full"><Plus /> Registrar</Button></div>
                </div>
              )}
              <div className="overflow-hidden rounded-xl border bg-white">
                <Table><TableHeader><TableRow><TableHead>Tipo / descripción</TableHead><TableHead>Fecha</TableHead><TableHead className="text-right">Cantidad</TableHead>{showFinancials && <TableHead className="text-right">Costo</TableHead>}</TableRow></TableHeader><TableBody>
                  {data?.entries.length ? data.entries.map((entry) => <TableRow key={entry.publicId}><TableCell><div className="font-medium">{ENTRY_LABELS[entry.entryType]}</div><div className="text-xs text-slate-500">{entry.description} · {entry.recordedBy || "SOLIS"}</div></TableCell><TableCell className="text-xs">{entry.entryDate}</TableCell><TableCell className="text-right">{entry.quantity} {entry.unit}</TableCell>{showFinancials && <TableCell className="text-right">{money(entry.total, order.currency)}</TableCell>}</TableRow>) : <TableRow><TableCell colSpan={showFinancials ? 4 : 3} className="h-24 text-center text-slate-500">Sin registros de terreno.</TableCell></TableRow>}
                </TableBody></Table>
              </div>
            </TabsContent>
            <TabsContent value="requests" className="mt-4 space-y-4">
              {canWrite && (
                <div className="grid gap-3 rounded-xl border bg-white p-4 md:grid-cols-3">
                  <div className="space-y-2 md:col-span-2"><Label>Actividad asociada</Label><select value={requestActivityId} onChange={(event) => setRequestActivityId(event.target.value)} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccione la tarea que necesita el material</option>{data?.activities.filter((activity) => !activity.publicId.startsWith("pending:")).map((activity) => <option key={activity.publicId} value={activity.publicId}>{activity.title}</option>)}</select></div>
                  <div className="space-y-2"><Label>Urgencia</Label><select value={requestUrgency} onChange={(event) => setRequestUrgency(event.target.value as (typeof MATERIAL_URGENCIES)[number])} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{MATERIAL_URGENCIES.map((urgency) => <option key={urgency}>{urgency}</option>)}</select></div>
                  <div className="space-y-2 md:col-span-2"><Label>Material de inventario o biblioteca</Label><select value={requestCatalogItem} onChange={(event) => { const value = event.target.value; setRequestCatalogItem(value); const option = data?.requestOptions.find((item) => item.publicId === value); if (option) { setRequestDescription(option.name); setRequestUnit(option.unit); } }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Material no catalogado / compra especial</option>{data?.requestOptions.map((item) => <option key={item.publicId} value={item.publicId}>{item.code} · {item.name} · disponible {item.available} {item.unit}</option>)}</select></div>
                  <div className="space-y-2"><Label>Descripción o especificación</Label><Input value={requestDescription} onChange={(event) => setRequestDescription(event.target.value)} placeholder="Modelo, medida o requisito técnico" /></div>
                  <div className="space-y-2"><Label>Fecha necesaria</Label><Input type="date" value={requestNeededDate} onChange={(event) => setRequestNeededDate(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Cantidad</Label><Input type="number" min="0.01" step="0.01" value={requestQuantity} onChange={(event) => setRequestQuantity(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Unidad</Label><Input value={requestUnit} onChange={(event) => setRequestUnit(event.target.value)} /></div>
                  <div className="space-y-2"><Label>Justificación</Label><Input value={requestJustification} onChange={(event) => setRequestJustification(event.target.value)} placeholder="Motivo o condición detectada" /></div>
                  <div className="flex items-end md:col-span-3 md:justify-end"><Button onClick={() => void createMaterialRequest()} disabled={working}><PackagePlus /> Enviar solicitud</Button></div>
                </div>
              )}
              {!online && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Puede crear solicitudes sin conexión. La aprobación y entrega requieren conexión para evitar decisiones duplicadas.</div>}
              <div className="space-y-3">
                {data?.materialRequests.length ? data.materialRequests.map((request) => (
                  <div key={request.publicId} className="rounded-xl border bg-white p-4">
                    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold text-slate-950">{request.items.map((item) => `${item.quantity} ${item.unit} · ${item.description}`).join("; ")}</span><Badge variant="outline" className={request.status === "Aprobada" || request.status === "Entregada" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : request.status === "Rechazada" || request.status === "Cancelada" ? "border-red-200 bg-red-50 text-red-700" : "border-amber-200 bg-amber-50 text-amber-700"}>{request.status}</Badge><Badge variant="outline">{request.urgency}</Badge></div>
                        <div className="mt-1 text-xs text-slate-500">Actividad: {request.activityTitle} · Solicitó {request.requestedBy}{request.neededDate ? ` · Necesario ${request.neededDate}` : ""}</div>
                        {request.justification && <div className="mt-2 text-sm text-slate-600">{request.justification}</div>}
                        {request.reviewedBy && <div className="mt-2 text-xs text-slate-500">Revisó {request.reviewedBy} · {request.reviewedAt.slice(0, 16).replace("T", " ")}{request.responseNotes ? ` · ${request.responseNotes}` : ""}</div>}
                      </div>
                      {data.canApproveMaterials && request.status === "Pendiente" && !request.publicId.startsWith("pending:") && <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={() => void reviewMaterialRequest(request, "Aprobada")} disabled={working || !online}>Aprobar necesidad</Button><Button size="sm" variant="outline" onClick={() => void reviewMaterialRequest(request, "Rechazada")} disabled={working || !online}>Rechazar</Button></div>}
                    </div>
                  </div>
                )) : <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">No hay solicitudes de material para esta orden.</div>}
              </div>
            </TabsContent>
            <TabsContent value="evidence" className="mt-4 space-y-4">
              {canWrite && <div className="grid gap-3 rounded-xl border bg-white p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><div className="space-y-2"><Label>Fotografía</Label><Input ref={evidenceInput} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => setEvidenceFile(event.target.files?.[0] || null)} /></div><div className="space-y-2"><Label>Descripción</Label><Input value={evidenceCaption} onChange={(event) => setEvidenceCaption(event.target.value)} placeholder="Antes, durante o después" /></div><Button onClick={() => void uploadEvidence()} disabled={working || !online}><Camera /> Subir</Button></div>}
              {!online && <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Las fotografías requieren conexión; no cierre la app hasta poder subirlas.</div>}
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{data?.evidence.length ? data.evidence.map((item) => <a key={item.publicId} href={`/api/order-evidence/${item.publicId}`} target="_blank" rel="noreferrer" className="overflow-hidden rounded-xl border bg-white transition hover:border-amber-300"><Image src={`/api/order-evidence/${item.publicId}`} alt={item.caption || item.fileName} width={480} height={256} unoptimized className="h-32 w-full object-cover" /><div className="p-3"><div className="truncate text-sm font-semibold">{item.caption || item.fileName}</div><div className="mt-1 text-[11px] text-slate-500">{item.createdAt.slice(0, 16).replace("T", " ")} · {item.createdBy}</div></div></a>) : <div className="col-span-full rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500"><ImageIcon className="mx-auto mb-2 size-6" />Aún no hay evidencias.</div>}</div>
            </TabsContent>
            <TabsContent value="signoff" className="mt-4 space-y-4">
              <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-800">Esta aceptación deja trazabilidad operativa. No corresponde a una firma electrónica avanzada certificada.</div>
              {canWrite && <div className="grid gap-4 rounded-xl border bg-white p-4 md:grid-cols-2"><div className="space-y-3"><FieldControlled label="Nombre de quien recibe" value={customerName} onChange={setCustomerName} /><FieldControlled label="Cargo o relación" value={customerRole} onChange={setCustomerRole} placeholder="Ej.: Supervisor del cliente" /><div className="space-y-2"><Label>Observación de recepción</Label><textarea value={signoffNotes} onChange={(event) => setSignoffNotes(event.target.value)} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" /></div></div><SignaturePad value={signature} onChange={setSignature} /><div className="md:col-span-2 flex justify-end"><Button onClick={() => void saveSignoff()} disabled={working || !online}><PenLine /> Registrar conformidad</Button></div></div>}
              <div className="space-y-2">{data?.signoffs.length ? data.signoffs.map((item) => <div key={item.publicId} className="flex items-center justify-between gap-3 rounded-xl border bg-white p-3"><div><div className="text-sm font-semibold">{item.customerName}</div><div className="text-xs text-slate-500">{item.customerRole || "Receptor"} · {item.signedAt.slice(0, 16).replace("T", " ")}</div>{item.notes && <div className="mt-1 text-xs text-slate-600">{item.notes}</div>}</div><Button asChild variant="outline" size="sm"><a href={`/api/order-signoff/${item.publicId}`} target="_blank" rel="noreferrer">Ver firma</a></Button></div>) : <div className="rounded-xl border border-dashed bg-white p-6 text-center text-sm text-slate-500">La orden aún no tiene conformidad registrada.</div>}</div>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}

function ExecutionMetric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Camera }) {
  return <div className="flex items-center justify-between rounded-xl border bg-white p-3"><div><div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div><div className="mt-1 text-xl font-bold text-slate-950">{value}</div></div><Icon className="size-5 text-amber-600" /></div>;
}

function SignaturePad({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const point = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const width = Math.max(280, canvas.getBoundingClientRect().width);
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(160 * ratio);
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(ratio, ratio);
    context.fillStyle = "white";
    context.fillRect(0, 0, width, 160);
    context.strokeStyle = "#0f172a";
    context.lineWidth = 2.2;
    context.lineCap = "round";
    context.lineJoin = "round";
  }, []);
  useEffect(() => {
    if (value) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
  }, [value]);
  const start = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    drawing.current = true;
  };
  const move = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const context = event.currentTarget.getContext("2d");
    if (!context) return;
    const current = point(event);
    context.lineTo(current.x, current.y);
    context.stroke();
  };
  const finish = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(event.currentTarget.toDataURL("image/png"));
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    onChange("");
  };
  return <div className="space-y-2"><div className="flex items-center justify-between"><Label>Firma en pantalla</Label><Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!value}>Limpiar</Button></div><canvas ref={canvasRef} onPointerDown={start} onPointerMove={move} onPointerUp={finish} onPointerCancel={finish} className="h-40 w-full touch-none rounded-xl border bg-white" aria-label="Área para firma manuscrita" /><p className="text-xs text-slate-500">Solicite al receptor firmar con el dedo o lápiz táctil.</p></div>;
}

const BILLING_CONCEPT_OPTIONS = ["Anticipo", "Avance", "Saldo final", "Servicio", "Otro"] as const;
const PAYMENT_METHOD_OPTIONS = ["Transferencia", "Tarjeta", "Efectivo", "Cheque", "Otro"] as const;

function BillingPanel({ online, actor }: { online: boolean; actor: string }) {
  const [data, setData] = useState<BillingData>({ documents: [], orders: [], summaryByCurrency: {}, canManage: false, canRecordPayments: false, canDocument: false, notice: "" });
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [selected, setSelected] = useState<BillingDocument | null>(null);
  const [currency, setCurrency] = useState("CLP");
  const [saving, setSaving] = useState(false);
  const [workOrderPublicId, setWorkOrderPublicId] = useState("");
  const [concept, setConcept] = useState<(typeof BILLING_CONCEPT_OPTIONS)[number]>("Anticipo");
  const [issueDate, setIssueDate] = useState(today());
  const [dueDate, setDueDate] = useState(() => { const date = new Date(); date.setUTCDate(date.getUTCDate() + 15); return date.toISOString().slice(0, 10); });
  const [netAmount, setNetAmount] = useState(0);
  const [taxPercent, setTaxPercent] = useState(19);
  const [notes, setNotes] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentDate, setPaymentDate] = useState(today());
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHOD_OPTIONS)[number]>("Transferencia");
  const [paymentReference, setPaymentReference] = useState("");
  const [voidReason, setVoidReason] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<BillingData>("/api/billing");
      setData(result);
      const currencies = Object.keys(result.summaryByCurrency);
      if (currencies.length && !currencies.includes(currency)) setCurrency(currencies.includes("CLP") ? "CLP" : currencies[0]);
      setSelected((current) => current ? result.documents.find((document) => document.publicId === current.publicId) || null : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible cargar la cobranza."); }
    finally { setLoading(false); }
  }, [currency]);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const order = data.orders.find((item) => item.publicId === workOrderPublicId);
  const summary = data.summaryByCurrency[currency] || { billed: 0, collected: 0, receivable: 0, overdue: 0 };
  const createDocument = async () => {
    setSaving(true);
    try {
      await api("/api/billing", { method: "POST", body: JSON.stringify({ action: "create", workOrderPublicId, concept, issueDate, dueDate, netAmount, taxPercent, notes }) });
      toast.success("Documento de cobro creado como borrador."); setCreateOpen(false); setWorkOrderPublicId(""); setNetAmount(0); setNotes(""); await load();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible crear el documento."); }
    finally { setSaving(false); }
  };
  const action = async (payload: Record<string, unknown>, success: string) => {
    setSaving(true);
    try { await api("/api/billing", { method: "POST", body: JSON.stringify(payload) }); toast.success(success); await load(); }
    catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible completar la acción."); }
    finally { setSaving(false); }
  };
  const cards: Array<[string, number, string]> = [["Documentado", summary.billed, "text-slate-950"], ["Cobrado", summary.collected, "text-emerald-700"], ["Por cobrar", summary.receivable, "text-amber-700"], ["Vencido", summary.overdue, "text-red-700"]];
  return <section className="space-y-5">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Cobranza y flujo de caja</h1><p className="mt-1 text-sm text-slate-500">Anticipos, avances, pagos parciales, vencimientos y saldo comercial por proyecto.</p></div><div className="flex gap-2"><select value={currency} onChange={(event) => setCurrency(event.target.value)} className="h-10 rounded-md border bg-white px-3 text-sm">{Object.keys(data.summaryByCurrency).length ? Object.keys(data.summaryByCurrency).map((value) => <option key={value}>{value}</option>) : <option>CLP</option>}</select>{data.canManage && <Button onClick={() => setCreateOpen(true)} disabled={!online}><Plus />Documento de cobro</Button>}</div></div>
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900"><ShieldCheck className="mr-2 inline size-4" />{data.notice || "Este módulo controla cobros internos; la emisión tributaria DTE se integrará por separado."}</div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(([label, value, tone]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label} · {currency}</CardDescription><CardTitle className={`text-xl ${tone}`}>{money(value, currency)}</CardTitle></CardHeader></Card>)}</div>
    <Card><CardHeader><CardTitle>Documentos y pagos</CardTitle><CardDescription>{data.documents.filter((document) => document.status === "Vencida").length} vencidos · {data.documents.filter((document) => document.status === "Pagada").length} pagados</CardDescription></CardHeader><CardContent>{loading ? <LoadingState /> : data.documents.length ? <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Documento</TableHead><TableHead>Cliente / proyecto</TableHead><TableHead>Vence</TableHead><TableHead>Total</TableHead><TableHead>Cobrado</TableHead><TableHead>Saldo</TableHead><TableHead>Estado</TableHead></TableRow></TableHeader><TableBody>{data.documents.map((document) => <TableRow key={document.publicId} className="cursor-pointer" onClick={() => { setSelected(document); setPaymentAmount(document.balance); }}><TableCell><div className="font-semibold">{document.number}</div><div className="text-xs text-slate-500">{document.concept}</div></TableCell><TableCell><div>{document.clientName}</div><div className="text-xs text-slate-500">{document.project}</div></TableCell><TableCell>{document.dueDate}</TableCell><TableCell>{money(document.totalAmount, document.currency)}</TableCell><TableCell className="text-emerald-700">{money(document.paidAmount, document.currency)}</TableCell><TableCell className={document.balance > 0 ? "font-semibold text-amber-700" : "text-slate-500"}>{money(document.balance, document.currency)}</TableCell><TableCell><Badge variant="outline" className={document.status === "Vencida" ? "border-red-200 bg-red-50 text-red-700" : document.status === "Pagada" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "bg-white"}>{document.status}</Badge></TableCell></TableRow>)}</TableBody></Table></div> : <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Aún no existen documentos de cobro.</div>}</CardContent></Card>
    <Dialog open={createOpen} onOpenChange={setCreateOpen}><DialogContent className="sm:max-w-xl"><DialogHeader><DialogTitle>Nuevo documento de cobro</DialogTitle><DialogDescription>El monto neto acumulado no puede superar la venta aprobada de la orden.</DialogDescription></DialogHeader><div className="space-y-4"><div className="space-y-2"><Label>Orden de trabajo</Label><select value={workOrderPublicId} onChange={(event) => { setWorkOrderPublicId(event.target.value); const target = data.orders.find((item) => item.publicId === event.target.value); if (target) setNetAmount(target.availableNet); }} className="h-10 w-full rounded-md border bg-white px-3 text-sm"><option value="">Seleccione…</option>{data.orders.filter((item) => item.availableNet > 0).map((item) => <option key={item.publicId} value={item.publicId}>{item.number} · {item.clientName} · disponible {money(item.availableNet, item.currency)}</option>)}</select>{order && <p className="text-xs text-slate-500">Venta neta aprobada: {money(order.approvedSale, order.currency)} · comprometido: {money(order.committedNet, order.currency)}</p>}</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Concepto</Label><select value={concept} onChange={(event) => setConcept(event.target.value as typeof concept)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{BILLING_CONCEPT_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></div><div className="space-y-2"><Label>Monto neto</Label><Input type="number" min="0" value={netAmount || ""} onChange={(event) => setNetAmount(Number(event.target.value))} /></div><div className="space-y-2"><Label>Emisión</Label><Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} /></div><div className="space-y-2"><Label>Vencimiento</Label><Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></div><div className="space-y-2"><Label>IVA referencial (%)</Label><Input type="number" min="0" max="100" value={taxPercent} onChange={(event) => setTaxPercent(Number(event.target.value))} /></div><div className="rounded-lg bg-slate-50 p-3 text-sm"><div className="text-xs text-slate-500">Total con IVA</div><div className="font-bold">{money(netAmount * (1 + taxPercent / 100), order?.currency || "CLP")}</div></div></div><div className="space-y-2"><Label>Observaciones</Label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-20 w-full rounded-md border px-3 py-2 text-sm" /></div></div><DialogFooter><Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button><Button onClick={createDocument} disabled={!online || !workOrderPublicId || netAmount <= 0 || saving}>{saving && <Loader2 className="animate-spin" />}Crear borrador</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">{selected && <><DialogHeader><DialogTitle>{selected.number} · {selected.status}</DialogTitle><DialogDescription>{selected.clientName} · {selected.project} · {selected.concept}</DialogDescription></DialogHeader><div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Total</div><div className="font-bold">{money(selected.totalAmount, selected.currency)}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Cobrado</div><div className="font-bold text-emerald-700">{money(selected.paidAmount, selected.currency)}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Saldo</div><div className="font-bold text-amber-700">{money(selected.balance, selected.currency)}</div></div></div>
      {selected.payments.length > 0 && <div className="space-y-2"><div className="text-sm font-semibold">Pagos registrados</div>{selected.payments.map((payment) => <div key={payment.publicId} className="flex justify-between rounded-lg border p-3 text-sm"><div><div className="font-medium">{payment.paymentDate} · {payment.method}</div><div className="text-xs text-slate-500">{payment.reference} · {payment.recordedBy}</div></div><div className="font-bold text-emerald-700">{money(payment.amount, selected.currency)}</div></div>)}</div>}
      {selected.status === "Borrador" && data.canManage && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><div className="text-sm font-semibold">Borrador no emitido</div><p className="mt-1 text-xs text-amber-900">Revise monto, fechas y cliente. Después de emitir podrá registrar pagos.</p><Button className="mt-3" onClick={() => void action({ action: "issue", publicId: selected.publicId }, "Documento emitido.")} disabled={!online || saving}><FileCheck2 />Emitir documento</Button></div>}
      {!['Borrador','Anulada','Pagada'].includes(selected.status) && data.canRecordPayments && <div className="space-y-3 rounded-xl border bg-slate-50 p-4"><div className="text-sm font-semibold">Registrar pago</div><div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></div><div className="space-y-2"><Label>Monto</Label><Input type="number" min="0" max={selected.balance} value={paymentAmount || ""} onChange={(event) => setPaymentAmount(Number(event.target.value))} /></div><div className="space-y-2"><Label>Método</Label><select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as typeof paymentMethod)} className="h-10 w-full rounded-md border bg-white px-3 text-sm">{PAYMENT_METHOD_OPTIONS.map((value) => <option key={value}>{value}</option>)}</select></div><div className="space-y-2"><Label>Referencia</Label><Input value={paymentReference} onChange={(event) => setPaymentReference(event.target.value)} placeholder="Transferencia, comprobante…" /></div></div><Button onClick={() => void action({ action: "payment", publicId: selected.publicId, paymentDate, amount: paymentAmount, method: paymentMethod, reference: paymentReference, notes: "" }, "Pago registrado.").then(() => { setPaymentReference(""); })} disabled={!online || saving || paymentAmount <= 0 || paymentAmount > selected.balance || paymentReference.trim().length < 2}><CircleDollarSign />Registrar pago</Button></div>}
      {data.canDocument && !["Borrador", "Anulada"].includes(selected.status) && <DocumentsPanel entityType="collection_document" entityPublicId={selected.publicId} actor={actor} canGenerate={online} blockedMessage="Conéctese para emitir el documento PDF." />}
      {data.canManage && selected.status !== "Anulada" && selected.paidAmount === 0 && <div className="space-y-2 border-t pt-4"><Label>Anulación controlada</Label><div className="flex gap-2"><Input value={voidReason} onChange={(event) => setVoidReason(event.target.value)} placeholder="Motivo de anulación" /><Button variant="destructive" onClick={() => void action({ action: "void", publicId: selected.publicId, reason: voidReason }, "Documento anulado.")} disabled={!online || saving || voidReason.trim().length < 5}>Anular</Button></div></div>}
      <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cerrar</Button></DialogFooter></>}</DialogContent></Dialog>
  </section>;
}

type ProfitabilityOrder = Omit<WorkOrder, "budgetedCost" | "actualCost" | "actualProfit" | "actualMarginPercent"> & {
  sale: number; budgetedCost: number; actualCost: number; actualProfit: number; actualMarginPercent: number;
  budgetedProfit: number; budgetedMarginPercent: number; budgetVariance: number; breakdown: Record<string, number>;
  blockers: string[]; readyToClose: boolean; counts: { activities: number; signoffs: number; materialRequests: number; purchases: number };
};

function ProfitabilityPanel({ online, actor, onClosed }: { online: boolean; actor: string; onClosed: () => void }) {
  const [orders, setOrders] = useState<ProfitabilityOrder[]>([]);
  const [selected, setSelected] = useState<ProfitabilityOrder | null>(null);
  const [canClose, setCanClose] = useState(false);
  const [canDocument, setCanDocument] = useState(false);
  const [loading, setLoading] = useState(true);
  const [closing, setClosing] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ orders: ProfitabilityOrder[]; canClose: boolean; canDocument: boolean }>("/api/profitability");
      setOrders(result.orders); setCanClose(result.canClose); setCanDocument(result.canDocument);
      setSelected((current) => current ? result.orders.find((item) => item.publicId === current.publicId) || null : null);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible cargar la rentabilidad."); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load]);
  const totals = orders.reduce((result, order) => ({ sale: result.sale + order.sale, cost: result.cost + order.actualCost }), { sale: 0, cost: 0 });
  const margin = totals.sale ? (totals.sale - totals.cost) / totals.sale * 100 : 0;
  const closeOrder = async () => {
    if (!selected) return;
    setClosing(true);
    try {
      await api("/api/profitability", { method: "POST", body: JSON.stringify({ workOrderPublicId: selected.publicId, closureNotes: notes, costReviewConfirmed: confirmed }) });
      toast.success("Orden cerrada. La rentabilidad real quedó congelada.");
      setNotes(""); setConfirmed(false); await load(); await onClosed();
    } catch (error) { toast.error(error instanceof Error ? error.message : "No fue posible cerrar la orden."); }
    finally { setClosing(false); }
  };
  const metricCards = [
    ["Venta aprobada", money(totals.sale, "CLP")], ["Costo real", money(totals.cost, "CLP")],
    ["Utilidad real", money(totals.sale - totals.cost, "CLP")], ["Margen real", `${margin.toFixed(1)}%`],
  ];
  return <section className="space-y-5">
    <div><h1 className="text-2xl font-bold tracking-tight text-slate-950">Rentabilidad y cierre</h1><p className="mt-1 text-sm text-slate-500">Compare presupuesto y ejecución; cierre solo cuando la operación esté completa y conforme.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{metricCards.map(([label, value]) => <Card key={label}><CardHeader className="pb-2"><CardDescription>{label}</CardDescription><CardTitle className="text-xl">{value}</CardTitle></CardHeader></Card>)}</div>
    <Card><CardHeader><CardTitle>Resultados por orden</CardTitle><CardDescription>{orders.filter((order) => order.status === "Cerrada").length} cerradas · {orders.filter((order) => order.readyToClose).length} listas para cierre</CardDescription></CardHeader><CardContent>
      {loading ? <LoadingState /> : <div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>Orden / proyecto</TableHead><TableHead>Venta</TableHead><TableHead>Costo presup.</TableHead><TableHead>Costo real</TableHead><TableHead>Utilidad / margen</TableHead><TableHead>Control</TableHead></TableRow></TableHeader><TableBody>{orders.map((order) => <TableRow key={order.publicId}><TableCell><div className="font-semibold">{order.number}</div><div className="text-xs text-slate-500">{order.clientName} · {order.project}</div></TableCell><TableCell>{money(order.sale, order.currency)}</TableCell><TableCell>{money(order.budgetedCost, order.currency)}</TableCell><TableCell className={order.budgetVariance > 0 ? "text-red-700" : "text-emerald-700"}>{money(order.actualCost, order.currency)}</TableCell><TableCell><div className="font-semibold">{money(order.actualProfit, order.currency)}</div><div className="text-xs text-slate-500">{order.actualMarginPercent.toFixed(1)}%</div></TableCell><TableCell><Button size="sm" variant="outline" onClick={() => setSelected(order)}>{order.status === "Cerrada" ? <LockKeyhole /> : <ClipboardCheck />}{order.status === "Cerrada" ? "Informe" : order.readyToClose ? "Cerrar" : "Revisar"}</Button></TableCell></TableRow>)}</TableBody></Table></div>}
    </CardContent></Card>
    <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}><DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">{selected && <><DialogHeader><DialogTitle>{selected.status === "Cerrada" ? "Cierre congelado" : "Control de cierre"} · {selected.number}</DialogTitle><DialogDescription>{selected.clientName} · {selected.project}</DialogDescription></DialogHeader>
      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Venta</div><div className="font-bold">{money(selected.sale, selected.currency)}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Costo real</div><div className="font-bold">{money(selected.actualCost, selected.currency)}</div></div><div className="rounded-xl border p-3"><div className="text-xs text-slate-500">Margen real</div><div className="font-bold">{selected.actualMarginPercent.toFixed(2)}%</div></div></div>
      {selected.status === "Cerrada" ? <div className="space-y-3"><div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"><ShieldCheck className="mr-2 inline size-4" />Cerrada por {selected.closedBy} el {selected.closedAt.slice(0, 16).replace("T", " ")}.<div className="mt-2">{selected.closureNotes}</div></div>{canDocument && <DocumentsPanel entityType="closure_report" entityPublicId={selected.publicId} actor={actor} canGenerate={online} blockedMessage="Conéctese para emitir el informe final." />}</div> : <div className="space-y-4">
        <div className={selected.blockers.length ? "rounded-xl border border-amber-200 bg-amber-50 p-4" : "rounded-xl border border-emerald-200 bg-emerald-50 p-4"}><div className="mb-2 text-sm font-semibold">{selected.blockers.length ? "Requisitos pendientes" : "Orden lista para cierre"}</div>{selected.blockers.length ? <ul className="space-y-1 text-sm text-amber-900">{selected.blockers.map((blocker) => <li key={blocker}>• {blocker}</li>)}</ul> : <p className="text-sm text-emerald-900">Actividades, materiales, compras y conformidad validados.</p>}</div>
        {canClose && <><div className="space-y-2"><Label>Nota de cierre</Label><textarea value={notes} onChange={(event) => setNotes(event.target.value)} className="min-h-24 w-full rounded-md border px-3 py-2 text-sm" placeholder="Resultado final, observaciones y acuerdos…" /></div><label className="flex items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(value) => setConfirmed(value === true)} /><span>Confirmo que revisé todos los costos reales y la rentabilidad final.</span></label></>}
      </div>}
      <DialogFooter><Button variant="outline" onClick={() => setSelected(null)}>Cerrar ventana</Button>{selected.status !== "Cerrada" && canClose && <Button onClick={closeOrder} disabled={!online || !selected.readyToClose || !confirmed || notes.trim().length < 5 || closing}>{closing && <Loader2 className="animate-spin" />}Cerrar y congelar</Button>}</DialogFooter>
    </>}</DialogContent></Dialog>
  </section>;
}

function DocumentsPanel({
  entityType,
  entityPublicId,
  actor,
  canGenerate,
  blockedMessage,
}: {
  entityType: "quote" | "work_order" | "purchase_order" | "closure_report" | "collection_document";
  entityPublicId: string;
  actor: string;
  canGenerate: boolean;
  blockedMessage: string;
}) {
  const [documents, setDocuments] = useState<DocumentSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const label = entityType === "quote" ? "cotización comercial" : entityType === "work_order" ? "orden de trabajo" : entityType === "closure_report" ? "informe final de cierre" : entityType === "collection_document" ? "documento de cobro" : "orden de compra";
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api<{ documents: DocumentSnapshot[] }>(
        `/api/documents?entityType=${entityType}&entityPublicId=${encodeURIComponent(entityPublicId)}`,
      );
      setDocuments(result.documents);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible cargar los PDF.",
      );
    } finally {
      setLoading(false);
    }
  }, [entityType, entityPublicId]);
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  const generate = async () => {
    if (!canGenerate) {
      toast.error(blockedMessage);
      return;
    }
    setGenerating(true);
    try {
      await api("/api/documents", {
        method: "POST",
        body: JSON.stringify({
          entityType,
          entityPublicId,
          actor: actor.trim() || "SOLIS",
        }),
      });
      toast.success(`PDF de ${label} generado y guardado en Cloudflare R2.`);
      await load();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "No fue posible generar el PDF.",
      );
    } finally {
      setGenerating(false);
    }
  };
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-amber-400 p-2 text-slate-950">
            <FileText className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Documentos PDF</div>
            <div className="text-xs text-slate-500">
              Cada emisión queda versionada con huella SHA-256.
            </div>
          </div>
        </div>
        <Button
          size="sm"
          onClick={generate}
          disabled={generating || !canGenerate}
          className="bg-slate-950 text-white hover:bg-slate-800"
        >
          {generating ? <Loader2 className="animate-spin" /> : <FileCheck2 />}{" "}
          Generar PDF
        </Button>
      </div>
      {!canGenerate && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-white/70 px-3 py-2 text-xs text-amber-800">
          {blockedMessage}
        </div>
      )}
      <div className="mt-3 space-y-2">
        {loading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
            <Loader2 className="size-3.5 animate-spin" /> Cargando documentos…
          </div>
        ) : documents.length ? (
          documents.map((document) => (
            <div
              key={document.publicId}
              className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
            >
              <div className="min-w-0">
                <div className="truncate text-xs font-semibold text-slate-800">
                  {document.fileName}
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  v{String(document.version).padStart(2, "0")} ·{" "}
                  {document.createdAt.slice(0, 16).replace("T", " ")} ·{" "}
                  {document.createdBy}
                </div>
                <div className="font-mono text-[10px] text-slate-400">
                  SHA-256 {document.sha256.slice(0, 16)}…
                </div>
              </div>
              <Button asChild variant="outline" size="icon-sm">
                <a
                  href={`/api/documents/${document.publicId}`}
                  download={document.fileName}
                  aria-label={`Descargar ${document.fileName}`}
                >
                  <Download />
                </a>
              </Button>
            </div>
          ))
        ) : (
          <div className="py-2 text-xs text-slate-500">
            Aún no se han emitido PDF para este registro.
          </div>
        )}
      </div>
    </div>
  );
}

function FlowStep({
  icon: Icon,
  label,
  active,
}: {
  icon: typeof FilePlus2;
  label: string;
  active: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2 rounded-xl border p-3 text-xs font-semibold ${active ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "bg-slate-50 text-slate-400"}`}
    >
      <Icon className="size-4" />
      {label}
    </div>
  );
}
function ActionButton({
  icon: Icon,
  title,
  note,
  working,
  onClick,
}: {
  icon: typeof FilePlus2;
  title: string;
  note: string;
  working: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={working}
      className="flex items-start gap-3 rounded-xl border bg-white p-4 text-left transition hover:border-amber-300 hover:bg-amber-50 disabled:opacity-50"
    >
      {working ? (
        <Loader2 className="mt-0.5 size-5 animate-spin" />
      ) : (
        <Icon className="mt-0.5 size-5 text-amber-600" />
      )}
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        <span className="mt-1 block text-xs text-slate-500">{note}</span>
      </span>
    </button>
  );
}

function Field({
  name,
  label,
  type = "text",
  defaultValue = "",
  required = false,
  minLength,
  maxLength,
}: {
  name: string;
  label: string;
  type?: string;
  defaultValue?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <Input
        id={name}
        name={name}
        type={type}
        defaultValue={defaultValue}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        min={type === "number" ? 0 : undefined}
      />
    </div>
  );
}
function FieldControlled({
  label,
  value,
  onChange,
  placeholder,
  disabled = false,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  type?: "text" | "number" | "date" | "email";
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        type={type}
      />
    </div>
  );
}
function SelectField({
  name,
  label,
  options,
}: {
  name: string;
  label: string;
  options: string[];
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={name}>{label}</Label>
      <select
        id={name}
        name={name}
        className="h-9 w-full rounded-md border bg-white px-3 text-sm"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </div>
  );
}
function Metric({
  label,
  value,
  negative,
}: {
  label: string;
  value: string;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl border border-blue-100 bg-blue-50 p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div
        className={`mt-1 text-sm font-bold ${negative ? "text-red-600" : "text-blue-900"}`}
      >
        {value}
      </div>
    </div>
  );
}
