# Android APK

This project keeps the normal web version available and adds a Capacitor Android shell.

The APK loads the deployed HTTPS game:

```text
https://online-werewolf.onrender.com
```

The Node web server, Render deployment, and browser/PWA version continue to work as before.

## Build prerequisites

Install these on the build machine:

- Android Studio
- JDK 17 or newer
- Android SDK Platform / Build Tools installed through Android Studio

Then make sure `java` works in PowerShell and Android Studio can open the `android` folder.

## Commands

Install dependencies:

```powershell
npm.cmd install
```

Sync Capacitor Android project:

```powershell
npm.cmd run cap:sync
```

Build a debug APK:

```powershell
npm.cmd run android:build
```

The debug APK will be generated under:

```text
android\app\build\outputs\apk\debug\app-debug.apk
```

## Notes

- The APK is a native Android shell around the online web app, not a separate offline server.
- Microphone permission is declared for WebRTC voice chat, but voice should still be tested on real Android devices.
- Render free instances can still sleep; the APK does not change server uptime or memory-room persistence.
