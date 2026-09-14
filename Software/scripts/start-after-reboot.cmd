@echo off
rem Starts DealerDesk after the server restarts.
rem
rem Run by the scheduled task "DealerDesk start after reboot", created once on
rem the live server (in Command Prompt, as Administrator) with:
rem
rem   schtasks /create /tn "DealerDesk start after reboot" /sc onstart /delay 0001:00 /rl highest /ru Administrator /rp * /tr "\"D:\saher 2.0\autodms\Software\scripts\start-after-reboot.cmd\""
rem
rem Why a task: pm2-startup (pm2-windows-startup) starts PM2 only when someone
rem signs in to Windows, so after an unattended reboot DealerDesk stayed down
rem until "pm2 resurrect" was run by hand (2026-09-14). The task runs as the
rem account that owns PM2's process list (C:\Users\Administrator\.pm2), which is
rem also the Windows login DealerDesk uses for SQL Server, one minute after
rem startup so SQL Server is up first.
rem
rem Safe to run by hand: it does nothing if DealerDesk is already running.
rem Log: %USERPROFILE%\.pm2\start-after-reboot.log
setlocal
set "LOG=%USERPROFILE%\.pm2\start-after-reboot.log"
set "PM2=pm2"
if exist "%APPDATA%\npm\pm2.cmd" set "PM2=%APPDATA%\npm\pm2.cmd"
cd /d "%~dp0.."

echo [%date% %time%] start-after-reboot >> "%LOG%"

call :running
if defined PID (
    echo DealerDesk is already running, pid %PID%. >> "%LOG%"
    echo DealerDesk is already running, pid %PID%.
    goto end
)

echo Restoring the saved PM2 process list. >> "%LOG%"
call "%PM2%" resurrect >> "%LOG%" 2>&1

call :running
if defined PID (
    echo Restored, pid %PID%. >> "%LOG%"
    echo DealerDesk started, pid %PID%.
    goto end
)

echo Nothing restored; starting from ecosystem.config.js. >> "%LOG%"
call "%PM2%" start ecosystem.config.js --update-env >> "%LOG%" 2>&1
call "%PM2%" save >> "%LOG%" 2>&1
call :running
if defined PID (
    echo DealerDesk started, pid %PID%.
) else (
    echo DealerDesk did not start. See %LOG%
)
goto end

rem Sets PID to autodms's process id, or leaves it empty when not running.
rem Only an all-digit line counts: "pm2 pid" also prints daemon start-up
rem messages, and prints 0 for a stopped process.
:running
set "PID="
for /f "delims=" %%p in ('call "%PM2%" pid autodms 2^>nul ^| findstr /r "^[0-9][0-9]*$"') do set "PID=%%p"
if "%PID%"=="0" set "PID="
exit /b 0

:end
call "%PM2%" status >> "%LOG%" 2>&1
endlocal
