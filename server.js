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
  invalidCount: "\u4eba\u6570\u5fc5\u987b\u662f 6 \u5230 12",
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
const rooms = new Map();
const rateLimits = new Map();
const maxRoomAgeMs = 1000 * 60 * 60 * 8;
const rateLimitWindowMs = 1000 * 60;
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

function getRolesForCount(count) {
  const config = playerConfigs[count];
  return roleOrder.flatMap((role) => Array(config[role] || 0).fill(role));
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
  };
}

function createRoom(playerCount, hostName) {
  const code = randomRoomCode();
  const hostToken = randomToken();
  const joinSecret = randomCode();
  const room = {
    code,
    hostToken,
    joinSecret,
    playerCount,
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
    hunter: null,
    witch: { healUsed: false, poisonUsed: false },
    guardLastTargetId: null,
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
    config: playerConfigs[room.playerCount],
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
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; base-uri 'none'; frame-ancestors 'none'",
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
      if (body.length > 1024 * 8) {
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

function recordDeath(room, player, reason, hunterNextPhase = "night") {
  if (!player.alive) return;
  player.alive = false;
  room.log.push(`${player.seat}\u53f7 ${player.name} ${reason}`);
  if (player.role === "hunter" && reason !== "\u88ab\u5973\u5deb\u6bd2\u6740" && room.phase !== "hunter") {
    room.hunter = { playerId: player.id, nextPhase: hunterNextPhase };
    room.phase = "hunter";
  }
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
  for (const [player, reason] of deaths) recordDeath(room, player, reason, "day");
  if (checkWinner(room) || room.phase === "hunter") return;
  room.phase = "day";
  room.day = makeDay();
  room.announcement = nightAnnouncement;
}

function startNextNight(room) {
  room.round += 1;
  room.phase = "night";
  room.night = makeNight(room.round);
  room.day = null;
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

  const roles = shuffle(getRolesForCount(room.playerCount));
  room.players = room.players.map((player, index) => ({
    ...player,
    seat: index + 1,
    role: roles[index],
    alive: true,
    ready: true,
  }));
  room.status = "started";
  room.startedAt = Date.now();
  room.log = [text.rolesAssigned];
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
  if (checkWinner(room) || room.phase === "hunter") return;
  startNextNight(room);
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
    target.alive = false;
    room.log.push(`${target.seat}\u53f7 ${target.name} \u88ab\u730e\u4eba\u5e26\u8d70`);
  } else {
    room.log.push("\u730e\u4eba\u9009\u62e9\u4e0d\u5f00\u67aa");
  }
  if (checkWinner(room)) return;
  if (room.hunter?.nextPhase === "day") {
    room.phase = "day";
    room.day = makeDay();
    room.announcement = "\u730e\u4eba\u5f00\u67aa\u540e\uff0c\u767d\u5929\u5f00\u59cb";
    room.hunter = null;
    return;
  }
  startNextNight(room);
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
      sendJson(response, 200, { playerConfigs, roleMeta, counts: Object.keys(playerConfigs).map(Number) });
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/rooms") {
      const body = await readBody(request);
      const playerCount = Number(body.playerCount);
      if (!playerConfigs[playerCount]) {
        sendJson(response, 400, { error: text.invalidCount });
        return;
      }
      const room = createRoom(playerCount, body.hostName);
      sendJson(response, 200, { room: publicRoom(room, room.hostToken), hostToken: room.hostToken });
      return;
    }

    const roomMatch = url.pathname.match(/^\/api\/rooms\/([^/]+)(?:\/([^/]+))?$/);
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
