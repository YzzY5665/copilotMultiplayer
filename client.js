// --- Locked server URL ---
const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";

// --- Connection & protocol state ---
let socket = null;
let playerId = null;
let roomId = null;
let isHost = false;

// --- DOM elements ---
const statusEl = document.getElementById("connection-status");
const connectBtn = document.getElementById("connect-btn");

const lobbySection = document.getElementById("lobby");
const roomSection = document.getElementById("room");

const createRoomBtn = document.getElementById("create-room-btn");
const joinRoomInput = document.getElementById("join-room-id");
const joinRoomBtn = document.getElementById("join-room-btn");
const refreshRoomsBtn = document.getElementById("refresh-rooms-btn");
const roomListEl = document.getElementById("room-list");

const roomIdLabel = document.getElementById("room-id-label");
const playerIdLabel = document.getElementById("player-id-label");
const hostLabel = document.getElementById("host-label");
const leaveRoomBtn = document.getElementById("leave-room-btn");

const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");

// --- Simple game state ---
const players = new Map();
const speed = 150;
const keys = new Set();
let lastTime = performance.now();

// --- UI helpers ---
function setStatus(text, cls = "") {
  statusEl.textContent = text;
  statusEl.className = "";
  if (cls) statusEl.classList.add(cls);
}

function showLobby() {
  lobbySection.classList.remove("hidden");
  roomSection.classList.add("hidden");
}

function showRoom() {
  lobbySection.classList.add("hidden");
  roomSection.classList.remove("hidden");
}

// --- WebSocket setup ---
connectBtn.addEventListener("click", () => {
  if (socket && socket.readyState === WebSocket.OPEN) {
    socket.close();
    return;
  }

  socket = new WebSocket(SERVER_URL);
  setStatus("Connecting...");

  socket.addEventListener("open", () => {
    setStatus("Connected", "connected");
    connectBtn.textContent = "Disconnect";
    lobbySection.classList.remove("hidden");
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected");
    connectBtn.textContent = "Connect";
    lobbySection.classList.add("hidden");
    roomSection.classList.add("hidden");
    players.clear();
    playerId = null;
    roomId = null;
    isHost = false;
  });

  socket.addEventListener("error", () => {
    setStatus("Connection error", "error");
  });

  socket.addEventListener("message", (event) => {
    handleMessage(event.data);
  });
});

// --- Protocol send helpers ---
function sendJSON(obj) {
  if (!socket || socket.readyState !== WebSocket.OPEN) return;
  socket.send(JSON.stringify(obj));
}

// --- Incoming message handler ---
function handleMessage(raw) {
  if (typeof raw !== "string") return;
  let data;
  try { data = JSON.parse(raw); } catch { return; }

  switch (data.type) {
    case "assign_id":
      playerId = data.playerId;
      playerIdLabel.textContent = `Your ID: ${playerId}`;
      break;

    case "room_created":
      roomId = data.roomId;
      isHost = true;
      roomIdLabel.textContent = `Room: ${roomId}`;
      hostLabel.textContent = "(You are host)";
      showRoom();
      initLocalPlayer();
      break;

    case "room_joined":
      roomId = data.roomId;
      isHost = false;
      roomIdLabel.textContent = `Room: ${roomId}`;
      hostLabel.textContent = "(You are player)";
      showRoom();
      initLocalPlayer();
      break;

    case "room_list":
      renderRoomList(data.rooms || []);
      break;

    case "relay":
      handleRelayPayload(data.from, data.payload);
      break;

    case "remove_player":
      players.delete(data.removed_player_id);
      break;

    case "make_host":
      isHost = true;
      hostLabel.textContent = "(You are host)";
      break;

    case "error":
      alert(data.message);
      break;
  }
}

// --- Lobby actions ---
createRoomBtn.addEventListener("click", () => {
  sendJSON({ type: "create_room" });
});

joinRoomBtn.addEventListener("click", () => {
  const id = joinRoomInput.value.trim();
  if (!id) return;
  sendJSON({ type: "join_room", roomId: id });
});

refreshRoomsBtn.addEventListener("click", () => {
  sendJSON({ type: "list_rooms" });
});

function renderRoomList(rooms) {
  roomListEl.innerHTML = "";
  if (!rooms.length) {
    roomListEl.textContent = "No active rooms.";
    return;
  }
  rooms.forEach((room) => {
    const div = document.createElement("div");
    div.className = "room-entry";
    div.textContent = `ID: ${room.roomId} | Players: ${room.playerCount}`;
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join";
    joinBtn.onclick = () => sendJSON({ type: "join_room", roomId: room.roomId });
    div.appendChild(joinBtn);
    roomListEl.appendChild(div);
  });
}

// --- Room actions ---
leaveRoomBtn.addEventListener("click", () => {
  if (!roomId) return;
  sendJSON({ type: "leave_room" });
  roomId = null;
  isHost = false;
  players.clear();
  showLobby();
});

// --- Game logic ---
function initLocalPlayer() {
  players.set(playerId, {
    x: canvas.width / 2,
    y: canvas.height / 2,
    color: randomColor(),
  });
}

function randomColor() {
  return `hsl(${Math.random() * 360}, 70%, 60%)`;
}

function handleRelayPayload(fromId, payload) {
  if (!payload || payload.kind !== "state") return;
  if (fromId === playerId) return;

  let p = players.get(fromId);
  if (!p) {
    p = { x: payload.x, y: payload.y, color: randomColor() };
    players.set(fromId, p);
  } else {
    p.x = payload.x;
    p.y = payload.y;
  }
}

window.addEventListener("keydown", (e) => keys.add(e.key.toLowerCase()));
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function update(dt) {
  const me = players.get(playerId);
  if (!me) return;

  let dx = 0, dy = 0;
  if (keys.has("w") || keys.has("arrowup")) dy -= 1;
  if (keys.has("s") || keys.has("arrowdown")) dy += 1;
  if (keys.has("a") || keys.has("arrowleft")) dx -= 1;
  if (keys.has("d") || keys.has("arrowright")) dx += 1;

  const len = Math.hypot(dx, dy) || 1;
  me.x += (dx / len) * speed * dt;
  me.y += (dy / len) * speed * dt;

  me.x = Math.max(10, Math.min(canvas.width - 10, me.x));
  me.y = Math.max(10, Math.min(canvas.height - 10, me.y));

  if (roomId) {
    sendJSON({
      type: "relay",
      payload: { kind: "state", x: me.x, y: me.y },
    });
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [id, p] of players.entries()) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    ctx.fillStyle = "#fff";
    ctx.fillText(id, p.x - 10, p.y - 14);
  }
}

function loop(now) {
  const dt = (now - lastTime) / 1000;
  lastTime = now;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
