import { DurableObject } from "cloudflare:workers";

const MAX_PLAYERS = 4;
const RATE_LIMIT_WINDOW_MS = 1000;
const RATE_LIMIT_MAX_MESSAGES = 100;
const RATE_LIMIT_KICK_MULTIPLIER = 4;
const RECONNECT_TTL_MS = 10 * 60 * 1000;
const VALID_MAPS = ["town", "wayside", "blacksire", "laststop", "crossroads", "crossroads_night", "overpass", "overpass_night"];
const VALID_PERKS = new Set(["jugg", "revive", "speed", "dtap", "stamin", "mule"]);
const START_POINTS_OPTIONS = [500, 1000, 2000, 4000];
const ROUND_GAP_OPTIONS = [90, 150, 210, 300];

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
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

function cleanRules(value) {
  const source = value || {};
  const startPoints = START_POINTS_OPTIONS.includes(Number(source.startPoints)) ? Number(source.startPoints) : 500;
  const roundGap = ROUND_GAP_OPTIONS.includes(Number(source.roundGap)) ? Number(source.roundGap) : 150;
  return { startPoints, roundGap, hardcore: Boolean(source.hardcore) };
}

function boundedNumber(value, min, max, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

function cleanState(source) {
  source = source || {};
  return {
    x: boundedNumber(source.x, -250, 250),
    y: boundedNumber(source.y, -20, 80),
    z: boundedNumber(source.z, -250, 250),
    yaw: normalizeYaw(source.yaw),
    pitch: boundedNumber(source.pitch, -Math.PI / 2, Math.PI / 2),
    hp: boundedNumber(source.hp, 0, 500),
    downed: Boolean(source.downed),
    reviving: Boolean(source.reviving),
    weapon: String(source.weapon || "").slice(0, 24),
    map: VALID_MAPS.includes(source.map) ? source.map : "town",
    speed: boundedNumber(source.speed, 0, 12),
    sprint: Boolean(source.sprint),
    ads: Boolean(source.ads),
    crouched: Boolean(source.crouched),
    grounded: source.grounded !== false,
    points: boundedNumber(source.points, 0, 99999999),
    downs: boundedNumber(source.downs, 0, 9999),
    kills: boundedNumber(source.kills, 0, 999999),
    headshots: boundedNumber(source.headshots, 0, 999999),
  };
}

function cleanCheckpoint(source, runId) {
  source = source || {};
  const perks = {};
  if (source.perks && typeof source.perks === "object") {
    for (const key of VALID_PERKS) if (source.perks[key]) perks[key] = true;
  }
  const guns = Array.isArray(source.guns)
    ? source.guns.slice(0, 3).map((gun) => ({
        id: String(gun?.id || "").slice(0, 24),
        ammo: Math.round(boundedNumber(gun?.ammo, 0, 9999)),
        res: Math.round(boundedNumber(gun?.res, 0, 99999)),
        pack: Math.round(boundedNumber(gun?.pack, 0, 3)),
      })).filter((gun) => gun.id)
    : [];
  return {
    runId: String(runId || ""),
    points: Math.round(boundedNumber(source.points, 0, 99999999)),
    perks,
    slot: Math.round(boundedNumber(source.slot, 0, 2)),
    guns,
    hp: boundedNumber(source.hp, 0, 500, 100),
    maxHp: boundedNumber(source.maxHp, 100, 500, 100),
    grenades: Math.round(boundedNumber(source.grenades, 0, 99)),
    claymores: Math.round(boundedNumber(source.claymores, 0, 99)),
    downs: Math.round(boundedNumber(source.downs, 0, 9999)),
    kills: Math.round(boundedNumber(source.kills, 0, 999999)),
    headshots: Math.round(boundedNumber(source.headshots, 0, 999999)),
    savedAt: Date.now(),
  };
}

export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  sockets() {
    return this.ctx.getWebSockets("player").filter((ws) => ws.readyState === 1);
  }

  attachment(ws) {
    return ws.deserializeAttachment() || {};
  }

  send(ws, message) {
    try {
      ws.send(JSON.stringify(message));
    } catch {
      // The close/error callback owns cleanup.
    }
  }

  broadcast(message, except = null) {
    const payload = JSON.stringify(message);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      try {
        ws.send(payload);
      } catch {
        // The close/error callback owns cleanup.
      }
    }
  }

  async saveIdentity(player) {
    if (!player?.token || !player?.id) return;
    await this.ctx.storage.put(`identity:${player.token}`, {
      id: player.id,
      name: player.name,
      host: Boolean(player.host),
      state: player.state || null,
      checkpoint: player.checkpoint || null,
      savedAt: Date.now(),
    });
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === "/init" && request.method === "POST") {
      const exists = await this.ctx.storage.get("created");
      if (exists) return json({ error: "Room already exists" }, 409);
      await this.ctx.storage.put({
        created: true,
        room: { active: false, map: null, paused: false, leaderboard: null, runId: null },
      });
      return json({ ok: true }, 201);
    }

    const created = await this.ctx.storage.get("created");
    if (!created) return json({ error: "Room not found" }, 404);

    if (url.pathname === "/status") {
      return json({
        exists: true,
        players: this.sockets().length,
        room: (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false, leaderboard: null, runId: null },
      });
    }

    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return json({ error: "Expected a WebSocket upgrade" }, 426);
    }

    const requestedToken = cleanToken(url.searchParams.get("token"));
    let existing = this.sockets();
    let reconnectSocket = null;
    let reconnect = null;

    // If a browser reconnects before Cloudflare has fully retired its old TCP
    // connection, reclaim that exact slot instead of incorrectly reporting a
    // four-player room as full. The old socket is marked superseded so its
    // close callback does not broadcast a fake disconnect or migrate host.
    if (requestedToken) {
      reconnectSocket = existing.find((socket) => this.attachment(socket).token === requestedToken) || null;
      if (reconnectSocket) {
        const old = this.attachment(reconnectSocket);
        reconnect = {
          id: old.id,
          name: old.name,
          host: old.host,
          state: old.state || null,
          checkpoint: old.checkpoint || null,
          savedAt: Date.now(),
        };
        old.superseded = true;
        reconnectSocket.serializeAttachment(old);
        existing = existing.filter((socket) => socket !== reconnectSocket);
      } else {
        const saved = await this.ctx.storage.get(`identity:${requestedToken}`);
        if (saved && Date.now() - Number(saved.savedAt || 0) < RECONNECT_TTL_MS) reconnect = saved;
      }
    }

    if (!reconnect && existing.length >= MAX_PLAYERS) {
      return new Response("Room is full", { status: 429 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const id = reconnect?.id || crypto.randomUUID();
    const name = reconnect?.name || cleanName(url.searchParams.get("name"));
    const host = reconnect
      ? Boolean(reconnect.host) && !existing.some((socket) => this.attachment(socket).host)
      : existing.length === 0;
    // Keep the reconnect token stable. Rotating it on every flap makes a
    // second failure depend on the first reconnect's welcome packet reaching
    // the browser, which is exactly the wrong dependency on an unstable link.
    const token = reconnect && requestedToken ? requestedToken : crypto.randomUUID();
    const player = {
      id,
      name,
      host,
      state: reconnect?.state || null,
      checkpoint: reconnect?.checkpoint || null,
      token,
      rateStart: 0,
      rateCount: 0,
      superseded: false,
    };

    this.ctx.acceptWebSocket(server, ["player"]);
    server.serializeAttachment(player);
    await this.saveIdentity(player);

    if (reconnectSocket) {
      try {
        reconnectSocket.close(1012, "Connection replaced by reconnect");
      } catch {
        // It may already have disappeared between lookup and takeover.
      }
    }

    const players = existing.map((ws) => {
      const current = this.attachment(ws);
      return { id: current.id, name: current.name, host: current.host, state: current.state };
    });
    const room = (await this.ctx.storage.get("room")) || { active: false, map: null, paused: false, leaderboard: null, runId: null };
    const resume = player.checkpoint && player.checkpoint.runId && player.checkpoint.runId === room.runId
      ? player.checkpoint
      : null;
    this.send(server, { type: "welcome", id, name, host, token, players, room, resume });
    this.broadcast({ type: "player_joined", player: { id, name, host, state: player.state } }, server);

    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, rawMessage) {
    if (typeof rawMessage !== "string" || rawMessage.length > 65536) return;

    const player = this.attachment(ws);
    if (!player.id || player.superseded) return;

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
      const state = cleanState(message.state);
      player.state = state;
      ws.serializeAttachment(player);
      this.broadcast({ type: "state", id: player.id, state }, ws);
      return;
    }

    if (message.type === "checkpoint" && message.checkpoint) {
      const room = (await this.ctx.storage.get("room")) || {};
      player.checkpoint = cleanCheckpoint(message.checkpoint, room.runId);
      ws.serializeAttachment(player);
      await this.saveIdentity(player);
      return;
    }

    if (message.type === "fire") {
      this.broadcast({
        type: "fire",
        id: player.id,
        weapon: String(message.weapon || "").slice(0, 24),
        pack: Math.max(0, Math.min(3, Number(message.pack) || 0)),
        yaw: normalizeYaw(message.yaw),
        pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
      }, ws);
      return;
    }

    if (message.type === "melee") {
      this.broadcast({
        type: "melee",
        id: player.id,
        yaw: normalizeYaw(message.yaw),
        pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
        hit: Boolean(message.hit),
      }, ws);
      return;
    }

    if (message.type === "grenade") {
      this.broadcast({
        type: "grenade",
        id: player.id,
        yaw: normalizeYaw(message.yaw),
        pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, Number(message.pitch) || 0)),
      }, ws);
      return;
    }

    if (message.type === "claymore_place") {
      this.broadcast({
        type: "claymore_place",
        id: player.id,
        cid: String(message.cid || "").slice(0, 64),
        x: boundedNumber(message.x, -250, 250),
        y: boundedNumber(message.y, -20, 80),
        z: boundedNumber(message.z, -250, 250),
        yaw: normalizeYaw(message.yaw),
      }, ws);
      return;
    }

    if (message.type === "claymore_boom") {
      this.broadcast({
        type: "claymore_boom",
        id: player.id,
        cid: String(message.cid || "").slice(0, 64),
        x: boundedNumber(message.x, -250, 250),
        y: boundedNumber(message.y, -20, 80),
        z: boundedNumber(message.z, -250, 250),
      }, ws);
      return;
    }

    if (message.type === "ping") {
      this.broadcast({
        type: "ping",
        owner: player.id,
        x: boundedNumber(message.x, -250, 250),
        y: boundedNumber(message.y, -20, 80),
        z: boundedNumber(message.z, -250, 250),
        kind: message.kind === "zombie" ? "zombie" : "spot",
      }, ws);
      return;
    }

    if (message.type === "leaderboard_submit" && player.host && message.entry) {
      const round = Math.max(0, Math.min(9999, Math.floor(Number(message.entry.round)) || 0));
      const kills = Math.max(0, Math.min(999999, Math.floor(Number(message.entry.kills)) || 0));
      const room = (await this.ctx.storage.get("room")) || { active: true, map: "town", paused: false, leaderboard: null, runId: null };
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
        "zombie_damage", "zombie_kill", "drop_collect", "box_roll", "box_take",
        "round_call", "player_down", "revive", "map_gate", "map_switch",
      ]);
      if (!allowed.has(message.event.type)) return;
      const hostSocket = this.sockets().find((socket) => this.attachment(socket).host);
      if (hostSocket) this.send(hostSocket, { type: "game_request", playerId: player.id, event: message.event });
      return;
    }

    if (message.type === "host_broadcast" && player.host && message.event) {
      const allowed = new Set([
        "world", "zombie_kill", "drop_spawn", "drop_collect", "box_roll", "box_take",
        "round_start", "player_revived", "team_wipe", "session_pause", "map_gate", "map_switch",
      ]);
      if (allowed.has(message.event.type)) {
        if (message.event.type === "session_pause") {
          const room = (await this.ctx.storage.get("room")) || { active: true, map: "town", runId: null };
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
      const target = this.sockets().find((socket) => this.attachment(socket).id === message.target);
      if (target) this.send(target, { type: "game", event: message.event });
      return;
    }

    if (message.type === "rules" && player.host && message.rules) {
      this.broadcast({ type: "rules", rules: cleanRules(message.rules) }, ws);
      return;
    }

    if (message.type === "start") {
      if (!player.host) {
        this.send(ws, { type: "error", message: "Only the host can start the match" });
        return;
      }
      const map = VALID_MAPS.includes(message.map) ? message.map : "town";
      const rules = cleanRules(message.rules);
      const previous = (await this.ctx.storage.get("room")) || {};
      const runId = crypto.randomUUID();
      const room = {
        active: true,
        map,
        paused: false,
        leaderboard: previous.leaderboard || null,
        runId,
      };
      await this.ctx.storage.put("room", room);
      // Do not erase reconnect identities here. Checkpoints carry runId and
      // only restore when it matches this room's current run.
      this.broadcast({ type: "start", map, rules, runId });
    }
  }

  async webSocketClose(ws, code, reason) {
    const player = this.attachment(ws);
    if (!player.id || player.superseded) return;

    const deliberate = code === 1000 && reason === "Left room";
    this.broadcast({ type: deliberate ? "player_left" : "player_disconnected", id: player.id }, ws);

    await this.saveIdentity(player);

    if (player.host) {
      const next = this.sockets().find((socket) => socket !== ws);
      if (next) {
        const replacement = this.attachment(next);
        replacement.host = true;
        next.serializeAttachment(replacement);
        await this.saveIdentity(replacement);
        this.broadcast({ type: "role", id: replacement.id, host: true });
      } else {
        await this.ctx.storage.setAlarm(Date.now() + RECONNECT_TTL_MS);
      }
    }
  }

  async webSocketError(ws) {
    const player = this.attachment(ws);
    if (player?.id && !player.superseded) await this.saveIdentity(player);
    try {
      ws.close(1011, "WebSocket error");
    } catch {
      // The socket is already closed.
    }
  }

  async alarm() {
    if (this.sockets().length === 0) await this.ctx.storage.deleteAll();
  }
}
