self.addEventListener("activate", event => {
  event.waitUntil(
    self.registration.showNotification("通知の準備ができました", {
      body: "Push 通知が有効になりました。",
      icon: "icon-192.png"
    })
  );
});

// === Cloudflare Worker からの Push 通知受信（これだけ残す） ===
self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "通知";
  const message = data.message || "メッセージがあります";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: message,
      icon: "icon-192.png"
    })
  );
});

// === PWA キャッシュ ===
const CACHE_NAME = "webrtc-pwa-cache-v1";
const urlsToCache = [
  "./",
  "./index.html",
  "./app.js",
  "./manifest.json",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(urlsToCache))
  );
});

self.addEventListener("fetch", event => {
  event.respondWith(
    caches.match(event.request).then(response => response || fetch(event.request))
  );
});

// 通知クリック時の動作
self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow("./index.html")
  );
});
