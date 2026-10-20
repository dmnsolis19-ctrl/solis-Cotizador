const STATIC_CACHE = "solis-cotizador-static-v35";
const PRIVATE_SHELL_CACHE = "solis-cotizador-shell-v35";
const STATIC_ASSETS = ["/manifest.webmanifest", "/solis-logo.png"];
const isStaticAsset = (path) => STATIC_ASSETS.includes(path) ||
  (path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/api/") && path !== "/sw.js" && /\.(?:js|css|woff2?)$/.test(path));

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(STATIC_CACHE);
    await cache.addAll(STATIC_ASSETS);
    const manifest = await fetch("/offline-assets.json", { cache: "no-store" }).then((response) => response.ok ? response.json() : null);
    if (manifest?.assets?.length) {
      const assets = manifest.assets.filter((url) => typeof url === "string" && isStaticAsset(url));
      // A failed asset prevents activation so a working old cache is retained.
      for (let i = 0; i < assets.length; i += 12) await cache.addAll(assets.slice(i, i + 12));
    }
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith("solis-cotizador-") && ![STATIC_CACHE, PRIVATE_SHELL_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

async function navigationResponse(request) {
  try {
    const response = await fetch(request);
    const url = new URL(request.url);
    const responseUrl = new URL(response.url);
    if (response.ok && !response.redirected && url.pathname === "/" && responseUrl.pathname === "/") {
      const cache = await caches.open(PRIVATE_SHELL_CACHE);
      await cache.put("/", response.clone());
    }
    return response;
  } catch {
    const cached = await caches.match("/");
    return cached || new Response("SOLIS Cotizador no está disponible sin conexión en este dispositivo.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }
}

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/api/")) {
    event.respondWith(
      fetch(event.request).catch(() => new Response(JSON.stringify({ error: "Sin conexión" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
      })),
    );
    return;
  }

  if (event.request.mode === "navigate") {
    // Login is never stored. The authenticated application shell uses a
    // network-first strategy and is purged explicitly when the user logs out.
    if (url.pathname === "/login") {
      event.respondWith(fetch(event.request));
      return;
    }
    event.respondWith(navigationResponse(event.request));
    return;
  }

  if (isStaticAsset(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) event.waitUntil(caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, response.clone())));
        return response;
      })),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SOLIS_CACHE_SHELL") {
    event.waitUntil((async () => {
      const response = await fetch("/", { credentials: "include", cache: "no-store", headers: { Accept: "text/html" } });
      if (response.ok && !response.redirected && new URL(response.url).pathname === "/") {
        const cache = await caches.open(PRIVATE_SHELL_CACHE); await cache.put("/", response);
        event.source?.postMessage({ type: "SOLIS_OFFLINE_READY" });
      }
    })().catch(() => undefined));
  }
  if (event.data?.type === "SOLIS_CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(PRIVATE_SHELL_CACHE));
  }
});

async function flushInBackground() {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open("solis-cotizador-offline", 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("operations")) db.createObjectStore("operations", { keyPath: "id" });
      if (!db.objectStoreNames.contains("snapshots")) db.createObjectStore("snapshots", { keyPath: "scopeUserPublicId" });
      if (!db.objectStoreNames.contains("resources")) db.createObjectStore("resources", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  try {
    if (!db.objectStoreNames.contains("resources") || !db.objectStoreNames.contains("operations")) return;
    const read = (store, key) => new Promise((resolve, reject) => { const tx = db.transaction(store, "readonly"); const request = key ? tx.objectStore(store).get(key) : tx.objectStore(store).getAll(); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
    const active = await read("resources", "__active__"); if (!active?.scopeUserPublicId) return;
    const operations = (await read("operations")).filter((row) => row.scopeUserPublicId === active.scopeUserPublicId).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const write = (operation, remove = false) => new Promise((resolve, reject) => { const tx = db.transaction("operations", "readwrite"); const store = tx.objectStore("operations"); if (remove) store.delete(operation.id); else store.put(operation); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); });
    for (const operation of operations) {
      if (operation.lastError) break;
      const response = await fetch("/api/sync", { method: "POST", credentials: "include", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/json", "X-Solis-Offline-User": active.scopeUserPublicId }, body: JSON.stringify(operation) });
      if ([502, 503, 504].includes(response.status)) throw new Error("Servidor no disponible");
      if (!response.ok) { const body = await response.json().catch(() => ({})); await write({ ...operation, attempts: operation.attempts + 1, lastError: body.error || "Abra la aplicación y revise la sincronización." }); break; }
      await write(operation, true);
    }
  } finally { db.close(); }
}
self.addEventListener("sync", (event) => {
  if (event.tag !== "solis-cotizador-sync") return;
  event.waitUntil((async () => {
    if (self.navigator.locks) await self.navigator.locks.request("solis-offline-sync", flushInBackground);
    else await flushInBackground();
    const clients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    clients.forEach((client) => client.postMessage({ type: "SOLIS_SYNC_REQUEST" }));
  })());
});
