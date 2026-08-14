/**
 * Service Worker (FASE 10)
 * Estrategia:
 *   - App shell: stale-while-revalidate (arranque instantáneo + actualización silenciosa)
 *   - Navegación: network-first con fallback offline
 *   - Firebase / APIs: SIEMPRE red (nunca se cachean datos de juego)
 */
const VERSION = "v3";
const SHELL_CACHE = `gestorpro-shell-${VERSION}`;
const ASSET_CACHE = `gestorpro-assets-${VERSION}`;
const SHELL = ["/", "/index.html", "/manifest.webmanifest", "/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).catch(() => {})
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function isGameApi(url) {
  return (
    url.hostname.includes("googleapis.com") ||
    url.hostname.includes("firebaseio.com") ||
    url.hostname.includes("cloudfunctions.net") ||
    url.hostname.includes("firebaseinstallations") ||
    url.hostname.includes("identitytoolkit")
  );
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Datos del juego: nunca desde caché
  if (isGameApi(url)) return;

  // Navegación: red primero, caché como red de seguridad offline
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put("/index.html", copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match("/index.html").then((r) => r || Response.error()))
    );
    return;
  }

  // Recursos estáticos: stale-while-revalidate
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(ASSET_CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          })
          .catch(() => cached);
        return cached || network;
      })
    );
  }
});

// Notificaciones push (preparado para FCM en el futuro)
self.addEventListener("push", (event) => {
  let data = { title: "Gestor Pro", body: "Tienes novedades en tu club." };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    /* payload no JSON */
  }
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "/icon-512.png",
      badge: "/icon-512.png",
      tag: "gestorpro",
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window" }).then((list) => {
      for (const client of list) if ("focus" in client) return client.focus();
      return self.clients.openWindow("/");
    })
  );
});
