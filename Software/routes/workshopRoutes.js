const express = require('express');
const router = express.Router();
const wc = require('../controllers/workshopController');
const { requirePerm, requireAccess, requireAnyAccess } = require('../middleware/permissions');
const si = require('../controllers/serviceIntakeController');
const qc = require('../controllers/qcInspectionController');

// ── Customers (workshop_customers) ─────────────────────────────────────────
router.get(   '/customers',                 requirePerm('workshop_customers', 'view'),   wc.getCustomers);
router.get(   '/customers/:id',             requirePerm('workshop_customers', 'view'),   wc.getCustomerById);
router.post(  '/customers',                 requirePerm('workshop_customers', 'insert'), wc.saveCustomer);
router.get(   '/customers/:id/vehicles',    requirePerm('workshop_customers', 'view'),   wc.getCustomerVehicles);
router.post(  '/customers/:id/vehicles',    requirePerm('workshop_customers', 'insert'), wc.addCustomerVehicle);
router.put(   '/customers/:id/vehicles/:vehicleId', requirePerm('workshop_customers', 'edit'), wc.updateCustomerVehicle);

// ── Parties (read-only — used by JC create + various pickers) ──────────────
router.get(   '/parties',                   requireAnyAccess('workshop_jobs:view', 'crm_parties:view'), wc.getParties);

// ── Job Types (workshop_settings) ──────────────────────────────────────────
// GET is also needed by JobCardForm (Business Unit dropdown) and by the JC
// Register report's Business Type filter — allow any of these three views.
router.get(   '/job-types',                 requireAnyAccess('workshop_settings:view', 'workshop_jobs:view', 'report:job_card_register'), wc.getJobCardTypes);
router.post(  '/job-types',                 requirePerm('workshop_settings', 'insert'),  wc.saveJobCardType);
router.delete('/job-types/:id',             requirePerm('workshop_settings', 'delete'),  wc.deleteJobCardType);
router.patch( '/job-types/:id/manager',     requirePerm('workshop_settings', 'edit'),    wc.setJobCardTypeManager);
router.patch( '/job-types/:id/gl',          requirePerm('workshop_settings', 'edit'),    wc.setJobCardTypeGL);

// ── Order Types (under workshop_settings) ──────────────────────────────────
// GET is also needed by JobCardForm (Order Type dropdown).
router.get(   '/order-types',               requireAnyAccess('workshop_settings:view', 'workshop_jobs:view'), wc.getOrderTypes);
router.post(  '/order-types',               requirePerm('workshop_settings', 'insert'),  wc.saveOrderType);
router.delete('/order-types/:id',           requirePerm('workshop_settings', 'delete'),  wc.deleteOrderType);

// ── Job Cards (workshop_jobs) ──────────────────────────────────────────────
router.get(   '/job-cards',                 requirePerm('workshop_jobs', 'view'),        wc.getJobCards);
router.get(   '/job-cards/counts',          requirePerm('workshop_jobs', 'view'),        wc.getJobCardCounts);
router.get(   '/vehicle-history',           requirePerm('workshop_jobs', 'view'),        wc.getVehicleHistory);
// Cashier flows (Receive Payment / Depreciation payments) also need to
// look up a JC by its RO number and read its insurance balance without
// having full workshop_jobs view rights. Both are read-only.
router.get(   '/job-cards/resolve-ro',      requireAnyAccess('workshop_jobs:view', 'payments'), wc.resolveByRO);
router.get(   '/job-cards/:id/print-data',  requirePerm('workshop_jobs', 'view'),        wc.getJobCardPrintData);
// What the customer signed at the vehicle, and the walk-around video, reached
// from the job card rather than the tablet (owner ask 2026-09-25). Same
// permission as the job card itself — an advisor or cashier holds
// workshop_jobs, not workshop_tablet.
router.get(   '/job-cards/:id/signature/:signatureId', requirePerm('workshop_jobs', 'view'), si.getJobCardSignatureImage);
router.get(   '/job-cards/:id/media/:mediaId/ticket',  requirePerm('workshop_jobs', 'view'), si.getJobCardMediaTicket);

// QC Inspection Checksheet, worked through before the car is handed back
// (owner ask 2026-09-25). Record only -- nothing here is called from the
// finalize path, so an unfinished sheet never strands a job card.
//
// Filling one goes with the job card; editing the list of points is a
// workshop setting, so the two sit behind different permissions.
router.get(   '/qc/points',               requireAnyAccess('workshop_jobs:view', 'workshop_settings:view'), qc.listPoints);
router.post(  '/qc/points',               requirePerm('workshop_settings', 'edit'), qc.createPoint);
router.put(   '/qc/points/:id',           requirePerm('workshop_settings', 'edit'), qc.updatePoint);
router.delete('/qc/points/:id',           requirePerm('workshop_settings', 'edit'), qc.retirePoint);

router.get(   '/job-cards/:id/qc',        requirePerm('workshop_jobs', 'view'), qc.listForJobCard);
router.post(  '/job-cards/:id/qc',        requirePerm('workshop_jobs', 'edit'), qc.startForJobCard);
router.get(   '/qc/:inspectionId',        requirePerm('workshop_jobs', 'view'), qc.getInspection);
router.put(   '/qc/:inspectionId',        requirePerm('workshop_jobs', 'edit'), qc.saveResults);
router.get(   '/job-cards/:id/invoice-data', requirePerm('workshop_jobs', 'view'),       wc.getJobCardInvoiceData);
router.get(   '/job-cards/:id',             requirePerm('workshop_jobs', 'view'),        wc.getJobCardById);
router.post(  '/job-cards',                 requirePerm('workshop_jobs', 'insert'),      wc.saveJobCard);
router.patch( '/job-cards/:id/status',      requirePerm('workshop_jobs', 'edit'),        wc.updateJobStatus);
router.get(   '/job-cards/:id/navigation',  requirePerm('workshop_jobs', 'view'),        wc.getNavigation);
router.post(  '/job-cards/:id/damage-marks',requirePerm('workshop_jobs', 'edit'),        wc.saveDamageMarks);

// Insurance handling on JC — treated as JC edits
router.get(   '/job-cards/:id/insurance',   requireAnyAccess('workshop_jobs:view', 'payments'), wc.getJobCardInsurance);
router.post(  '/job-cards/:id/insurance',   requirePerm('workshop_jobs', 'edit'),        wc.saveJobCardInsurance);
// Depreciation receipt is a payment operation, not a JC edit. Cashiers
// have `payments` (workflow) but usually NOT workshop_jobs:edit. Accept
// either so a cashier can record the depreciation cash while an advisor
// / manager with JC-edit rights can also still trigger it.
router.post(  '/job-cards/:id/depreciation-payments', requireAnyAccess('payments', 'workshop_jobs:edit'), wc.recordDepreciationPayment);

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
router.get(   '/parts-issue/list',          requirePerm('workshop_parts_issue', 'view'),   wc.getPartsIssueList);
router.post(  '/parts-issue',               requirePerm('workshop_parts_issue', 'insert'), wc.issuePartsToJobCard);
// Delete a single line from an issue (and reverse just that line's stock-out)
// — only allowed while the underlying Job Card is NOT finalized. The issue
// header is also removed if its last line is deleted.
router.patch( '/parts-issue/line/:detailId', requirePerm('workshop_parts_issue', 'edit'),   wc.updatePartsIssueLine);
router.delete('/parts-issue/line/:detailId', requirePerm('workshop_parts_issue', 'delete'), wc.deletePartsIssueLine);

// ── RO & Doc Counters (workshop_settings — admin tweak) ────────────────────
router.get(   '/ro-counters',               requirePerm('workshop_settings', 'view'),    wc.getROCounters);
router.put(   '/ro-counters/:CardCode',     requirePerm('workshop_settings', 'edit'),    wc.updateROCounter);
router.get(   '/doc-counters',              requirePerm('workshop_settings', 'view'),    wc.getDocCounters);
router.put(   '/doc-counters/:DocType',     requirePerm('workshop_settings', 'edit'),    wc.updateDocCounter);

module.exports = router;
