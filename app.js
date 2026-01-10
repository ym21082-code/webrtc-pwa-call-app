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

// === WebRTC ===
const pc = new RTCPeerConnection({
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" }
  ]
});

let localStream;
let role = null; // ← 発信側 or 応答側を記録する

// カメラ取得
navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    document.getElementById("localVideo").srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
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
db.ref("candidates").on("child_added", snapshot => {
  const candidate = snapshot.val();
  pc.addIceCandidate(new RTCIceCandidate(candidate));
});

// ===============================
// 発信側（Caller）
// ===============================
document.getElementById("callBtn").onclick = async () => {
  role = "caller";

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  db.ref("offer").set(offer);
};

// answer を受信（Caller のみ）
db.ref("answer").on("value", async snapshot => {
  if (role !== "caller") return;

  const answer = snapshot.val();
  if (answer && pc.signalingState === "have-local-offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

// ===============================
// 応答側（Callee）
// ===============================
document.getElementById("answerBtn").onclick = async () => {
  role = "callee";

  const offerSnapshot = await db.ref("offer").once("value");
  const offer = offerSnapshot.val();
  if (!offer) return;

  await pc.setRemoteDescription(new RTCSessionDescription(offer));

  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  db.ref("answer").set(answer);
};
// offer を受信（Callee のみ）
db.ref("offer").on("value", async snapshot => {
  if (role !== "callee") return;  // 応答側だけが offer を受信

  const offer = snapshot.val();
  if (offer && !pc.currentRemoteDescription) {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
  }
});
