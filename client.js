// --- Connection & protocol state ---
let socket = null;
let playerId = null;
let roomId = null;
let isHost = false;

// --- DOM elements ---
const statusEl = document.getElementById("connection-status");
const serverUrlInput = document.getElementById("server-url");
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
const players = new Map(); // playerId -> { x, y, color }
const speed = 150; // pixels per second
const keys = new Set();
let lastTime = performance.now();

// Utility: random color
function randomColor() {
  const r = 100 + Math.floor(Math.random() * 155);
  const g = 100 + Math.floor(Math.random() * 155);
  const b = 100 + Math.floor(Math.random() * 155);
  return `rgb(${r},${g},${b})`;
}

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
  const url = serverUrlInput.value.trim();
  if (!url) return;

  socket = new WebSocket(url);
  setStatus("Connecting...", "");

  socket.addEventListener("open", () => {
    setStatus("Connected", "connected");
    connectBtn.textContent = "Disconnect";
    lobbySection.classList.remove("hidden");
  });

  socket.addEventListener("close", () => {
    setStatus("Disconnected", "");
    connectBtn.textContent = "Connect";
    lobbySection.classList.add("hidden");
    roomSection.classList.add("hidden");
    playerId = null;
    roomId = null;
    isHost = false;
    players.clear();
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
  // Server sends JSON for control, raw Buffer for binary (ignored here)
  if (typeof raw !== "string") return;
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

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

    case "add_player":
      // Host gets notified of new players; we could send them initial state here if we wanted.
      console.log("Player joined:", data.newPlayerId);
      break;

    case "remove_player":
      players.delete(data.removed_player_id);
      break;

    case "make_host":
      if (data && data.old_host) {
        console.log("New host, previous host:", data.old_host);
      }
      isHost = true;
      hostLabel.textContent = "(You are host)";
      break;

    case "relay":
      handleRelayPayload(data.from, data.payload);
      break;

    case "tell_owner":
      // Not used in this simple demo, but wired for future logic.
      console.log("tell_owner from", data.from, data.payload);
      break;

    case "tell_player":
      console.log("tell_player from", data.from, data.payload);
      break;

    case "error":
      alert(data.message || "Server error");
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
    const info = document.createElement("span");
    info.textContent = `ID: ${room.roomId} | Owner: ${room.ownerId} | Players: ${room.playerCount}`;
    const joinBtn = document.createElement("button");
    joinBtn.textContent = "Join";
    joinBtn.addEventListener("click", () => {
      joinRoomInput.value = room.roomId;
      sendJSON({ type: "join_room", roomId: room.roomId });
    });
    div.appendChild(info);
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
  if (!playerId) return;
  const color = randomColor();
  players.set(playerId, {
    x: canvas.width / 2,
    y: canvas.height / 2,
    color,
  });
}

// Handle relay payloads from other players
function handleRelayPayload(fromId, payload) {
  if (!payload || payload.kind !== "state") return;
  if (fromId === playerId) return; // ignore our own echo just in case

  let p = players.get(fromId);
  if (!p) {
    p = { x: payload.x, y: payload.y, color: randomColor() };
    players.set(fromId, p);
  } else {
    p.x = payload.x;
    p.y = payload.y;
  }
}

// Input handling
window.addEventListener("keydown", (e) => {
  if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "w", "a", "s", "d"].includes(e.key)) {
    keys.add(e.key.toLowerCase());
  }
});

window.addEventListener("keyup", (e) => {
  keys.delete(e.key.toLowerCase());
});

// Game loop
function update(dt) {
  const me = players.get(playerId);
  if (me) {
    let dx = 0;
    let dy = 0;
    if (keys.has("arrowup") || keys.has("w")) dy -= 1;
    if (keys.has("arrowdown") || keys.has("s")) dy += 1;
    if (keys.has("arrowleft") || keys.has("a")) dx -= 1;
    if (keys.has("arrowright") || keys.has("d")) dx += 1;

    const len = Math.hypot(dx, dy) || 1;
    me.x += (dx / len) * speed * dt;
    me.y += (dy / len) * speed * dt;

    // Clamp to canvas
    me.x = Math.max(10, Math.min(canvas.width - 10, me.x));
    me.y = Math.max(10, Math.min(canvas.height - 10, me.y));

    // Broadcast our state to others in the room
    if (roomId) {
      sendJSON({
        type: "relay",
        payload: {
          kind: "state",
          x: me.x,
          y: me.y,
        },
      });
    }
  }
}

function render() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (const [id, p] of players.entries()) {
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 10, p.y - 10, 20, 20);
    ctx.fillStyle = "#e5e7eb";
    ctx.font = "10px sans-serif";
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
