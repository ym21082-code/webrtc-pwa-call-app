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

// === Push 通知設定 ===
const workerURL = "https://fancy-rain-ff61.ym21082.workers.dev";

// Service Worker を登録
async function registerSW() {
  // GitHub Pages 用に絶対パス
  const reg = await navigator.serviceWorker.register("/webrtc-pwa-call-app/service-worker.js");
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

  // ★ これが超重要：SW が完全に ready になるまで待つ
  await navigator.serviceWorker.ready;
  console.log("Service Worker is ready");

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
Notification.requestPermission().then(() => {
  new Notification("テスト通知", {
    body: "これはテストです",
    icon: "icon-192.png"
  });
});


// アプリ起動時に Push 通知を登録
setupPush();

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// === WebRTC ===
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
});

// ICE candidate のキュー
let pendingCandidates = [];

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

// ICE candidate を受信（キュー対応）
db.ref("candidates").on("child_added", async snapshot => {
  const data = snapshot.val();
  if (!data) return;

  const candidate = new RTCIceCandidate(data);
  console.log("remote ICE candidate:", candidate);

  if (!pc.remoteDescription) {
    console.log("remoteDescription がまだ無いのでキューに保存");
    pendingCandidates.push(candidate);
    return;
  }

  try {
    await pc.addIceCandidate(candidate);
  } catch (err) {
    console.error("addIceCandidate error:", err);
  }
});

// ===============================
// 発信側（Caller）
// ===============================
document.getElementById("callBtn").onclick = async () => {
  role = "caller";
  console.log("role = caller");

  // シグナリングデータをクリア
  await db.ref("offer").set(null);
  await db.ref("answer").set(null);
  await db.ref("candidates").set(null);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  console.log("created offer:", offer);
  await db.ref("offer").set(offer);

  // 相手に通知
  await fetch(workerURL + "/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "着信があります",
      message: "相手があなたに発信しました"
    }),
  });
};

// answer を受信（Caller）
db.ref("answer").on("value", async snapshot => {
  if (role !== "caller") return;

  const answer = snapshot.val();
  if (!answer) return;

  if (pc.signalingState === "have-local-offer") {
    console.log("setRemoteDescription(answer)");
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    // キューに溜まっていた ICE candidate を処理
    for (const c of pendingCandidates) {
      try {
        await pc.addIceCandidate(c);
      } catch (err) {
        console.error("addIceCandidate (from queue) error:", err);
      }
    }
    pendingCandidates = [];
  }
});

// ===============================
// 応答側（Callee）
// ===============================
document.getElementById("answerBtn").onclick = async () => {
  role = "callee";
  console.log("role = callee");

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

  // 相手に通知
  await fetch(workerURL + "/notify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "通話が開始されました",
      message: "相手が通話に出ました"
    }),
  });
};
