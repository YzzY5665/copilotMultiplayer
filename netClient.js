// ============================================================================
// NetClient.js
// Lightweight WebSocket networking client for browser games
// ============================================================================

export default class NetClient {
    constructor(url, gameName = "defaultGame") {
        this.url = url;
        this.gameName = gameName;
        this.ws = null;

        // connection / room state
        this.playerId = null;
        this.roomId = null;
        this.ownerId = null;
        this.isHost = false;

        // event listeners: eventName → callbacks[]
        this.listeners = {};
    }

    // ------------------------------------------------------------------------
    // === PUBLIC EVENT API ===
    // ------------------------------------------------------------------------

    /**
     * Subscribe to a networking event.
     *
     * @param {string} event
     * @param {Function} callback
     *
     * Events:
     * "connected"
     * "disconnected"
     * "assignedId"        (yourId)
     * "roomCreated"       (roomId, yourId)
     * "roomJoined"        (roomId, yourId, ownerId, maxClients)
     * "leftRoom"          (roomId)
     * "makeHost"          (oldHostId)
     * "reassignedHost"    (newHostId, oldHostId)
     * "playerLeft"        (playerId)
     * "relay"             (fromId, payload)
     * "tellOwner"         (fromId, payload)
     * "tellPlayer"        (fromId, payload)
     * "roomList"          (rooms)
     * "binary"            (fromId, ArrayBuffer)
     * "error"             (message)
     */
    on(event, callback) {
        if (!this.listeners[event]) this.listeners[event] = [];
        this.listeners[event].push(callback);
    }

    emit(event, ...args) {
        this.listeners[event]?.forEach(cb => cb(...args));
    }

    // ------------------------------------------------------------------------
    // === CONNECTION API ===
    // ------------------------------------------------------------------------

    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => this.emit("connected");

        this.ws.onclose = () => {
            // reset all local state
            this.playerId = null;
            this.roomId = null;
            this.ownerId = null;
            this.isHost = false;
            this.emit("disconnected");
        };

        this.ws.onerror = () => console.warn("WebSocket error");
        this.ws.onmessage = evt => this._handleMessage(evt);
    }

    disconnect() {
        this.ws?.close();
        this.ws = null;
    }

    // ------------------------------------------------------------------------
    // === ROOM API ===
    // ------------------------------------------------------------------------

    createRoom(tags = [], maxClients = 8, isPrivate = false) {
        this._send({
            type: "createRoom",
            tags: [...tags, `game:${this.gameName}`, ...(isPrivate ? ["private"] : [])],
            maxClients
        });
    }

    joinRoom(roomId) {
        this._send({ type: "joinRoom", roomId });
    }

    leaveRoom() {
        this._send({ type: "leaveRoom" });
    }

    listRooms(tags = []) {
        this._send({
            type: "listRooms",
            tags: [...tags, `game:${this.gameName}`]
        });
    }

    // ------------------------------------------------------------------------
    // === MESSAGE API ===
    // ------------------------------------------------------------------------

    sendRelay(payload) {
        this._send({ type: "relay", payload });
    }

    tellOwner(payload) {
        this._send({ type: "tellOwner", payload });
    }

    tellPlayer(playerId, payload) {
        this._send({ type: "tellPlayer", playerId, payload });
    }

    /**
     * Send raw binary data to all players in the room.
     * Server will prefix senderId automatically.
     *
     * @param {ArrayBuffer} buffer
     */
    sendBinary(buffer) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(buffer);
    }

    // ------------------------------------------------------------------------
    // === INTERNAL MESSAGE HANDLING ===
    // ------------------------------------------------------------------------

    _handleMessage(evt) {
        // ---------------- Binary ----------------
        if (evt.data instanceof ArrayBuffer) {
            const dv = new DataView(evt.data);
            const fromId = dv.getUint32(0);

            // slice off senderId (first 4 bytes)
            const payload = evt.data.slice(4);
            this.emit("binary", fromId, payload);
            return;
        }

        // ---------------- JSON ----------------
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
                this.isHost = true;
                this.emit("roomCreated", data.roomId, data.playerId);
                break;

            case "roomJoined":
                this.roomId = data.roomId;
                this.ownerId = data.ownerId;
                this.isHost = false;
                this.emit("roomJoined", data.roomId, data.playerId, data.ownerId, data.maxClients);
                break;

            case "leftRoom":
                this.roomId = null;
                this.ownerId = null;
                this.isHost = false;
                this.emit("leftRoom", data.roomId);
                break;

            case "makeHost":
                this.isHost = true;
                this.ownerId = this.playerId;
                this.emit("makeHost", data.oldHostId);
                break;

            case "reassignedHost":
                this.ownerId = data.newHostId;
                this.isHost = this.playerId === data.newHostId;
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

            case "error":
                this.emit("error", data.message);
                break;
        }
    }

    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(obj));
    }
}
