# Different-network online play / 异地联机

This game is now a small Node.js web app. Players can join from different networks only when the app has a public HTTPS URL.

## Option A: Deploy to a public Node host

Use any host that can run Node.js, such as Render, Railway, Fly.io, a VPS, or a school/company server.

Required settings:

- Build command: none
- Start command: `npm start`
- Port: use the platform-provided `PORT` environment variable
- Health check path: `/api/health`

After deployment, open the public URL, create a room, and send the full invite link to players. Players can also join with the room code plus invite code shown on the host page.

## Option B: Temporary tunnel from this computer

Start the local server first:

```powershell
npm start
```

Then expose local port `5173` with a tunnel tool.

Cloudflare Tunnel example:

```powershell
cloudflared tunnel --url http://127.0.0.1:5173
```

ngrok example:

```powershell
ngrok http 5173
```

Send the generated public `https://...` URL to players. Keep both the game server window and the tunnel window open while playing.

## Notes

- Rooms are stored in server memory. Restarting the server clears all rooms.
- Rooms are automatically removed after 8 hours.
- Players should use the full invite link, or manually enter both the room code and invite code. Room code only is not enough.
- Daytime now has last words, ordered discussion, countdowns, skip controls, speech records, and then voting. The host can end or skip the current speaker.
- Voice chat uses browser microphone permission and WebRTC. It needs HTTPS for remote play. If players show as voice-online but cannot hear each other, configure a TURN relay with `TURN_URL`, `TURN_USERNAME`, and `TURN_CREDENTIAL`.
- Do not use `open-game.bat`; online play must go through `start.bat`, `npm start`, or a deployed server URL.
