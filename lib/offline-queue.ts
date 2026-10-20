import type { SyncOperation, SyncOperationType } from "@/lib/sync-contract";

const DB_NAME = "solis-cotizador-offline";
const DB_VERSION = 3;
const OPERATION_STORE = "operations";
const SNAPSHOT_STORE = "snapshots";
const RESOURCE_STORE = "resources";
const SYNC_TAG = "solis-cotizador-sync";
const ACTIVE_SCOPE_KEY = "solis.offline.active-user.v2";

export type StoredOperation = SyncOperation & {
  attempts: number;
  lastError: string;
  scopeUserPublicId: string;
};
export type QueueStatus = { pending: number; failed: number };
type StoredSnapshot<T = unknown> = {
  scopeUserPublicId: string;
  savedAt: string;
  payload: T;
};

function activeScope() {
  return typeof window === "undefined" ? "" : localStorage.getItem(ACTIVE_SCOPE_KEY) || "";
}

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(OPERATION_STORE)) {
        db.createObjectStore(OPERATION_STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
        db.createObjectStore(SNAPSHOT_STORE, { keyPath: "scopeUserPublicId" });
      }
      if (!db.objectStoreNames.contains(RESOURCE_STORE)) db.createObjectStore(RESOURCE_STORE, { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No fue posible abrir el almacenamiento offline."));
  });
}

async function withStore<T>(
  storeName: typeof OPERATION_STORE | typeof SNAPSHOT_STORE | typeof RESOURCE_STORE,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
) {
  const db = await openQueue();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const request = action(transaction.objectStore(storeName));
    let result: T;
    request.onsuccess = () => { result = request.result; };
    request.onerror = () => reject(request.error || new Error("No fue posible actualizar el almacenamiento offline."));
    transaction.oncomplete = () => { db.close(); resolve(result); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error("No se confirmó el guardado offline.")); };
    transaction.onerror = () => {
      db.close();
      reject(transaction.error || new Error("Falló el almacenamiento offline."));
    };
  });
}

async function registerBackgroundSync() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.ready;
    const sync = (registration as ServiceWorkerRegistration & { sync?: { register(tag: string): Promise<void> } }).sync;
    await sync?.register(SYNC_TAG);
  } catch { /* La sincronización al volver a la app sigue disponible. */ }
}

export async function activateOfflineScope(userPublicId: string) {
  if (!userPublicId) throw new Error("No se pudo identificar al usuario para el modo offline.");
  localStorage.setItem(ACTIVE_SCOPE_KEY, userPublicId);
  await withStore(RESOURCE_STORE, "readwrite", (store) => store.put({ key: "__active__", scopeUserPublicId: userPublicId }));
  const operations = await withStore<Array<StoredOperation & { scopeUserPublicId?: string }>>(
    OPERATION_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  for (const operation of operations.filter((item) => !item.scopeUserPublicId)) {
    await withStore(OPERATION_STORE, "readwrite", (store) => store.put({ ...operation, scopeUserPublicId: userPublicId }));
  }
}

export async function saveDashboardSnapshot<T>(userPublicId: string, payload: T) {
  if (!userPublicId) return;
  const snapshot: StoredSnapshot<T> = { scopeUserPublicId: userPublicId, savedAt: new Date().toISOString(), payload };
  await withStore(SNAPSHOT_STORE, "readwrite", (store) => store.put(snapshot));
}

export async function loadDashboardSnapshot<T>() {
  const scopeUserPublicId = activeScope();
  if (!scopeUserPublicId) return null;
  const snapshot = await withStore<StoredSnapshot<T> | undefined>(SNAPSHOT_STORE, "readonly", (store) => store.get(scopeUserPublicId));
  return snapshot?.payload ?? null;
}

export async function clearOfflineSessionData(options: { discardPending?: boolean } = {}) {
  const scopeUserPublicId = activeScope();
  if (!scopeUserPublicId) return;
  await withStore(SNAPSHOT_STORE, "readwrite", (store) => store.delete(scopeUserPublicId));
  const resources = await withStore<Array<{ key: string; scopeUserPublicId: string }>>(RESOURCE_STORE, "readonly", (store) => store.getAll());
  for (const resource of resources.filter((item) => item.scopeUserPublicId === scopeUserPublicId)) await withStore(RESOURCE_STORE, "readwrite", (store) => store.delete(resource.key));
  if (options.discardPending) {
    const operations = await withStore<StoredOperation[]>(OPERATION_STORE, "readonly", (store) => store.getAll());
    for (const operation of operations.filter((item) => item.scopeUserPublicId === scopeUserPublicId)) {
      await withStore(OPERATION_STORE, "readwrite", (store) => store.delete(operation.id));
    }
  }
  await withStore(RESOURCE_STORE, "readwrite", (store) => store.delete("__active__"));
  localStorage.removeItem(ACTIVE_SCOPE_KEY);
}

export async function enqueueOperation(type: SyncOperationType, payload: Record<string, unknown>, id = crypto.randomUUID()) {
  const scopeUserPublicId = activeScope();
  if (!scopeUserPublicId) throw new Error("Actualice la aplicación en línea antes de guardar cambios offline.");
  const operation: StoredOperation = {
    id,
    type,
    payload,
    createdAt: new Date().toISOString(),
    attempts: 0,
    lastError: "",
    scopeUserPublicId,
  };
  await withStore(OPERATION_STORE, "readwrite", (store) => store.put(operation));
  await registerBackgroundSync();
  return operation;
}

export async function migrateLegacyQuoteDraft() {
  const raw = localStorage.getItem("solis.quote.draft.v1");
  if (!raw) return false;
  try {
    const legacy = JSON.parse(raw) as Record<string, unknown>;
    const { savedAt: _savedAt, ...payload } = legacy;
    void _savedAt;
    await enqueueOperation("quote.create", { publicId: crypto.randomUUID(), ...payload });
    localStorage.removeItem("solis.quote.draft.v1");
    return true;
  } catch { return false; }
}

export async function listOperations() {
  const scopeUserPublicId = activeScope();
  if (!scopeUserPublicId) return [];
  const operations = await withStore<StoredOperation[]>(OPERATION_STORE, "readonly", (store) => store.getAll());
  return operations
    .filter((operation) => operation.scopeUserPublicId === scopeUserPublicId)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const operations = await listOperations();
  return { pending: operations.length, failed: operations.filter((operation) => Boolean(operation.lastError)).length };
}

export async function discardOperation(id: string) {
  const operation = await withStore<StoredOperation | undefined>(OPERATION_STORE, "readonly", (store) => store.get(id));
  if (!operation || operation.scopeUserPublicId !== activeScope()) return false;
  await withStore(OPERATION_STORE, "readwrite", (store) => store.delete(id));
  return true;
}

export async function retryOperation(id: string) {
  const operation = await withStore<StoredOperation | undefined>(OPERATION_STORE, "readonly", (store) => store.get(id));
  if (!operation || operation.scopeUserPublicId !== activeScope()) return false;
  await withStore(OPERATION_STORE, "readwrite", (store) => store.put({ ...operation, lastError: "" }));
  return true;
}

async function removeOperation(id: string) {
  await withStore(OPERATION_STORE, "readwrite", (store) => store.delete(id));
}

async function markFailed(operation: StoredOperation, message: string) {
  await withStore(OPERATION_STORE, "readwrite", (store) => store.put({ ...operation, attempts: operation.attempts + 1, lastError: message }));
}

export async function sendOperation(operation: SyncOperation) {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Solis-Offline-User": activeScope() },
    body: JSON.stringify(operation),
    signal: AbortSignal.timeout(20000),
  });
  const body = await response.json().catch(() => ({ error: "El servidor no está disponible." })) as { error?: string; result?: unknown; replayed?: boolean };
  if (!response.ok) throw Object.assign(new Error(body.error || "La operación pendiente fue rechazada."), { status: response.status });
  return body;
}

async function syncLock<T>(run: () => Promise<T>): Promise<T> {
  return await Promise.resolve(navigator.locks ? navigator.locks.request("solis-offline-sync", run) : run()).then((result) => result);
}
export async function executeOrQueue(type: SyncOperationType, payload: Record<string, unknown>) {
  // Persist before the request so a timeout or tab close cannot lose the write.
  const operation = await enqueueOperation(type, payload);
  if (!navigator.onLine) return { queued: true, result: null };
  return await syncLock(async () => {
    const queue = await listOperations();
    if (queue[0]?.id !== operation.id) return { queued: true, result: null };
    try {
      const response = await sendOperation(operation);
      await removeOperation(operation.id);
      return { queued: false, result: response.result };
    } catch (error) {
      if (isConnectionFailure(error)) return { queued: true, result: null };
      await removeOperation(operation.id);
      throw error;
    }
  });
}

export function isConnectionFailure(error: unknown) {
  return !navigator.onLine || error instanceof TypeError || (error instanceof DOMException && ["TimeoutError", "AbortError"].includes(error.name)) || [502, 503, 504].includes(Number((error as { status?: number })?.status));
}

export async function cacheResource<T>(resource: string, payload: T) {
  const scopeUserPublicId = activeScope(); if (!scopeUserPublicId) return;
  await withStore(RESOURCE_STORE, "readwrite", (store) => store.put({ key: `${scopeUserPublicId}:${resource}`, scopeUserPublicId, savedAt: new Date().toISOString(), payload }));
}
export async function loadResource<T>(resource: string) {
  const scope = activeScope(); if (!scope) return null;
  return await withStore<{ payload: T; savedAt: string } | undefined>(RESOURCE_STORE, "readonly", (store) => store.get(`${scope}:${resource}`)) || null;
}
export async function cachedApi<T>(resource: string): Promise<T> {
  try {
    if (!navigator.onLine) throw new TypeError("Sin conexión");
    const response = await fetch(resource, { signal: AbortSignal.timeout(15000), cache: "no-store" });
    if (!response.ok) throw Object.assign(new Error("No fue posible cargar los datos."), { status: response.status });
    const result = await response.json() as T;
    await cacheResource(resource, result).catch(() => undefined); return result;
  } catch (error) {
    if (!isConnectionFailure(error)) throw error;
    const saved = await loadResource<T>(resource);
    if (saved) return saved.payload;
    throw new Error("Abra este registro una vez con internet para consultarlo offline.");
  }
}

async function flushQueue() {
  const operations = await listOperations();
  let synced = 0;
  let failedThisRun = 0;
  for (const operation of operations) {
    if (!navigator.onLine) break;
    // A conflict requires an explicit review, and blocks later dependent edits.
    if (operation.lastError) break;
    try {
      await sendOperation(operation);
      await removeOperation(operation.id);
      synced += 1;
    } catch (error) {
      if (isConnectionFailure(error)) break;
      const message = error instanceof Error ? error.message : "No fue posible sincronizar.";
      await markFailed(operation, message);
      failedThisRun += 1;
      break;
    }
  }
  const status = await getQueueStatus();
  return { synced, failedThisRun, ...status };
}

let flushing: Promise<Awaited<ReturnType<typeof flushQueue>>> | null = null;
export async function flushOfflineQueue() {
  if (flushing) return flushing;
  const run = () => flushQueue();
  const task = syncLock(run);
  flushing = task.finally(() => { flushing = null; });
  return flushing;
}
