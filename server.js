const http = require("http");
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const root = __dirname;
const rootWithSeparator = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
const port = Number(process.env.PORT || 5173);
const host = "0.0.0.0";

const text = {
  werewolf: "\u72fc\u4eba",
  villager: "\u5e73\u6c11",
  seer: "\u9884\u8a00\u5bb6",
  witch: "\u5973\u5deb",
  hunter: "\u730e\u4eba",
  guard: "\u5b88\u536b",
  wolfCamp: "\u72fc\u4eba\u9635\u8425",
  goodCamp: "\u597d\u4eba\u9635\u8425",
  god: "\u795e\u804c",
  gameStartedNoJoin: "\u6e38\u620f\u5df2\u7ecf\u5f00\u59cb\uff0c\u4e0d\u80fd\u52a0\u5165",
  roomFull: "\u623f\u95f4\u5df2\u6ee1",
  playerSuffix: "\u53f7\u73a9\u5bb6",
  hostOnlyStart: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u5f00\u59cb\u6e38\u620f",
  alreadyStarted: "\u6e38\u620f\u5df2\u7ecf\u5f00\u59cb",
  needMorePrefix: "\u8fd8\u9700\u8981 ",
  needMoreSuffix: " \u540d\u73a9\u5bb6",
  rolesAssigned: "\u8eab\u4efd\u5df2\u968f\u673a\u5206\u914d\u3002\u8bf7\u6240\u6709\u73a9\u5bb6\u5728\u81ea\u5df1\u7684\u624b\u673a\u4e0a\u67e5\u770b\u8eab\u4efd\u3002",
  hostOnlyEnd: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u7ed3\u675f\u6e38\u620f",
  hostOnlyDisband: "\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u89e3\u6563\u623f\u95f4",
  goodWin: "\u6240\u6709\u72fc\u4eba\u51fa\u5c40\uff0c\u597d\u4eba\u9635\u8425\u80dc\u5229\u3002",
  wolfWin: "\u72fc\u4eba\u5df2\u5c60\u8fb9\uff0c\u72fc\u4eba\u9635\u8425\u80dc\u5229\u3002",
  invalidCount: "\u4eba\u6570\u5fc5\u987b\u662f 3 \u5230 20",
  invalidRoleConfig: "\u8eab\u4efd\u6570\u91cf\u9700\u8981\u7b49\u4e8e\u73a9\u5bb6\u4eba\u6570\uff0c\u4e14\u81f3\u5c11\u5305\u542b 1 \u540d\u72fc\u4eba\u548c 1 \u540d\u597d\u4eba",
  apiMissing: "\u63a5\u53e3\u4e0d\u5b58\u5728",
  roomMissing: "\u623f\u95f4\u4e0d\u5b58\u5728",
  serverError: "\u670d\u52a1\u5668\u9519\u8bef",
};

const types = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const roleMeta = {
  werewolf: { name: text.werewolf, camp: "werewolf", campName: text.wolfCamp, type: text.werewolf },
  villager: { name: text.villager, camp: "good", campName: text.goodCamp, type: text.villager },
  seer: { name: text.seer, camp: "good", campName: text.goodCamp, type: text.god },
  witch: { name: text.witch, camp: "good", campName: text.goodCamp, type: text.god },
  hunter: { name: text.hunter, camp: "good", campName: text.goodCamp, type: text.god },
  guard: { name: text.guard, camp: "good", campName: text.goodCamp, type: text.god },
};

const playerConfigs = {
  6: { werewolf: 2, villager: 2, seer: 1, witch: 1 },
  7: { werewolf: 2, villager: 3, seer: 1, witch: 1 },
  8: { werewolf: 3, villager: 2, seer: 1, witch: 1, hunter: 1 },
  9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
  10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1 },
  11: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1 },
  12: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
};

const roleOrder = ["werewolf", "villager", "seer", "witch", "hunter", "guard"];
const minPlayerCount = 3;
const maxPlayerCount = 20;
const rooms = new Map();
const rateLimits = new Map();
const maxRoomAgeMs = 1000 * 60 * 60 * 8;
const rateLimitWindowMs = 1000 * 60;
const maxRequestBodyBytes = 1024 * 96;
const voiceParticipantTimeoutMs = 1000 * 20;
const voiceMessageTtlMs = 1000 * 60 * 2;
const voiceMaxMessages = 600;
const voiceIceServers = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun.cloudflare.com:3478" },
];
const timeLimitOptions = [30, 60, 90, 120];
const defaultSpeechTimeLimit = 60;
const defaultLastWordsTimeLimit = 60;
const allowedStaticFiles = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/game.js", "game.js"],
]);

function randomToken(length = 18) {
  return crypto.randomBytes(length).toString("base64url");
}

function randomCode(length = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  let token = "";
  for (let index = 0; index < length; index += 1) {
    token += chars[crypto.randomInt(chars.length)];
  }
  return token;
}

function randomRoomCode() {
  let code = "";
  do {
    code = String(crypto.randomInt(100000, 1000000));
  } while (rooms.has(code));
  return code;
}

function shuffle(items) {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const randomIndex = crypto.randomInt(index + 1);
    [output[index], output[randomIndex]] = [output[randomIndex], output[index]];
  }
  return output;
}

function totalRoles(config) {
  return roleOrder.reduce((sum, role) => sum + (Number(config?.[role]) || 0), 0);
}

function getRecommendedConfig(count) {
  if (playerConfigs[count]) return { ...playerConfigs[count] };
  const playerCount = Math.min(maxPlayerCount, Math.max(minPlayerCount, Number(count) || minPlayerCount));
  const werewolf = Math.max(1, Math.min(Math.floor(playerCount / 3), playerCount - 2));
  const seer = playerCount >= 4 ? 1 : 0;
  const witch = playerCount >= 5 ? 1 : 0;
  const hunter = playerCount >= 8 ? 1 : 0;
  const guard = playerCount >= 12 ? 1 : 0;
  const used = werewolf + seer + witch + hunter + guard;
  return {
    werewolf,
    villager: Math.max(1, playerCount - used),
    seer,
    witch,
    hunter,
    guard,
  };
}

function normalizeRoleConfig(config, playerCount) {
  const normalized = {};
  for (const role of roleOrder) {
    const count = Number(config?.[role] || 0);
    normalized[role] = Number.isInteger(count) && count > 0 ? Math.min(count, playerCount) : 0;
  }
  return normalized;
}

function validateRoleConfig(config, playerCount) {
  const total = totalRoles(config);
  const goodCount = total - (config.werewolf || 0);
  return total === playerCount && config.werewolf >= 1 && goodCount >= 1;
}

function getRolesForConfig(config) {
  return roleOrder.flatMap((role) => Array(config[role] || 0).fill(role));
}

function makeVoiceState() {
  return {
    participants: new Map(),
    messages: [],
    nextMessageId: 1,
  };
}

function normalizeTimeLimit(value, fallback = defaultSpeechTimeLimit) {
  if (value === "none" || value === 0 || value === "0") return 0;
  const timeLimit = Number(value);
  return timeLimitOptions.includes(timeLimit) ? timeLimit : fallback;
}

function publicTimeLimit(value) {
  return value === 0 ? null : value;
}

function configuredIceServers() {
  const servers = [...voiceIceServers];
  const turnUrl = String(process.env.TURN_URL || "").trim();
  if (turnUrl) {
    const turnServer = { urls: turnUrl };
    const username = String(process.env.TURN_USERNAME || "").trim();
    const credential = String(process.env.TURN_CREDENTIAL || "").trim();
    if (username) turnServer.username = username;
    if (credential) turnServer.credential = credential;
    servers.push(turnServer);
  }
  return servers;
}

function createPlayer(room, name, token = randomToken()) {
  return {
    id: randomToken(10),
    token,
    seat: room.players.length + 1,
    name: sanitizeName(name, `${room.players.length + 1}${text.playerSuffix}`),
    role: null,
    alive: true,
    ready: false,
    checks: [],
    lastWordsUsed: false,
  };
}

function createRoom(playerCount, hostName, settings = {}) {
  const code = randomRoomCode();
  const hostToken = randomToken();
  const joinSecret = randomCode();
  const config = normalizeRoleConfig(settings.roleConfig || getRecommendedConfig(playerCount), playerCount);
  const room = {
    code,
    hostToken,
    joinSecret,
    playerCount,
    config,
    status: "lobby",
    phase: "lobby",
    round: 0,
    players: [],
    createdAt: Date.now(),
    startedAt: null,
    log: [],
    winner: null,
    announcement: "",
    night: null,
    day: null,
    discussion: null,
    lastWords: null,
    pendingDeaths: [],
    speechLog: [],
    hunter: null,
    pendingAfterHunter: null,
    witch: { healUsed: false, poisonUsed: false },
    guardLastTargetId: null,
    settings: {
      speechTimeLimit: normalizeTimeLimit(settings.speechTimeLimit, defaultSpeechTimeLimit),
      lastWordsTimeLimit: normalizeTimeLimit(settings.lastWordsTimeLimit, defaultLastWordsTimeLimit),
    },
    voice: makeVoiceState(),
  };
  room.players.push(createPlayer(room, hostName, hostToken));
  rooms.set(code, room);
  return room;
}

function alivePlayers(room) {
  return room.players.filter((player) => player.alive);
}

function publicPlayer(player, viewer) {
  return {
    id: player.id,
    seat: player.seat,
    name: player.name,
    alive: player.alive,
    ready: player.ready,
    role: undefined,
    roleName: undefined,
    isYou: Boolean(viewer && viewer.id === player.id),
  };
}

function visibleDeaths(room) {
  return room.log.slice(-8);
}

function nightActionDone(room, viewer) {
  if (!viewer || room.phase !== "night" || !viewer.alive) return true;
  if (viewer.role === "werewolf") return Boolean(room.night?.wolfTargetId);
  if (viewer.role === "seer") return Boolean(room.night?.seerDone?.[viewer.id]);
  if (viewer.role === "witch") return !witchNeedsAction(room) || Boolean(room.night?.witchDone);
  if (viewer.role === "guard") return Boolean(room.night?.guardDone);
  return true;
}

function dayVoteDone(room, viewer) {
  return Boolean(viewer && room.phase === "day" && room.day?.votes?.[viewer.id]);
}

function publicRoom(room, viewerToken, viewerJoinSecret) {
  advanceTimedStages(room);
  const viewer = room.players.find((player) => player.token === viewerToken);
  const isHost = Boolean(viewerToken && secureCompare(viewerToken, room.hostToken));
  const hasInvite = Boolean(viewerJoinSecret && secureCompare(viewerJoinSecret, room.joinSecret));
  const canViewLobby = Boolean(viewer || isHost || hasInvite);
  return {
    code: room.code,
    joinSecret: isHost ? room.joinSecret : undefined,
    playerCount: room.playerCount,
    status: room.status,
    phase: room.phase,
    round: room.round,
    announcement: room.announcement,
    canStart: room.players.length === room.playerCount && room.status === "lobby",
    joinedCount: room.players.length,
    config: room.config,
    settings: {
      speechTimeLimit: publicTimeLimit(room.settings?.speechTimeLimit ?? defaultSpeechTimeLimit),
      lastWordsTimeLimit: publicTimeLimit(room.settings?.lastWordsTimeLimit ?? defaultLastWordsTimeLimit),
    },
    roleMeta,
    players: canViewLobby
      ? room.players.map((player) => {
          const item = publicPlayer(player, viewer);
          if (room.status === "ended") {
            item.role = player.role;
            item.roleName = roleMeta[player.role]?.name;
          }
          return item;
        })
      : [],
    viewer: viewer
      ? {
          id: viewer.id,
          seat: viewer.seat,
          name: viewer.name,
          alive: viewer.alive,
          role: viewer.role,
          roleName: viewer.role ? roleMeta[viewer.role].name : null,
          camp: viewer.role ? roleMeta[viewer.role].camp : null,
          campName: viewer.role ? roleMeta[viewer.role].campName : null,
          checks: viewer.checks || [],
          nightActionDone: nightActionDone(room, viewer),
          dayVoteDone: dayVoteDone(room, viewer),
          witch: viewer.role === "witch" ? witchViewerState(room) : null,
          teammates:
            viewer.role === "werewolf" && room.status !== "lobby"
              ? room.players
                  .filter((player) => player.role === "werewolf" && player.id !== viewer.id)
                  .map((player) => ({ seat: player.seat, name: player.name }))
              : [],
        }
      : null,
    isHost,
    log: isHost || room.status === "ended" ? room.log : [],
    publicLog: visibleDeaths(room),
    aliveCounts: getAliveCounts(room),
    voiceParticipants: canViewLobby ? getVoiceParticipants(room) : [],
    serverNow: Date.now(),
    lastWords: canViewLobby ? publicSpeechStage(room, "lastWords") : null,
    discussion: canViewLobby ? publicSpeechStage(room, "discussion") : null,
    speechLog: canViewLobby ? (room.speechLog || []).slice(-40) : [],
    dayVotesSubmitted: room.phase === "day" ? Object.keys(room.day?.votes || {}).length : 0,
    dayVotesNeeded: room.phase === "day" ? alivePlayers(room).length : 0,
    hunter: room.phase === "hunter" ? { playerId: room.hunter?.playerId } : null,
    winner: room.winner,
  };
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    ...securityHeaders(),
  });
  response.end(JSON.stringify(payload));
}

function securityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Permissions-Policy": "camera=(), microphone=(self), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https: wss: stun: turn: turns:; img-src 'self' data:; media-src 'self' blob:; base-uri 'none'; frame-ancestors 'none'",
  };
}

function secureCompare(left, right) {
  const leftValue = String(left || "");
  const rightValue = String(right || "");
  if (!leftValue || !rightValue) return false;
  const leftBuffer = Buffer.from(leftValue);
  const rightBuffer = Buffer.from(rightValue);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sanitizeName(name, fallback) {
  const cleanName = String(name || "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 16);
  return cleanName || fallback;
}

function getClientKey(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const clientIp = Array.isArray(forwardedFor) ? forwardedFor[0] : String(forwardedFor || request.socket.remoteAddress || "");
  return clientIp.split(",")[0].trim() || "unknown";
}

function checkRateLimit(request, action) {
  const key = `${getClientKey(request)}:${action}`;
  const now = Date.now();
  const limit = action === "write" ? 60 : 900;
  const current = rateLimits.get(key);
  if (!current || now - current.startedAt > rateLimitWindowMs) {
    rateLimits.set(key, { startedAt: now, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > maxRequestBodyBytes) {
        request.destroy();
        reject(new Error("Request body too large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function findRoom(code) {
  const roomCode = String(code || "").trim();
  if (!/^\d{6}$/.test(roomCode)) return null;
  return rooms.get(roomCode);
}

function addPlayer(room, name, joinSecret) {
  if (room.status !== "lobby") {
    const error = new Error(text.gameStartedNoJoin);
    error.status = 409;
    throw error;
  }
  if (room.players.length >= room.playerCount) {
    const error = new Error(text.roomFull);
    error.status = 409;
    throw error;
  }
  if (!secureCompare(joinSecret, room.joinSecret)) {
    const error = new Error("\u623f\u95f4\u9080\u8bf7\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u8f93\u5165\u623f\u4e3b\u9875\u9762\u663e\u793a\u7684\u9080\u8bf7\u7801\uff0c\u6216\u4f7f\u7528\u623f\u4e3b\u5206\u4eab\u7684\u5b8c\u6574\u94fe\u63a5");
    error.status = 403;
    throw error;
  }
  const player = createPlayer(room, name);
  room.players.push(player);
  return player;
}

function ensureVoiceState(room) {
  if (!room.voice) room.voice = makeVoiceState();
  return room.voice;
}

function requireRoomPlayer(room, token) {
  const viewer = room.players.find((player) => player.token === token);
  if (!viewer) {
    const error = new Error("\u73a9\u5bb6\u4e0d\u5b58\u5728");
    error.status = 403;
    throw error;
  }
  return viewer;
}

function publicVoiceParticipant(room, participant) {
  const player = findPlayer(room, participant.playerId);
  if (!player) return null;
  return {
    id: player.id,
    seat: player.seat,
    name: player.name,
    joinedAt: participant.joinedAt,
    lastSeen: participant.lastSeen,
  };
}

function pruneVoice(room) {
  const voice = ensureVoiceState(room);
  const now = Date.now();
  for (const [playerId, participant] of voice.participants.entries()) {
    if (!findPlayer(room, playerId) || now - participant.lastSeen > voiceParticipantTimeoutMs) {
      voice.participants.delete(playerId);
    }
  }
  voice.messages = voice.messages
    .filter((message) => now - message.createdAt <= voiceMessageTtlMs && voice.participants.has(message.to))
    .slice(-voiceMaxMessages);
}

function getVoiceParticipants(room) {
  pruneVoice(room);
  return [...ensureVoiceState(room).participants.values()]
    .map((participant) => publicVoiceParticipant(room, participant))
    .filter(Boolean);
}

function joinVoice(room, token) {
  const viewer = requireRoomPlayer(room, token);
  const voice = ensureVoiceState(room);
  pruneVoice(room);
  const existing = voice.participants.get(viewer.id);
  const now = Date.now();
  voice.participants.set(viewer.id, {
    playerId: viewer.id,
    joinedAt: existing?.joinedAt || now,
    lastSeen: now,
  });
  return {
    playerId: viewer.id,
    participants: getVoiceParticipants(room),
    iceServers: configuredIceServers(),
    lastSignalId: voice.nextMessageId - 1,
  };
}

function syncVoice(room, token, since) {
  const viewer = requireRoomPlayer(room, token);
  const voice = ensureVoiceState(room);
  pruneVoice(room);
  const participant = voice.participants.get(viewer.id);
  if (!participant) {
    const error = new Error("\u8bed\u97f3\u672a\u5f00\u542f\uff0c\u8bf7\u5148\u70b9\u51fb\u5f00\u542f\u8bed\u97f3");
    error.status = 409;
    throw error;
  }
  participant.lastSeen = Date.now();
  const sinceId = Math.max(0, Number(since) || 0);
  const messages = voice.messages
    .filter((message) => message.to === viewer.id && message.id > sinceId)
    .map((message) => ({
      id: message.id,
      from: message.from,
      type: message.type,
      payload: message.payload,
    }));
  return {
    playerId: viewer.id,
    participants: getVoiceParticipants(room),
    messages,
    lastSignalId: voice.nextMessageId - 1,
  };
}

function leaveVoice(room, token) {
  const viewer = requireRoomPlayer(room, token);
  const voice = ensureVoiceState(room);
  voice.participants.delete(viewer.id);
  voice.messages = voice.messages.filter((message) => message.from !== viewer.id && message.to !== viewer.id);
}

function sendVoiceSignal(room, token, body) {
  const viewer = requireRoomPlayer(room, token);
  const voice = ensureVoiceState(room);
  pruneVoice(room);
  if (!voice.participants.has(viewer.id)) {
    const error = new Error("\u8bed\u97f3\u672a\u5f00\u542f\uff0c\u8bf7\u5148\u70b9\u51fb\u5f00\u542f\u8bed\u97f3");
    error.status = 409;
    throw error;
  }

  const to = String(body.to || "");
  if (!voice.participants.has(to)) {
    const error = new Error("\u5bf9\u65b9\u8bed\u97f3\u4e0d\u5728\u7ebf");
    error.status = 409;
    throw error;
  }

  const type = String(body.type || "");
  if (!["offer", "answer", "ice-candidate"].includes(type)) {
    const error = new Error("\u8bed\u97f3\u4fe1\u4ee4\u7c7b\u578b\u4e0d\u6b63\u786e");
    error.status = 400;
    throw error;
  }

  const payload = body.payload || null;
  if (JSON.stringify(payload).length > maxRequestBodyBytes / 2) {
    const error = new Error("\u8bed\u97f3\u4fe1\u4ee4\u8fc7\u5927");
    error.status = 400;
    throw error;
  }

  voice.messages.push({
    id: voice.nextMessageId,
    from: viewer.id,
    to,
    type,
    payload,
    createdAt: Date.now(),
  });
  voice.nextMessageId += 1;
  voice.messages = voice.messages.slice(-voiceMaxMessages);
}

function getAliveCounts(room) {
  const counts = { werewolf: 0, villager: 0, god: 0, good: 0 };
  for (const player of room.players) {
    if (!player.alive) continue;
    const meta = roleMeta[player.role];
    if (!meta) continue;
    if (meta.camp === "werewolf") counts.werewolf += 1;
    if (meta.camp === "good") counts.good += 1;
    if (player.role === "villager") counts.villager += 1;
    if (meta.camp === "good" && player.role !== "villager") counts.god += 1;
  }
  return counts;
}

function checkWinner(room) {
  if (room.status !== "started") return false;
  const counts = getAliveCounts(room);
  if (counts.werewolf === 0) {
    finishRoom(room, "good", text.goodWin);
    return true;
  }
  if (counts.villager === 0 || counts.god === 0) {
    finishRoom(room, "werewolf", text.wolfWin);
    return true;
  }
  return false;
}

function finishRoom(room, winner, message) {
  room.status = "ended";
  room.phase = "ended";
  room.winner = winner;
  room.announcement = message;
  room.log.push(message);
}

function makeNight(round) {
  return {
    round,
    wolfTargetId: null,
    seerDone: {},
    guardTargetId: null,
    guardDone: false,
    witchHeal: false,
    witchPoisonTargetId: null,
    witchDone: false,
  };
}

function makeDay() {
  return { votes: {} };
}

function findPlayer(room, playerId) {
  return room.players.find((player) => player.id === playerId);
}

function publicSpeechPlayer(room, playerId) {
  const player = findPlayer(room, playerId);
  if (!player) return null;
  return {
    id: player.id,
    seat: player.seat,
    name: player.name,
    alive: player.alive,
  };
}

function publicSpeechStage(room, key) {
  const stage = room[key];
  if (!stage) return null;
  const currentEntry = stage.entries[stage.currentIndex] || null;
  return {
    day: stage.day,
    kind: stage.kind,
    title: stage.title,
    timeLimit: publicTimeLimit(stage.timeLimit),
    currentIndex: stage.currentIndex,
    startedAt: currentEntry?.startedAt || null,
    endsAt: currentEntry?.endsAt || null,
    currentPlayer: currentEntry ? publicSpeechPlayer(room, currentEntry.playerId) : null,
    entries: stage.entries.map((entry, index) => {
      const player = publicSpeechPlayer(room, entry.playerId);
      return {
        playerId: entry.playerId,
        seat: player?.seat || entry.seat,
        name: player?.name || entry.name,
        alive: Boolean(player?.alive),
        status: entry.status,
        isCurrent: index === stage.currentIndex && entry.status === "speaking",
      };
    }),
    records: stage.records.slice(-24),
  };
}

function requireLivingViewer(room, token) {
  const viewer = room.players.find((player) => player.token === token);
  if (!viewer) {
    const error = new Error("\u73a9\u5bb6\u4e0d\u5b58\u5728");
    error.status = 403;
    throw error;
  }
  if (!viewer.alive) {
    const error = new Error("\u4f60\u5df2\u51fa\u5c40\uff0c\u4e0d\u80fd\u64cd\u4f5c");
    error.status = 403;
    throw error;
  }
  return viewer;
}

function requirePhase(room, phase) {
  if (room.phase !== phase || room.status !== "started") {
    const error = new Error("\u5f53\u524d\u9636\u6bb5\u4e0d\u80fd\u8fd9\u6837\u64cd\u4f5c");
    error.status = 409;
    throw error;
  }
}

function roleError(role) {
  const error = new Error(`\u53ea\u6709${roleMeta[role]?.name || role}\u53ef\u4ee5\u8fd9\u6837\u64cd\u4f5c`);
  error.status = 403;
  return error;
}

function validateAliveTarget(room, targetId, allowSelf = true) {
  const target = findPlayer(room, targetId);
  if (!target || !target.alive) {
    const error = new Error("\u76ee\u6807\u4e0d\u5b58\u5728\u6216\u5df2\u51fa\u5c40");
    error.status = 400;
    throw error;
  }
  if (!allowSelf && target.id === targetId) {
    const error = new Error("\u4e0d\u80fd\u9009\u62e9\u81ea\u5df1");
    error.status = 400;
    throw error;
  }
  return target;
}

function startSpeechEntry(stage) {
  const entry = stage.entries[stage.currentIndex];
  if (!entry) return;
  const now = Date.now();
  entry.status = "speaking";
  entry.startedAt = now;
  entry.endsAt = stage.timeLimit ? now + stage.timeLimit * 1000 : null;
}

function activeSpeechStage(room) {
  if (room.phase === "lastWords") return room.lastWords;
  if (room.phase === "discussion") return room.discussion;
  return null;
}

function makeSpeechRecord(room, entry, action, actorName) {
  const player = findPlayer(room, entry.playerId);
  return {
    at: Date.now(),
    playerId: entry.playerId,
    seat: player?.seat || entry.seat,
    name: player?.name || entry.name,
    action,
    actorName,
  };
}

function addSpeechRecord(room, stage, entry, action, actorName) {
  const record = makeSpeechRecord(room, entry, action, actorName);
  stage.records.push(record);
  room.speechLog = room.speechLog || [];
  room.speechLog.push({ ...record, kind: stage.kind, day: stage.day });
  room.speechLog = room.speechLog.slice(-80);
}

function applyTransition(room, transition = { type: "night" }) {
  room.pendingTransition = null;
  if (checkWinner(room)) return;
  if (transition.type === "discussion") {
    startDiscussion(room, transition);
    return;
  }
  if (transition.type === "vote") {
    startVoting(room, transition.announcement);
    return;
  }
  startNextNight(room);
}

function finishSpeechStage(room, stage) {
  if (stage.kind === "lastWords") {
    const transition = stage.transition || room.pendingTransition || { type: "night" };
    room.lastWords = null;
    room.pendingDeaths = [];
    applyTransition(room, transition);
    return;
  }
  room.discussion = null;
  startVoting(room, "\u53d1\u8a00\u7ed3\u675f\uff0c\u8fdb\u5165\u6295\u7968\u9636\u6bb5\u3002");
}

function completeSpeechEntry(room, action, actorName) {
  const stage = activeSpeechStage(room);
  if (!stage) return false;
  const entry = stage.entries[stage.currentIndex];
  if (!entry) {
    finishSpeechStage(room, stage);
    return true;
  }

  entry.status = action === "skip" || action === "timeout" ? "skipped" : "done";
  entry.endedAt = Date.now();
  addSpeechRecord(room, stage, entry, action, actorName);
  if (stage.kind === "lastWords") {
    const player = findPlayer(room, entry.playerId);
    if (player) player.lastWordsUsed = true;
  }
  stage.currentIndex += 1;
  if (stage.currentIndex >= stage.entries.length) {
    finishSpeechStage(room, stage);
    return true;
  }
  startSpeechEntry(stage);
  return true;
}

function actorForSpeech(room, token, allowHost = true) {
  const player = room.players.find((item) => item.token === token);
  const isHost = Boolean(token && secureCompare(token, room.hostToken));
  if (!player && !(allowHost && isHost)) {
    const error = new Error("\u65e0\u6743\u64cd\u4f5c\u53d1\u8a00\u9636\u6bb5");
    error.status = 403;
    throw error;
  }
  return {
    player,
    isHost,
    name: isHost ? "\u623f\u4e3b" : `${player.seat}\u53f7 ${player.name}`,
  };
}

function speechAction(room, token, action) {
  advanceTimedStages(room);
  const stage = activeSpeechStage(room);
  if (!stage) {
    const error = new Error("\u5f53\u524d\u4e0d\u5728\u53d1\u8a00\u6216\u9057\u8a00\u9636\u6bb5");
    error.status = 409;
    throw error;
  }
  const entry = stage.entries[stage.currentIndex];
  if (!entry) {
    finishSpeechStage(room, stage);
    return;
  }
  const actor = actorForSpeech(room, token);
  if (!actor.isHost && actor.player.id !== entry.playerId) {
    const error = new Error("\u8fd8\u6ca1\u8f6e\u5230\u4f60\u53d1\u8a00");
    error.status = 403;
    throw error;
  }
  if (stage.kind === "discussion" && !actor.isHost && !actor.player.alive) {
    const error = new Error("\u4f60\u5df2\u51fa\u5c40\uff0c\u4e0d\u80fd\u53c2\u4e0e\u6b63\u5f0f\u53d1\u8a00");
    error.status = 403;
    throw error;
  }
  completeSpeechEntry(room, action, actor.name);
}

function endSpeechStage(room, hostToken) {
  advanceTimedStages(room);
  const actor = actorForSpeech(room, hostToken);
  if (!actor.isHost) {
    const error = new Error("\u53ea\u6709\u623f\u4e3b\u53ef\u4ee5\u624b\u52a8\u7ed3\u675f\u53d1\u8a00\u9636\u6bb5");
    error.status = 403;
    throw error;
  }
  const stage = activeSpeechStage(room);
  if (!stage) {
    const error = new Error("\u5f53\u524d\u4e0d\u5728\u53d1\u8a00\u6216\u9057\u8a00\u9636\u6bb5");
    error.status = 409;
    throw error;
  }
  const currentEntry = stage.entries[stage.currentIndex];
  if (currentEntry) {
    currentEntry.status = "skipped";
    currentEntry.endedAt = Date.now();
    addSpeechRecord(room, stage, currentEntry, "host-ended-stage", actor.name);
    if (stage.kind === "lastWords") {
      const player = findPlayer(room, currentEntry.playerId);
      if (player) player.lastWordsUsed = true;
    }
  }
  finishSpeechStage(room, stage);
}

function advanceTimedStages(room) {
  const stage = activeSpeechStage(room);
  if (!stage || !stage.timeLimit) return;
  const entry = stage.entries[stage.currentIndex];
  if (!entry?.endsAt || Date.now() < entry.endsAt) return;
  completeSpeechEntry(room, "timeout", "\u7cfb\u7edf");
}

function normalizeSpeechEntry(player) {
  return {
    playerId: player.id,
    seat: player.seat,
    name: player.name,
    status: "waiting",
    startedAt: null,
    endsAt: null,
    endedAt: null,
  };
}

function rotatePlayersFromSeat(players, startSeat) {
  const ordered = [...players].sort((left, right) => left.seat - right.seat);
  const startIndex = ordered.findIndex((player) => player.seat === startSeat);
  if (startIndex <= 0) return ordered;
  return [...ordered.slice(startIndex), ...ordered.slice(0, startIndex)];
}

function nextLivingSeatAfter(room, seat) {
  for (let offset = 1; offset <= room.playerCount; offset += 1) {
    const nextSeat = ((seat + offset - 1) % room.playerCount) + 1;
    const player = room.players.find((item) => item.seat === nextSeat && item.alive);
    if (player) return player.seat;
  }
  return alivePlayers(room)[0]?.seat || 1;
}

function discussionOrder(room, starterDeathSeats = []) {
  const living = alivePlayers(room);
  if (!living.length) return [];
  if (starterDeathSeats.length) {
    const firstDeathSeat = Math.min(...starterDeathSeats);
    return rotatePlayersFromSeat(living, nextLivingSeatAfter(room, firstDeathSeat));
  }
  const ordered = [...living].sort((left, right) => left.seat - right.seat);
  const randomStart = ordered[crypto.randomInt(ordered.length)].seat;
  return rotatePlayersFromSeat(ordered, randomStart);
}

function startDiscussion(room, transition = {}) {
  const entries = discussionOrder(room, transition.starterDeathSeats).map(normalizeSpeechEntry);
  if (!entries.length) {
    checkWinner(room);
    return;
  }
  room.phase = "discussion";
  room.day = null;
  room.lastWords = null;
  room.discussion = {
    kind: "discussion",
    title: "\u767d\u5929\u53d1\u8a00",
    day: room.round,
    timeLimit: room.settings?.speechTimeLimit ?? defaultSpeechTimeLimit,
    currentIndex: 0,
    entries,
    records: [],
  };
  room.announcement = transition.announcement || `\u7b2c${room.round}\u5929\u767d\u5929\u53d1\u8a00\u5f00\u59cb\u3002`;
  startSpeechEntry(room.discussion);
}

function startVoting(room, announcement) {
  if (checkWinner(room)) return;
  room.phase = "day";
  room.day = makeDay();
  room.discussion = null;
  room.lastWords = null;
  room.announcement = announcement || "\u8bf7\u53d1\u8a00\u540e\u6295\u7968\u653e\u9010\u4e00\u540d\u73a9\u5bb6\u3002";
}

function pendingLastWordsPlayers(room) {
  const seen = new Set();
  return [...room.pendingDeaths]
    .sort((left, right) => left.seat - right.seat)
    .map((death) => findPlayer(room, death.playerId))
    .filter((player) => {
      if (!player || player.alive || player.lastWordsUsed || seen.has(player.id)) return false;
      seen.add(player.id);
      return true;
    });
}

function startLastWordsOrTransition(room, transition) {
  const players = pendingLastWordsPlayers(room);
  if (!players.length) {
    room.pendingDeaths = [];
    applyTransition(room, transition);
    return;
  }

  room.phase = "lastWords";
  room.lastWords = {
    kind: "lastWords",
    title: "\u9057\u8a00\u9636\u6bb5",
    day: room.round,
    timeLimit: room.settings?.lastWordsTimeLimit ?? defaultLastWordsTimeLimit,
    currentIndex: 0,
    entries: players.map(normalizeSpeechEntry),
    records: [],
    transition,
  };
  room.announcement = "\u6b7b\u4ea1\u73a9\u5bb6\u4f9d\u5ea7\u4f4d\u53f7\u987a\u5e8f\u53d1\u8868\u9057\u8a00\u3002";
  startSpeechEntry(room.lastWords);
}

function continueAfterDeaths(room, transition) {
  if (transition.type === "discussion" && !transition.starterDeathSeats?.length) {
    transition.starterDeathSeats = room.pendingDeaths.map((death) => death.seat);
  }
  room.pendingTransition = transition;
  const hunterDeath = room.pendingDeaths.find((death) => death.canHunter && !death.hunterResolved);
  if (hunterDeath) {
    room.phase = "hunter";
    room.hunter = { playerId: hunterDeath.playerId };
    room.announcement = `${hunterDeath.seat}\u53f7 ${hunterDeath.name} \u662f\u730e\u4eba\uff0c\u8bf7\u51b3\u5b9a\u662f\u5426\u5f00\u67aa\u3002`;
    return;
  }
  startLastWordsOrTransition(room, transition);
}

function recordDeath(room, player, reason) {
  if (!player.alive) return null;
  player.alive = false;
  const death = {
    playerId: player.id,
    seat: player.seat,
    name: player.name,
    reason,
    canHunter: player.role === "hunter" && reason !== "\u88ab\u5973\u5deb\u6bd2\u6740",
    hunterResolved: false,
  };
  room.pendingDeaths.push(death);
  room.log.push(`${player.seat}\u53f7 ${player.name} ${reason}`);
  return death;
}

function witchNeedsAction(room) {
  return !room.witch.healUsed || !room.witch.poisonUsed;
}

function witchViewerState(room) {
  const killed = room.night?.wolfTargetId ? findPlayer(room, room.night.wolfTargetId) : null;
  return {
    healUsed: room.witch.healUsed,
    poisonUsed: room.witch.poisonUsed,
    killed: killed ? { id: killed.id, seat: killed.seat, name: killed.name } : null,
  };
}

function allNightDone(room) {
  const livingRoles = new Set(alivePlayers(room).map((player) => player.role));
  if (livingRoles.has("werewolf") && !room.night.wolfTargetId) return false;
  if (livingRoles.has("seer")) {
    const livingSeers = alivePlayers(room).filter((player) => player.role === "seer");
    if (livingSeers.some((player) => !room.night.seerDone[player.id])) return false;
  }
  if (livingRoles.has("witch") && witchNeedsAction(room) && !room.night.witchDone) return false;
  if (livingRoles.has("guard") && !room.night.guardDone) return false;
  return true;
}

function resolveNight(room) {
  const deaths = [];
  const wolfTarget = room.night.wolfTargetId ? findPlayer(room, room.night.wolfTargetId) : null;
  const guardedId = room.night.guardTargetId;
  if (wolfTarget && wolfTarget.alive) {
    const savedByGuard = guardedId && guardedId === wolfTarget.id;
    const savedByWitch = room.night.witchHeal;
    if (!savedByGuard && !savedByWitch) deaths.push([wolfTarget, "\u88ab\u72fc\u4eba\u51fb\u6740"]);
  }
  const poisoned = room.night.witchPoisonTargetId ? findPlayer(room, room.night.witchPoisonTargetId) : null;
  if (poisoned && poisoned.alive && !deaths.some(([player]) => player.id === poisoned.id)) {
    deaths.push([poisoned, "\u88ab\u5973\u5deb\u6bd2\u6740"]);
  }
  if (!deaths.length) room.log.push(`\u7b2c${room.round}\u591c \u5e73\u5b89\u591c`);
  const nightAnnouncement = deaths.length
    ? `\u6628\u665a\u6b7b\u4ea1\uff1a${deaths.map(([player]) => `${player.seat}\u53f7 ${player.name}`).join("\u3001")}`
    : "\u6628\u665a\u5e73\u5b89\u591c";
  const starterDeathSeats = deaths.map(([player]) => player.seat);
  for (const [player, reason] of deaths) recordDeath(room, player, reason);
  continueAfterDeaths(room, {
    type: "discussion",
    starterDeathSeats,
    announcement: nightAnnouncement,
  });
}

function startNextNight(room) {
  room.round += 1;
  room.phase = "night";
  room.night = makeNight(room.round);
  room.day = null;
  room.discussion = null;
  room.lastWords = null;
  room.pendingDeaths = [];
  room.pendingTransition = null;
  room.hunter = null;
  room.announcement = `\u7b2c${room.round}\u591c\u5f00\u59cb`;
}

function startRoom(room, hostToken) {
  if (!secureCompare(hostToken, room.hostToken)) {
    const error = new Error(text.hostOnlyStart);
    error.status = 403;
    throw error;
  }
  if (room.status !== "lobby") {
    const error = new Error(text.alreadyStarted);
    error.status = 409;
    throw error;
  }
  if (room.players.length !== room.playerCount) {
    const error = new Error(`${text.needMorePrefix}${room.playerCount - room.players.length}${text.needMoreSuffix}`);
    error.status = 409;
    throw error;
  }

  const roles = shuffle(getRolesForConfig(room.config));
  room.players = room.players.map((player, index) => ({
    ...player,
    seat: index + 1,
    role: roles[index],
    alive: true,
    ready: true,
    lastWordsUsed: false,
  }));
  room.status = "started";
  room.startedAt = Date.now();
  room.log = [text.rolesAssigned];
  room.pendingDeaths = [];
  room.pendingTransition = null;
  room.discussion = null;
  room.lastWords = null;
  room.day = null;
  room.hunter = null;
  startNextNight(room);
}

function disbandRoom(room, hostToken) {
  if (!secureCompare(hostToken, room.hostToken)) {
    const error = new Error(text.hostOnlyDisband);
    error.status = 403;
    throw error;
  }
  rooms.delete(room.code);
}

function wolfAction(room, token, targetId) {
  requirePhase(room, "night");
  const viewer = requireLivingViewer(room, token);
  if (viewer.role !== "werewolf") throw roleError("werewolf");
  const target = validateAliveTarget(room, targetId);
  room.night.wolfTargetId = target.id;
  if (allNightDone(room)) resolveNight(room);
}

function seerAction(room, token, targetId) {
  requirePhase(room, "night");
  const viewer = requireLivingViewer(room, token);
  if (viewer.role !== "seer") throw roleError("seer");
  if (room.night.seerDone[viewer.id]) {
    const error = new Error("\u4eca\u665a\u5df2\u7ecf\u67e5\u9a8c\u8fc7");
    error.status = 409;
    throw error;
  }
  const target = validateAliveTarget(room, targetId);
  const camp = roleMeta[target.role].camp === "werewolf" ? "werewolf" : "good";
  viewer.checks = viewer.checks || [];
  viewer.checks.push({
    round: room.round,
    seat: target.seat,
    name: target.name,
    camp,
    result: camp === "werewolf" ? "\u72fc\u4eba" : "\u597d\u4eba",
  });
  room.night.seerDone[viewer.id] = true;
  if (allNightDone(room)) resolveNight(room);
}

function witchAction(room, token, body) {
  requirePhase(room, "night");
  const viewer = requireLivingViewer(room, token);
  if (viewer.role !== "witch") throw roleError("witch");
  if (!room.night.wolfTargetId) {
    const error = new Error("\u8bf7\u7b49\u72fc\u4eba\u5148\u9009\u62e9\u51fb\u6740\u76ee\u6807");
    error.status = 409;
    throw error;
  }
  if (room.night.witchDone) {
    const error = new Error("\u4eca\u665a\u5df2\u7ecf\u64cd\u4f5c\u8fc7");
    error.status = 409;
    throw error;
  }
  const wantsHeal = Boolean(body.heal);
  const poisonTargetId = String(body.poisonTargetId || "");
  if (wantsHeal) {
    if (room.witch.healUsed) {
      const error = new Error("\u89e3\u836f\u5df2\u7ecf\u7528\u8fc7");
      error.status = 400;
      throw error;
    }
    if (!room.night.wolfTargetId) {
      const error = new Error("\u4eca\u665a\u6ca1\u6709\u72fc\u4eba\u51fb\u6740\u76ee\u6807");
      error.status = 400;
      throw error;
    }
    room.night.witchHeal = true;
    room.witch.healUsed = true;
  }
  if (poisonTargetId) {
    if (room.witch.poisonUsed) {
      const error = new Error("\u6bd2\u836f\u5df2\u7ecf\u7528\u8fc7");
      error.status = 400;
      throw error;
    }
    const target = validateAliveTarget(room, poisonTargetId);
    room.night.witchPoisonTargetId = target.id;
    room.witch.poisonUsed = true;
  }
  room.night.witchDone = true;
  if (allNightDone(room)) resolveNight(room);
}

function guardAction(room, token, targetId) {
  requirePhase(room, "night");
  const viewer = requireLivingViewer(room, token);
  if (viewer.role !== "guard") throw roleError("guard");
  if (room.night.guardDone) {
    const error = new Error("\u4eca\u665a\u5df2\u7ecf\u5b88\u62a4\u8fc7");
    error.status = 409;
    throw error;
  }
  const target = validateAliveTarget(room, targetId);
  if (room.guardLastTargetId === target.id) {
    const error = new Error("\u5b88\u536b\u4e0d\u80fd\u8fde\u7eed\u4e24\u665a\u5b88\u62a4\u540c\u4e00\u4eba");
    error.status = 400;
    throw error;
  }
  room.night.guardTargetId = target.id;
  room.night.guardDone = true;
  room.guardLastTargetId = target.id;
  if (allNightDone(room)) resolveNight(room);
}

function voteAction(room, token, targetId) {
  requirePhase(room, "day");
  const viewer = requireLivingViewer(room, token);
  const target = validateAliveTarget(room, targetId);
  room.day.votes[viewer.id] = target.id;
  if (Object.keys(room.day.votes).length < alivePlayers(room).length) return;

  const tally = new Map();
  for (const votedId of Object.values(room.day.votes)) {
    tally.set(votedId, (tally.get(votedId) || 0) + 1);
  }
  const ordered = [...tally.entries()].sort((left, right) => right[1] - left[1]);
  if (!ordered.length || (ordered[1] && ordered[0][1] === ordered[1][1])) {
    room.log.push("\u767d\u5929\u6295\u7968\u5e73\u7968\uff0c\u65e0\u4eba\u51fa\u5c40");
    if (!checkWinner(room)) startNextNight(room);
    return;
  }
  const exiled = findPlayer(room, ordered[0][0]);
  recordDeath(room, exiled, "\u88ab\u6295\u7968\u653e\u9010");
  continueAfterDeaths(room, { type: "night" });
}

function hunterAction(room, token, targetId) {
  requirePhase(room, "hunter");
  const hunter = room.players.find((player) => player.token === token && player.id === room.hunter?.playerId);
  if (!hunter) {
    const error = new Error("\u53ea\u6709\u6b7b\u4ea1\u7684\u730e\u4eba\u53ef\u4ee5\u5f00\u67aa");
    error.status = 403;
    throw error;
  }
  if (targetId) {
    const target = findPlayer(room, targetId);
    if (!target || !target.alive) {
      const error = new Error("\u76ee\u6807\u4e0d\u5b58\u5728\u6216\u5df2\u51fa\u5c40");
      error.status = 400;
      throw error;
    }
    recordDeath(room, target, "\u88ab\u730e\u4eba\u5e26\u8d70");
  } else {
    room.log.push("\u730e\u4eba\u9009\u62e9\u4e0d\u5f00\u67aa");
  }
  const hunterDeath = room.pendingDeaths.find((death) => death.playerId === hunter.id);
  if (hunterDeath) hunterDeath.hunterResolved = true;
  room.hunter = null;
  continueAfterDeaths(room, room.pendingTransition || { type: "night" });
}

async function handleApi(request, response, url) {
  try {
    if (!checkRateLimit(request, request.method === "GET" ? "read" : "write")) {
      sendJson(response, 429, { error: "\u64cd\u4f5c\u8fc7\u4e8e\u9891\u7e41\uff0c\u8bf7\u7a0d\u540e\u518d\u8bd5" });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/health") {
      sendJson(response, 200, {
        ok: true,
        rooms: rooms.size,
        uptime: Math.round(process.uptime()),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/configs") {
      sendJson(response, 200, {
        playerConfigs,
        roleMeta,
        counts: Object.keys(playerConfigs).map(Number),
        minPlayerCount,
        maxPlayerCount,
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(request);
      const playerCount = Number(body.playerCount);
      if (!Number.isInteger(playerCount) || playerCount < minPlayerCount || playerCount > maxPlayerCount) {
        sendJson(response, 400, { error: text.invalidCount });
        return;
      }
      const roleConfig = normalizeRoleConfig(body.roleConfig || getRecommendedConfig(playerCount), playerCount);
      if (!validateRoleConfig(roleConfig, playerCount)) {
        sendJson(response, 400, { error: text.invalidRoleConfig });
        return;
      }
      const room = createRoom(playerCount, body.hostName, {
        roleConfig,
        speechTimeLimit: body.speechTimeLimit,
        lastWordsTimeLimit: body.lastWordsTimeLimit,
      });
      sendJson(response, 200, { room: publicRoom(room, room.hostToken), hostToken: room.hostToken });
      return;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/(.+))?$/);
    if (!roomMatch) {
      sendJson(response, 404, { error: text.apiMissing });
      return;
    }

    const room = findRoom(roomMatch[1]);
    const action = roomMatch[2] || "";
    if (!room) {
      sendJson(response, 404, { error: text.roomMissing });
      return;
    }

    if (request.method === "GET" && !action) {
      const token = url.searchParams.get("token");
      const joinSecret = url.searchParams.get("invite");
      sendJson(response, 200, { room: publicRoom(room, token, joinSecret) });
      return;
    }

    if (request.method === "POST" && action === "join") {
      const body = await readBody(request);
      const player = addPlayer(room, body.name, body.joinSecret);
      sendJson(response, 200, { room: publicRoom(room, player.token), playerToken: player.token });
      return;
    }

    if (request.method === "POST" && action === "start") {
      const body = await readBody(request);
      startRoom(room, body.hostToken);
      sendJson(response, 200, { room: publicRoom(room, body.hostToken) });
      return;
    }

    if (request.method === "POST" && action === "disband") {
      const body = await readBody(request);
      disbandRoom(room, body.hostToken);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && action === "voice/join") {
      const body = await readBody(request);
      sendJson(response, 200, joinVoice(room, body.playerToken));
      return;
    }

    if (request.method === "GET" && action === "voice/sync") {
      const token = url.searchParams.get("token");
      const since = url.searchParams.get("since");
      sendJson(response, 200, syncVoice(room, token, since));
      return;
    }

    if (request.method === "POST" && action === "voice/signal") {
      const body = await readBody(request);
      sendVoiceSignal(room, body.playerToken, body);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && action === "voice/leave") {
      const body = await readBody(request);
      leaveVoice(room, body.playerToken);
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "POST" && action === "speech/end") {
      const body = await readBody(request);
      const token = body.hostToken || body.playerToken;
      speechAction(room, token, "done");
      sendJson(response, 200, { room: publicRoom(room, token) });
      return;
    }

    if (request.method === "POST" && action === "speech/skip") {
      const body = await readBody(request);
      speechAction(room, body.hostToken, "skip");
      sendJson(response, 200, { room: publicRoom(room, body.hostToken) });
      return;
    }

    if (request.method === "POST" && action === "speech/end-stage") {
      const body = await readBody(request);
      endSpeechStage(room, body.hostToken);
      sendJson(response, 200, { room: publicRoom(room, body.hostToken) });
      return;
    }

    if (request.method === "POST" && action === "wolf") {
      const body = await readBody(request);
      wolfAction(room, body.playerToken, body.targetId);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    if (request.method === "POST" && action === "seer") {
      const body = await readBody(request);
      seerAction(room, body.playerToken, body.targetId);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    if (request.method === "POST" && action === "witch") {
      const body = await readBody(request);
      witchAction(room, body.playerToken, body);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    if (request.method === "POST" && action === "guard") {
      const body = await readBody(request);
      guardAction(room, body.playerToken, body.targetId);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    if (request.method === "POST" && action === "vote") {
      const body = await readBody(request);
      voteAction(room, body.playerToken, body.targetId);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    if (request.method === "POST" && action === "hunter") {
      const body = await readBody(request);
      hunterAction(room, body.playerToken, body.targetId);
      sendJson(response, 200, { room: publicRoom(room, body.playerToken) });
      return;
    }

    sendJson(response, 404, { error: text.apiMissing });
  } catch (error) {
    const isClientError = error.status && error.status < 500;
    sendJson(response, error.status || 500, { error: isClientError ? error.message : text.serverError });
  }
}

function handleStatic(request, response, url) {
  const pathname = decodeURIComponent(url.pathname);
  if (pathname === "/favicon.ico") {
    response.writeHead(204);
    response.end();
    return;
  }

  const allowedFile = allowedStaticFiles.get(pathname);
  if (!allowedFile) {
    response.writeHead(404, securityHeaders());
    response.end("Not found");
    return;
  }

  const filePath = path.join(root, allowedFile);
  const resolved = path.resolve(filePath);

  if (resolved !== root && !resolved.startsWith(rootWithSeparator)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.readFile(resolved, (error, data) => {
    if (error) {
      response.writeHead(404, securityHeaders());
      response.end("Not found");
      return;
    }

    response.writeHead(200, {
      "Content-Type": types[path.extname(resolved)] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...securityHeaders(),
    });
    response.end(data);
  });
}

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://127.0.0.1:${port}`);
  if (url.pathname.startsWith("/api/")) {
    handleApi(request, response, url);
    return;
  }
  handleStatic(request, response, url);
});

server.listen(port, host, () => {
  console.log(`Serving http://127.0.0.1:${port}`);
  Object.values(os.networkInterfaces())
    .flat()
    .filter((item) => item && item.family === "IPv4" && !item.internal)
    .forEach((item) => {
      console.log(`LAN http://${item.address}:${port}`);
    });
});

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms.entries()) {
    if (now - room.createdAt > maxRoomAgeMs) {
      rooms.delete(code);
    }
  }
}, 1000 * 60 * 30).unref();
