import NetClient from "./netClient.js";

function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Number of fake clients to spawn
const CLIENT_COUNT = 4;
const clients = [];

// Replace with your actual WebSocket URL
const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";

// Create clients
for (let i = 0; i < CLIENT_COUNT; i++) {
    const c = new NetClient(SERVER_URL, "demoGame");
    clients.push(c);
}

// Attach logs to each client
clients.forEach((c, index) => {
    c.on("connected", () => console.log(`C${index} connected`));
    c.on("assignedId", id => console.log(`C${index} assignedId`, id));
    c.on("roomCreated", (roomId, pid) => console.log(`C${index} roomCreated`, roomId));
    c.on("roomJoined", (roomId, pid, ownerId, max) => console.log(`C${index} roomJoined`, roomId));
    c.on("relay", (from, payload) => console.log(`C${index} relay from ${from}`, payload));
    c.on("tellOwner", (from, payload) => console.log(`C${index} tellOwner from ${from}`, payload));
    c.on("tellPlayer", (from, payload) => console.log(`C${index} tellPlayer from ${from}`, payload));
    c.on("makeHost", oldHost => console.log(`C${index} makeHost`, oldHost));
    c.on("reassignedHost", (newHost, oldHost) => console.log(`C${index} reassignedHost`, newHost));
    c.on("playerLeft", pid => console.log(`C${index} playerLeft`, pid));
    c.on("roomList", list => console.log(`C${index} roomList`, list));
    c.on("binary", data => console.log(`C${index} binary`, data));
});

// Connect all clients
clients.forEach(c => c.connect());

(async () => {
    await wait(1000);

    console.log("=== STEP 1: Client 0 creates a room ===");
    clients[0].createRoom([], 8, false);

    await wait(500);

    const roomId = clients[0].roomId;
    console.log("Room created:", roomId);

    console.log("=== STEP 2: Other clients join the room ===");
    for (let i = 1; i < CLIENT_COUNT; i++) {
        clients[i].joinRoom(roomId);
        await wait(300);
    }

    console.log("=== STEP 3: Relay messages from all clients ===");
    for (let i = 0; i < CLIENT_COUNT; i++) {
        clients[i].sendRelay({ msg: `Hello from client ${i}` });
        await wait(200);
    }

    console.log("=== STEP 4: tellOwner from clients 1–3 ===");
    for (let i = 1; i < CLIENT_COUNT; i++) {
        clients[i].tellOwner({ msg: `Owner pls respond ${i}` });
        await wait(200);
    }

    console.log("=== STEP 5: tellPlayer from owner to each client ===");
    for (let i = 1; i < CLIENT_COUNT; i++) {
        clients[0].tellPlayer(clients[i].playerId, { msg: `Hi C${i}` });
        await wait(200);
    }

    console.log("=== STEP 6: List rooms ===");
    clients[2].listRooms();

    await wait(500);

    console.log("=== STEP 7: Send binary packets ===");
    const bin = [1, 2, 3, 4, 5];
    clients[1].sendBinary(bin);
    clients[2].sendBinary(bin);
    clients[3].sendBinary(bin);

    await wait(500);

    console.log("=== STEP 8: Clients leave the room ===");
    for (let i = CLIENT_COUNT - 1; i >= 0; i--) {
        clients[i].leaveRoom();
        await wait(300);
    }

    console.log("=== CHAOS TEST COMPLETE ===");
})();