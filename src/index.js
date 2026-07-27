import { DurableObject } from "cloudflare:workers";

const ROOM_CODE_LENGTH = 6;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 4;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function roomCode() {
  const bytes = new Uint8Array(ROOM_CODE_LENGTH);
  crypto.getRandomValues(bytes);
  let code = "";
  for (const byte of bytes) code += ROOM_ALPHABET[byte % ROOM_ALPHABET.length];
  return code;
}

function cleanCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, ROOM_CODE_LENGTH);
}

function cleanName(value) {
  const name = String(value || "Survivor")
    .replace(/[^\w .'-]/g, "")
    .trim()
    .slice(0, 18);
  return name || "Survivor";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      for (let attempt = 0; attempt < 8; attempt++) {
        const code = roomCode();
        const stub = env.GAME_ROOMS.getByName(code);
        const response = await stub.fetch("https://room.internal/init", { method: "POST" });
        if (response.status === 201) return json({ code });
      }
      return json({ error: "Could not reserve a room code" }, 503);
    }

    const match = url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(ws))?$/i);
    if (match) {
      const code = cleanCode(match[1]);
      const stub = env.GAME_ROOMS.getByName(code);

      if (match[2] === "ws") {
        if (request.method !== "GET" || request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
          return json({ error: "Expected a WebSocket upgrade" }, 426);
        }
        return stub.fetch(request);
      }

      if (request.method === "GET") {
        return stub.fetch("https://room.internal/status");
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found" }, 404);
    const response = await env.ASSETS.fetch(request);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("text/html")) return response;
    const headers = new Headers(response.headers);
    headers.set("cache-control", "no-store, max-age=0");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  },
};

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  sockets() {
    return this.ctx.getWebSockets("player").filter((ws) => ws.readyState < 2);
  }

  attachment(ws) {
    return ws.deserializeAttachment() || {};
  }

  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // A close event will clean up disconnected sockets.
    }
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        // A close event will clean up disconnected sockets.
      }
    }
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const exists = await this.ctx.storage.get("created");
      if (exists) return json({ error: "Room already exists" }, 409);
      await this.ctx.storage.put({
        created: true,
        room: { active: false, map: null, paused: false },
      });
      return json({ ok: true }, 201);
    }

    const created = await this.ctx.storage.get("created");
    if (!created) return json({ error: "Room not found" }, 404);

    if (url.pathname === "/status") {
      return json({
        exists: true,
        players: this.sockets().length,
        room: (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false },
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade" }, 426);
    }

    const existing = this.sockets();
    if (existing.length >= MAX_PLAYERS) return new Response("Room is full", { status: 429 });

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = crypto.randomUUID();
    const name = cleanName(url.searchParams.get("name"));
    const host = existing.length === 0;
    const player = { id, name, host, state: null };

    this.ctx.acceptWebSocket(server, ["player"]);
    server.serializeAttachment(player);

    const players = existing.map((ws) => this.attachment(ws));
    const room = (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false };
    this.send(server, { type: "welcome", id, name, host, players, room });
    this.broadcast({ type: "player_joined", player: { id, name, host } }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    if (typeof rawMessage !== "string" || rawMessage.length > 65536) return;

    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

    const player = this.attachment(ws);
    if (!player.id) return;

    if (message.type === "state" && message.state) {
      const source = message.state;
      const number = (value, min, max) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : 0;
      };
      const state = {
        x: number(source.x, -250, 250),
        y: number(source.y, -20, 80),
        z: number(source.z, -250, 250),
        yaw: number(source.yaw, -Math.PI * 4, Math.PI * 4),
        pitch: number(source.pitch, -Math.PI / 2, Math.PI / 2),
        hp: number(source.hp, 0, 500),
        downed: Boolean(source.downed),
        weapon: String(source.weapon || "").slice(0, 24),
        map: source.map === "nuketown" ? "nuketown" : "town",
        speed: number(source.speed, 0, 12),
        sprint: Boolean(source.sprint),
        ads: Boolean(source.ads),
        grounded: source.grounded !== false,
      };
      player.state = state;
      ws.serializeAttachment(player);
      this.broadcast({ type: "state", id: player.id, state }, ws);
      return;
    }

    if (message.type === "fire") {
      this.broadcast(
        {
          type: "fire",
          id: player.id,
          weapon: String(message.weapon || "").slice(0, 24),
          pack: Math.max(0, Math.min(2, Number(message.pack) || 0)),
          yaw: Math.max(-Math.PI * 4, Math.min(Math.PI * 4, Number(message.yaw) || 0)),
          pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
        },
        ws,
      );
      return;
    }

    if (message.type === "game_event" && message.event) {
      const allowed = new Set([
        "zombie_damage",
        "zombie_kill",
        "drop_collect",
        "box_roll",
        "box_take",
        "round_call",
        "player_down",
        "revive",
      ]);
      if (!allowed.has(message.event.type)) return;
      const hostSocket = this.sockets().find((socket) => this.attachment(socket).host);
      if (hostSocket) {
        this.send(hostSocket, {
          type: "game_request",
          playerId: player.id,
          event: message.event,
        });
      }
      return;
    }

    if (message.type === "host_broadcast" && player.host && message.event) {
      const allowed = new Set([
        "world",
        "zombie_kill",
        "drop_spawn",
        "drop_collect",
        "box_roll",
        "box_take",
        "round_start",
        "player_revived",
        "team_wipe",
        "session_pause",
      ]);
      if (allowed.has(message.event.type)) {
        if (message.event.type === "session_pause") {
          const room = (await this.ctx.storage.get("room")) || { active: true, map: "town" };
          room.paused = Boolean(message.event.paused);
          await this.ctx.storage.put("room", room);
        }
        this.broadcast({ type: "game", event: message.event }, ws);
      }
      return;
    }

    if (message.type === "host_direct" && player.host && message.target && message.event) {
      const allowed = new Set(["damage_result", "player_damage"]);
      if (!allowed.has(message.event.type)) return;
      const target = this.sockets().find(
        (socket) => this.attachment(socket).id === message.target,
      );
      if (target) this.send(target, { type: "game", event: message.event });
      return;
    }

    if (message.type === "start") {
      if (!player.host) {
        this.send(ws, { type: "error", message: "Only the host can start the match" });
        return;
      }
      const map = message.map === "nuketown" ? "nuketown" : "town";
      const room = { active: true, map, paused: false };
      await this.ctx.storage.put("room", room);
      this.broadcast({ type: "start", map });
    }
  }

  async webSocketClose(ws, code, reason) {
    const player = this.attachment(ws);
    try {
      ws.close(code, reason);
    } catch {
      // The client may already be gone.
    }
    if (!player.id) return;

    this.broadcast({ type: "player_left", id: player.id }, ws);

    if (player.host) {
      const next = this.sockets().find((socket) => socket !== ws);
      if (next) {
        const replacement = this.attachment(next);
        replacement.host = true;
        next.serializeAttachment(replacement);
        this.broadcast({ type: "role", id: replacement.id, host: true });
      } else {
        await this.ctx.storage.put("room", { active: false, map: null, paused: false });
      }
    }
  }

  webSocketError(ws) {
    try {
      ws.close(1011, "WebSocket error");
    } catch {
      // The socket is already closed.
    }
  }
}
