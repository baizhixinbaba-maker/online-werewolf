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
  minPlayerCount: 3,
  maxPlayerCount: 20,
  playerCount: 6,
  roleConfig: { ...fallbackConfigs[6] },
  speechTimeLimit: storage.getItem("werewolfSpeechTimeLimit") || "60",
  lastWordsTimeLimit: storage.getItem("werewolfLastWordsTimeLimit") || "60",
  room: null,
  hostToken: storage.getItem("werewolfHostToken") || "",
  playerToken: storage.getItem("werewolfPlayerToken") || "",
  roomCode: storage.getItem("werewolfRoomCode") || "",
  joinSecret: storage.getItem("werewolfJoinSecret") || "",
  joinCode: storage.getItem("werewolfRoomCode") || "",
  inviteCode: "",
  playerName: storage.getItem("werewolfPlayerName") || "房主",
  message: "",
  error: "",
  roleVisible: false,
  pollTimer: null,
  clockTimer: null,
  now: Date.now(),
  voiceEnabled: false,
  voiceMuted: false,
  voiceStatus: "",
  voiceError: "",
  voiceNeedsPlayback: false,
  voiceParticipants: [],
  voiceSyncTimer: null,
  voiceLastSignalId: 0,
  voiceIceServers: [],
  voicePlayerId: "",
  localStream: null,
  peers: new Map(),
  isTyping: false,
  pendingRoom: null,
  actionSelections: {},
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

function parseInviteText(value) {
  const rawText = String(value || "").trim();
  if (!rawText) return false;

  let foundRoom = "";
  let foundInvite = "";

  try {
    const url = new URL(rawText, window.location.origin);
    foundRoom = (url.searchParams.get("room") || "").replace(/\D/g, "").slice(0, 6);
    foundInvite = (url.searchParams.get("invite") || "").replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
  } catch (error) {
    // Plain room info copied from the host page is handled by the regex fallback below.
  }

  if (!foundRoom) {
    const roomMatch = rawText.match(/(?:房间号|房间码|room)\s*[：:=]?\s*(\d{6})/i) || rawText.match(/\b(\d{6})\b/);
    foundRoom = roomMatch ? roomMatch[1] : "";
  }

  if (!foundInvite) {
    const inviteMatch = rawText.match(/(?:邀请码|invite)\s*[：:=]?\s*([A-Za-z0-9]{6,32})/i);
    foundInvite = inviteMatch ? inviteMatch[1].replace(/[^A-Za-z0-9]/g, "").slice(0, 32) : "";
  }

  if (!foundRoom && !foundInvite) return false;
  if (foundRoom) state.joinCode = foundRoom;
  if (foundInvite) {
    state.inviteCode = foundInvite;
    state.joinSecret = foundInvite;
  }
  return true;
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

function totalRoles(config = state.roleConfig) {
  return roleOrder.reduce((sum, role) => sum + (Number(config[role]) || 0), 0);
}

function goodRoleCount(config = state.roleConfig) {
  return totalRoles(config) - (Number(config.werewolf) || 0);
}

function recommendedConfig(count = state.playerCount) {
  if (state.configs[count]) return { ...state.configs[count] };
  const playerCount = Math.min(state.maxPlayerCount, Math.max(state.minPlayerCount, Number(count) || state.minPlayerCount));
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

function normalizeRoleConfig(config = state.roleConfig, playerCount = state.playerCount) {
  const normalized = {};
  for (const role of roleOrder) {
    const count = Number(config[role] || 0);
    normalized[role] = Number.isInteger(count) && count > 0 ? Math.min(count, playerCount) : 0;
  }
  return normalized;
}

function roleConfigError(config = state.roleConfig, playerCount = state.playerCount) {
  const total = totalRoles(config);
  if (total !== playerCount) return `当前身份共 ${total} 个，需要正好等于 ${playerCount} 个玩家。`;
  if ((Number(config.werewolf) || 0) < 1) return "至少需要 1 名狼人。";
  if (goodRoleCount(config) < 1) return "至少需要 1 名好人。";
  return "";
}

function timeLimitLabel(value) {
  return String(value) === "none" || value === null || Number(value) === 0 ? "不限时" : `${value}秒`;
}

function timeLimitPayload(value) {
  return String(value) === "none" ? "none" : Number(value) || 60;
}

function renderTimeOptions(selectedValue) {
  return [
    ["30", "30秒"],
    ["60", "60秒"],
    ["90", "90秒"],
    ["120", "120秒"],
    ["none", "不限时"],
  ]
    .map(([value, label]) => `<option value="${value}" ${String(selectedValue) === value ? "selected" : ""}>${label}</option>`)
    .join("");
}

function formatCountdown(milliseconds) {
  if (milliseconds === null || milliseconds === undefined) return "不限时";
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function speechActionLabel(action) {
  const labels = {
    done: "已发言",
    skip: "已跳过",
    timeout: "超时结束",
    "host-ended-stage": "房主结束阶段",
  };
  return labels[action] || action;
}

function roleTag(role) {
  if (!role) return `<span class="role-tag villager">未知</span>`;
  return `<span class="role-tag ${role}">${state.roleMeta[role]?.name || role}</span>`;
}

function panel(content, extra = "") {
  return `<section class="panel ${extra}"><div class="panel-inner">${content}</div></section>`;
}

function renderConfigList(configOrCount = state.roleConfig) {
  const config = typeof configOrCount === "number" ? state.configs[configOrCount] || recommendedConfig(configOrCount) : configOrCount;
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

function renderRoleConfigEditor() {
  const recommended = recommendedConfig(state.playerCount);
  const error = roleConfigError();
  return `
    <div class="role-config-editor">
      <div class="section-title">
        <h3>自定义身份数量</h3>
        <strong>${totalRoles()} / ${state.playerCount}</strong>
      </div>
      <div class="notice">系统推荐：${getRoleCountText(recommended)}</div>
      <div class="actions">
        <button class="ghost-button" type="button" data-apply-recommended>套用推荐配置</button>
      </div>
      <div class="role-config-grid">
        ${roleOrder
          .map(
            (role) => `
              <label>
                ${state.roleMeta[role].name}
                <input type="number" min="0" max="${state.playerCount}" value="${Number(state.roleConfig[role] || 0)}" data-role-count="${role}" />
              </label>
            `,
          )
          .join("")}
      </div>
      ${error ? `<div class="notice danger">${escapeHtml(error)}</div>` : `<div class="notice ok">当前配置可用：${getRoleCountText(state.roleConfig)}</div>`}
    </div>
  `;
}

function renderPlayerOptions(players, includeEmpty = false, selectedValue = "") {
  const emptySelected = selectedValue === "" ? " selected" : "";
  return `${includeEmpty ? `<option value=""${emptySelected}>不使用</option>` : ""}${players
    .filter((player) => player.alive)
    .map((player) => {
      const selected = String(player.id) === String(selectedValue) ? " selected" : "";
      return `<option value="${escapeHtml(player.id)}"${selected}>${player.seat}号 ${escapeHtml(player.name)}</option>`;
    })
    .join("")}`;
}

function actionSelectionKey(room, viewer, purpose) {
  return [room?.code || "room", room?.phase || "phase", room?.round || 0, viewer?.id || "viewer", purpose].join(":");
}

function renderNotice() {
  if (state.error) return `<div class="notice danger">${escapeHtml(state.error)}</div>`;
  if (state.message) return `<div class="notice ok">${escapeHtml(state.message)}</div>`;
  return "";
}

function isEditingControl(element) {
  return Boolean(element?.matches?.("input, textarea, select"));
}

function canRenderNow() {
  return !state.isTyping && !isEditingControl(document.activeElement);
}

function renderOrDefer(room) {
  if (room) state.pendingRoom = room;
  if (!canRenderNow()) return;
  if (state.pendingRoom) {
    state.room = state.pendingRoom;
    state.pendingRoom = null;
  }
  render();
}

function finishTyping() {
  if (!state.isTyping && !state.pendingRoom) return;
  state.isTyping = false;
  renderOrDefer();
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
        <label>
          房主昵称
          <input type="text" maxlength="16" value="${escapeHtml(state.playerName)}" data-player-name placeholder="输入房主名字" />
        </label>
        <div>
          <div class="section-title">
            <h3>创建房间人数</h3>
            <strong>${state.playerCount} 人</strong>
          </div>
          <label>
            玩家人数
            <input type="number" min="${state.minPlayerCount}" max="${state.maxPlayerCount}" value="${state.playerCount}" data-player-count />
          </label>
          <p class="subtle">支持 ${state.minPlayerCount}-${state.maxPlayerCount} 人。人数变化时会自动生成一套标准身份数量供参考。</p>
        </div>
        ${renderRoleConfigEditor()}
        <div class="settings-grid">
          <label>
            发言时间
            <select data-speech-time>
              ${renderTimeOptions(state.speechTimeLimit)}
            </select>
          </label>
          <label>
            遗言时间
            <select data-last-words-time>
              ${renderTimeOptions(state.lastWordsTimeLimit)}
            </select>
          </label>
        </div>
        <div class="actions">
          <button class="primary-button" type="button" data-create-room ${roleConfigError() ? "disabled" : ""}>创建联机房间</button>
        </div>
      `)}
      ${panel(`
        <div class="section-title">
          <h3>加入已有房间</h3>
        </div>
        <label>
          房间号
          <input type="text" inputmode="numeric" maxlength="160" value="${escapeHtml(state.joinCode)}" data-join-code placeholder="房间号或完整邀请链接" />
        </label>
        <label>
          邀请码
          <input type="text" maxlength="160" value="${escapeHtml(state.inviteCode || state.joinSecret)}" data-invite-code placeholder="房主页面显示的邀请码" />
        </label>
        <div class="notice">手动加入需要房间号和邀请码；也可以直接粘贴房主分享的完整邀请链接。</div>
        <label>
          你的昵称
          <input type="text" maxlength="16" value="${escapeHtml(state.playerName)}" data-player-name placeholder="输入你的名字" />
        </label>
        <div class="actions">
          <button class="secondary-button" type="button" data-join-room>加入房间</button>
        </div>
        <div class="section-title">
          <h3>${state.playerCount} 人推荐配置</h3>
        </div>
        ${renderConfigList(recommendedConfig(state.playerCount))}
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

function renderRoomBadge(room) {
  return `
    <div class="room-badge ${room.isHost ? "host" : "player"}">
      <strong>${room.isHost ? "房主控制台" : "玩家视角"}</strong>
      <span>${room.isHost ? "只有本设备可以开始、结算或解散房间" : "等待房主开始或结算游戏"}</span>
    </div>
  `;
}

function renderVoicePanel(room) {
  if (!state.playerToken || !room.viewer) return "";
  const participants = state.voiceEnabled ? state.voiceParticipants : room.voiceParticipants || [];
  const status = state.voiceError || state.voiceStatus || (state.voiceEnabled ? "语音已开启" : "语音未开启");
  return `
    <div class="voice-box ${state.voiceEnabled ? "active" : ""}">
      <div class="section-title">
        <h3>房间语音</h3>
        <span class="status-tag ${state.voiceEnabled ? "alive" : "dead"}">${participants.length} 人在线</span>
      </div>
      <div class="voice-list">
        ${
          participants.length
            ? participants.map((item) => `<span class="voice-chip ${item.id === state.voicePlayerId ? "self" : ""}">${item.seat}号 ${escapeHtml(item.name)}</span>`).join("")
            : `<span class="subtle">暂无玩家开启语音</span>`
        }
      </div>
      <div class="actions">
        ${
          state.voiceEnabled
            ? `
              <button class="secondary-button" type="button" data-voice-mute>${state.voiceMuted ? "取消静音" : "静音"}</button>
              ${state.voiceNeedsPlayback ? `<button class="primary-button" type="button" data-voice-play>播放声音</button>` : ""}
              <button class="ghost-button" type="button" data-voice-leave>关闭语音</button>
            `
            : `<button class="secondary-button" type="button" data-voice-join>开启语音</button>`
        }
      </div>
      <p class="subtle voice-status">${escapeHtml(status)}</p>
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
        ${renderRoomBadge(room)}
        ${renderNotice()}
        <div class="notice share-box">
          <div class="share-row">
            <span>完整加入链接</span>
            <strong>${escapeHtml(joinUrl)}</strong>
          </div>
          <div class="share-row">
            <span>房间号</span>
            <strong>${room.code}</strong>
          </div>
          ${room.joinSecret ? `<div class="share-row"><span>邀请码</span><strong>${escapeHtml(room.joinSecret)}</strong></div>` : ""}
        </div>
        ${
          room.joinSecret
            ? `<div class="actions">
                <button class="secondary-button" type="button" data-copy-link>复制完整邀请链接</button>
                <button class="ghost-button" type="button" data-copy-room-info>复制房间号和邀请码</button>
              </div>`
            : ""
        }
        ${
          room.status === "lobby"
            ? `
              <p class="subtle">等待所有玩家加入。满员后房主点击开始，身份会随机分配到每个人自己的手机上。</p>
              <div class="actions">
                ${
                  room.isHost
                    ? `
                      <button class="primary-button" type="button" data-start-room ${room.canStart ? "" : "disabled"}>随机分配身份并开始</button>
                      <button class="danger-button" type="button" data-disband-room>解散房间</button>
                    `
                    : `<button class="secondary-button" type="button" disabled>等待房主开始</button>`
                }
              </div>
            `
            : renderGameControls(room)
        }
        ${renderVoicePanel(room)}
      `)}
      ${panel(`
        <div class="section-title">
          <h3>玩家座位</h3>
        </div>
        ${renderSeats(room)}
        <div class="section-title">
          <h3>本局配置</h3>
        </div>
        ${renderConfigList(room.config)}
      `)}
    </div>
  `;
}

function renderGameControls(room) {
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
    return `${renderPlayerPanel(room)}<div class="actions"><button class="danger-button" type="button" data-disband-room>解散房间</button></div>${renderPublicRecords(room)}`;
  }

  return `${renderPlayerPanel(room)}${renderPublicRecords(room)}`;
}

function renderPublicRecords(room) {
  const speechLog = room.speechLog?.length
    ? `
      <div class="section-title"><h3>发言记录</h3></div>
      <ul class="records">
        ${room.speechLog
          .slice(-12)
          .map((record) => `<li class="record-item"><span>第${record.day}天 ${record.seat}号 ${escapeHtml(record.name)}：${speechActionLabel(record.action)}</span></li>`)
          .join("")}
      </ul>
    `
    : "";
  const publicLog = room.publicLog?.length
    ? `<ul class="records">${room.publicLog.map((item) => `<li class="record-item"><span>${escapeHtml(item)}</span></li>`).join("")}</ul>`
    : "";
  return `${publicLog}${speechLog}`;
}

function renderPlayerPanel(room) {
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
    ${renderPhaseAction(room, viewer)}
  `;
}

function renderPhaseAction(room, viewer) {
  if (room.phase === "lastWords") return renderSpeechStage(room, viewer, room.lastWords);
  if (!viewer.alive && room.phase !== "hunter") return `<div class="notice danger">你已出局，请等待游戏结束。</div>`;
  if (room.phase === "night") return renderNightAction(room, viewer);
  if (room.phase === "discussion") return renderSpeechStage(room, viewer, room.discussion);
  if (room.phase === "day") return renderVoteAction(room, viewer);
  if (room.phase === "hunter") return renderHunterAction(room, viewer);
  return "";
}

function renderNightAction(room, viewer) {
  if (viewer.nightActionDone) return `<div class="notice ok">${room.announcement || "夜晚行动等待其他玩家完成。"}</div>`;
  const targetKey = actionSelectionKey(room, viewer, `${viewer.role}-target`);
  const selectedTarget = state.actionSelections[targetKey] || "";
  const options = renderPlayerOptions(room.players, false, selectedTarget);
  if (viewer.role === "werewolf") {
    return panel(`
      <div class="section-title"><h3>狼人行动</h3></div>
      <label class="action-select">击杀目标<select data-action-target data-selection-key="${targetKey}">${options}</select></label>
      <div class="actions"><button class="danger-button" type="button" data-night-action="wolf">确认击杀</button></div>
    `);
  }
  if (viewer.role === "seer") {
    return panel(`
      <div class="section-title"><h3>预言家查验</h3></div>
      <label class="action-select">查验目标<select data-action-target data-selection-key="${targetKey}">${options}</select></label>
      <div class="actions"><button class="primary-button" type="button" data-night-action="seer">确认查验</button></div>
      ${viewer.checks?.length ? `<ul class="records">${viewer.checks.map((item) => `<li class="record-item"><span>第${item.round}夜：${item.seat}号 ${escapeHtml(item.name)} 是 ${item.result}</span></li>`).join("")}</ul>` : ""}
    `);
  }
  if (viewer.role === "witch") {
    const killed = viewer.witch?.killed;
    const poisonKey = actionSelectionKey(room, viewer, "witch-poison");
    const selectedPoison = state.actionSelections[poisonKey] || "";
    return panel(`
      <div class="section-title"><h3>女巫行动</h3></div>
      <div class="notice">${killed ? `今晚被杀：${killed.seat}号 ${escapeHtml(killed.name)}` : "今晚没有狼人击杀目标。"}</div>
      <label><input type="checkbox" data-witch-heal ${viewer.witch?.healUsed || !killed ? "disabled" : ""} /> 使用解药</label>
      <label class="action-select">毒药目标<select data-witch-poison data-selection-key="${poisonKey}" ${viewer.witch?.poisonUsed ? "disabled" : ""}>${renderPlayerOptions(room.players, true, selectedPoison)}</select></label>
      <div class="actions"><button class="primary-button" type="button" data-night-action="witch">确认女巫行动</button></div>
    `);
  }
  if (viewer.role === "guard") {
    return panel(`
      <div class="section-title"><h3>守卫行动</h3></div>
      <label class="action-select">守护目标<select data-action-target data-selection-key="${targetKey}">${options}</select></label>
      <div class="actions"><button class="primary-button" type="button" data-night-action="guard">确认守护</button></div>
    `);
  }
  return `<div class="notice">夜晚阶段，你没有夜晚技能，等待天亮。</div>`;
}

function renderSpeechStage(room, viewer, stage) {
  if (!stage) return `<div class="notice">发言阶段准备中。</div>`;
  const currentPlayer = stage.currentPlayer;
  const isCurrentViewer = Boolean(currentPlayer && viewer?.id === currentPlayer.id);
  const canEndCurrent = Boolean(room.isHost || isCurrentViewer);
  const canHostControl = Boolean(room.isHost);
  const countdown = stage.timeLimit ? formatCountdown((stage.endsAt || 0) - Date.now()) : "不限时";
  const phaseTitle = stage.kind === "lastWords" ? "遗言阶段" : "白天发言";
  const currentStatus = currentPlayer?.alive ? "存活" : "已出局";
  return panel(`
    <div class="speech-stage">
      <div class="section-title">
        <h3>第${stage.day}天 · ${phaseTitle}</h3>
        <span class="status-tag alive">${timeLimitLabel(stage.timeLimit)}</span>
      </div>
      <div class="speaker-card">
        <span class="camp-tag ${stage.kind === "lastWords" ? "werewolf" : "good"}">当前发言</span>
        <h3>${currentPlayer ? `${currentPlayer.seat}号 ${escapeHtml(currentPlayer.name)}` : "等待中"}</h3>
        <p class="subtle">状态：${currentPlayer ? currentStatus : "无"} · 倒计时：<strong data-countdown>${countdown}</strong></p>
      </div>
      <div class="actions">
        ${
          canEndCurrent
            ? `<button class="primary-button" type="button" data-speech-end>结束发言</button>`
            : `<button class="secondary-button" type="button" disabled>等待当前玩家发言</button>`
        }
        ${canHostControl ? `<button class="ghost-button" type="button" data-speech-skip>跳过发言</button>` : ""}
        ${canHostControl ? `<button class="danger-button" type="button" data-speech-end-stage>${stage.kind === "lastWords" ? "结束遗言阶段" : "直接进入投票"}</button>` : ""}
      </div>
      <div class="section-title"><h3>发言顺序</h3></div>
      <ul class="speech-list">
        ${stage.entries
          .map(
            (entry) => `
              <li class="speech-item ${entry.isCurrent ? "current" : ""}">
                <span>${entry.seat}号 ${escapeHtml(entry.name)}</span>
                <strong>${entry.alive || stage.kind === "lastWords" ? speechStatusLabel(entry.status) : "已出局"}</strong>
              </li>
            `,
          )
          .join("")}
      </ul>
      ${
        stage.records?.length
          ? `
            <div class="section-title"><h3>发言记录</h3></div>
            <ul class="records">
              ${stage.records
                .map((record) => `<li class="record-item"><span>${record.seat}号 ${escapeHtml(record.name)}：${speechActionLabel(record.action)}</span></li>`)
                .join("")}
            </ul>
          `
          : ""
      }
    </div>
  `);
}

function speechStatusLabel(status) {
  if (status === "speaking") return "发言中";
  if (status === "done") return "已发言";
  if (status === "skipped") return "已跳过";
  return "等待中";
}

function renderVoteAction(room, viewer) {
  if (viewer.dayVoteDone) return `<div class="notice ok">已投票，等待其他玩家。${room.dayVotesSubmitted} / ${room.dayVotesNeeded}</div>`;
  const voteKey = actionSelectionKey(room, viewer, "day-vote");
  const selectedVote = state.actionSelections[voteKey] || "";
  return panel(`
    <div class="section-title"><h3>白天投票</h3></div>
    <div class="notice">${escapeHtml(room.announcement || "请发言后投票放逐一名玩家。")}</div>
    <label class="action-select">放逐目标<select data-action-target data-selection-key="${voteKey}">${renderPlayerOptions(room.players, false, selectedVote)}</select></label>
    <div class="actions"><button class="danger-button" type="button" data-day-vote>确认投票</button></div>
  `);
}

async function voiceApi(path, options = {}) {
  return api(`/api/rooms/${encodeURIComponent(state.roomCode)}/voice/${path}`, options);
}

async function joinVoice() {
  if (!state.playerToken) {
    setMessage("请先加入房间再开启语音。", true);
    render();
    return;
  }
  try {
    state.voiceError = "";
    state.voiceStatus = "正在请求麦克风权限...";
    render();
    state.localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      video: false,
    });
    const data = await voiceApi("join", {
      method: "POST",
      body: JSON.stringify({ playerToken: state.playerToken }),
    });
    state.voiceEnabled = true;
    state.voiceMuted = false;
    state.voiceNeedsPlayback = false;
    state.voicePlayerId = data.playerId;
    state.voiceParticipants = data.participants || [];
    state.voiceIceServers = data.iceServers || [];
    state.voiceLastSignalId = data.lastSignalId || 0;
    state.voiceStatus = "语音已开启";
    startVoiceSync();
    await connectVoiceParticipants();
    render();
  } catch (error) {
    state.voiceError = error.message || "开启语音失败";
    stopLocalVoice();
    render();
  }
}

function stopLocalVoice() {
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
    state.localStream = null;
  }
}

function startVoiceSync() {
  stopVoiceSync();
  state.voiceSyncTimer = window.setInterval(syncVoice, 1200);
}

function stopVoiceSync() {
  if (state.voiceSyncTimer) {
    window.clearInterval(state.voiceSyncTimer);
    state.voiceSyncTimer = null;
  }
}

async function syncVoice() {
  if (!state.voiceEnabled) return;
  try {
    const data = await voiceApi(`sync?token=${encodeURIComponent(state.playerToken)}&since=${state.voiceLastSignalId}`);
    state.voiceParticipants = data.participants || [];
    state.voiceLastSignalId = data.lastSignalId || state.voiceLastSignalId;
    for (const message of data.messages || []) {
      await handleVoiceSignal(message);
    }
    await connectVoiceParticipants();
    cleanupVoicePeers();
    updateVoicePanelOnly();
  } catch (error) {
    state.voiceError = error.message || "语音连接中断";
    updateVoicePanelOnly();
  }
}

async function leaveVoice() {
  try {
    if (state.voiceEnabled) {
      await voiceApi("leave", {
        method: "POST",
        body: JSON.stringify({ playerToken: state.playerToken }),
      });
    }
  } catch (error) {
    // The local microphone and peer connections should still close even if the leave request fails.
  }
  stopVoice();
  render();
}

function stopVoice() {
  stopVoiceSync();
  for (const peer of state.peers.values()) {
    peer.connection.close();
    peer.audio?.remove();
  }
  state.peers.clear();
  stopLocalVoice();
  state.voiceEnabled = false;
  state.voiceMuted = false;
  state.voiceNeedsPlayback = false;
  state.voiceStatus = "";
  state.voiceError = "";
  state.voiceParticipants = [];
  state.voiceLastSignalId = 0;
  state.voiceIceServers = [];
  state.voicePlayerId = "";
}

function toggleVoiceMute() {
  if (!state.localStream) return;
  state.voiceMuted = !state.voiceMuted;
  state.localStream.getAudioTracks().forEach((track) => {
    track.enabled = !state.voiceMuted;
  });
  state.voiceStatus = state.voiceMuted ? "麦克风已静音" : "麦克风已开启";
  render();
}

async function connectVoiceParticipants() {
  if (!state.voiceEnabled || !state.voicePlayerId || !state.localStream) return;
  for (const participant of state.voiceParticipants) {
    if (participant.id === state.voicePlayerId) continue;
    const peer = ensureVoicePeer(participant.id);
    if (state.voicePlayerId < participant.id && !peer.offerSent) {
      peer.offerSent = true;
      const offer = await peer.connection.createOffer();
      await peer.connection.setLocalDescription(offer);
      await sendVoiceSignal(participant.id, "offer", peer.connection.localDescription);
    }
  }
}

function ensureVoicePeer(peerId) {
  const existing = state.peers.get(peerId);
  if (existing) return existing;
  const connection = new RTCPeerConnection({ iceServers: state.voiceIceServers });
  state.localStream.getAudioTracks().forEach((track) => connection.addTrack(track, state.localStream));
  const peer = { connection, audio: null, offerSent: false, pendingCandidates: [] };
  connection.onicecandidate = (event) => {
    if (event.candidate) sendVoiceSignal(peerId, "ice-candidate", event.candidate).catch(() => {});
  };
  connection.ontrack = (event) => {
    if (!peer.audio) {
      peer.audio = document.createElement("audio");
      peer.audio.autoplay = true;
      peer.audio.playsInline = true;
      peer.audio.controls = false;
      document.body.appendChild(peer.audio);
    }
    peer.audio.srcObject = event.streams[0];
    peer.audio.play().then(() => {
      state.voiceNeedsPlayback = false;
      state.voiceStatus = "语音已连接";
      updateVoicePanelOnly();
    }).catch(() => {
      state.voiceNeedsPlayback = true;
      state.voiceStatus = "浏览器拦截了声音播放，请点击播放声音";
      updateVoicePanelOnly();
    });
  };
  connection.onconnectionstatechange = () => {
    if (connection.connectionState === "connected") {
      state.voiceStatus = "语音已连接";
      updateVoicePanelOnly();
    }
    if (["checking", "connecting"].includes(connection.connectionState)) {
      state.voiceStatus = "正在连接语音...";
      updateVoicePanelOnly();
    }
    if (["failed", "closed", "disconnected"].includes(connection.connectionState)) {
      state.voiceStatus = "语音正在重连...";
      updateVoicePanelOnly();
    }
  };
  state.peers.set(peerId, peer);
  return peer;
}

async function sendVoiceSignal(to, type, payload) {
  await voiceApi("signal", {
    method: "POST",
    body: JSON.stringify({ playerToken: state.playerToken, to, type, payload }),
  });
}

async function handleVoiceSignal(message) {
  if (!state.voiceEnabled || !message.from) return;
  const peer = ensureVoicePeer(message.from);
  if (message.type === "offer") {
    await peer.connection.setRemoteDescription(new RTCSessionDescription(message.payload));
    await flushPendingCandidates(peer);
    const answer = await peer.connection.createAnswer();
    await peer.connection.setLocalDescription(answer);
    await sendVoiceSignal(message.from, "answer", peer.connection.localDescription);
    return;
  }
  if (message.type === "answer") {
    if (peer.connection.signalingState !== "stable") {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(message.payload));
      await flushPendingCandidates(peer);
    }
    return;
  }
  if (message.type === "ice-candidate") {
    await addRemoteCandidate(peer, message.payload);
  }
}

async function addRemoteCandidate(peer, payload) {
  if (!peer.connection.remoteDescription) {
    peer.pendingCandidates.push(payload);
    return;
  }
  await peer.connection.addIceCandidate(new RTCIceCandidate(payload));
}

async function flushPendingCandidates(peer) {
  const pending = peer.pendingCandidates.splice(0);
  for (const candidate of pending) {
    await peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
  }
}

function cleanupVoicePeers() {
  const onlineIds = new Set(state.voiceParticipants.map((participant) => participant.id));
  for (const [peerId, peer] of state.peers.entries()) {
    if (onlineIds.has(peerId)) continue;
    peer.connection.close();
    peer.audio?.remove();
    state.peers.delete(peerId);
  }
}

function playRemoteVoice() {
  const plays = [...state.peers.values()]
    .filter((peer) => peer.audio)
    .map((peer) => peer.audio.play());
  Promise.allSettled(plays).then((results) => {
    state.voiceNeedsPlayback = results.some((result) => result.status === "rejected");
    state.voiceStatus = state.voiceNeedsPlayback ? "仍无法播放声音，请检查浏览器声音权限" : "语音已连接";
    render();
  });
}

function updateVoicePanelOnly() {
  const box = app.querySelector(".voice-box");
  if (!box || !state.room) return;
  box.outerHTML = renderVoicePanel(state.room);
}

function renderHunterAction(room, viewer) {
  if (room.hunter?.playerId !== viewer.id) return `<div class="notice">等待猎人决定是否开枪。</div>`;
  const hunterKey = actionSelectionKey(room, viewer, "hunter-target");
  const selectedHunterTarget = state.actionSelections[hunterKey] || "";
  return panel(`
    <div class="section-title"><h3>猎人开枪</h3></div>
    <label class="action-select">带走目标<select data-hunter-target data-selection-key="${hunterKey}">${renderPlayerOptions(room.players, true, selectedHunterTarget)}</select></label>
    <div class="actions"><button class="danger-button" type="button" data-hunter-action>确认</button></div>
  `);
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
  updateCountdownDisplay();
  manageClockTimer();
}

function currentSpeechStage() {
  if (!state.room) return null;
  if (state.room.phase === "lastWords") return state.room.lastWords;
  if (state.room.phase === "discussion") return state.room.discussion;
  return null;
}

function updateCountdownDisplay() {
  const stage = currentSpeechStage();
  const countdownElement = app.querySelector("[data-countdown]");
  if (!stage || !countdownElement) return;
  countdownElement.textContent = stage.timeLimit ? formatCountdown((stage.endsAt || 0) - Date.now()) : "不限时";
  if (stage.timeLimit && (stage.endsAt || 0) <= Date.now()) {
    countdownElement.textContent = "0:00";
  }
}

function manageClockTimer() {
  const stage = currentSpeechStage();
  if (!stage?.timeLimit) {
    stopClock();
    return;
  }
  if (state.clockTimer) return;
  state.clockTimer = window.setInterval(() => {
    state.now = Date.now();
    updateCountdownDisplay();
    const activeStage = currentSpeechStage();
    if (activeStage?.timeLimit && (activeStage.endsAt || 0) <= Date.now()) {
      refreshRoom();
    }
  }, 1000);
}

function stopClock() {
  if (state.clockTimer) {
    window.clearInterval(state.clockTimer);
    state.clockTimer = null;
  }
}

async function loadConfigs() {
  try {
    const data = await api("/api/configs");
    state.configs = data.playerConfigs;
    state.roleMeta = data.roleMeta;
    state.counts = data.counts;
    state.minPlayerCount = data.minPlayerCount || state.minPlayerCount;
    state.maxPlayerCount = data.maxPlayerCount || state.maxPlayerCount;
    if (roleConfigError()) state.roleConfig = recommendedConfig(state.playerCount);
  } catch (error) {
    setMessage("配置加载失败，已使用本地默认配置。", true);
  }
}

async function createRoom() {
  try {
    setMessage("");
    const data = await api("/api/rooms", {
      method: "POST",
      body: JSON.stringify({
        playerCount: state.playerCount,
        hostName: state.playerName,
        roleConfig: normalizeRoleConfig(state.roleConfig, state.playerCount),
        speechTimeLimit: timeLimitPayload(state.speechTimeLimit),
        lastWordsTimeLimit: timeLimitPayload(state.lastWordsTimeLimit),
      }),
    });
    state.room = data.room;
    state.roomCode = data.room.code;
    state.joinSecret = data.room.joinSecret || "";
    state.hostToken = data.hostToken;
    state.playerToken = data.hostToken;
    storage.setItem("werewolfRoomCode", state.roomCode);
    storage.setItem("werewolfJoinSecret", state.joinSecret);
    storage.setItem("werewolfHostToken", state.hostToken);
    storage.setItem("werewolfPlayerToken", state.playerToken);
    storage.setItem("werewolfPlayerName", state.playerName);
    storage.setItem("werewolfSpeechTimeLimit", state.speechTimeLimit);
    storage.setItem("werewolfLastWordsTimeLimit", state.lastWordsTimeLimit);
    setMessage("房间已创建，请分享页面里的完整加入地址给朋友。");
    startPolling();
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

async function joinRoom() {
  try {
    setMessage("");
    const code = state.joinCode.trim();
    if (!code) throw new Error("请输入房间号");
    const invite = (state.inviteCode || state.joinSecret).trim();
    if (!invite) throw new Error("只输入房间号不能加入，请再输入邀请码，或直接粘贴房主分享的完整邀请链接");
    if (!state.playerName.trim()) throw new Error("请输入昵称");
    const data = await api(`/api/rooms/${encodeURIComponent(code)}/join`, {
      method: "POST",
      body: JSON.stringify({ name: state.playerName, joinSecret: invite }),
    });
    state.room = data.room;
    state.roomCode = code;
    state.joinSecret = data.room.joinSecret || state.joinSecret;
    state.inviteCode = state.joinSecret;
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

async function copyText(textToCopy, successMessage) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(textToCopy);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = textToCopy;
      textarea.setAttribute("readonly", "");
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    setMessage(successMessage);
  } catch (error) {
    setMessage("复制失败，请手动复制页面里的加入信息。", true);
  }
  render();
}

function copyInviteLink() {
  if (!state.room) return;
  copyText(roomInviteUrl(state.room), "已复制完整邀请链接，发给朋友后他们打开即可自动填好房间信息。");
}

function copyRoomInfo() {
  if (!state.room) return;
  const info = [`房间号：${state.room.code}`];
  if (state.room.joinSecret) info.push(`邀请码：${state.room.joinSecret}`);
  copyText(info.join("\n"), "已复制房间号和邀请码。");
}

async function refreshRoom() {
  if (!state.roomCode) return;
  try {
    const token = tokenForRoom();
    const params = new URLSearchParams();
    if (token) params.set("token", token);
    if (state.joinSecret) params.set("invite", state.joinSecret);
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}?${params.toString()}`);
    state.room = canRenderNow() ? data.room : state.room;
    state.joinSecret = data.room.joinSecret || state.joinSecret;
    if (data.room.status !== "started") state.roleVisible = false;
    renderOrDefer(data.room);
  } catch (error) {
    if (error.message.includes("房间不存在")) {
      clearRoomSession();
      state.joinCode = "";
      setMessage("房间已被房主解散或已过期，请重新创建房间或加入新的邀请链接。");
      render();
      return;
    }
    setMessage(error.message, true);
    renderOrDefer();
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

async function submitPlayerAction(action, body) {
  try {
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}/${action}`, {
      method: "POST",
      body: JSON.stringify({ playerToken: state.playerToken, ...body }),
    });
    state.room = data.room;
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

function selectedValue(selector) {
  return app.querySelector(selector)?.value || "";
}

function submitNightAction(action) {
  if (action === "witch") {
    submitPlayerAction("witch", {
      heal: Boolean(app.querySelector("[data-witch-heal]")?.checked),
      poisonTargetId: selectedValue("[data-witch-poison]"),
    });
    return;
  }
  submitPlayerAction(action, { targetId: selectedValue("[data-action-target]") });
}

function submitVote() {
  submitPlayerAction("vote", { targetId: selectedValue("[data-action-target]") });
}

function submitHunter() {
  submitPlayerAction("hunter", { targetId: selectedValue("[data-hunter-target]") });
}

async function submitSpeechAction(action) {
  try {
    const body =
      action === "end" && !state.hostToken
        ? { playerToken: state.playerToken }
        : { hostToken: state.hostToken || "", playerToken: state.playerToken || "" };
    const data = await api(`/api/rooms/${encodeURIComponent(state.roomCode)}/speech/${action}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    state.room = data.room;
    render();
  } catch (error) {
    setMessage(error.message, true);
    render();
  }
}

async function disbandRoom() {
  if (!state.hostToken) {
    setMessage("只有房主可以解散房间。", true);
    render();
    return;
  }
  if (!window.confirm("确定要解散这个房间吗？所有玩家都会回到首页。")) return;
  try {
    await api(`/api/rooms/${encodeURIComponent(state.roomCode)}/disband`, {
      method: "POST",
      body: JSON.stringify({ hostToken: state.hostToken }),
    });
    clearRoomSession();
    state.joinCode = "";
    setMessage("房间已解散，可以重新创建新房间。");
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
  stopClock();
  if (state.voiceEnabled) stopVoice();
  storage.removeItem("werewolfRoomCode");
  storage.removeItem("werewolfHostToken");
  storage.removeItem("werewolfPlayerToken");
  storage.removeItem("werewolfJoinSecret");
  state.room = null;
  state.roomCode = "";
  state.hostToken = "";
  state.playerToken = "";
  state.joinSecret = "";
  state.inviteCode = "";
  state.roleVisible = false;
  state.pendingRoom = null;
  state.actionSelections = {};
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
    state.roleConfig = recommendedConfig(state.playerCount);
    render();
    return;
  }
  if (button.dataset.applyRecommended !== undefined) {
    state.roleConfig = recommendedConfig(state.playerCount);
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
  if (button.dataset.copyLink !== undefined) {
    copyInviteLink();
    return;
  }
  if (button.dataset.copyRoomInfo !== undefined) {
    copyRoomInfo();
    return;
  }
  if (button.dataset.startRoom !== undefined) {
    startRoom();
    return;
  }
  if (button.dataset.disbandRoom !== undefined) {
    disbandRoom();
    return;
  }
  if (button.dataset.nightAction) {
    submitNightAction(button.dataset.nightAction);
    return;
  }
  if (button.dataset.dayVote !== undefined) {
    submitVote();
    return;
  }
  if (button.dataset.hunterAction !== undefined) {
    submitHunter();
    return;
  }
  if (button.dataset.voiceJoin !== undefined) {
    joinVoice();
    return;
  }
  if (button.dataset.voiceMute !== undefined) {
    toggleVoiceMute();
    return;
  }
  if (button.dataset.voicePlay !== undefined) {
    playRemoteVoice();
    return;
  }
  if (button.dataset.voiceLeave !== undefined) {
    leaveVoice();
    return;
  }
  if (button.dataset.speechEnd !== undefined) {
    submitSpeechAction("end");
    return;
  }
  if (button.dataset.speechSkip !== undefined) {
    submitSpeechAction("skip");
    return;
  }
  if (button.dataset.speechEndStage !== undefined) {
    submitSpeechAction("end-stage");
    return;
  }
  if (button.dataset.toggleRole !== undefined) {
    state.roleVisible = !state.roleVisible;
    render();
  }
}

function handleInput(event) {
  state.isTyping = true;
  if (event.target.dataset.playerCount !== undefined) {
    const count = Math.min(state.maxPlayerCount, Math.max(state.minPlayerCount, Number(event.target.value) || state.minPlayerCount));
    state.playerCount = count;
    event.target.value = String(count);
    state.roleConfig = recommendedConfig(count);
    render();
    return;
  }
  if (event.target.dataset.roleCount !== undefined) {
    const role = event.target.dataset.roleCount;
    state.roleConfig = {
      ...state.roleConfig,
      [role]: Math.min(state.playerCount, Math.max(0, Number(event.target.value) || 0)),
    };
    event.target.value = String(state.roleConfig[role]);
    render();
    return;
  }
  if (event.target.dataset.joinCode !== undefined) {
    const rawValue = event.target.value;
    if (parseInviteText(rawValue)) {
      event.target.value = state.joinCode;
      const inviteInput = app.querySelector("[data-invite-code]");
      if (inviteInput) inviteInput.value = state.inviteCode || state.joinSecret;
      return;
    }
    state.joinCode = rawValue.replace(/\D/g, "").slice(0, 6);
    event.target.value = state.joinCode;
  }
  if (event.target.dataset.inviteCode !== undefined) {
    const rawValue = event.target.value;
    if (parseInviteText(rawValue)) {
      event.target.value = state.inviteCode || state.joinSecret;
      const codeInput = app.querySelector("[data-join-code]");
      if (codeInput) codeInput.value = state.joinCode;
      return;
    }
    state.inviteCode = rawValue.replace(/[^A-Za-z0-9]/g, "").slice(0, 32);
    state.joinSecret = state.inviteCode;
    event.target.value = state.inviteCode;
  }
  if (event.target.dataset.playerName !== undefined) {
    state.playerName = event.target.value;
  }
  if (event.target.dataset.speechTime !== undefined) {
    state.speechTimeLimit = event.target.value;
    storage.setItem("werewolfSpeechTimeLimit", state.speechTimeLimit);
  }
  if (event.target.dataset.lastWordsTime !== undefined) {
    state.lastWordsTimeLimit = event.target.value;
    storage.setItem("werewolfLastWordsTimeLimit", state.lastWordsTimeLimit);
  }
}

function handleChange(event) {
  if (event.target.dataset.selectionKey !== undefined) {
    state.actionSelections[event.target.dataset.selectionKey] = event.target.value;
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
    state.inviteCode = state.joinSecret;
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
app.addEventListener("change", handleChange);
app.addEventListener("focusin", (event) => {
  if (isEditingControl(event.target)) state.isTyping = true;
});
app.addEventListener("focusout", (event) => {
  if (isEditingControl(event.target)) window.setTimeout(finishTyping, 120);
});
resetButton.addEventListener("click", resetLocal);

boot();
