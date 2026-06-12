# Vercel demo deployment

This frontend is configured to deploy as a **standalone demo** on Vercel.
No backend, no database. The browser fakes login and API responses so every
screen can be navigated.

## How the demo works

- `.env.production` sets `VITE_DEMO_MODE=true`, which is read at build time.
- `src/demoMode.js` swaps axios's HTTP adapter for an in-memory one when the flag is on:
  - Any username + password signs you in as **Demo Administrator** with every module.
  - All `GET` requests return `[]` (or `{}` for known single-record endpoints), so
    list pages render their empty states cleanly.
  - All writes return a generic success — the UI thinks it worked; nothing persists.
- A "DEMO MODE" banner shows on the login screen and on every page after login.

## Deploy from PowerShell (one-time setup)

```powershell
# 1. From the frontend folder
cd c:\Users\ServerDeskop\Desktop\db1\Software\frontend

# 2. Install Vercel CLI globally (one-time)
npm install -g vercel

# 3. Log in (one-time — opens a browser to authenticate)
vercel login

# 4. Deploy a preview (URL is throwaway, perfect for sharing once)
vercel

# 5. Or deploy production (stable URL like autodms.vercel.app)
vercel --prod
```

The first run prompts a few questions — accept the defaults:
- Set up and deploy? **Y**
- Which scope? *your account*
- Link to existing project? **N** (first time)
- Project name? **autodms-demo** (or anything)
- Code directory? **./**  (just press Enter)
- Override settings? **N**  (vercel.json already has the right config)

Vercel auto-detects Vite, runs `npm run build`, serves `dist/`. Done in ~60 seconds.

## Or deploy via the Vercel dashboard (Git-based)

1. Push the repo to GitHub.
2. On vercel.com → **Add New → Project → Import** your repo.
3. **Root Directory** → `Software/frontend`
4. Framework → Vite (auto-detected)
5. Build command → `npm run build` (default)
6. Output directory → `dist` (default)
7. Environment variables → `VITE_DEMO_MODE` = `true`
   *(already set in `.env.production` but adding it in the dashboard is harmless)*
8. **Deploy**.

Each push to `main` auto-redeploys; each PR gets its own preview URL.

## Sharing with the boss

After `vercel --prod`, you get a URL like `https://autodms-demo.vercel.app`.
Send that link. On the login screen they can type anything (e.g. `demo` / `demo`)
and they'll land on the dashboard with full sidebar access to all 22+ modules.

## Switching back to a real backend

When the real API is hosted later:

1. Set `VITE_DEMO_MODE=false` in Vercel project settings.
2. Set `VITE_API_URL=https://your-backend.example.com` in Vercel project settings.
3. Redeploy. The demo adapter unhooks itself and axios talks to the real server.

For local dev with a real backend, copy `.env.example` → `.env.local` and edit.
