const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceCampaignController');

const requireAny = (...mods) => (req, res, next) => {
    const u = req.user?.modules || [];
    if (mods.some(m => u.includes(m))) return next();
    return res.status(403).json({ error: 'Access denied.' });
};

// Admins (workshop_settings) manage campaigns. Anyone in workshop/parts can list.
// workshop_tablet included so the service advisor can apply a campaign from
// the tablet at the vehicle (owner ask 2026-09-26) -- a campaign attaches to a
// job card, and the tablet holds its own job card screen.
const canRead   = requireAny('workshop_settings', 'workshop_jobs', 'workshop_labour',
                              'parts_spare', 'sales_store', 'reports', 'workshop_tablet');
const canWrite  = requireAny('workshop_settings', 'admin_users');

// Lookups used by the admin form
router.get('/lookups/job-info',          canRead,  c.listJobInfo);
router.get('/lookups/expense-accounts',  canRead,  c.listExpenseAccounts);

// Application — attach a campaign to a JC or Store Sale
router.get('/applicable',                                canRead,  c.listApplicable);
router.get('/applications/by-jobcard/:id',               canRead,  c.applicationByJobCard);
router.get('/applications/by-sale/:id',                  canRead,  c.applicationBySale);
router.post('/:id/apply',                                canRead,  c.applyCampaign);
router.post('/applications/:appId/reverse',              canRead,  c.reverseApplication);

// CRUD
router.get('/',                          canRead,  c.list);
router.get('/:id',                       canRead,  c.getOne);
router.post('/',                         canWrite, c.create);
router.put('/:id',                       canWrite, c.update);
router.post('/:id/status',               canWrite, c.changeStatus);

module.exports = router;
