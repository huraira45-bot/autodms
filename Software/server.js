require('dotenv').config();
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const authMiddleware = require('./middleware/auth');
const chatSocket = require('./services/chatSocket');

// Fail fast if JWT secret isn't configured. Otherwise the auth layer silently
// falls back to a known string and every token in the wild becomes forgeable.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 16) {
    console.error('FATAL: JWT_SECRET env var must be set to a 16+ character secret. Aborting startup.');
    process.exit(1);
}

const app = express();

// Middleware
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests
app.use(express.urlencoded({ extended: false })); // Twilio webhook form posts
// Service tablet walk-around videos and photos are customer vehicle evidence.
// Everything else under /uploads is served publicly with no login, so this
// folder is carved out of that mount before it (plan 2026-09-14, Phase 1).
app.use('/uploads/service-media', (req, res) => res.status(404).end());
app.use('/uploads', express.static('uploads'));

// Serve the built frontend (single-port deploy on the LAN).
// `npm run build` in Software/frontend produces Software/frontend/dist.
// Requests that don't match an API route fall through to index.html so
// React Router can handle deep links like /sales/bookings/42.
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

// TLS material for the tablet app's HTTPS port (scripts/make_tls_cert.js).
// Never committed — each server makes its own.
const TLS_DIR  = process.env.TLS_DIR || path.join(__dirname, 'certs');
const TLS_CERT = process.env.TLS_CERT_FILE || path.join(TLS_DIR, 'dealerdesk-server.crt');
const TLS_KEY  = process.env.TLS_KEY_FILE  || path.join(TLS_DIR, 'dealerdesk-server.key');
const TLS_CA   = process.env.TLS_CA_FILE   || path.join(TLS_DIR, 'dealerdesk-ca.crt');

// A tablet cannot trust the HTTPS port until it has this file, so it is served
// over plain HTTP with no login — that is the only way out of the chicken and
// egg. It is the PUBLIC half of the certificate, meant to be handed out; the
// private key that signs with it never leaves the server.
app.get('/dealerdesk-ca.crt', (req, res) => {
    if (!fs.existsSync(TLS_CA)) {
        return res.status(404).type('text/plain')
                  .send('No certificate yet. On the server: node scripts/make_tls_cert.js');
    }
    res.type('application/x-x509-ca-cert');
    res.setHeader('Content-Disposition', 'attachment; filename="dealerdesk-ca.crt"');
    res.sendFile(TLS_CA);
});

// Connect to Database
connectDB();

// Auth (public)
app.use('/api/auth', require('./routes/authRoutes'));

// Permissions (protected internally via router middleware)
app.use('/api/admin', require('./routes/permissionRoutes'));
app.use('/api/finalize', require('./routes/finalizeRoutes'));

// CRO public (token-based, no auth needed) — must come before authMiddleware
app.use('/api/cro', require('./routes/croPublicRoutes'));
// Kiosk / big-screen job-status display — public, read-only. Also mounts
// before authMiddleware so a lobby TV can render it on a bare browser.
app.use('/api/kiosk', require('./routes/kioskRoutes'));

// Service tablet app — public reachability check (plan 2026-09-14, Phase 0).
// Must answer before anyone signs in, so the tablet can confirm it reached
// THIS server rather than a Wi-Fi login page or its own bundled page. Returns
// a marker and the server clock only — no data.
app.get('/api/service-intake/ping', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ app: 'DealerDesk', ok: true, serverTime: new Date().toISOString() });
});

// Bay screens (plan 2026-09-14, Phase 3). They hold a device token, not a user
// login, so they mount before the auth middleware; routes/bayScreenRoutes.js
// accepts device tokens only, and the auth middleware refuses them.
app.use('/api/bay-screen', require('./routes/bayScreenRoutes'));

// Protect all remaining API routes
app.use('/api', authMiddleware);

// Routes for Phase 1: Master Configurations
app.use('/api/employees', require('./routes/employeeRoutes'));
app.use('/api/hr',        require('./routes/hrSalaryRoutes'));
app.use('/api/parties', require('./routes/partyRoutes'));
app.use('/api/branches', require('./routes/branchRoutes'));
app.use('/api/departments', require('./routes/departmentRoutes'));
app.use('/api/designations', require('./routes/designationRoutes'));

// Routes for Phase 2: Inventory Configurations
app.use('/api/inventory-config', require('./routes/inventoryConfigRoutes'));
app.use('/api/items', require('./routes/itemRoutes'));

// Routes for Phase 3: Procurement & Sales
app.use('/api/procurement/grn', require('./routes/grnRoutes'));
app.use('/api/procurement/grtn', require('./routes/grtnRoutes'));
// Paint Lab — separate paint inventory + costing module (owner ask 2026-07-04).
// Only master data + settings ship in phase 0; GRN / GRTN / Issue / Reports
// mount under /api/paint/* in follow-up phases.
app.use('/api/paint/grn',   require('./routes/paintGRNRoutes'));
app.use('/api/paint/grtn',  require('./routes/paintGRTNRoutes'));
app.use('/api/paint/issue', require('./routes/paintIssueRoutes'));
app.use('/api/paint',       require('./routes/paintReportsRoutes'));
app.use('/api/paint',       require('./routes/paintLabRoutes'));
app.use('/api/sales/store-sale', require('./routes/saleRoutes'));
app.use('/api/sales/ssr', require('./routes/ssrRoutes'));
app.use('/api/accounts', require('./routes/accountRoutes'));
app.use('/api/workshop', require('./routes/workshopRoutes'));
app.use('/api/care-offs', require('./routes/careOffRoutes'));
app.use('/api/careoff-elevations', require('./routes/careOffElevationRoutes'));
app.use('/api/accessories', require('./routes/accessoriesRoutes'));
app.use('/api/system-accounts', require('./routes/systemAccountsRoutes'));
app.use('/api/tax-rates', require('./routes/taxRatesRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/pos-settlement', require('./routes/posSettlementRoutes'));
app.use('/api/cheques', require('./routes/chequeRoutes'));
app.use('/api/gatepass', require('./routes/gatePassRoutes'));
// The library behind the lobby board's videos. What the TV itself reads is
// the anonymous /api/kiosk/playlist, registered above the auth middleware.
app.use('/api/kiosk-videos', require('./routes/kioskVideoRoutes'));
app.use('/api/settings/business-profile', require('./routes/businessProfileRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/reports/service', require('./routes/serviceReportsRoutes'));
app.use('/api/reports/parts',   require('./routes/partsReportsRoutes'));
app.use('/api/reports/sales',   require('./routes/salesReportsRoutes'));
app.use('/api/service-campaigns', require('./routes/serviceCampaignRoutes'));
app.use('/api/crd', require('./routes/crdRoutes'));
app.use('/api/cro', require('./routes/croRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));
app.use('/api/chat', require('./routes/chatRoutes'));
app.use('/api/charity', require('./routes/charityRoutes'));
app.use('/api/fixed-assets', require('./routes/fixedAssetRoutes'));
// Service tablet app (plan 2026-09-14). Its public /ping is registered above
// the auth middleware; these routes require a signed-in user.
app.use('/api/service-intake', require('./routes/serviceIntakeRoutes'));

// SPA fallback — anything that isn't an API route or a static asset returns
// index.html so React Router takes over client-side. Must come AFTER all
// /api/* mounts and the express.static() above.
app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res, next) => {
    const indexPath = path.join(FRONTEND_DIST, 'index.html');
    res.sendFile(indexPath, (err) => {
        if (err) next(err);
    });
});

const PORT = process.env.PORT || 5000;
// Use a raw http.Server so Socket.io can attach on the same port as Express
// (the chat feature requires WebSockets). The `.listen` semantics are the
// same as app.listen — the raw server just makes the shared handle explicit.
const httpServer = http.createServer(app);
const io = chatSocket.attach(httpServer);
// Live updates for the service tablet, the parts counter and bay screens
// (plan 2026-09-14, Phase 3) share the socket.io server with chat.
require('./services/serviceEvents').attach(io);
// ---- HTTPS, for the service tablets (owner ask 2026-09-23) ----
// Chrome only installs a page as an app — the thing that takes away the
// address bar and the tabs — over HTTPS. So the tablets get a TLS port,
// running beside the plain HTTP one that the desktop ERP keeps using
// unchanged. Certificates come from scripts/make_tls_cert.js and are never
// committed; with none present this is skipped and the server behaves exactly
// as it did before.
const HTTPS_PORT = Number(process.env.HTTPS_PORT || 5443);

if (fs.existsSync(TLS_CERT) && fs.existsSync(TLS_KEY)) {
    try {
        const httpsServer = https.createServer(
            { cert: fs.readFileSync(TLS_CERT), key: fs.readFileSync(TLS_KEY) }, app);
        // Same socket.io instance on both ports, so chat and the bay screens
        // work whichever way a client connected.
        io.attach(httpsServer);
        httpsServer.on('error', (err) => {
            console.error(`[https] port ${HTTPS_PORT} unavailable: ${err.code || err.message}. HTTP is unaffected.`);
        });
        httpsServer.listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`HTTPS is running on port ${HTTPS_PORT}`);
            console.log(`Tablets: https://<lan-ip>:${HTTPS_PORT}/tablet`);
        });
    } catch (err) {
        console.error('[https] could not start:', err.message, '— HTTP is unaffected.');
    }
} else {
    console.log(`[https] no certificate in ${TLS_DIR} — HTTPS off (run: node scripts/make_tls_cert.js)`);
}

// Bind to 0.0.0.0 so the server is reachable from other machines on the LAN
// (Express defaults to 0.0.0.0 already, but stating it explicitly is clearer).
httpServer.listen(PORT, '0.0.0.0', async () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Frontend served from ${FRONTEND_DIST}`);
  console.log(`Open http://localhost:${PORT} (or http://<lan-ip>:${PORT} from another machine)`);
  require('./services/escalationCron').start();
  require('./services/reminderCron').start();

  // Warm up heavy report queries so the first user request isn't penalized
  // by msnodesqlv8 cold-cache + plan compilation. Runs in the background;
  // failures here are non-fatal.
  setTimeout(async () => {
    try {
      const axios = require('axios');
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ userId: 0, userName: 'warmup', groupId: 0, groupTitle: 'warmup',
                               employeeId: 0, modules: ['reports','parts_spare','inventory_settings'] },
                              process.env.JWT_SECRET, { expiresIn: '1m' });
      const t0 = Date.now();
      await axios.get(`http://localhost:${PORT}/api/reports/inventory-valuation`,
                      { headers: { Authorization: 'Bearer ' + token }, timeout: 90000 });
      console.log(`[warmup] inventory report ready (${Date.now()-t0}ms)`);
    } catch (e) {
      console.warn('[warmup] failed:', e.code || e.message);
    }
  }, 1500);
});
