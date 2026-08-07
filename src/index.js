import { DurableObject } from "cloudflare:workers";

const ROOM_CODE_LENGTH = 6;
const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const MAX_PLAYERS = 4;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 40;
const RATE_LIMIT_KICK_MULTIPLIER = 4;
const RECONNECT_TTL_MS = 2 * 60 * 1000;

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

function normalizeYaw(value) {
  const yaw = Number(value);
  return Number.isFinite(yaw) ? Math.atan2(Math.sin(yaw), Math.cos(yaw)) : 0;
}

function cleanToken(value) {
  const token = String(value || "");
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token) ? token : "";
}

const START_POINTS_OPTIONS = [500, 1000, 2000, 4000];
const ROUND_GAP_OPTIONS = [90, 150, 210, 300];
function cleanRules(value) {
  const source = value || {};
  const startPoints = START_POINTS_OPTIONS.includes(Number(source.startPoints)) ? Number(source.startPoints) : 500;
  const roundGap = ROUND_GAP_OPTIONS.includes(Number(source.roundGap)) ? Number(source.roundGap) : 150;
  return { startPoints, roundGap, hardcore: Boolean(source.hardcore) };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const clientIp = request.headers.get("CF-Connecting-IP") || "unknown";

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const { success } = await env.ROOM_API_LIMITER.limit({ key: clientIp });
      if (!success) return json({ error: "Too many requests" }, 429);

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
        const { success } = await env.ROOM_API_LIMITER.limit({ key: clientIp });
        if (!success) return json({ error: "Too many requests" }, 429);
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
        room: { active: false, map: null, paused: false, leaderboard: null },
      });
      return json({ ok: true }, 201);
    }

    const created = await this.ctx.storage.get("created");
    if (!created) return json({ error: "Room not found" }, 404);

    if (url.pathname === "/status") {
      return json({
        exists: true,
        players: this.sockets().length,
        room: (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false, leaderboard: null },
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade" }, 426);
    }

    const existing = this.sockets();
    if (existing.length >= MAX_PLAYERS) return new Response("Room is full", { status: 429 });

    const requestedToken = cleanToken(url.searchParams.get("token"));
    let reconnect = null;
    if (requestedToken) {
      const saved = await this.ctx.storage.get(`identity:${requestedToken}`);
      await this.ctx.storage.delete(`identity:${requestedToken}`);
      if (saved && Date.now() - saved.savedAt < RECONNECT_TTL_MS) reconnect = saved;
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = reconnect ? reconnect.id : crypto.randomUUID();
    const name = cleanName(url.searchParams.get("name"));
    const host = reconnect
      ? reconnect.host && !existing.some((socket) => this.attachment(socket).host)
      : existing.length === 0;
    const token = crypto.randomUUID();
    const player = { id, name, host, state: null, token };

    this.ctx.acceptWebSocket(server, ["player"]);
    server.serializeAttachment(player);

    // Socket attachments contain private reconnect tokens and rate-limit counters. Only
    // expose the public player snapshot needed by the joining client's roster and models.
    const players = existing.map((ws) => {
      const current = this.attachment(ws);
      return { id: current.id, name: current.name, host: current.host, state: current.state };
    });
    const room = (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false, leaderboard: null };
    this.send(server, { type: "welcome", id, name, host, token, players, room });
    this.broadcast({ type: "player_joined", player: { id, name, host } }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    if (typeof rawMessage !== "string" || rawMessage.length > 65536) return;

    const player = this.attachment(ws);
    if (!player.id) return;

    const now = Date.now();
    if (!player.rateStart || now - player.rateStart >= RATE_LIMIT_WINDOW_MS) {
      player.rateStart = now;
      player.rateCount = 0;
    }
    player.rateCount += 1;
    ws.serializeAttachment(player);
    if (player.rateCount > RATE_LIMIT_MAX_MESSAGES) {
      if (player.rateCount > RATE_LIMIT_MAX_MESSAGES * RATE_LIMIT_KICK_MULTIPLIER) {
        try {
          ws.close(1008, "Rate limit exceeded");
        } catch {
          // The client may already be gone.
        }
      }
      return;
    }

    let message;
    try {
      message = JSON.parse(rawMessage);
    } catch {
      return;
    }

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
        yaw: normalizeYaw(source.yaw),
        pitch: number(source.pitch, -Math.PI / 2, Math.PI / 2),
        hp: number(source.hp, 0, 500),
        downed: Boolean(source.downed),
        weapon: String(source.weapon || "").slice(0, 24),
        map: ["town", "nuketown", "blacksire", "laststop"].includes(source.map) ? source.map : "town",
        speed: number(source.speed, 0, 12),
        sprint: Boolean(source.sprint),
        ads: Boolean(source.ads),
        crouched: Boolean(source.crouched),
        grounded: source.grounded !== false,
        points: number(source.points, 0, 99999999),
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
          pack: Math.max(0, Math.min(3, Number(message.pack) || 0)),
          yaw: normalizeYaw(message.yaw),
          pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
        },
        ws,
      );
      return;
    }

    if (message.type === "melee") {
      this.broadcast(
        {
          type: "melee",
          id: player.id,
          yaw: normalizeYaw(message.yaw),
          pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
          hit: Boolean(message.hit),
        },
        ws,
      );
      return;
    }

    if (message.type === "ping") {
      // A cosmetic map marker, not game state - broadcast straight to the
      // room like fire/melee instead of routing through host arbitration.
      this.broadcast(
        {
          type: "ping",
          owner: player.id,
          x: Math.max(-250, Math.min(250, Number(message.x) || 0)),
          y: Math.max(-20, Math.min(80, Number(message.y) || 0)),
          z: Math.max(-250, Math.min(250, Number(message.z) || 0)),
          kind: message.kind === "zombie" ? "zombie" : "spot",
        },
        ws,
      );
      return;
    }

    if (message.type === "leaderboard_submit" && player.host && message.entry) {
      const round = Math.max(0, Math.min(9999, Math.floor(Number(message.entry.round)) || 0));
      const kills = Math.max(0, Math.min(999999, Math.floor(Number(message.entry.kills)) || 0));
      const room = (await this.ctx.storage.get("room")) || { active: true, map: "town", paused: false, leaderboard: null };
      const current = room.leaderboard;
      if (!current || round > current.round || (round === current.round && kills > current.kills)) {
        room.leaderboard = { round, kills };
        await this.ctx.storage.put("room", room);
        this.broadcast({ type: "leaderboard", entry: room.leaderboard });
      }
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
        "map_gate",
        "map_switch",
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
        "map_gate",
        "map_switch",
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

    if (message.type === "rules" && player.host && message.rules) {
      // Purely a lobby display sync so everyone sees what the host has
      // picked before starting - not persisted, re-sent fresh with "start".
      this.broadcast({ type: "rules", rules: cleanRules(message.rules) }, ws);
      return;
    }

    if (message.type === "start") {
      if (!player.host) {
        this.send(ws, { type: "error", message: "Only the host can start the match" });
        return;
      }
      const map = ["town", "nuketown", "blacksire", "laststop"].includes(message.map) ? message.map : "town";
      const rules = cleanRules(message.rules);
      // A new match resets everything about the room *except* its leaderboard -
      // that's meant to track this room's best run across matches, not just one.
      const previous = (await this.ctx.storage.get("room")) || {};
      const room = { active: true, map, paused: false, leaderboard: previous.leaderboard || null };
      await this.ctx.storage.put("room", room);
      this.broadcast({ type: "start", map, rules });
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

    if (player.token) {
      await this.ctx.storage.put(`identity:${player.token}`, {
        id: player.id,
        name: player.name,
        host: player.host,
        savedAt: Date.now(),
      });
    }

    if (player.host) {
      const next = this.sockets().find((socket) => socket !== ws);
      if (next) {
        const replacement = this.attachment(next);
        replacement.host = true;
        next.serializeAttachment(replacement);
        this.broadcast({ type: "role", id: replacement.id, host: true });
      } else {
        // Preserve the active map and pause state during the reconnect grace period. The
        // alarm removes the room if nobody returns, while a reconnect receives the same
        // active room snapshot and can continue without splitting client/server state.
        await this.ctx.storage.setAlarm(Date.now() + RECONNECT_TTL_MS);
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

  async alarm() {
    if (this.sockets().length === 0) {
      await this.ctx.storage.deleteAll();
    }
  }
}
