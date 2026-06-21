const app = document.querySelector("#app");
const resetButton = document.querySelector("#resetGame");

const fallbackConfigs = {
  6: { werewolf: 2, villager: 2, seer: 1, witch: 1 },
  7: { werewolf: 2, villager: 3, seer: 1, witch: 1 },
  8: { werewolf: 3, villager: 2, seer: 1, witch: 1, hunter: 1 },
  9: { werewolf: 3, villager: 3, seer: 1, witch: 1, hunter: 1 },
  10: { werewolf: 3, villager: 4, seer: 1, witch: 1, hunter: 1 },
  11: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1 },
  12: { werewolf: 4, villager: 4, seer: 1, witch: 1, hunter: 1, guard: 1 },
};

const fallbackRoleMeta = {
  werewolf: { name: "狼人", camp: "werewolf", campName: "狼人阵营", type: "狼人" },
  villager: { name: "平民", camp: "good", campName: "好人阵营", type: "平民" },
  seer: { name: "预言家", camp: "good", campName: "好人阵营", type: "神职" },
  witch: { name: "女巫", camp: "good", campName: "好人阵营", type: "神职" },
  hunter: { name: "猎人", camp: "good", campName: "好人阵营", type: "神职" },
  guard: { name: "守卫", camp: "good", campName: "好人阵营", type: "神职" },
};

const roleOrder = ["werewolf", "villager", "seer", "witch", "hunter", "guard"];
const storage = window.localStorage;

let state = {
  screen: "home",
  configs: fallbackConfigs,
  roleMeta: fallbackRoleMeta,
  counts: Object.keys(fallbackConfigs).map(Number),
  playerCount: 6,
  room: null,
  hostToken: storage.getItem("werewolfHostToken") || "",
  playerToken: storage.getItem("werewolfPlayerToken") || "",
  roomCode: storage.getItem("werewolfRoomCode") || "",
  joinSecret: storage.getItem("werewolfJoinSecret") || "",
  joinCode: storage.getItem("werewolfRoomCode") || "",
  playerName: storage.getItem("werewolfPlayerName") || "",
  message: "",
  error: "",
  roleVisible: false,
  pollTimer: null,
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function api(path, options = {}) {
  return fetch(path, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    cache: "no-store",
    ...options,
  }).then(async (response) => {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "请求失败");
    return data;
  });
}

function currentToken() {
  return state.hostToken || state.playerToken || "";
}

function tokenForRoom(roomCode = state.roomCode) {
  if (!roomCode) return "";
  return currentToken();
}

function roomInviteUrl(room) {
  const url = new URL(window.location.origin);
  url.searchParams.set("room", room.code);
  if (room.joinSecret) url.searchParams.set("invite", room.joinSecret);
  return url.toString();
}

function setMessage(message, isError = false) {
  state.message = isError ? "" : message;
  state.error = isError ? message : "";
}

function getRoleCountText(config) {
  return roleOrder
    .filter((role) => config[role])
    .map((role) => `${state.roleMeta[role].name} ${config[role]}`)
    .join("、");
}

function roleTag(role) {
  if (!role) return `<span class="role-tag villager">未知</span>`;
  return `<span class="role-tag ${role}">${state.roleMeta[role]?.name || role}</span>`;
}

function panel(content, extra = "") {
  return `<section class="panel ${extra}"><div class="panel-inner">${content}</div></section>`;
}

function renderConfigList(count = state.playerCount) {
  const config = state.configs[count];
  return `
    <ul class="config-list">
      ${roleOrder
        .filter((role) => config[role])
        .map(
          (role) => `
            <li class="config-item">
              <span>${state.roleMeta[role].name}</span>
              <strong>${config[role]} 人</strong>
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function renderNotice() {
  if (state.error) return `<div class="notice danger">${escapeHtml(state.error)}</div>`;
  if (state.message) return `<div class="notice ok">${escapeHtml(state.message)}</div>`;
  return "";
}

function renderPhaseStrip(current) {
  const steps = [
    ["home", "建房", "选择人数"],
    ["join", "加入", "手机入座"],
    ["started", "身份", "各自查看"],
    ["ended", "结算", "公开身份"],
  ];
  return `
    <div class="phase-strip">
      ${steps
        .map(
          ([key, title, desc]) => `
            <div class="phase-step ${key === current ? "current" : ""}">
              <strong>${title}</strong>
              <span>${desc}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderHome() {
  app.innerHTML = `
    ${renderPhaseStrip("home")}
    <div class="split">
      ${panel(`
        <div class="section-title">
          <h2>联机狼人杀</h2>
        </div>
        <p class="subtle">一台电脑启动服务并创建房间，其他玩家打开同一个游戏链接后输入房号加入。房主点开始后，系统随机分配身份，每个玩家只在自己的手机上看到自己的身份。</p>
        ${renderNotice()}
        <div>
          <div class="section-title">
            <h3>创建房间人数</h3>
            <strong>${state.playerCount} 人</strong>
          </div>
          <div class="number-grid" role="group" aria-label="选择玩家人数">
            ${state.counts
              .map(
                (count) => `
                  <button class="number-button ${count === state.playerCount ? "active" : ""}" type="button" data-count="${count}">
                    ${count}
                  </button>
                `,
              )
              .join("")}
          </div>
        </div>
        <div class="notice">当前配置：${getRoleCountText(state.configs[state.playerCount])}</div>
        <div class="actions">
          <button class="primary-button" type="button" data-create-room>创建联机房间</button>
        </div>
      `)}
      ${panel(`
        <div class="section-title">
          <h3>加入已有房间</h3>
        </div>
        <label>
          房间号
          <input type="text" inputmode="numeric" maxlength="6" value="${escapeHtml(state.joinCode)}" data-join-code placeholder="例如 123456" />
        </label>
        <label>
          你的昵称
          <input type="text" maxlength="16" value="${escapeHtml(state.playerName)}" data-player-name placeholder="输入你的名字" />
        </label>
        <div class="actions">
          <button class="secondary-button" type="button" data-join-room>加入房间</button>
        </div>
        <div class="section-title">
          <h3>${state.playerCount} 人身份配置</h3>
        </div>
        ${renderConfigList(state.playerCount)}
      `)}
    </div>
  `;
}

function renderSeats(room) {
  return `
    <div class="seats">
      ${room.players
        .map(
          (player) => `
            <article class="seat-card ${player.isYou ? "selected" : ""}">
              <div class="seat-top">
                <span class="seat-no">${player.seat}</span>
                <span class="status-tag ${player.alive ? "alive" : "dead"}">${player.alive ? "在线" : "出局"}</span>
              </div>
              <p class="seat-name">${escapeHtml(player.name)}</p>
              ${
                player.role
                  ? `${roleTag(player.role)}<p class="seat-note">${player.isYou ? "这是你" : "结算后公开"}</p>`
                  : `<p class="seat-note">${player.isYou ? "这是你" : "等待开始"}</p>`
              }
            </article>
          `,
        )
        .join("")}
      ${Array.from({ length: Math.max(0, room.playerCount - room.players.length) }, (_, index) => index + room.players.length + 1)
        .map(
          (seat) => `
            <article class="seat-card">
              <div class="seat-top">
                <span class="seat-no">${seat}</span>
                <span class="status-tag dead">空位</span>
              </div>
              <p class="seat-name">等待玩家</p>
              <p class="seat-note">分享房号让朋友加入。</p>
            </article>
          `,
        )
        .join("")}
    </div>
  `;
}

function renderRoom() {
  const room = state.room;
  if (!room) {
    renderHome();
    return;
  }
  const joinUrl = roomInviteUrl(room);
  const phase = room.status === "ended" ? "ended" : room.status === "started" ? "started" : "join";
  app.innerHTML = `
    ${renderPhaseStrip(phase)}
    <div class="split">
      ${panel(`
        <div class="section-title">
          <h2>房间 ${room.code}</h2>
          <span class="status-tag alive">${room.joinedCount} / ${room.playerCount}</span>
        </div>
        ${renderNotice()}
        <div class="notice">
          手机加入地址：${escapeHtml(joinUrl)}
          <br />
          其他玩家打开房主分享的完整链接后输入房间号：${room.code}
        </div>
        ${
          room.status === "lobby"
            ? `
              <p class="subtle">等待所有玩家加入。满员后房主点击开始，身份会随机分配到每个人自己的手机上。</p>
              <div class="actions">
                ${
                  room.isHost
                    ? `<button class="primary-button" type="button" data-start-room ${room.canStart ? "" : "disabled"}>随机分配身份并开始</button>`
                    : `<button class="secondary-button" type="button" disabled>等待房主开始</button>`
                }
              </div>
            `
            : renderStartedControls(room)
        }
      `)}
      ${panel(`
        <div class="section-title">
          <h3>玩家座位</h3>
        </div>
        ${renderSeats(room)}
        <div class="section-title">
          <h3>本局配置</h3>
        </div>
        ${renderConfigList(room.playerCount)}
      `)}
    </div>
  `;
}

function renderStartedControls(room) {
  if (room.status === "ended") {
    return `
      <div class="result-hero">
        <span class="camp-tag ${room.winner === "werewolf" ? "werewolf" : "good"}">${room.winner === "werewolf" ? "狼人阵营胜利" : "好人阵营胜利"}</span>
        <h2>游戏结束</h2>
        <p>所有身份已公开，房主可以重新创建下一局。</p>
      </div>
    `;
  }

  if (room.isHost) {
    return `
      <div class="notice ok">身份已分配。为了防止提前泄露，房主也只管理胜负结算；玩家只能看到自己的身份。</div>
      <div class="actions">
        <button class="ok-button" type="button" data-end-room="good">宣布好人胜利</button>
        <button class="danger-button" type="button" data-end-room="werewolf">宣布狼人胜利</button>
      </div>
      ${
        room.log.length
          ? `<ul class="records">${room.log.map((item) => `<li class="record-item"><span>${escapeHtml(item)}</span></li>`).join("")}</ul>`
          : ""
      }
    `;
  }

  const viewer = room.viewer;
  if (!viewer || !viewer.role) {
    return `<div class="notice">游戏已开始。请确认你是从自己的手机加入的玩家页面。</div>`;
  }

  return `
    <div class="identity-box">
      <p class="eyebrow">${viewer.seat} 号 ${escapeHtml(viewer.name)}</p>
      <div class="role-reveal">
        <span class="camp-tag ${viewer.camp}">${escapeHtml(viewer.campName)}</span>
        <h3 class="role-name ${state.roleVisible ? "" : "hidden-role"}">${state.roleVisible ? escapeHtml(viewer.roleName) : "隐藏身份"}</h3>
        <p class="subtle">${state.roleVisible ? getRoleHelp(viewer.role) : "请确认周围没人偷看，再点击查看身份。"}</p>
        ${
          state.roleVisible && viewer.teammates.length
            ? `<p class="notice">狼人队友：${viewer.teammates.map((item) => `${item.seat}号 ${escapeHtml(item.name)}`).join("、")}</p>`
            : ""
        }
      </div>
      <div class="actions">
        <button class="primary-button" type="button" data-toggle-role>${state.roleVisible ? "隐藏身份" : "查看我的身份"}</button>
      </div>
    </div>
  `;
}

function getRoleHelp(role) {
  const text = {
    werewolf: "夜晚与狼人队友共同选择击杀目标，白天隐藏身份参与发言和投票。",
    villager: "没有夜晚技能，通过发言和投票帮助好人阵营找出狼人。",
    seer: "每晚可以查验一名玩家，得知对方是狼人还是好人。",
    witch: "拥有一瓶解药和一瓶毒药，每瓶药整局只能使用一次。",
    hunter: "死亡时可以开枪带走一名玩家，被女巫毒死时不能开枪。",
    guard: "每晚守护一名玩家使其免死，不能连续两晚守护同一名玩家。",
  };
  return text[role] || "";
}

function render() {
  if (state.room) renderRoom();
  else renderHome();
}

async function loadConfigs() {
  try {
    const data = await api("/api/configs");
    state.configs = data.playerConfigs;
    state.roleMeta = data.roleMeta;
    state.counts = data.counts;
  } catch (error) {
    setMessage("配置加载失败，已使用本地默认配置。", true);
  }
}

async function createRoom() {
  try {
    setMessage("");
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({ playerCount: state.playerCount }),
    });
    state.room = data.room;
    state.roomCode = data.room.code;
    state.joinSecret = data.room.joinSecret || "";
    state.hostToken = data.hostToken;
    state.playerToken = "";
    storage.setItem("werewolfRoomCode", state.roomCode);
    storage.setItem("werewolfJoinSecret", state.joinSecret);
    storage.setItem("werewolfHostToken", state.hostToken);
    storage.removeItem("werewolfPlayerToken");
    setMessage("房间已创建，请分享页面里的完整加入地址给朋友。");
    startPolling();
    render();
  } catch (error) {
    if (error.message.includes("房间不存在")) {
      clearRoomSession();
      state.joinCode = "";
      setMessage("上一局房间已过期，请重新创建房间或加入新的邀请链接。");
      render();
      return;
    }
    setMessage(error.message, true);
    render();
  }
}

async function joinRoom() {
  try {
    setMessage("");
    const code = state.joinCode.trim();
    if (!code) throw new Error("请输入房间号");
    if (!state.playerName.trim()) throw new Error("请输入昵称");
    const data = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name: state.playerName, joinSecret: state.joinSecret }),
    });
    state.room = data.room;
    state.roomCode = code;
    state.joinSecret = data.room.joinSecret || state.joinSecret;
    state.playerToken = data.playerToken;
    state.hostToken = "";
    storage.setItem("werewolfRoomCode", state.roomCode);
    storage.setItem("werewolfJoinSecret", state.joinSecret);
    storage.setItem("werewolfPlayerToken", state.playerToken);
    storage.setItem("werewolfPlayerName", state.playerName);
    storage.removeItem("werewolfHostToken");
    setMessage("加入成功，等待房主开始。");
    startPolling();
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

async function refreshRoom() {
  if (!state.roomCode) return;
  try {
    const token = tokenForRoom();
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (state.joinSecret) params.set("invite", state.joinSecret);
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}?${params.toString()}`);
    state.room = data.room;
    state.joinSecret = data.room.joinSecret || state.joinSecret;
    if (data.room.status !== "started") state.roleVisible = false;
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

async function startRoom() {
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}/start`, {
      method: "POST",
      body: JSON.stringify({ hostToken: state.hostToken }),
    });
    state.room = data.room;
    setMessage("游戏开始，身份已随机分配。");
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

async function endRoom(winner) {
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}/end`, {
      method: "POST",
      body: JSON.stringify({ hostToken: state.hostToken, winner }),
    });
    state.room = data.room;
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

function startPolling() {
  stopPolling();
  state.pollTimer = window.setInterval(refreshRoom, 1400);
}

function stopPolling() {
  if (state.pollTimer) {
    window.clearInterval(state.pollTimer);
    state.pollTimer = null;
  }
}

function clearRoomSession() {
  stopPolling();
  storage.removeItem("werewolfRoomCode");
  storage.removeItem("werewolfHostToken");
  storage.removeItem("werewolfPlayerToken");
  storage.removeItem("werewolfJoinSecret");
  state.room = null;
  state.roomCode = "";
  state.hostToken = "";
  state.playerToken = "";
  state.joinSecret = "";
  state.roleVisible = false;
}

function resetLocal() {
  clearRoomSession();
  state.joinCode = "";
  state.message = "";
  state.error = "";
  render();
}

function handleClick(event) {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.count) {
    state.playerCount = Number(button.dataset.count);
    render();
    return;
  }
  if (button.dataset.createRoom !== undefined) {
    createRoom();
    return;
  }
  if (button.dataset.joinRoom !== undefined) {
    joinRoom();
    return;
  }
  if (button.dataset.startRoom !== undefined) {
    startRoom();
    return;
  }
  if (button.dataset.endRoom) {
    endRoom(button.dataset.endRoom);
    return;
  }
  if (button.dataset.toggleRole !== undefined) {
    state.roleVisible = !state.roleVisible;
    render();
  }
}

function handleInput(event) {
  if (event.target.dataset.joinCode !== undefined) {
    state.joinCode = event.target.value.replace(/\D/g, "").slice(0, 6);
    event.target.value = state.joinCode;
  }
  if (event.target.dataset.playerName !== undefined) {
    state.playerName = event.target.value;
  }
}

async function boot() {
  const params = new URLSearchParams(window.location.search);
  const roomFromUrl = (params.get("room") || "").replace(/\D/g, "").slice(0, 6);
  const inviteFromUrl = params.get("invite");
  if (roomFromUrl) {
    if (state.roomCode && state.roomCode !== roomFromUrl) {
      clearRoomSession();
      setMessage("已切换到新的房间链接，请输入昵称加入。");
    }
    state.joinCode = roomFromUrl;
  }
  if (inviteFromUrl) {
    state.joinSecret = inviteFromUrl.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    storage.setItem("werewolfJoinSecret", state.joinSecret);
  }
  await loadConfigs();
  if (state.roomCode && currentToken()) {
    startPolling();
    await refreshRoom();
  }
  render();
}

app.addEventListener("click", handleClick);
app.addEventListener("input", handleInput);
resetButton.addEventListener("click", resetLocal);

boot();
