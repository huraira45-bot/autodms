# DealerDesk Service — Android tablet app

The service advisor tablet app. It is the regular DealerDesk frontend
(`../frontend`) opened at `/tablet`, packaged as an Android app with
[Capacitor](https://capacitorjs.com). There is one codebase: a change to the
tablet screens is a change in `frontend/src/pages/tablet/`.

Plan: `C:\Users\ServerDeskop\.claude\plans\do-you-have-database-glowing-crayon.md`

**Current stage: Phase 0.** The app signs in and runs the *Tablet tests*
(server connection, walk-around video upload, printing). Intake, estimates,
signatures, bay screens and parts requisitions come after those tests pass on
the real tablet.

---

## What the build machine needs

Building the APK needs tools this server does **not** have yet:

| Tool | Notes |
|---|---|
| Node.js 22 or newer | already installed (v24) |
| JDK 21 | the JDK bundled with Android Studio works |
| Android SDK | install **Android Studio**; open `android/` once and accept the SDK components it asks for |

The Android SDK is several GB. It can live on any Windows PC on the network,
not necessarily the server. Once the tools are in, run `npm run doctor` here
to confirm Capacitor is happy.

## Build a test APK

From `Software/mobile-android`:

```powershell
npm install          # first time only
npm run apk:debug    # builds the frontend, copies it into android/, builds the APK
```

The APK lands at:

```
android\app\build\outputs\apk\debug\app-debug.apk
```

`apk:debug` produces an unsigned debug build — fine for testing on the
workshop tablets. A signed release build is set up before rollout.

## Install on a tablet

Either:

- Copy `app-debug.apk` to the tablet (USB or shared folder) and open it.
  Android will ask to allow installing from that source once.
- Or, with USB debugging on: `adb install -r app-debug.apk`

## First launch

1. **Server address** — enter `http://192.168.3.10:5000` and tap *Test and save*.
   The tablet must be on the workshop Wi-Fi. The app works on the local
   network only (plain HTTP to the server), not from outside.
2. **Sign in** with a DealerDesk account whose role has **Service Tablet App**
   ticked in Role Permissions (admin has it by default).
3. Tap **Run the tablet tests**.

## Phase 0 — what to test, at the reception area

Run all three standing where advisors will actually use the tablet, then send a
screenshot of the tests page.

1. **Reach the server** — should pass in well under a second.
2. **Upload a walk-around video** — record a real ~2-minute walk-around. The
   result shows the speed and confirms the file arrived whole. The server
   deletes the test file immediately.
3. **Print** — try *A. Print inside the app* and *B. Open test page in Chrome*.
   Note which one gives a correct single A4 sheet on the workshop printer.
   The print method used for estimates and job cards depends on this.

## Updating the app

UI changes are bundled into the APK, so a change to the tablet screens means
rebuilding (`npm run apk:debug`) and reinstalling on each tablet. Backend
changes (the server) do not need a new APK.

## Why the config looks the way it does

- `server.androidScheme: "http"` and `cleartext: true` — the app page must be
  served over `http://` so it is allowed to call the DealerDesk server at
  `http://192.168.3.10`. An `https://` app page calling an `http://` server is
  blocked by Android as mixed content.
- `@capacitor/browser` — lets the app open a page in Chrome, which is one of
  the two print routes being tested.
