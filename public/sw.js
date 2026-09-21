const STATIC_CACHE = "solis-cotizador-static-v13";
const PRIVATE_SHELL_CACHE = "solis-cotizador-shell-v13";
const STATIC_ASSETS = ["/manifest.webmanifest", "/solis-logo.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE)
      .then((cache) => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => ![STATIC_CACHE, PRIVATE_SHELL_CACHE].includes(key))
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

  if (url.pathname.startsWith("/assets/") || STATIC_ASSETS.includes(url.pathname)) {
    event.respondWith(
      caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
        if (response.ok) void caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, response.clone()));
        return response;
      })),
    );
  }
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SOLIS_CLEAR_PRIVATE_CACHE") {
    event.waitUntil(caches.delete(PRIVATE_SHELL_CACHE));
  }
});

self.addEventListener("sync", (event) => {
  if (event.tag !== "solis-cotizador-sync") return;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
    clients.forEach((client) => client.postMessage({ type: "SOLIS_SYNC_REQUEST" }));
  }));
});
