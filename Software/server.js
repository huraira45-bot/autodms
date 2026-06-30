require('dotenv').config();
const path = require('path');
const express = require('express');
const cors = require('cors');
const { connectDB } = require('./config/db');
const authMiddleware = require('./middleware/auth');

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
app.use('/uploads', express.static('uploads'));

// Serve the built frontend (single-port deploy on the LAN).
// `npm run build` in Software/frontend produces Software/frontend/dist.
// Requests that don't match an API route fall through to index.html so
// React Router can handle deep links like /sales/bookings/42.
const FRONTEND_DIST = path.join(__dirname, 'frontend', 'dist');
app.use(express.static(FRONTEND_DIST));

// Connect to Database
connectDB();

// Auth (public)
app.use('/api/auth', require('./routes/authRoutes'));

// Permissions (protected internally via router middleware)
app.use('/api/admin', require('./routes/permissionRoutes'));
app.use('/api/finalize', require('./routes/finalizeRoutes'));

// CRO public (token-based, no auth needed) — must come before authMiddleware
app.use('/api/cro', require('./routes/croPublicRoutes'));

// Protect all remaining API routes
app.use('/api', authMiddleware);

// Routes for Phase 1: Master Configurations
app.use('/api/employees', require('./routes/employeeRoutes'));
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
app.use('/api/sales/store-sale', require('./routes/saleRoutes'));
app.use('/api/sales/ssr', require('./routes/ssrRoutes'));
app.use('/api/accounts', require('./routes/accountRoutes'));
app.use('/api/workshop', require('./routes/workshopRoutes'));
app.use('/api/care-offs', require('./routes/careOffRoutes'));
app.use('/api/accessories', require('./routes/accessoriesRoutes'));
app.use('/api/system-accounts', require('./routes/systemAccountsRoutes'));
app.use('/api/tax-rates', require('./routes/taxRatesRoutes'));
app.use('/api/payments', require('./routes/paymentRoutes'));
app.use('/api/pos-settlement', require('./routes/posSettlementRoutes'));
app.use('/api/cheques', require('./routes/chequeRoutes'));
app.use('/api/gatepass', require('./routes/gatePassRoutes'));
app.use('/api/reports', require('./routes/reportsRoutes'));
app.use('/api/reports/service', require('./routes/serviceReportsRoutes'));
app.use('/api/reports/parts',   require('./routes/partsReportsRoutes'));
app.use('/api/reports/sales',   require('./routes/salesReportsRoutes'));
app.use('/api/service-campaigns', require('./routes/serviceCampaignRoutes'));
app.use('/api/crd', require('./routes/crdRoutes'));
app.use('/api/cro', require('./routes/croRoutes'));
app.use('/api/sales', require('./routes/salesRoutes'));

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
// Bind to 0.0.0.0 so the server is reachable from other machines on the LAN
// (Express defaults to 0.0.0.0 already, but stating it explicitly is clearer).
app.listen(PORT, '0.0.0.0', async () => {
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
