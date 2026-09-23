/**
 * Service worker for the tablet app (owner ask 2026-09-23).
 *
 * Chrome will not offer to install a page — the thing that removes the address
 * bar and the tabs — unless a service worker with a fetch handler is running.
 * So this exists first of all to make the tablet app installable, and second
 * to keep it usable when the workshop Wi-Fi drops for a moment.
 *
 * Its scope is /tablet only. The desktop ERP is never touched by it.
 *
 * The rules are deliberately cautious:
 *   - /api, /uploads and /socket.io are never intercepted. Job cards, stock
 *     and signatures must always be what the server says they are; a cached
 *     answer here would be a wrong answer.
 *   - Pages are fetched from the network first, so a deploy takes effect at
 *     once. The last page that loaded is kept only as an offline fallback.
 *   - Build assets are content-hashed by Vite, so a cached one can never be
 *     stale: a new build asks for a new filename.
 */
const VERSION = 'dd-tablet-v1';
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const SHELL_KEY = '/tablet';        // what an offline tablet falls back to
const MAX_ASSETS = 80;              // a few deploys' worth, then the oldest go

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        for (const key of await caches.keys()) {
            if (!key.startsWith(VERSION)) await caches.delete(key);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;

    let url;
    try { url = new URL(req.url); } catch { return; }
    if (url.origin !== self.location.origin) return;
    // Live data, uploads and the socket are the server's business, not ours.
    if (/^\/(api|uploads|socket\.io)\//.test(url.pathname)) return;
    if (url.pathname === '/tablet-sw.js') return;

    if (req.mode === 'navigate') {
        event.respondWith(pageFromNetworkFirst(req));
        return;
    }
    if (/^\/assets\//.test(url.pathname) || /\.(js|css|png|svg|woff2?|webmanifest)$/.test(url.pathname)) {
        event.respondWith(assetFromCacheFirst(req));
    }
});

/** Always the live page; the last good one is kept only for a dead network. */
async function pageFromNetworkFirst(req) {
    try {
        const res = await fetch(req);
        if (res && res.ok) {
            const cache = await caches.open(SHELL);
            await cache.put(SHELL_KEY, res.clone());
        }
        return res;
    } catch {
        const cached = await caches.match(SHELL_KEY, { cacheName: SHELL });
        return cached || new Response(OFFLINE_PAGE, {
            status: 503,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }
}

/** Hashed build assets: safe to serve from cache, because names change. */
async function assetFromCacheFirst(req) {
    const cache = await caches.open(ASSETS);
    const hit = await cache.match(req);
    if (hit) return hit;
    const res = await fetch(req);
    if (res && res.status === 200 && res.type === 'basic') {
        await cache.put(req, res.clone());
        // Old builds leave their assets behind; drop the oldest when it grows.
        const keys = await cache.keys();
        if (keys.length > MAX_ASSETS) {
            await Promise.all(keys.slice(0, keys.length - MAX_ASSETS).map(k => cache.delete(k)));
        }
    }
    return res;
}

const OFFLINE_PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>DealerDesk Service — offline</title>
<style>
  body { font-family: 'Segoe UI', Arial, sans-serif; background: #f1f5f9; color: #0f172a;
         display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 20px; }
  .card { background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 28px;
          max-width: 420px; text-align: center; }
  h1 { font-size: 22px; margin: 0 0 8px; }
  p { font-size: 15px; line-height: 1.5; color: #64748b; margin: 0 0 18px; }
  button { min-height: 52px; padding: 0 22px; font-size: 17px; font-weight: 600; border: none;
           border-radius: 10px; background: #714b67; color: #fff; }
</style>
<div class="card">
  <h1>No connection to DealerDesk</h1>
  <p>The tablet cannot reach the server. Check it is on the workshop Wi-Fi, then try again.</p>
  <button onclick="location.reload()">Try again</button>
</div>`;
