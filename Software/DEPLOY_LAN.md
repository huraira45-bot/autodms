# AutoDMS — LAN deploy on this server

Single-port deploy: Express serves both the API and the React SPA on port **5000**.
Database is SQL Server on `localhost` (Windows Auth). Anyone on the office LAN
hits the same machine by IP.

Current LAN IP of this server: **http://192.168.3.11:5000**

## How it's wired

- `Software/server.js` mounts `express.static('frontend/dist')` and a `/^(?!\/api|\/uploads).*/`
  catch-all that returns `index.html` so React Router can handle deep links.
- `Software/frontend/.env.production.local` sets `VITE_DEMO_MODE=false` and
  `VITE_API_URL=""` so axios uses **relative URLs** — same-origin, no CORS needed.
- Server binds to `0.0.0.0:5000` (all interfaces) so any LAN device reaches it.

## One-time setup tasks

### 1) Open Windows Firewall for port 5000 (LAN only)

Run **once** from an **elevated PowerShell** (right-click → Run as Administrator):

```powershell
New-NetFirewallRule -DisplayName 'AutoDMS LAN (5000)' `
    -Direction Inbound -Protocol TCP -LocalPort 5000 `
    -Action Allow -Profile Private,Domain
```

Profile `Private,Domain` only — keeps the rule scoped to your work network,
not to public Wi-Fi if someone takes a laptop home.

To verify:
```powershell
Get-NetFirewallRule -DisplayName 'AutoDMS LAN (5000)' | Select DisplayName, Enabled, Profile
```

To remove (if you ever want to undo it):
```powershell
Remove-NetFirewallRule -DisplayName 'AutoDMS LAN (5000)'
```

### 2) Strengthen `JWT_SECRET` (one-time)

The dev `.env` has `JWT_SECRET=dms_jwt_secret_2026_change_in_prod`. Replace it
with a long random string before going live:

```powershell
# Generate a strong secret (run once, copy the output)
[System.Convert]::ToBase64String((1..48 | ForEach-Object { Get-Random -Maximum 256 }))
```

Edit `Software\.env` and replace the JWT_SECRET line with the generated value.
**Important**: changing the secret invalidates all existing JWTs — users must log in again.

### 3) Production start (no nodemon)

```powershell
cd C:\Users\ServerDeskop\Desktop\db1\Software
npm start
```

You should see:
```
Server is running on port 5000
Frontend served from C:\...\frontend\dist
MSSQL Database Connected Successfully (Windows Authentication).
```

Open in any browser on the LAN: `http://192.168.3.11:5000`

## Rebuilding after code changes

Every time you change frontend code:
```powershell
cd C:\Users\ServerDeskop\Desktop\db1\Software\frontend
npm run build
# Then restart the server so it picks up the new dist/ (only needed for the index.html — assets are content-hashed)
```

Backend changes only need a server restart (no rebuild step).

## Make it auto-start on Windows boot

Three options, in order of robustness:

### Option A — NSSM (Recommended — proper Windows Service)

[NSSM](https://nssm.cc/) wraps `node server.js` as a real Windows Service.
Survives crashes (auto-restart), survives reboots, runs even if no user is logged in.

```powershell
# Download nssm.exe (one-time) — put it in C:\Tools\nssm.exe or wherever
# https://nssm.cc/download

# Install the service (elevated PowerShell)
C:\Tools\nssm.exe install AutoDMS "C:\Program Files\nodejs\node.exe" "C:\Users\ServerDeskop\Desktop\db1\Software\server.js"
C:\Tools\nssm.exe set AutoDMS AppDirectory "C:\Users\ServerDeskop\Desktop\db1\Software"
C:\Tools\nssm.exe set AutoDMS DisplayName "AutoDMS Dealership Management"
C:\Tools\nssm.exe set AutoDMS Start SERVICE_AUTO_START
C:\Tools\nssm.exe set AutoDMS AppStdout "C:\Users\ServerDeskop\Desktop\db1\Software\logs\stdout.log"
C:\Tools\nssm.exe set AutoDMS AppStderr "C:\Users\ServerDeskop\Desktop\db1\Software\logs\stderr.log"
C:\Tools\nssm.exe set AutoDMS AppRotateFiles 1
C:\Tools\nssm.exe set AutoDMS AppRotateBytes 10485760

# Create the log folder
New-Item -ItemType Directory -Force -Path C:\Users\ServerDeskop\Desktop\db1\Software\logs | Out-Null

# Start the service
Start-Service AutoDMS

# Verify
Get-Service AutoDMS
```

To control it later:
```powershell
Restart-Service AutoDMS   # after a rebuild
Stop-Service AutoDMS
Get-Content C:\Users\ServerDeskop\Desktop\db1\Software\logs\stdout.log -Tail 50 -Wait
```

To uninstall:
```powershell
Stop-Service AutoDMS
C:\Tools\nssm.exe remove AutoDMS confirm
```

**Important**: NSSM runs as `LocalSystem` by default, which usually CANNOT use
Windows Auth against your SQL Server. Switch the service account so it can:
```powershell
# Run as the current user (whose Windows account is the SQL login)
C:\Tools\nssm.exe set AutoDMS ObjectName ".\ServerDeskop" "<your-windows-password>"
Restart-Service AutoDMS
```

### Option B — Task Scheduler (simpler, no extra software)

Lighter, but doesn't restart on crash. Create a task that runs at boot:

```powershell
$action = New-ScheduledTaskAction -Execute 'C:\Program Files\nodejs\node.exe' `
    -Argument 'server.js' `
    -WorkingDirectory 'C:\Users\ServerDeskop\Desktop\db1\Software'
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "$env:COMPUTERNAME\$env:USERNAME" -LogonType S4U -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "AutoDMS" -Action $action -Trigger $trigger -Principal $principal -Settings $settings
```

### Option C — PM2 (Node-native)

```powershell
npm install -g pm2
npm install -g pm2-windows-startup
pm2-startup install
cd C:\Users\ServerDeskop\Desktop\db1\Software
pm2 start server.js --name autodms
pm2 save
```

PM2 auto-restarts on crash and on reboot.

## Troubleshooting

**Browser shows "Cannot GET /" on `http://localhost:5000`** —
There's likely a zombie node process. Check:
```powershell
Get-NetTCPConnection -LocalPort 5000 -State Listen | ForEach-Object { Get-Process -Id $_.OwningProcess }
```
Kill anything that isn't the running service / current `node server.js`.

**Other LAN machines can't reach `http://192.168.3.11:5000`** —
1. Confirm firewall rule from step 1 above is in place.
2. From the other machine, run `Test-NetConnection -ComputerName 192.168.3.11 -Port 5000` —
   if `TcpTestSucceeded: False`, firewall is the issue.
3. Make sure the server's network profile is **Private** (not Public).

**SQL connection error after switching to Windows Service** —
NSSM is running as `LocalSystem`. Change `ObjectName` to a user account that
has a SQL login (see NSSM step above).

**Frontend changes don't show up** — you need to rebuild the dist:
```powershell
cd C:\Users\ServerDeskop\Desktop\db1\Software\frontend
npm run build
Restart-Service AutoDMS   # if using NSSM
```
