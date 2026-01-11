self.addEventListener("push", event => {
  const data = event.data ? event.data.json() : {};

  const title = data.title || "通知";
  const message = data.message || "メッセージがあります";

  event.waitUntil(
    self.registration.showNotification(title, {
      body: message,
      icon: "icon.png" // 任意
    })
  );
});
