# 国内云服务器部署

推荐购买腾讯云轻量应用服务器或阿里云轻量应用服务器。

## 服务器建议

- 地域：离玩家近即可，例如上海、广州、北京
- 系统：Ubuntu 22.04 LTS
- 配置：1 核 1G 或 2 核 2G 都够用
- 带宽：1M 以上即可
- 安全组/防火墙：开放 TCP 80 端口

如果不想备案域名，可以先用服务器公网 IP 访问：

```text
http://你的服务器公网IP
```

## 上传项目

把这个文件夹上传到服务器，例如放到：

```bash
/opt/online-werewolf
```

可以用服务器控制台里的文件上传、SFTP 工具，或先上传到 GitHub 再在服务器 `git clone`。

## 安装 Node.js

登录服务器后执行：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

## 启动游戏

进入项目目录：

```bash
cd /opt/online-werewolf
npm install
PORT=80 npm start
```

这时浏览器打开：

```text
http://你的服务器公网IP
```

## 长期后台运行

安装 pm2：

```bash
sudo npm install -g pm2
cd /opt/online-werewolf
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

查看状态：

```bash
pm2 status
pm2 logs online-werewolf
```

重启：

```bash
pm2 restart online-werewolf
```

停止：

```bash
pm2 stop online-werewolf
```

## 游玩方式

1. 所有人打开 `http://你的服务器公网IP`
2. 房主创建房间，设置人数和身份数量；系统会给出推荐配置
3. 房主把完整邀请链接发给玩家，或发送“房间号 + 邀请码”
4. 玩家打开完整邀请链接后输入昵称加入；手动加入时需要同时输入房间号和邀请码
5. 人满后房主点击随机分配身份
6. 白天会依次进入遗言、发言、投票阶段；房主可以跳过或结束当前发言

## 注意

- 当前房间数据存在服务器内存里，重启服务会清空房间。
- 房间 8 小时后自动清理。
- 远程语音聊天需要浏览器允许麦克风。正式使用建议配置 HTTPS；只用公网 IP 的 `http://` 页面通常无法在远程浏览器请求麦克风权限。
- 语音聊天使用 WebRTC 点对点音频；当前没有配置 TURN 服务器，少数严格 NAT 网络下可能无法连通。
- 如果使用域名并在国内服务器上长期访问，域名通常需要备案；只用公网 IP 临时玩可以先不备案。
