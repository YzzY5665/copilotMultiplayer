import NetClient from "./netClient.js";

// CHANGE THIS to your Render WebSocket URL
const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";

const net = new NetClient(SERVER_URL, "demoGame");

// UI helpers
const logBox = document.getElementById("log");
function log(msg, replace = false) {
    if (replace) {
        logBox.innerHTML = msg + "<br>";
    } else {
        logBox.innerHTML += msg + "<br>";
    }
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
log("Connecting to server...");
// ----------------------
// EVENT HANDLERS
// ----------------------

net.on("connected", () => log("Connected to server", true));
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
        x: Math.floor(Math.random() * 100) * 5,
        y: Math.floor(Math.random() * 60) * 5,
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
    if (payload.color) players[fromId].color = payload.color;
    if (payload.x) players[fromId].x = payload.x;
    if (payload.y) players[fromId].y = payload.y;
});

net.on("playerJoined", (playerId) => {
    console.log("Player joined: " + playerId);
    const me = players[myId];
    net.sendRelay({ x: me.x, y: me.y, color: me.color });
});

// ----------------------
// INPUT HANDLING
// ----------------------
var keysDown = {};
document.addEventListener("keydown", function (e) {
    keysDown[e.key] = true;
});
document.addEventListener("keyup", function (e) {
    delete keysDown[e.key];
});

// ----------------------
// RENDER LOOP
// ----------------------

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (players[myId]){

        const me = players[myId];

        if (keysDown["ArrowUp"]) me.y -= 3;
        if (keysDown["ArrowDown"]) me.y += 3;
        if (keysDown["ArrowLeft"]) me.x -= 3;
        if (keysDown["ArrowRight"]) me.x += 3;
        me.y = Math.max(0, Math.min(canvas.height - 20, me.y));
        me.x = Math.max(0, Math.min(canvas.width - 20, me.x));
        // Broadcast movement
        
        net.sendRelay({ x: me.x, y: me.y });
    }
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

document.getElementById("colorBtn").onclick = () => {
    if (!players[myId]) return;

    const me = players[myId];
    me.color = "#" + Math.floor(Math.random()*16777215).toString(16);
    net.sendRelay({ color: me.color });
}