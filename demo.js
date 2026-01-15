import NetClient from "./netClient.js";

// Utility
function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
}

// Create N fake clients
const CLIENT_COUNT = 4;
const clients = [];

for (let i = 0; i < CLIENT_COUNT; i++) {
    const c = new NetClient("wss://gamebackend-dk2p.onrender.com", "demoGame");
    clients.push(c);
}

// Attach logs to each client
clients.forEach((c, index) => {
    c.on("assignId", data => console.log(`C${index} assignedId`, data));
    c.on("roomCreated", data => console.log(`C${index} roomCreated`, data));
    c.on("roomJoined", data => console.log(`C${index} roomJoined`, data));
    c.on("relay", data => console.log(`C${index} relay`, data));
    c.on("makeHost", data => console.log(`C${index} makeHost`, data));
    c.on("reassignedHost", data => console.log(`C${index} reassignedHost`, data));
    c.on("playerLeft", data => console.log(`C${index} playerLeft`, data));
    c.on("roomList", data => console.log(`C${index} roomList`, data));
});

// Connect all clients
clients.forEach(c => c.connect());

(async () => {
    // Wait for all connections to establish
    await wait(1000);

    console.log("=== STEP 1: Client 0 creates a room ===");
    clients[0].createRoom({
        tags: ["game:demoGame"],
        maxClients: 8
    });

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
        clients[i].relay({ msg: `Hello from client ${i}` });
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
    const bin = new Uint8Array([1, 2, 3, 4, 5]);
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