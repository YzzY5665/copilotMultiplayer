// ============================================================================
// NetClient.js
// Networking class for browser games
// ============================================================================

export default class NetClient {
    constructor(url, gameName = "defaultGame") {
        this.url = url;
        this.gameName = gameName;
        this.ws = null;

        // connection states
        this.playerId = null;
        this.roomId = null;
        this.ownerId = null;
        this.isHost = false;

        // binary output mode: "bitstring" or "arraybytes"
        this.binaryMode = "bitstring";

        // event listeners: eventName → array of callbacks
        this.listeners = {};
    }

    // ------------------------------------------------------------------------
    // === PUBLIC API: Events, Methods, and functions pls read ===
    // ------------------------------------------------------------------------

    /**
     * Add a callback function to an event.
     * Multiple functions can be added to the same event.
     *
     * @param {string} event - The event name to listen for.
     * @param {Function} callback - The function to call when the event fires.
     *  
     * Available events:
     * 
     * "connected"      – Fired when the WebSocket connection is established.
     * 
     * "disconnected"   – Fired when the WebSocket connection is closed.
     * 
     * "assignedId"     – Fired when the server assigns this client a unique player ID. (yourId)
     * 
     * "roomCreated"    – Fired after the server creates a room. (roomId, yourId)
     * 
     * "roomJoined"     – Fired after joining a room. (roomId, yourId, ownerId, maxClients)
     * 
     * "makeHost"       – Fired when this client is promoted to host. (oldHostId)
     * 
     * "playerLeft"     – Fired when a player leaves the room. (thatPlayerId)
     * 
     * "reassignedHost" – Fired when another player becomes host. (newHostId, oldHostId)
     * 
     * "relay"          – Fired when a broadcast message is received. (fromId, payload)
     * 
     * "tellOwner"      – Fired when a direct message is sent to the room owner. (fromId, payload)
     * 
     * "tellPlayer"     – Fired when a direct message is sent to this client. (fromId, payload)
     * 
     * "roomList"       – Fired when the server responds with a list of rooms. (roomList)
     * 
     * "binary"         – Fired when binary data is received. (binaryPackage)
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    // Connect to the WebSocket server
    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => this.emit("connected");
        this.ws.onclose = () => this.emit("disconnected");
        this.ws.onerror = () => console.warn("WebSocket error");
        this.ws.onmessage = (evt) => this._handleMessage(evt);
    }

    // Disconnect cleanly
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    // --- Room API ---
    createRoom(tags = [], maxClients = 8, isPrivate = false) {
        if (!Array.isArray(tags)) tags = [];
        tags.push(`game:${this.gameName}`);
        if (isPrivate) tags.push("private");

        this._send({ type: "createRoom", tags, maxClients });
    }

    joinRoom(roomId) {
        this._send({ type: "joinRoom", roomId });
    }

    leaveRoom() {
        this._send({ type: "leaveRoom" });
        this.roomId = null;
    }

    listRooms(tags = [], includePrivate = false) {
        if (!Array.isArray(tags)) tags = [];
        tags.push(`game:${this.gameName}`);

        this._send({ type: "listRooms", tags, includePrivate });
    }

    // --- Messaging API ---
    sendRelay(payload) {
        this._send({ type: "relay", payload });
    }

    tellOwner(payload) {
        this._send({ type: "tellOwner", payload });
    }

    tellPlayer(playerId, payload) {
        this._send({ type: "tellPlayer", playerId, payload });
    }

    // --- Binary API ---
    sendBinary(data) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        let buffer;
        if (typeof data === "string") {
            const chunks = data.match(/.{1,8}/g) || [];
            const bytes = chunks.map(bin => parseInt(bin, 2));
            buffer = new Uint8Array(bytes).buffer;
        } else if (Array.isArray(data)) {
            buffer = new Uint8Array(data).buffer;
        }

        if (buffer) this.ws.send(buffer);
    }

    // ------------------------------------------------------------------------
    // === INTERNAL HELPERS, so like stop reading ===
    // ------------------------------------------------------------------------

    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(...args));
        }
    }

    _handleMessage(evt) {
        // Binary data
        if (evt.data instanceof ArrayBuffer) {
            const bytes = new Uint8Array(evt.data);

            if (this.binaryMode === "bitstring") {
                const bitstring = [...bytes]
                    .map(b => b.toString(2).padStart(8, "0"))
                    .join("");
                this.emit("binary", bitstring);
            } else if (this.binaryMode === "arraybytes") {
                const arr = Array.from(bytes);
                this.emit("binary", arr);
            }
            return;
        }

        // JSON data
        let data;
        try {
            data = JSON.parse(evt.data);
        } catch {
            return;
        }

        switch (data.type) {

            case "assignId":
                this.playerId = data.playerId;
                this.emit("assignedId", data.playerId);
                break;

            case "roomCreated":
                this.roomId = data.roomId;
                this.ownerId = data.playerId;
                this.emit("roomCreated", data.roomId, data.playerId);
                break;

            case "roomJoined":
                this.isHost = false;
                this.roomId = data.roomId;
                this.ownerId = data.ownerId;
                this.emit("roomJoined", data.roomId, data.playerId, data.ownerId, data.maxClients);
                break;

            case "makeHost":
                this.isHost = true;
                this.ownerId = this.playerId;
                this.emit("makeHost", data.oldHostId);
                break;

            case "reassignedHost":
                this.ownerId = data.newHostId;
                this.isHost = (this.playerId === data.newHostId);
                this.emit("reassignedHost", data.newHostId, data.oldHostId);
                break;

            case "playerLeft":
                this.emit("playerLeft", data.playerId);
                break;

            case "relay":
                this.emit("relay", data.from, data.payload);
                break;

            case "tellOwner":
                this.emit("tellOwner", data.from, data.payload);
                break;

            case "tellPlayer":
                this.emit("tellPlayer", data.from, data.payload);
                break;

            case "roomList":
                this.emit("roomList", data.rooms);
                break;
        }
    }

    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(obj));
    }
}