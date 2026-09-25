@echo off
REM ============================================================================
REM  Brings DealerDesk back up after the server has been restarted.
REM
REM  Double-click this, or run it from a command prompt. Safe to run when the
REM  app is already running — startOrRestart starts it if it is not there and
REM  restarts it if it is, so there is no "already launched" error to puzzle
REM  over at seven in the morning.
REM
REM  It also runs `pm2 save`, which records the running app so PM2 can bring it
REM  back by itself next time. For that to happen automatically on boot, PM2
REM  needs its Windows startup hook installed once (see ecosystem.config.js):
REM      npm install -g pm2
REM      pm2 install pm2-windows-startup
REM      pm2-startup install
REM  After that this file is only needed if something has gone wrong.
REM ============================================================================

REM %~dp0 is this file's own folder, so the path is right on any machine.
cd /d "%~dp0"

echo Starting DealerDesk...
call pm2 startOrRestart ecosystem.config.js --update-env
if errorlevel 1 (
    echo.
    echo PM2 could not start it. Is PM2 installed?  npm install -g pm2
    pause
    exit /b 1
)

call pm2 save

echo.
call pm2 status
echo.
echo DealerDesk should now be answering on port 5000.
echo Open http://localhost:5000 here, or http://192.168.3.10:5000 from another machine.
echo.
pause
