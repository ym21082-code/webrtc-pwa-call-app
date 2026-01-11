// === Cloudflare Worker 用 Web Push 通知受信 ===

self.addEventListener("push", event => {
  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.message,
      icon: "icon-192.png",
      data: data
    })
  );
});

// 通知をクリックしたときの挙動
self.addEventListener("notificationclick", event => {
  event.notification.close();

  event.waitUntil(
    clients.openWindow("/index.html")
  );
});
