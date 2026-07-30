@echo off
REM ============================================================================
REM  AutoDMS — deployment script for the LIVE server.
REM
REM  Pulls the latest code from Git, installs any new npm deps, runs any
REM  pending DB migrations, rebuilds the frontend, and reloads the Node
REM  backend through PM2. Idempotent — running it twice with no new commits
REM  is a no-op (except for the PM2 reload).
REM
REM  First-time install: see DEPLOYMENT.md. After that, you run THIS file
REM  whenever you want to pull dev changes onto live:
REM
REM      cd C:\AutoDMS\Software
REM      deploy.bat
REM
REM  This script aborts on the first error so you never get a half-deployed
REM  system. Check the console output for what failed.
REM ============================================================================

setlocal enabledelayedexpansion
echo.
echo === AutoDMS deploy starting at %DATE% %TIME% ===
echo.

REM ── Always run from the script's own folder (Software/) ─────────────
cd /d "%~dp0"

REM ── 1. Git pull ──────────────────────────────────────────────────
echo [1/5] Pulling latest from Git...
git pull --ff-only
if errorlevel 1 (
    echo.
    echo ERROR: git pull failed. Resolve conflicts and re-run.
    pause & exit /b 1
)

REM ── 2. Backend deps (only re-installs if package.json changed) ──
REM     `npm ci` always wipes node_modules first. If PM2 still has the
REM     backend running, native addons (msnodesqlv8's sqlserver.node) are
REM     mmap'd into that process and Windows refuses to delete the file
REM     (EPERM). Stop the app first so the handle is released.
echo.
echo [2/5] Installing backend npm packages...
where pm2 >nul 2>&1
if not errorlevel 1 pm2 stop autodms >nul 2>&1
call npm ci --omit=dev
if errorlevel 1 (
    echo.
    echo ERROR: npm ci failed.
    pause & exit /b 1
)

REM ── 3. Frontend build ──────────────────────────────────────────
REM     Plain `npm install` here, not `npm ci` — this server's npm version
REM     can resolve a slightly different optional-dependency set (e.g. the
REM     @emnapi/* WASM shims under rolldown) than whatever npm generated
REM     the committed lock file, which makes `npm ci`'s exact-match check
REM     fail even though nothing is actually broken.
echo.
echo [3/5] Building frontend...
cd frontend
call npm install
if errorlevel 1 (
    echo ERROR: frontend npm install failed.
    pause & exit /b 1
)
set "NODE_OPTIONS=--max-old-space-size=2048"
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed.
    pause & exit /b 1
)
cd ..

REM ── 4. Apply pending DB migrations ─────────────────────────────
echo.
echo [4/5] Applying pending DB migrations...
node scripts/run-pending-migrations.js
if errorlevel 1 (
    echo.
    echo ERROR: migration runner failed. Backend NOT reloaded.
    pause & exit /b 1
)

REM ── 5. Restart Node backend through PM2 ─────────────────────────
REM     Step 2 stopped the app (to release the native-addon file lock), so
REM     use `restart` here, not `reload` — `reload` expects an already-
REM     running process for its zero-downtime handoff.
echo.
echo [5/5] Restarting backend (PM2)...
where pm2 >nul 2>&1
if errorlevel 1 (
    echo WARNING: PM2 not found in PATH. Install with: npm install -g pm2
    echo Skipping PM2 restart — the backend may be running directly via nodemon.
) else (
    pm2 restart ecosystem.config.js --update-env
    if errorlevel 1 (
        echo ERROR: PM2 restart failed.
        exit /b 1
    )
)

echo.
echo === Deploy complete at %DATE% %TIME% ===
echo.
endlocal
pause
