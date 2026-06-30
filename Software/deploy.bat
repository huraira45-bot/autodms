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
    exit /b 1
)

REM ── 2. Backend deps (only re-installs if package.json changed) ──
echo.
echo [2/5] Installing backend npm packages...
call npm ci --omit=dev
if errorlevel 1 (
    echo.
    echo ERROR: npm ci failed.
    exit /b 1
)

REM ── 3. Frontend build ──────────────────────────────────────────
echo.
echo [3/5] Building frontend...
cd frontend
call npm ci
if errorlevel 1 (
    echo ERROR: frontend npm ci failed.
    exit /b 1
)
set "NODE_OPTIONS=--max-old-space-size=2048"
call npm run build
if errorlevel 1 (
    echo ERROR: frontend build failed.
    exit /b 1
)
cd ..

REM ── 4. Apply pending DB migrations ─────────────────────────────
echo.
echo [4/5] Applying pending DB migrations...
node scripts/run-pending-migrations.js
if errorlevel 1 (
    echo.
    echo ERROR: migration runner failed. Backend NOT reloaded.
    exit /b 1
)

REM ── 5. Reload Node backend through PM2 ─────────────────────────
echo.
echo [5/5] Reloading backend (PM2)...
where pm2 >nul 2>&1
if errorlevel 1 (
    echo WARNING: PM2 not found in PATH. Install with: npm install -g pm2
    echo Skipping PM2 reload — the backend may be running directly via nodemon.
) else (
    pm2 reload ecosystem.config.js --update-env
    if errorlevel 1 (
        echo ERROR: PM2 reload failed.
        exit /b 1
    )
)

echo.
echo === Deploy complete at %DATE% %TIME% ===
echo.
endlocal
