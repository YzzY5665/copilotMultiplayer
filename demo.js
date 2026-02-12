import NetClient from "./netClient.js";

// CHANGE THIS to your Render WebSocket URL
const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";

const net = new NetClient(SERVER_URL, "demoGame");

// UI helpers
const logBox = document.getElementById("log");
function log(msg) {
    logBox.innerHTML += msg + "<br>";
    logBox.scrollTop = logBox.scrollHeight;
}

// Game state
const players = {}; // playerId → { x, y, color }
let myId = null;

// Canvas setup
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

// Connect immediately
net.connect();

// ----------------------
// EVENT HANDLERS
// ----------------------

net.on("connected", () => log("Connected to server"));
net.on("disconnected", () => log("Disconnected"));

net.on("assignedId", (id) => {
    myId = id;
    log("Assigned ID: " + id);
});

net.on("roomCreated", (roomId, yourId) => {
    log("Room created: " + roomId);
    players[myId] = {
        x: Math.random() * 500,
        y: Math.random() * 300,
        color: "#" + Math.floor(Math.random()*16777215).toString(16)
    };
});

net.on("roomJoined", (roomId, yourId, ownerId, maxClients) => {
    log(`Joined room ${roomId} | Host: ${ownerId} | Max: ${maxClients}`);

    // Spawn your square
    players[myId] = {
        x: Math.random() * 500,
        y: Math.random() * 300,
        color: "#" + Math.floor(Math.random()*16777215).toString(16)
    };
    
    net.sendRelay({ x: players[myId].x, y: players[myId].y, color : players[myId].color });
});

net.on("playerLeft", (playerId) => {
    log("Player left: " + playerId);
    delete players[playerId];
});

net.on("makeHost", (oldHostId) => {
    log("You are now the host (old host: " + oldHostId + ")");
});

net.on("reassignedHost", (newHostId, oldHostId) => {
    log(`Host changed: ${oldHostId} → ${newHostId}`);
});

net.on("relay", (fromId, payload) => {

    if (!players[fromId]) {
        players[fromId] = {
            x: 0, y: 0,
            color: payload.color || "#" + Math.floor(Math.random()*16777215).toString(16)
        };
    }
    players[fromId].x = payload.x;
    players[fromId].y = payload.y;
});

net.on("playerJoined", (playerId) => {
    console.log("Player joined: " + playerId);
    const me = players[myId];
    net.sendRelay({ x: me.x, y: me.y, color: me.color });
});

// ----------------------
// INPUT HANDLING
// ----------------------

document.addEventListener("keydown", (e) => {
    if (!players[myId]) return;

    const me = players[myId];

    if (e.key === "ArrowUp") me.y -= 5;
    if (e.key === "ArrowDown") me.y += 5;
    if (e.key === "ArrowLeft") me.x -= 5;
    if (e.key === "ArrowRight") me.x += 5;

    // Broadcast movement
    net.sendRelay({ x: me.x, y: me.y });
});

// ----------------------
// RENDER LOOP
// ----------------------

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (const id in players) {
        const p = players[id];
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 20, 20);
    }

    requestAnimationFrame(draw);
}
draw();

// ----------------------
// BUTTONS
// ----------------------

document.getElementById("createBtn").onclick = () => {
    net.createRoom([], 8, false);
};

document.getElementById("joinBtn").onclick = () => {
    const roomId = document.getElementById("roomInput").value.trim();
    if (roomId) net.joinRoom(roomId);
};