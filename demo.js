// ============================================================================
// demo.js
// Chaos / load test for NetClient + WebSocket game server (100 clients)
// Uses: metadata, tags, closed rooms, relay, binary
// ============================================================================

import NetClient from "./netClient.js";

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function wait(ms) {
    return new Promise(res => setTimeout(res, ms));
}

function stats(name, arr) {
    if (arr.length === 0) return;
    const min = Math.min(...arr).toFixed(2);
    const max = Math.max(...arr).toFixed(2);
    const avg = (arr.reduce((a, b) => a + b, 0) / arr.length).toFixed(2);
    console.log(`${name}: min=${min}ms max=${max}ms avg=${avg}ms samples=${arr.length}`);
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER_URL = "wss://gamebackend-dk2p.onrender.com";
const CLIENT_COUNT = 100;
const clients = [];

// counters
let assignedCount = 0;
let joinCount = 0;
let playerJoinedEvents = 0;
let relayReceived = 0;
let binaryReceived = 0;
let roomUpdatedCount = 0;
let tagAddedCount = 0;
let tagRemovedCount = 0;
let errorCount = 0;

// timing buckets
const timings = {
    connect: [],
    assignedId: [],
    joinRoom: [],
    relay: [],
    binary: [],
    roomUpdated: [],
    tagAdded: [],
    tagRemoved: [],
    listRooms: []
};

// ---------------------------------------------------------------------------
// Create clients
// ---------------------------------------------------------------------------

for (let i = 0; i < CLIENT_COUNT; i++) {
    const client = new NetClient(SERVER_URL, "demoGame");
    clients.push(client);

    const t0 = performance.now();

    client.on("connected", () => {
        timings.connect.push(performance.now() - t0);
    });

    client.on("assignedId", () => {
        assignedCount++;
        timings.assignedId.push(performance.now() - t0);
    });

    client.on("roomJoined", () => {
        joinCount++;
        timings.joinRoom.push(performance.now() - t0);
    });

    client.on("playerJoined", () => {
        playerJoinedEvents++;
    });

    client.on("relay", () => {
        relayReceived++;
        timings.relay.push(performance.now() - t0);
    });

    client.on("binary", () => {
        binaryReceived++;
        timings.binary.push(performance.now() - t0);
    });

    client.on("roomUpdated", () => {
        roomUpdatedCount++;
        timings.roomUpdated.push(performance.now() - t0);
    });

    client.on("roomTagAdded", () => {
        tagAddedCount++;
        timings.tagAdded.push(performance.now() - t0);
    });

    client.on("roomTagRemoved", () => {
        tagRemovedCount++;
        timings.tagRemoved.push(performance.now() - t0);
    });

    client.on("roomList", () => {
        timings.listRooms.push(performance.now() - t0);
    });

    client.on("error", msg => {
        errorCount++;
        console.warn(`[Client ${i}] ERROR:`, msg);
    });
}

// ---------------------------------------------------------------------------
// Connect all clients
// ---------------------------------------------------------------------------

clients.forEach(c => c.connect());

// ---------------------------------------------------------------------------
// Test sequence
// ---------------------------------------------------------------------------

(async () => {
    console.log("Waiting for all clients to receive assignedId...");

    while (assignedCount < CLIENT_COUNT) {
        await wait(50);
    }

    console.log("=== STEP 1: Client 0 creates room with metadata + tags ===");
    const host = clients[0];

    host.createRoom(
        ["region:NA", "mode:deathmatch"],
        200,
        false,
        {
            name: "Chaos Lobby",
            map: "Arena-01",
            mode: "Deathmatch",
            maxScore: 50
        }
    );

    while (!host.roomId) {
        await wait(20);
    }

    const roomId = host.roomId;
    console.log("Room ID:", roomId);

    console.log("=== STEP 2: All clients join ===");
    for (let i = 1; i < CLIENT_COUNT; i++) {
        clients[i].joinRoom(roomId);
        await wait(5); // stagger joins slightly
    }

    while (joinCount < CLIENT_COUNT - 1) {
        await wait(20);
    }

    console.log("=== STEP 3: Host updates metadata (roomUpdated) ===");
    host.updateMeta({
        map: "Arena-02",
        mode: "Team Deathmatch",
        note: "Meta updated during chaos test"
    });

    await wait(500);

    console.log("=== STEP 4: Host adds a 'closed' tag (no mid-join) ===");
    host.addTag("closed");

    await wait(500);

    console.log("=== STEP 5: Try to join after closed (should error) ===");
    const extraClient = new NetClient(SERVER_URL, "demoGame");
    extraClient.on("error", msg => {
        console.log("[ExtraClient] Expected error:", msg);
    });
    extraClient.connect();
    await wait(500);
    extraClient.joinRoom(roomId);
    await wait(500);
    extraClient.disconnect();

    console.log("=== STEP 6: Host removes 'closed' tag (re-open room) ===");
    host.removeTag("closed");

    await wait(500);

    console.log("=== STEP 7: List rooms with game tag filter ===");
    host.listRooms(["region:NA"]);

    await wait(500);

    console.log("=== STEP 8: Relay burst ===");
    for (let i = 0; i < CLIENT_COUNT; i++) {
        clients[i].sendRelay({ msg: `Hello from ${i}` });
    }

    await wait(1000);

    console.log("=== STEP 9: Binary burst ===");
    const bin = new Uint8Array([1, 2, 3, 4, 5]).buffer;
    for (let i = 0; i < CLIENT_COUNT; i++) {
        clients[i].sendBinary(bin);
    }

    await wait(1000);

    console.log("=== STEP 10: Everyone leaves ===");
    for (let i = 0; i < CLIENT_COUNT; i++) {
        clients[i].leaveRoom();
        await wait(5);
    }

    await wait(500);

    console.log("=== CHAOS TEST COMPLETE ===");

    console.log("\n=== TIMING RESULTS ===");
    stats("Connect", timings.connect);
    stats("AssignedId", timings.assignedId);
    stats("JoinRoom", timings.joinRoom);
    stats("Relay", timings.relay);
    stats("Binary", timings.binary);
    stats("RoomUpdated", timings.roomUpdated);
    stats("TagAdded", timings.tagAdded);
    stats("TagRemoved", timings.tagRemoved);
    stats("ListRooms", timings.listRooms);

    console.log("\n=== COUNTS ===");
    console.log("assigned:", assignedCount);
    console.log("joined:", joinCount);
    console.log("playerJoined events:", playerJoinedEvents);
    console.log("relay received:", relayReceived);
    console.log("binary received:", binaryReceived);
    console.log("roomUpdated events:", roomUpdatedCount);
    console.log("tagAdded events:", tagAddedCount);
    console.log("tagRemoved events:", tagRemovedCount);
    console.log("errors:", errorCount);
})();