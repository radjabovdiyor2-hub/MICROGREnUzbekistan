// Microgreen Uzbekistan — Service Worker v7
// Strategy: Network-first, minimal caching, instant updates

const CACHE_NAME = "microgreen-v7";

// Only cache truly static assets (images, icons)
const STATIC_ASSETS = [
    "/manifest.json",
    "/icons/icon-192.svg",
    "/icons/icon-512.svg",
];

// Install: Cache only essential static assets
self.addEventListener("install", (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log("[SW] Installing v7 — minimal cache strategy");
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // Force immediate activation — don't wait for old tabs to close
    self.skipWaiting();
});

// Activate: Delete ALL old caches immediately
self.addEventListener("activate", (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => {
                        console.log("[SW] Deleting old cache:", name);
                        return caches.delete(name);
                    })
            );
        })
    );
    // Take control of all pages immediately
    self.clients.claim();
    
    // Notify all clients to reload for fresh content
    self.clients.matchAll({ type: 'window' }).then(clients => {
        clients.forEach(client => {
            client.postMessage({ type: 'SW_UPDATED', version: CACHE_NAME });
        });
    });
});

// Fetch strategy: Network-first, cache only images for offline
self.addEventListener("fetch", (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== "GET") return;

    // Skip API routes — always fresh
    if (url.pathname.startsWith("/api/")) return;

    // Skip external requests
    if (url.origin !== location.origin) return;

    // HTML pages + JS/CSS — ALWAYS network, NO cache
    // This ensures users always get the latest version
    if (
        request.mode === "navigate" ||
        url.pathname.startsWith("/_next/") ||
        url.pathname.endsWith(".html") ||
        url.pathname.endsWith(".js") ||
        url.pathname.endsWith(".css")
    ) {
        event.respondWith(
            fetch(request).catch(async () => {
                // Only fallback to cache when truly offline
                const cached = await caches.match(request);
                if (cached) return cached;
                if (request.mode === "navigate") {
                    return new Response(
                        '<html><body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f0fdf4"><div style="text-align:center"><h1 style="color:#059669">Microgreen</h1><p>Офлайн режим. Интернетга уланинг.</p></div></body></html>',
                        { headers: { 'Content-Type': 'text/html' } }
                    );
                }
                return new Response("Offline", { status: 503 });
            })
        );
        return;
    }

    // Images — cache with network-first (for performance)
    if (/\.(png|jpg|jpeg|webp|avif|svg|ico|gif)$/i.test(url.pathname)) {
        event.respondWith(
            fetch(request)
                .then((response) => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(async () => {
                    const cached = await caches.match(request);
                    return cached || new Response("", { status: 404 });
                })
        );
        return;
    }

    // Everything else — network only, no caching
    event.respondWith(fetch(request));
});

// Handle push notifications
self.addEventListener("push", (event) => {
    const data = event.data
        ? event.data.json()
        : { title: "Microgreen Uzbekistan", body: "Yangi xabar" };

    const options = {
        body: data.body || data.message,
        icon: "/icons/icon-192.svg",
        badge: "/icons/icon-192.svg",
        vibrate: [100, 50, 100],
        data: { url: data.url || "/" },
        actions: data.actions || [
            { action: "open", title: "Ochish" },
            { action: "close", title: "Yopish" },
        ],
    };

    event.waitUntil(self.registration.showNotification(data.title || "Microgreen", options));
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
        const cache = await caches.open("microgreen-offline-data");
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

// ══════════════════════════════════════════════════════════════════════
// Push-уведомления о заказе.
//
// ЧЕГО НЕ БЫЛО. Обработчиков `push` и `notificationclick` не существовало
// вовсе: у покупателя БЕЗ Telegram канала не было никакого, и о доставке он
// узнавал, когда курьер звонил в дверь.
//
// УВЕДОМЛЕНИЕ ПРИХОДИТ БЕЗ ТЕКСТА, и это осознанно. Шифрование полезной
// нагрузки требует отдельной криптографии на каждое сообщение; вместо этого
// сервер будит страницу, а текст она дочитывает сама — тем же запросом и с
// той же сессией, что и обычный экран. Через службу доставки Google или
// Apple не проходит ничего, кроме факта «что-то произошло».
//
// Если дочитать не удалось (нет сети, вышел из аккаунта) — показываем общее
// сообщение. Промолчать нельзя: браузер требует показать уведомление после
// `push`, иначе следующие он может перестать доставлять вовсе.
// ══════════════════════════════════════════════════════════════════════

const ORDER_STATUS_TEXT = {
    PENDING: "Заказ принят",
    CONFIRMED: "Заказ подтверждён",
    PREPARING: "Заказ собирается",
    DELIVERING: "Заказ в пути",
    DELIVERED: "Заказ доставлен",
    CANCELLED: "Заказ отменён",
};

async function buildOrderNotification() {
    try {
        const res = await fetch("/api/orders?limit=1", { credentials: "same-origin" });
        if (!res.ok) return null;
        const data = await res.json();
        const order = (data.orders || [])[0];
        if (!order) return null;
        const status = ORDER_STATUS_TEXT[order.status] || "Статус заказа изменился";
        return { title: status, body: `Заказ №${order.orderNumber}` };
    } catch (err) {
        console.log("[SW] Не дочитал статус заказа:", err);
        return null;
    }
}

self.addEventListener("push", (event) => {
    event.waitUntil(
        (async () => {
            const built = await buildOrderNotification();
            const title = built ? built.title : "Microgreen Uzbekistan";
            const body = built ? built.body : "Статус заказа изменился";
            await self.registration.showNotification(title, {
                body,
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
                // Одно уведомление о заказе, а не лента: следующий статус
                // заменяет предыдущее, иначе за день их накопится пять.
                tag: "mg-order-status",
                renotify: true,
                data: { url: "/profile" },
            });
        })(),
    );
});

self.addEventListener("notificationclick", (event) => {
    event.notification.close();
    const url = (event.notification.data && event.notification.data.url) || "/profile";
    event.waitUntil(
        (async () => {
            const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
            // Уже открытую вкладку не дублируем — переводим на нужный экран.
            for (const client of all) {
                if ("focus" in client) {
                    await client.focus();
                    if ("navigate" in client) await client.navigate(url);
                    return;
                }
            }
            await self.clients.openWindow(url);
        })(),
    );
});
