// AgroTech Ecosystem - Service Worker
// Generated from sw.ts

const CACHE_NAME = "microgreen-v6";
const STATIC_ASSETS = [
    "/",
    "/shop",
    "/game",
    "/offline",
    "/manifest.json",
    "/icons/icon-192.svg",
    "/icons/icon-512.svg",
];

// Install: Cache static assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Caching static assets");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    self.skipWaiting();
});

// Activate: Clean old caches
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Fetch: Network-first with cache fallback
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== "GET") return;

    // Skip API routes
    if (url.pathname.startsWith("/api/")) return;

    // Skip external requests
    if (url.origin !== location.origin) return;

    event.respondWith(
        fetch(request)
            .then((response) => {
                if (response.ok) {
                    const clone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(request, clone);
                    });
                }
                return response;
            })
            .catch(async () => {
                const cached = await caches.match(request);
                if (cached) return cached;

                if (request.mode === "navigate") {
                    const offline = await caches.match("/offline");
                    if (offline) return offline;
                }

                return new Response("Offline", { status: 503 });
            })
    );
});

// Handle push notifications
self.addEventListener("push", (event) => {
    const data = event.data
        ? event.data.json()
        : { title: "AgroTech Ecosystem", body: "Новое уведомление" };

    const options = {
        body: data.body || data.message,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        vibrate: [100, 50, 100],
        data: { url: data.url || "/" },
        actions: data.actions || [
            { action: "open", title: "Открыть" },
            { action: "close", title: "Закрыть" },
        ],
    };

    event.waitUntil(self.registration.showNotification(data.title || "AgroTech", options));
});

// Handle push notification clicks
self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = event.notification.data?.url || "/";
    event.waitUntil(clients.openWindow(url));
});

// Background sync for offline orders
self.addEventListener("sync", (event) => {
    if (event.tag === "sync-orders") {
        event.waitUntil(syncOfflineOrders());
    }
});

async function syncOfflineOrders() {
    try {
        const cache = await caches.open("agrotech-offline-data");
        const keys = await cache.keys();
        for (const request of keys) {
            if (request.url.includes("/api/orders")) {
                const response = await cache.match(request);
                if (response) {
                    const data = await response.json();
                    await fetch("/api/orders", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify(data),
                    });
                    await cache.delete(request);
                }
            }
        }
    } catch (err) {
        console.log("[SW] Sync failed, will retry:", err);
    }
}
