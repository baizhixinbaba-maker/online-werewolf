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
  hostGoodWin: "\u623f\u4e3b\u5ba3\u5e03\u597d\u4eba\u9635\u8425\u80dc\u5229\u3002",
  hostWolfWin: "\u623f\u4e3b\u5ba3\u5e03\u72fc\u4eba\u9635\u8425\u80dc\u5229\u3002",
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

function createRoom(playerCount) {
  const code = randomRoomCode();
  const hostToken = randomToken();
  const joinSecret = randomCode();
  const room = {
    code,
    hostToken,
    joinSecret,
    playerCount,
    status: "lobby",
    players: [],
    createdAt: Date.now(),
    startedAt: null,
    log: [],
    winner: null,
  };
  rooms.set(code, room);
  return room;
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
    canStart: room.players.length === room.playerCount && room.status === "lobby",
    joinedCount: room.players.length,
    config: playerConfigs[room.playerCount],
    roleMeta,
    players: canViewLobby
      ? room.players.map((player) => ({
          id: player.id,
          seat: player.seat,
          name: player.name,
          alive: player.alive,
          ready: player.ready,
          role: room.status === "ended" ? player.role : undefined,
          roleName: room.status === "ended" ? roleMeta[player.role]?.name : undefined,
          isYou: Boolean(viewer && viewer.id === player.id),
        }))
      : [],
    viewer: viewer
      ? {
          id: viewer.id,
          seat: viewer.seat,
          name: viewer.name,
          role: viewer.role,
          roleName: viewer.role ? roleMeta[viewer.role].name : null,
          camp: viewer.role ? roleMeta[viewer.role].camp : null,
          campName: viewer.role ? roleMeta[viewer.role].campName : null,
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
    const error = new Error("\u623f\u95f4\u9080\u8bf7\u7801\u4e0d\u6b63\u786e\uff0c\u8bf7\u4f7f\u7528\u623f\u4e3b\u5206\u4eab\u7684\u5b8c\u6574\u94fe\u63a5\u52a0\u5165");
    error.status = 403;
    throw error;
  }
  const player = {
    id: randomToken(10),
    token: randomToken(),
    seat: room.players.length + 1,
    name: sanitizeName(name, `${room.players.length + 1}${text.playerSuffix}`),
    role: null,
    alive: true,
    ready: false,
  };
  room.players.push(player);
  return player;
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
}

function endRoom(room, hostToken, winner) {
  if (!secureCompare(hostToken, room.hostToken)) {
    const error = new Error(text.hostOnlyEnd);
    error.status = 403;
    throw error;
  }
  room.status = "ended";
  room.winner = winner === "werewolf" ? "werewolf" : "good";
  room.log.push(room.winner === "werewolf" ? text.hostWolfWin : text.hostGoodWin);
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
      const room = createRoom(playerCount);
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

    if (request.method === "POST" && action === "end") {
      const body = await readBody(request);
      endRoom(room, body.hostToken, body.winner);
      sendJson(response, 200, { room: publicRoom(room, body.hostToken) });
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
