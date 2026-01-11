// ==============================
// Firebase 初期化
// ==============================
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

// ==============================
// Push 通知 / Service Worker 設定
// ==============================
const workerURL = "https://fancy-rain-ff61.ym21082.workers.dev";

let currentSubscription = null; // この端末の購読情報
let role = null;                // "caller" or "callee"

// Service Worker を登録
async function registerSW() {
  const reg = await navigator.serviceWorker.register("/webrtc-pwa-call-app/service-worker.js");
  return reg;
}

// VAPID 公開鍵を取得
async function getVapidKey() {
  const res = await fetch(workerURL + "/vapidPublicKey");
  return await res.text();
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

// Push 通知を購読（★ caller/callee 決定後に実行）
async function setupPush() {
  const reg = await registerSW();
  await navigator.serviceWorker.ready;

  const vapidKey = await getVapidKey();

  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidKey),
  });

  currentSubscription = sub;

  // Worker 側の /subscribe はダミー
  await fetch(workerURL + "/subscribe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(sub),
  });

  // ★ role が決まっているので Firebase に保存できる
  if (role) {
    await db.ref("subscriptions/" + role).set(sub);
    console.log("Saved subscription for role:", role);
  }

  console.log("Push 通知の購読が完了しました");
}

// ==============================
// WebRTC 設定
// ==============================
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
});

let pendingCandidates = [];
let localStream;

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
  document.getElementById("remoteVideo").srcObject = event.streams[0];
};

// ICE candidate を送信
pc.onicecandidate = event => {
  if (event.candidate) {
    db.ref("candidates").push(event.candidate.toJSON());
  }
};

// ICE candidate を受信
db.ref("candidates").on("child_added", async snapshot => {
  const data = snapshot.val();
  if (!data) return;

  const candidate = new RTCIceCandidate(data);

  if (!pc.remoteDescription) {
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

  // ★ ここで購読を開始（初めて role が決まる）
  await setupPush();

  // シグナリングデータをクリア
  await db.ref("offer").set(null);
  await db.ref("answer").set(null);
  await db.ref("candidates").set(null);

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await db.ref("offer").set(offer);

  // ★ 相手（callee）の購読情報を取得
  const targetSnap = await db.ref("subscriptions/callee").get();
  const targetSub = targetSnap.val();

  if (targetSub) {
    await fetch(workerURL + "/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "着信があります",
        message: "相手があなたに発信しました",
        subscription: targetSub,
      }),
    });
  } else {
    console.warn("callee の購読情報がまだありません");
  }
};

// answer を受信（Caller）
db.ref("answer").on("value", async snapshot => {
  if (role !== "caller") return;

  const answer = snapshot.val();
  if (!answer) return;

  if (pc.signalingState === "have-local-offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));

    for (const c of pendingCandidates) {
      await pc.addIceCandidate(c);
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

  // ★ ここで購読を開始（初めて role が決まる）
  await setupPush();

  const offerSnapshot = await db.ref("offer").get();
  const offer = offerSnapshot.val();

  if (!offer) {
    alert("発信側がまだ準備できていません。");
    return;
  }

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);
  await db.ref("answer").set(answer);

  // ★ 相手（caller）の購読情報を取得
  const targetSnap = await db.ref("subscriptions/caller").get();
  const targetSub = targetSnap.val();

  if (targetSub) {
    await fetch(workerURL + "/notify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "通話が開始されました",
        message: "相手が通話に出ました",
        subscription: targetSub,
      }),
    });
  } else {
    console.warn("caller の購読情報がまだありません");
  }
};
