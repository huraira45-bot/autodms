const express = require('express');
const router = express.Router();
const wc = require('../controllers/workshopController');
const { requirePerm, requireAccess, requireAnyAccess } = require('../middleware/permissions');

// ── Customers (workshop_customers) ─────────────────────────────────────────
router.get(   '/customers',                 requirePerm('workshop_customers', 'view'),   wc.getCustomers);
router.get(   '/customers/:id',             requirePerm('workshop_customers', 'view'),   wc.getCustomerById);
router.post(  '/customers',                 requirePerm('workshop_customers', 'insert'), wc.saveCustomer);
router.get(   '/customers/:id/vehicles',    requirePerm('workshop_customers', 'view'),   wc.getCustomerVehicles);
router.post(  '/customers/:id/vehicles',    requirePerm('workshop_customers', 'insert'), wc.addCustomerVehicle);

// ── Parties (read-only — used by JC create + various pickers) ──────────────
router.get(   '/parties',                   requireAnyAccess('workshop_jobs:view', 'crm_parties:view'), wc.getParties);

// ── Job Types (workshop_settings) ──────────────────────────────────────────
router.get(   '/job-types',                 requirePerm('workshop_settings', 'view'),    wc.getJobCardTypes);
router.post(  '/job-types',                 requirePerm('workshop_settings', 'insert'),  wc.saveJobCardType);
router.delete('/job-types/:id',             requirePerm('workshop_settings', 'delete'),  wc.deleteJobCardType);
router.patch( '/job-types/:id/manager',     requirePerm('workshop_settings', 'edit'),    wc.setJobCardTypeManager);
router.patch( '/job-types/:id/gl',          requirePerm('workshop_settings', 'edit'),    wc.setJobCardTypeGL);

// ── Order Types (under workshop_settings) ──────────────────────────────────
router.get(   '/order-types',               requirePerm('workshop_settings', 'view'),    wc.getOrderTypes);
router.post(  '/order-types',               requirePerm('workshop_settings', 'insert'),  wc.saveOrderType);
router.delete('/order-types/:id',           requirePerm('workshop_settings', 'delete'),  wc.deleteOrderType);

// ── Job Cards (workshop_jobs) ──────────────────────────────────────────────
router.get(   '/job-cards',                 requirePerm('workshop_jobs', 'view'),        wc.getJobCards);
router.get(   '/job-cards/resolve-ro',      requirePerm('workshop_jobs', 'view'),        wc.resolveByRO);
router.get(   '/job-cards/:id/print-data',  requirePerm('workshop_jobs', 'view'),        wc.getJobCardPrintData);
router.get(   '/job-cards/:id',             requirePerm('workshop_jobs', 'view'),        wc.getJobCardById);
router.post(  '/job-cards',                 requirePerm('workshop_jobs', 'insert'),      wc.saveJobCard);
router.patch( '/job-cards/:id/status',      requirePerm('workshop_jobs', 'edit'),        wc.updateJobStatus);
router.get(   '/job-cards/:id/navigation',  requirePerm('workshop_jobs', 'view'),        wc.getNavigation);
router.post(  '/job-cards/:id/damage-marks',requirePerm('workshop_jobs', 'edit'),        wc.saveDamageMarks);

// Insurance handling on JC — treated as JC edits
router.get(   '/job-cards/:id/insurance',   requirePerm('workshop_jobs', 'view'),        wc.getJobCardInsurance);
router.post(  '/job-cards/:id/insurance',   requirePerm('workshop_jobs', 'edit'),        wc.saveJobCardInsurance);
router.post(  '/job-cards/:id/depreciation-payments', requirePerm('workshop_jobs', 'edit'), wc.recordDepreciationPayment);

// Birthdays — read-only, useful for CRO + Workshop staff dashboards
router.get(   '/birthdays',                 requireAnyAccess('workshop_jobs:view', 'cro_workspace', 'workshop_customers:view'), wc.getBirthdays);

// ── Job Controller (workshop_controller — workflow page) ───────────────────
router.get(   '/job-controller',            requireAccess('workshop_controller'),        wc.getTodayJobs);
router.get(   '/job-controller/:id/detail', requireAccess('workshop_controller'),        wc.getJobControllerDetail);
router.patch( '/job-controller/:id/status', requireAccess('workshop_controller'),        wc.updateWorkshopStatus);
router.patch( '/job-controller/detail/:detailId/assign', requireAccess('workshop_controller'), wc.updateLabourAssignment);

// Bays (part of workshop_settings)
router.get(   '/bays',                      requireAnyAccess('workshop_settings:view', 'workshop_controller', 'workshop_jobs:view'), wc.getBays);
router.get(   '/bays/all',                  requirePerm('workshop_settings', 'view'),    wc.getAllBays);
router.post(  '/bays',                      requirePerm('workshop_settings', 'insert'),  wc.saveBay);
router.put(   '/bays/:id',                  requirePerm('workshop_settings', 'edit'),    wc.saveBay);
router.delete('/bays/:id',                  requirePerm('workshop_settings', 'delete'),  wc.deleteBay);

// ── Sublet Repairs (workshop_sublet) ───────────────────────────────────────
router.get(   '/sublets',                   requirePerm('workshop_sublet', 'view'),      wc.getSublets);
router.post(  '/sublets',                   requirePerm('workshop_sublet', 'insert'),    wc.saveSublet);
router.delete('/sublets/:id',               requirePerm('workshop_sublet', 'delete'),    wc.deleteSublet);

// ── Parts Issue (workshop_parts_issue) ─────────────────────────────────────
router.get(   '/parts-issue',               requirePerm('workshop_parts_issue', 'view'),   wc.getPartsIssues);
router.post(  '/parts-issue',               requirePerm('workshop_parts_issue', 'insert'), wc.issuePartsToJobCard);

// ── RO & Doc Counters (workshop_settings — admin tweak) ────────────────────
router.get(   '/ro-counters',               requirePerm('workshop_settings', 'view'),    wc.getROCounters);
router.put(   '/ro-counters/:CardCode',     requirePerm('workshop_settings', 'edit'),    wc.updateROCounter);
router.get(   '/doc-counters',              requirePerm('workshop_settings', 'view'),    wc.getDocCounters);
router.put(   '/doc-counters/:DocType',     requirePerm('workshop_settings', 'edit'),    wc.updateDocCounter);

module.exports = router;
