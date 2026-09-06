import type { SyncOperation, SyncOperationType } from "@/lib/sync-contract";

const DB_NAME = "solis-cotizador-offline";
const DB_VERSION = 1;
const STORE = "operations";
const SYNC_TAG = "solis-cotizador-sync";

export type StoredOperation = SyncOperation & { attempts: number; lastError: string };
export type QueueStatus = { pending: number; failed: number };

function openQueue() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No fue posible abrir la cola offline."));
  });
}

async function withStore<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openQueue();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE, mode);
    const request = action(transaction.objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("No fue posible actualizar la cola offline."));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error("Falló la cola offline.")); };
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

export async function enqueueOperation(type: SyncOperationType, payload: Record<string, unknown>, id = crypto.randomUUID()) {
  const operation: StoredOperation = { id, type, payload, createdAt: new Date().toISOString(), attempts: 0, lastError: "" };
  await withStore("readwrite", (store) => store.put(operation));
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
  const operations = await withStore<StoredOperation[]>("readonly", (store) => store.getAll());
  return operations.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getQueueStatus(): Promise<QueueStatus> {
  const operations = await listOperations();
  return { pending: operations.length, failed: operations.filter((operation) => Boolean(operation.lastError)).length };
}

async function removeOperation(id: string) {
  await withStore("readwrite", (store) => store.delete(id));
}

async function markFailed(operation: StoredOperation, message: string) {
  await withStore("readwrite", (store) => store.put({ ...operation, attempts: operation.attempts + 1, lastError: message }));
}

export async function sendOperation(operation: SyncOperation) {
  const response = await fetch("/api/sync", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(operation),
  });
  const body = await response.json() as { error?: string; result?: unknown; replayed?: boolean };
  if (!response.ok) throw Object.assign(new Error(body.error || "La operación pendiente fue rechazada."), { status: response.status });
  return body;
}

export async function executeOrQueue(type: SyncOperationType, payload: Record<string, unknown>) {
  const operation: SyncOperation = { id: crypto.randomUUID(), type, payload, createdAt: new Date().toISOString() };
  if (!navigator.onLine) {
    await enqueueOperation(type, payload, operation.id);
    return { queued: true, result: null };
  }
  try {
    const response = await sendOperation(operation);
    return { queued: false, result: response.result };
  } catch (error) {
    if (!navigator.onLine || error instanceof TypeError) {
      await enqueueOperation(type, payload, operation.id);
      return { queued: true, result: null };
    }
    throw error;
  }
}

export async function flushOfflineQueue() {
  const operations = await listOperations();
  let synced = 0;
  let failed = 0;
  for (const operation of operations) {
    if (!navigator.onLine) break;
    try {
      await sendOperation(operation);
      await removeOperation(operation.id);
      synced += 1;
    } catch (error) {
      if (!navigator.onLine || error instanceof TypeError) break;
      const message = error instanceof Error ? error.message : "No fue posible sincronizar.";
      await markFailed(operation, message);
      failed += 1;
    }
  }
  return { synced, failed, ...(await getQueueStatus()) };
}
