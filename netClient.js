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

    /**
     * connects to the websocket server defined at this.url
     */
    connect() {
        this.ws = new WebSocket(this.url);
        this.ws.binaryType = "arraybuffer";

        this.ws.onopen = () => this.emit("connected");
        this.ws.onclose = () => this.emit("disconnected");
        this.ws.onerror = () => console.warn("WebSocket error");
        this.ws.onmessage = (evt) => this._handleMessage(evt);
    }

    /**
     * disconnects from the websocket server in a clean fasions
     */
    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }

    //--------------------
    // Room API/ functions
    //--------------------
    /**
     * Sends a request to the server to create a unique room with this client as the host.
     * 
     * when the room is created it's details will be given through the room created event see ("on" for more details)
     * 
     * @param {Array[String]} tags - the tags assigned to the room, can be used for filtering in list rooms
     * @param {int} maxClients - the maximum number of players that can be in a given room (including host/you)
     * @param {boolean} isPrivate  - if this is set to true this room will not show up when other players use list rooms
     */
    createRoom(tags = [], maxClients = 8, isPrivate = false) {
        if (!Array.isArray(tags)) tags = [];
        tags.push(`game:${this.gameName}`);
        if (isPrivate) tags.push("private");

        this._send({ type: "createRoom", tags, maxClients });
    }
    /**
     * sends a request to the server to join a specific room, need to use this for either private rooms(just put code)
     * 
     * or public rooms client side has access to all public room Id's but to join them you request through here
     * @param {String} roomId - The room Id you want to join
     */
    joinRoom(roomId) {
        this._send({ type: "joinRoom", roomId });
    }
    /**
     * Tells the server to remove this client from the room they are currently in, server tells all players and host
     */
    leaveRoom() {
        this._send({ type: "leaveRoom" });
        this.roomId = null;
    }
    /**
     * Sends a request to the server for it to return a list of all public rooms that include the tags in the tags parameter
     * 
     * Use tags for gameodes or none to list all available rooms, you can use the tags returned from the roomList event (see "on" for more details) to tell the player what the room's game mode is
     * 
     * @param {Array[String]} tags - The tags that a room has to have for them to be returned in the listed tooms
     */
    listRooms(tags = []) {
        if (!Array.isArray(tags)) tags = [];
        tags.push(`game:${this.gameName}`);

        this._send({ type: "listRooms", tags });
    }


    /**
     * Tells the server to relay the payload to all other player in the room(includes host) 
     * 
     * Other clients get a fromId (you) and the payload from the relay event (see "on" for more details)
     * 
     * @param {any} payload - The payload that gets delivered to all other clients
     */
    sendRelay(payload) {
        this._send({ type: "relay", payload });
    }
    /**
     * Tells the server to relay the payload to the host of the room
     * 
     * Host client get a fromId (you) and the payload from the tellOwner event (see "on" for more details)
     * 
     * @param {any} payload - The payload that gets delivered to the host client
     */
    tellOwner(payload) {
        this._send({ type: "tellOwner", payload });
    }
    /**
     * Tells the server to relay the payload to the a specific player in the room
     * 
     * @param {*} playerId - The player clientId the payload should be delivered to in this room
     * @param {*} payload - The payload that gets delivered to the player clients 
     */
    tellPlayer(playerId, payload) {
        this._send({ type: "tellPlayer", playerId, payload });
    }

    /**
     * @typedef {string} bitString
     * @typedef {number[]} byteArray
     */

    /**
     * sends a Binary package to all players (including host) no included tags, no from player, no premade en/de coding
     * 
     * you have to encode your own typing into your payloads, but very usefull for sending large amounts of small info like player position every couple frames
     * 
     * @param {bitString|byteArray} data - payload to be relayed to all players in your room
     * 
     * type of data(bitString | byteArray) depends on "this.binaryMode" set at the top of this file
     */
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
    /**
     * run all callbacks/functions connected to a given event by "on"
     * 
     * @param {*} event - What event has happened
     * @param  {...any} args - given function parameters to give to callbacks defined in "on"
     */
    emit(event, ...args) {
        if (this.listeners[event]) {
            this.listeners[event].forEach(cb => cb(...args));
        }
    }
    /**
     * The built in handler to decode all incoming messages from the server
     * 
     * Sends emit signals based on type of messages, so games should use the "on" event system instead of this
     * 
     * @param {*} evt - the raw message directly from the server
     * @returns 
     */
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
    /**
     * Sends a JSON message to the server, the server expects typing so use the built in messageing functions (ex. sendRelay, tellOwner, tellPlayer)
     * 
     * @param {*} obj - the message to be sent in the server typed as a JSON
     * 
     */
    _send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        this.ws.send(JSON.stringify(obj));
    }
}