# DealerDesk Service — Android tablet app

The service advisor tablet app. It is the regular DealerDesk frontend
(`../frontend`) opened at `/tablet`, packaged as an Android app with
[Capacitor](https://capacitorjs.com). There is one codebase: a change to the
tablet screens is a change in `frontend/src/pages/tablet/`.

Plan: `C:\Users\ServerDeskop\.claude\plans\do-you-have-database-glowing-crayon.md`

**Current stage: Phase 1 (code).** Intake at the vehicle and the estimate:
walk-around video, find or add the customer and vehicle, jobs from the labour
catalog and parts with live stock, and the estimate print. The Phase 0 *Tablet
tests* (server connection, video upload, printing) still have to be run on the
real tablet, and how estimates print inside the app depends on them.
Signatures, bay screens and parts requisitions come next.

**Do not build the APK on the DealerDesk server** (owner, 2026-09-14). The
tablet screens can be tried in any browser at `http://192.168.3.10:5000/tablet`
without an APK. Build the APK on a separate PC; see *To set this up on another
machine* below.

---

## Build toolchain (set up 2026-09-14)

The build server's C: drive is nearly full, so the whole Android toolchain
lives in one folder on F: — no Android Studio, nothing installed system-wide:

| Folder | What |
|---|---|
| `F:\android-build\jdk-21` | Java 21 (Microsoft OpenJDK 21.0.12) |
| `F:\android-build\sdk` | Android SDK: command-line tools, platform-tools (adb), Android 36 platform |
| `F:\android-build\gradle-home` | Gradle + its dependency cache (filled by the first build) |
| `F:\android-build\android-user-home` | Android per-user settings |
| `F:\android-build\tmp` | build temp files |
| `F:\android-build\downloads` | the original Java / SDK zips (safe to delete) |

`android\local.properties` (gitignored) points Gradle at `F:\android-build\sdk`.

To set this up on another machine: unzip Microsoft OpenJDK 21 into
`<folder>\jdk-21`, unzip Google's `commandlinetools-win-*_latest.zip` into
`<folder>\sdk\cmdline-tools\latest`, then with `JAVA_HOME` pointing at that JDK run
`<folder>\sdk\cmdline-tools\latest\bin\sdkmanager "platform-tools" "platforms;android-36"`.
Build with `-Toolchain <folder>`.

## Build a test APK

From `Software/mobile-android`:

```powershell
npm install                                              # first time only
powershell -ExecutionPolicy Bypass -File .\build-apk.ps1  # or: npm run apk:debug
```

`build-apk.ps1` builds the web app, copies it into `android/` and runs Gradle,
with Java, the SDK, Gradle's cache and temp files all redirected into the
toolchain folder for that run only. Add `-SkipWebBuild` when the web app is
already built. The first build downloads Gradle and its dependencies; later
builds are much faster.

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
3. Tap **Tablet tests** on the home screen and run all three before first use.

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
