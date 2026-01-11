// === Firebase 初期化 ===
const firebaseConfig = {
  apiKey: "AIzaSyDWSg2w91ChlChqXHqFAbzFx8grTDokShc",
  authDomain: "webrtc-call-app-7fcff.firebaseapp.com",
  databaseURL: "https://webrtc-call-app-7fcff-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "webrtc-call-app-7fcff",
  storageBucket: "webrtc-call-app-7fcff.appspot.com",
  messagingSenderId: "935797124048",
  appId: "1:935797124048:web:8183979656405373cee7d5",
  measurementId: "G-8714SHZEXC"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// === Firebase Messaging ===
const messaging = firebase.messaging();

messaging.getToken({
  vapidKey: "あなたのVAPID公開鍵をここに貼る"
}).then(token => {
  console.log("FCM token:", token);

  // トークンを Firebase に保存
  db.ref("tokens").push({
    token: token,
    timestamp: Date.now()
  });
}).catch(err => {
  console.error("FCM token error:", err);
});

// === WebRTC ===
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
});

let localStream;
let role = null; // "caller" or "callee"

// カメラ取得
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    document.getElementById("localVideo").srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  })
  .catch(err => {
    console.error("getUserMedia error:", err);
    alert("カメラ・マイクの取得に失敗しました。許可設定を確認してください。");
  });

// 相手の映像を受信
pc.ontrack = event => {
  console.log("ontrack:", event.streams[0]);
  document.getElementById("remoteVideo").srcObject = event.streams[0];
};

// ICE candidate を送信
pc.onicecandidate = event => {
  if (event.candidate) {
    console.log("local ICE candidate:", event.candidate);
    db.ref("candidates").push(event.candidate.toJSON());
  }
};

// ICE candidate を受信（両方）
db.ref("candidates").on("child_added", snapshot => {
  const data = snapshot.val();
  if (!data) return;

  const candidate = new RTCIceCandidate(data);
  console.log("remote ICE candidate:", candidate);
  pc.addIceCandidate(candidate).catch(err => {
    console.error("addIceCandidate error:", err);
  });
});

// ===============================
// 発信側（Caller）
// ===============================
document.getElementById("callBtn").onclick = async () => {
  role = "caller";
  console.log("role = caller");

  // 既存のシグナリングデータをクリア（毎回クリーンな状態で開始）
  await db.ref("offer").set(null);
  await db.ref("answer").set(null);
  await db.ref("candidates").set(null);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  console.log("created offer:", offer);
  await db.ref("offer").set(offer);
};

// answer を受信（Caller のみ）
db.ref("answer").on("value", async snapshot => {
  if (role !== "caller") return;

  const answer = snapshot.val();
  if (!answer) return;

  if (pc.signalingState === "have-local-offer") {
    console.log("setRemoteDescription(answer)");
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  } else {
    console.log("answer 受信時の signalingState:", pc.signalingState);
  }
});

// ===============================
// 応答側（Callee）
// ===============================
document.getElementById("answerBtn").onclick = async () => {
  role = "callee";
  console.log("role = callee");

  // offer を取得（まだ無い場合はエラー表示）
  const offerSnapshot = await db.ref("offer").get();
  const offer = offerSnapshot.val();

  if (!offer) {
    alert("まだ発信側の準備ができていません。発信側がボタンを押したあとに、もう一度「応答」を押してください。");
    return;
  }

  console.log("got offer:", offer);
  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  console.log("created answer:", answer);
  await db.ref("answer").set(answer);
};
const workerURL = "https://fancy-rain-ff61.ym21082.workers.dev";

// Service Worker を登録
async function registerSW() {
  const reg = await navigator.serviceWorker.register("service-worker.js");
  return reg;
}

// VAPID 公開鍵を取得
async function getVapidKey() {
  const res = await fetch(workerURL + "/vapidPublicKey");
  return await res.text();
}

// Push 通知を購読して Worker に送信
async function setupPush() {
  const reg = await registerSW();
  const vapidKey = await getVapidKey();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  await fetch(workerURL + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  console.log("Push 通知の購読が完了しました");
}

// Base64URL → Uint8Array
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding)
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}
