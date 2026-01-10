// Firebase のスクリプトを読み込む
importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-app.js");
importScripts("https://www.gstatic.com/firebasejs/8.10.0/firebase-messaging.js");

// Firebase 初期化（送信者IDを入れる）
firebase.initializeApp({
  messagingSenderId: "935797124048"  // ← あなたの Sender ID
});

// Messaging を有効化
const messaging = firebase.messaging();

// バックグラウンドで通知を受け取る処理
messaging.setBackgroundMessageHandler(payload => {
  console.log("[Service Worker] Background message received:", payload);

  return self.registration.showNotification(payload.notification.title, {
    body: payload.notification.body,
    icon: "/icon-192.png",
    data: payload.data
  });
});

// 通知をクリックしたときの挙動
self.addEventListener("notificationclick", event => {
  event.notification.close();

  // 通知に含まれる caller 情報を使ってアプリを開く
  const caller = event.notification.data?.caller || "";

  event.waitUntil(
    clients.openWindow("/index.html?caller=" + caller)
  );
});
