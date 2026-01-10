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
const pc = new RTCPeerConnection();
let localStream;

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localStream = stream;
    document.getElementById("localVideo").srcObject = stream;
    stream.getTracks().forEach(track => pc.addTrack(track, stream));
  });

pc.ontrack = event => {
  document.getElementById("remoteVideo").srcObject = event.streams[0];
};

pc.onicecandidate = event => {
  if (event.candidate) {
    db.ref("candidates").push(event.candidate.toJSON());
  }
};

document.getElementById("callBtn").onclick = async () => {
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  db.ref("offer").set(offer);
};

document.getElementById("answerBtn").onclick = async () => {
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  db.ref("answer").set(answer);
};

db.ref("offer").on("value", async snapshot => {
  const offer = snapshot.val();
  if (offer && !pc.currentRemoteDescription) {
    await pc.setRemoteDescription(new RTCSessionDescription(offer));
  }
});

db.ref("answer").on("value", async snapshot => {
  const answer = snapshot.val();
  if (answer && pc.signalingState === "have-local-offer") {
    await pc.setRemoteDescription(new RTCSessionDescription(answer));
  }
});

db.ref("candidates").on("child_added", async snapshot => {
  const candidate = snapshot.val();
  await pc.addIceCandidate(new RTCIceCandidate(candidate));
});
