# AutoDMS — Deployment Guide

This document covers (a) **first-time install on the live server** and (b) the
**ongoing dev → live update flow** you'll use every time you push changes from
your dev machine.

## Architecture

```
┌─────────────────────┐                  ┌──────────────────────┐
│ Dev machine         │  git push        │ GitHub (private repo)│
│ (this PC)           │ ──────────────▶  │  source of truth     │
│  - Make changes     │                  │                      │
│  - Test locally     │                  └─────┬────────────────┘
└─────────────────────┘                        │ git pull
                                               ▼
                            ┌─────────────────────────────────────┐
                            │ Live server (Windows)               │
                            │  - SQL Server (DB)                  │
                            │  - Node backend on :5000 (PM2)      │
                            │  - Built frontend served by backend │
                            │  - deploy.bat (manual trigger)      │
                            └─────────────────────────────────────┘
                                               ▲ LAN access
                            ┌──────────────────┴──────────────┐
                            │ Workshop / Sales / Accounts PCs │
                            │ http://<server-ip>:5000         │
                            └─────────────────────────────────┘
```

## Part 1 — One-time setup on the dev machine (this PC)

You only do these steps **once**.

### 1.1 Create a private GitHub repo

1. Go to https://github.com/new
2. Name it (e.g. `autodms-cmm`)
3. **Private** ✓
4. Skip "Add README / .gitignore / license" — we already have them
5. Click **Create repository**
6. Copy the URL (e.g. `https://github.com/YOUR-USER/autodms-cmm.git`)

### 1.2 Push this dev repo to GitHub

From `C:\Users\ServerDeskop\Desktop\db1`:

```bat
git remote add origin https://github.com/YOUR-USER/autodms-cmm.git
git branch -M main
git add -A
git commit -m "Deployment scaffolding + accumulated work"
git push -u origin main
```

If git asks for credentials, use a **Personal Access Token** (Settings → Developer settings → Personal access tokens → Tokens (classic), `repo` scope) as the password.

### 1.3 Bootstrap the migrations tracking table on the dev DB

The dev DB already has all 51 migrations applied manually. We need to **mark
them as applied** in the tracking table so the runner doesn't try to re-run
them on this dev box:

```bat
cd C:\Users\ServerDeskop\Desktop\db1\Software
node scripts\run-pending-migrations.js --mark-all-applied
```

This creates `dms_AppliedMigrations` and pre-populates it with all 51 filenames.

From now on, **every new `migrations/NNN_*.sql` file you add will be the only
thing the runner applies**.

## Part 2 — One-time setup on the LIVE server

### 2.1 Install prerequisites

On the live Windows server, install:

| Software | Where | Notes |
|---|---|---|
| **Node.js 22 LTS** | https://nodejs.org | Add to PATH ✓ |
| **Git for Windows** | https://git-scm.com | Add to PATH ✓ |
| **SQL Server 2019/2022** (Express is OK for small dealers) | Microsoft | Enable Mixed Mode or Windows Auth |
| **ODBC Driver 17 for SQL Server** | Microsoft | Required by `mssql` |
| **PM2** (process manager) | `npm install -g pm2` | + `npm install -g pm2-windows-startup` |
| **sqlcmd** | comes with SQL Server | Add to PATH |

### 2.2 Clone the repo

Pick a directory — `C:\AutoDMS\` is a good convention:

```bat
mkdir C:\AutoDMS
cd C:\AutoDMS
git clone https://github.com/YOUR-USER/autodms-cmm.git .
```

### 2.3 Configure environment

```bat
cd C:\AutoDMS\Software
copy .env.example .env
notepad .env
```

Edit `.env`:
- `JWT_SECRET=` → paste a long random string (32+ chars). **Different from dev.**
- `DB_NAME=autodms_prod` (or whatever you want the prod DB called)
- `DB_SERVER=localhost` (or the SQL Server hostname if different)
- `PUBLIC_API_BASE=http://192.168.x.x:5000` (the LAN IP staff will use)

### 2.4 Create the live database

Two options:

**Option A — Start from a dev backup (recommended for first cutover)**

This keeps your existing parties, employees, COA, parts catalog, etc.

On dev machine:
```powershell
sqlcmd -S localhost -E -Q "BACKUP DATABASE temp_db1 TO DISK='C:\Users\ServerDeskop\Desktop\db1\autodms_dev.bak' WITH INIT, COMPRESSION"
```

Copy the `.bak` to the live server, then:

```powershell
sqlcmd -S localhost -E -Q "RESTORE DATABASE autodms_prod FROM DISK='C:\path\to\autodms_dev.bak' WITH MOVE 'temp_db1' TO 'C:\SQLData\autodms_prod.mdf', MOVE 'temp_db1_log' TO 'C:\SQLData\autodms_prod_log.ldf', REPLACE"
```

Then bootstrap the tracking table on live too:
```bat
cd C:\AutoDMS\Software
node scripts\run-pending-migrations.js --mark-all-applied
```

**Option B — Start empty (clean slate, you re-enter master data on live)**

Run all 51 migrations from scratch:
```bat
sqlcmd -S localhost -E -Q "CREATE DATABASE autodms_prod"
cd C:\AutoDMS\Software
node scripts\run-pending-migrations.js
```

⚠️ This applies the migrations as-is. Some may have been hand-edited or assume earlier state; if anything fails, fix it and re-run. The runner is idempotent — already-applied files are skipped.

### 2.5 Install npm dependencies + first build

```bat
cd C:\AutoDMS\Software
npm ci --omit=dev

cd frontend
npm ci
npm run build
cd ..
```

### 2.6 Start the backend under PM2

```bat
cd C:\AutoDMS\Software
pm2 start ecosystem.config.js
pm2 save
pm2-startup install
```

Verify it's running:
```bat
pm2 status
curl http://localhost:5000/
```

### 2.7 Open the firewall for port 5000 (LAN only)

```bat
netsh advfirewall firewall add rule name="AutoDMS" dir=in action=allow protocol=TCP localport=5000 profile=private
```

This allows other PCs on the office LAN to reach the server, but **not the
internet** (because the profile is "private"). If you later want internet
access, change profile or set up a reverse-proxy + HTTPS — ask me when ready.

### 2.8 First login

From any LAN machine:
```
http://<server-lan-ip>:5000
```

Login: `admin / admin123` ← **change this immediately** through Settings → User Management.

## Part 3 — Ongoing dev → live workflow

Once both sides are set up, here's the loop you'll use:

### On dev (this PC)

1. Make changes. Test them. When happy:
```bat
cd C:\Users\ServerDeskop\Desktop\db1
git add -A
git commit -m "Short description of what changed"
git push
```

That's it on this side.

### On live server

When you're ready to push the changes through:

```bat
cd C:\AutoDMS\Software
deploy.bat
```

`deploy.bat` does:
1. `git pull --ff-only`
2. `npm ci --omit=dev` for backend
3. `npm ci && npm run build` for frontend
4. `node scripts/run-pending-migrations.js` — runs only new SQL files
5. `pm2 reload` — zero-downtime backend restart

If anything fails, the script aborts and tells you which step. The backend keeps running on the previous version.

## Part 4 — Troubleshooting

### "Migration X failed"
The runner prints the failing file and the error. Fix the SQL, then re-run `deploy.bat`. The runner restarts from where it stopped — already-applied files are skipped.

### "PM2 not found"
`npm install -g pm2` (and on Windows, also `npm install -g pm2-windows-startup` + `pm2-startup install`).

### Backend won't start
```bat
pm2 logs autodms --lines 100
```
Most common: bad `.env` or SQL Server not reachable.

### How do I roll back a bad deploy?
```bat
cd C:\AutoDMS
git log --oneline
git checkout <previous-commit-hash>
cd Software
deploy.bat
```
Note: migrations don't roll back automatically — if the bad commit had a destructive migration, you need a DB restore.

## Part 5 — Backup strategy

Recommended: **daily full backup** of the DB. Add a scheduled task on the server:

```bat
sqlcmd -S localhost -E -Q "BACKUP DATABASE autodms_prod TO DISK='D:\backups\autodms_prod_$(Get-Date -Format yyyy-MM-dd).bak' WITH INIT, COMPRESSION"
```

Schedule it via Task Scheduler to run at, say, 2 AM. Keep a week of backups locally, and copy at least weekly to an external drive or cloud sync (OneDrive / Google Drive).

The `uploads/` folder (Software/uploads/) also matters — it has JC attachments, CRO complaint screenshots, etc. Back it up the same way (`robocopy`).

## Part 6 — Files added for deployment

| File | Purpose |
|---|---|
| `Software/.env.example` | Template for the `.env` config |
| `Software/scripts/run-pending-migrations.js` | Idempotent migration runner |
| `Software/deploy.bat` | One-command deploy script for the live server |
| `Software/ecosystem.config.js` | PM2 process config (autostart, logs) |
| `DEPLOYMENT.md` | This file |

All committed to Git. The `.env` file itself is **NOT** committed — each environment has its own copy.
