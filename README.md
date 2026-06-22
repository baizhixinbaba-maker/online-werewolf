# Online Werewolf

Online Werewolf party game with custom player counts and role setups.

## Mobile install / PWA

The web app can be installed on phones from the public HTTPS site:

```text
https://online-werewolf.onrender.com
```

- Android Chrome: open the site, then tap `安装应用` if shown, or use browser menu `Add to Home screen`.
- iPhone Safari: open the site, tap Share, then `Add to Home Screen`.
- The installed app still connects to the online Node service. Rooms are still stored in server memory, so Render restarts or sleeps can clear active rooms.

## Android APK shell

The normal web version stays available. An Android Capacitor shell is also configured and documented in `ANDROID_APK.md`.
