import { WebSocketServer } from "ws";

import { randomUUID } from "node:crypto";

export default class Socket {
    constructor() {
        this.port = process.env.PORT || 80;

        this.wss = new WebSocketServer({
            port: this.port,
            perMessageDeflate: false,
        });

        this.lobby = {
            global: {
                name: "Chat global",
                connections: {},
                messages: [],
            },
        };

        this.connections = {};
    }

    addSocketInCache = (socketID, socket) => {
        this.connections[socketID] = socket;
    };

    removeSocketInCache = (socketID) => {
        delete this.connections[socketID];
    };

    getSocketInCache = (socketID) => {
        return this.connections[socketID];
    };

    addSocketInLobby = (channel, socketID) => {
        const lobby = this.lobby[channel];
        if (!lobby) {
            return false;
        }

        lobby.connections[socketID] = "online";
    };

    removeSocketInLobby = (channel, socketID) => {
        const lobby = this.lobby[channel];
        if (!lobby) {
            return false;
        }

        delete lobby.connections[socketID];
    };

    getSocketInLobby = (channel, socketID) => {
        const lobby = this.lobby[channel];
        if (!lobby) {
            return false;
        }

        return lobby.connections[socketID];
    };

    notifyAllSocketInLobby = (data) => {
        const json = JSON.stringify({
            type: data.type,
            packet: data.packet,
        });

        for (const index in this.connections) {
            const socket = this.connections[index];
            socket.send(json);
        }
    };

    notifySocketConnection = (socketID, data) => {
        const socket = this.getSocketInCache(socketID);
        if (!socket) {
            return false;
        }

        const json = JSON.stringify({
            type: data.type,
            packet: data.packet,
        });

        socket.send(json);
    };

    addMessageInChannel = (channel, socketID, message) => {
        const lobby = this.lobby[channel];
        if (!lobby) {
            return false;
        }

        const socket = this.getSocketInCache(socketID);
        if (!socket) {
            return false;
        }

        const date = new Date();
        const hour = date.getHours();
        const minute = date.getMinutes();
        lobby.messages.push({
            owner_id: socket.id,
            owner_name: socket.name,
            owner_avatar: socket.avatar,
            text: message,
            hour: hour,
            minute: minute,
        });

        this.notifyAllSocketInLobby({
            type: "send-client-message",
            packet: {
                messages: lobby.messages,
                connections: lobby.connections,
            },
        });
    };

    setupSocket = (socket, name, avatar, channel) => {
        const id = randomUUID();
        const lobby = this.lobby[channel];
        socket.id = id;
        socket.name = name;
        socket.avatar = avatar;
        socket.channel = channel;
        socket.on("close", () => this.onSocketClose(socket.id));
        socket.on("message", (buffer) => this.onSocketMessage(socket.channel, socket.id, buffer));
        this.addSocketInCache(socket.id, socket);
        this.addSocketInLobby(channel, socket.id);
        this.notifySocketConnection(id, {
            type: "setup-client",
            packet: { id: id, name: name, avatar: avatar, channel: channel, messages: lobby.messages, connections: lobby.connections },
        });
    };

    onSocketMessage = (channel, socketID, buffer) => {
        try {
            const string = buffer.toString("utf8");
            const json = JSON.parse(string);
            switch (json.type) {
                case "new-client-message":
                    this.addMessageInChannel(channel, socketID, json.content.message);
                    break;
                default:
                    throw new Error("not method allowed");
            }
        } catch {
            console.log("[CHAT-SERVER] - ERROR - PROCESS NEW CLIENT MESSAGE");
        }
    };

    onSocketClose = (socketID) => {
        const socket = this.getSocketInCache(socketID);
        if (!socket) {
            return false;
        }

        const lobby = this.lobby[socket.channel];
        if (!lobby) {
            return false;
        }

        this.removeSocketInCache(socketID);
        this.removeSocketInLobby(socket.channel, socketID);
        this.notifyAllSocketInLobby({
            type: "update-client-connections",
            packet: {
                connections: lobby.connections,
            },
        });
    };

    onSocketConnection = (socket, req) => {
        try {
            const params = new URL(`${req.headers.origin}${req.url}`).searchParams;
            const name = params.get("name");
            const lobby = params.get("lobby");
            const avatar = params.get("avatar");
            if (!name || !lobby || !avatar) {
                return socket.close();
            }

            if (lobby === "global") {
                return this.setupSocket(socket, name, avatar, "global");
            }

            const channel = this.lobby[lobby];
            if (!channel) {
                return socket.close();
            }

            const password = params.get("password");
            if (channel.password && channel.password !== password) {
                return socket.close();
            }

            return this.setupSocket(socket, name, avatar, lobby);
        } catch {
            return socket.close();
        }
    };

    init = () => {
        this.wss.on("connection", this.onSocketConnection);
        console.log(`[CHAT-SERVER] - SUCCESS - Socket is running in ${this.port}`);
    };
}
