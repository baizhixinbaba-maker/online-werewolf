# Render 部署步骤

Render 适合先试公网版本。大陆访问不保证稳定，但比本机免费隧道更像正式网站。

## 1. 上传到 GitHub

把项目上传到一个 GitHub 仓库。需要上传这些文件：

- `index.html`
- `styles.css`
- `game.js`
- `server.js`
- `package.json`
- `render.yaml`
- `ecosystem.config.js` 可上传但 Render 不使用
- `.gitignore`

不要上传这些临时文件：

- `.playwright-cli/`
- `public-url*.txt`
- `server-*.log`
- `ssh-tunnel-*.txt`
- `serveo-*.txt`
- `pinggy-*.txt`
- `cloudflared.exe`

`.gitignore` 已经帮你忽略了这些文件。

## 2. 在 Render 创建服务

1. 打开 <https://dashboard.render.com/>
2. 点击 `New +`
3. 选择 `Blueprint`
4. 连接你的 GitHub 仓库
5. Render 会读取 `render.yaml`
6. 确认服务名 `online-werewolf`
7. 点击部署

如果你不用 Blueprint，也可以选择 `Web Service` 手动填写：

- Runtime: `Node`
- Region: `Singapore`
- Build Command: `npm install`
- Start Command: `npm start`
- Health Check Path: `/api/health`

## 3. 部署完成后

Render 会给你一个网址，类似：

```text
https://online-werewolf-xxxx.onrender.com
```

所有玩家打开这个网址：

1. 房主创建房间
2. 把页面里的完整邀请链接发给朋友，或发送“房间号 + 邀请码”
3. 玩家打开完整邀请链接后输入昵称加入；手动加入时需要同时输入房间号和邀请码
4. 人满后房主开始
5. 白天会依次进入遗言、发言、投票阶段；房主可以跳过或结束当前发言

## 注意

- Render 免费服务会休眠，第一次打开可能要等几十秒。
- 房间数据存在内存中，Render 重启或休眠恢复时可能清空房间。
- Render 默认提供 HTTPS，浏览器语音聊天可以请求麦克风权限。
- 语音聊天使用 WebRTC 点对点音频；当前没有配置 TURN 服务器，少数严格 NAT 网络下可能无法连通。
- 如果大陆访问慢或打不开，最终还是建议国内云服务器。
