/**
 * Sales Module — main router for /api/sales/*
 *
 * Sub-routers / controllers are mounted here. Permission gates apply per
 * locked decisions in .claude/planning/sales-module-design.md §2.
 */
const express = require('express');
const router = express.Router();
const cat = require('../controllers/salesCatalogController');
const bk  = require('../controllers/salesBookingController');
const lc  = require('../controllers/salesLifecycleController');
const inc = require('../controllers/salesIncentiveController');
const doc = require('../controllers/salesDocumentController');
const iq  = require('../controllers/salesInquiryController');
const { uploadSalesDoc } = require('../middleware/salesUpload');

const requireAny = (...keys) => (req, res, next) => {
    if (req.user?.modules?.some(m => keys.includes(m))) return next();
    return res.status(403).json({ error: `Access denied: one of (${keys.join(', ')}) required.` });
};

// Read permissions: anyone in the sales chain or settings/reports
const SALES_READERS = ['sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_settings', 'sales_master_settlement', 'sales_reports'];

// =========================================================================
// Vehicle Catalog — Models / Variants / Vehicles
// Read: any sales-side role. Write: sales_admin_settings.
// Vehicle status flips (Receive at dealer): sales_master_settlement.
// =========================================================================

// Models
router.get(   '/models',           requireAny(...SALES_READERS),       cat.listModels);
router.get(   '/models/:id',       requireAny(...SALES_READERS),       cat.getModel);
router.post(  '/models',           requireAny('sales_admin_settings'), cat.createModel);
router.put(   '/models/:id',       requireAny('sales_admin_settings'), cat.updateModel);
router.delete('/models/:id',       requireAny('sales_admin_settings'), cat.deleteModel);

// Variants
router.get(   '/variants',         requireAny(...SALES_READERS),       cat.listVariants);
router.get(   '/variants/:id',     requireAny(...SALES_READERS),       cat.getVariant);
router.post(  '/variants',         requireAny('sales_admin_settings'), cat.createVariant);
router.put(   '/variants/:id',     requireAny('sales_admin_settings'), cat.updateVariant);
router.delete('/variants/:id',     requireAny('sales_admin_settings'), cat.deleteVariant);

// Vehicles
router.get(   '/vehicles',         requireAny(...SALES_READERS),       cat.listVehicles);
router.get(   '/vehicles/:id',     requireAny(...SALES_READERS),       cat.getVehicle);
router.post(  '/vehicles',         requireAny('sales_admin_settings', 'sales_master_settlement'), cat.createVehicle);
router.put(   '/vehicles/:id',     requireAny('sales_admin_settings', 'sales_master_settlement'), cat.updateVehicle);
router.delete('/vehicles/:id',     requireAny('sales_admin_settings'), cat.deleteVehicle);

// =========================================================================
// Bookings — create/list/get/cancel
// Create: sales_executive (or anyone with the role + a LinkedEmployeeID)
// Read:   any sales-side role
// Cancel: same as create, plus sales_admin_pricing
// =========================================================================
router.get(   '/bookings',                 requireAny(...SALES_READERS),       bk.listBookings);
router.get(   '/bookings/:id',             requireAny(...SALES_READERS),       bk.getBooking);
router.post(  '/bookings',                 requireAny('sales_executive', 'sales_agm', 'sales_gm'), bk.createBooking);
router.post(  '/bookings/:id/cancel',      requireAny('sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_pricing'), bk.cancelBooking);

// Payments against a booking — Direct or PayOrder path. Multipart: file field 'proof' required.
router.get(   '/bookings/:id/payments',    requireAny(...SALES_READERS),       bk.listPayments);
router.post(  '/bookings/:id/payments',    requireAny('sales_executive', 'sales_agm', 'sales_gm'),
              uploadSalesDoc.single('proof'),
              bk.recordPayment);

// Cancellation 3-step finalization loop
router.get(   '/cancellations',                       requireAny(...SALES_READERS, 'am_approve', 'admin_unfinalize'), bk.listCancellations);
router.post(  '/cancellations/:id/am-approve',        requireAny('am_approve'), bk.amApproveCancellation);
router.post(  '/cancellations/:id/am-reject',         requireAny('am_approve'), bk.amRejectCancellation);
router.post(  '/cancellations/:id/admin-execute',     requireAny('admin_unfinalize', 'sales_admin_settings'), bk.adminExecuteCancellation);
router.post(  '/cancellations/:id/withdraw',          requireAny('sales_executive', 'sales_agm', 'sales_gm'), bk.withdrawCancellation);

// Booking documents (PBO, CNIC, AuthorityLetter, Other) — separate from payment proof
router.get( '/bookings/:id/documents',               requireAny(...SALES_READERS), doc.listForBooking);
router.post('/bookings/:id/documents',               requireAny('sales_executive', 'sales_agm', 'sales_gm'),
            uploadSalesDoc.single('file'), doc.upload);
router.delete('/bookings/:id/documents/:docId',      requireAny('sales_agm', 'sales_gm', 'sales_admin_settings'), doc.remove);

// Lifecycle — allocation, Master invoice posting, delivery, gate pass
router.get( '/bookings/:id/allocation-readiness',    requireAny(...SALES_READERS), lc.allocationReadiness);
router.post('/bookings/:id/allocate',                requireAny('sales_agm', 'sales_gm', 'sales_admin_settings'), lc.allocateVehicle);
router.post('/bookings/:id/unallocate',              requireAny('sales_agm', 'sales_gm'), lc.unallocateVehicle);
router.post('/bookings/:id/post-master-invoice',     requireAny('sales_master_settlement'), lc.postMasterInvoice);
router.get( '/bookings/:id/delivery-readiness',      requireAny(...SALES_READERS), lc.deliveryReadiness);
router.post('/bookings/:id/enable-partial-delivery', requireAny('sales_gm'), lc.enablePartialDelivery);
router.post('/bookings/:id/finance-cosign',          requireAny('sales_admin_settings'), lc.financeCoSignPartial);  // proxy for Finance Head — wire to real finance role when HR adds it
router.post('/bookings/:id/issue-gate-pass',         requireAny('sales_agm', 'sales_gm', 'sales_admin_settings'), lc.issueGatePass);

// Sales-side inquiry queue (from CRO inquiries with Category='ProductInfo')
router.get(  '/inquiries',                  requireAny(...SALES_READERS), iq.list);
router.post( '/inquiries/:id/assign',       requireAny('sales_agm', 'sales_gm', 'sales_admin_settings'), iq.assign);
router.post( '/inquiries/:id/drop',         requireAny('sales_agm', 'sales_gm', 'sales_admin_settings'), iq.drop);
router.post( '/inquiries/:id/close',        requireAny('sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_settings'), iq.close);

// Negotiation queue
router.get(   '/negotiations',             requireAny('sales_admin_pricing', 'sales_gm', 'sales_reports'), bk.listNegotiations);
router.post(  '/negotiations/:id/approve', requireAny('sales_admin_pricing'),  bk.approveNegotiation);
router.post(  '/negotiations/:id/reject',  requireAny('sales_admin_pricing'),  bk.rejectNegotiation);

// =========================================================================
// Sales incentive policies / assignments / accruals / disbursement
// =========================================================================
router.get(   '/incentive-policies',                requireAny('sales_admin_settings', 'sales_gm', 'sales_reports'), inc.listPolicies);
router.get(   '/incentive-policies/:id',            requireAny('sales_admin_settings', 'sales_gm', 'sales_reports'), inc.getPolicy);
router.post(  '/incentive-policies',                requireAny('sales_admin_settings'), inc.createPolicy);
router.put(   '/incentive-policies/:id',            requireAny('sales_admin_settings'), inc.updatePolicy);
router.delete('/incentive-policies/:id',            requireAny('sales_admin_settings'), inc.deletePolicy);

router.get(   '/incentive-assignments',             requireAny('sales_admin_settings', 'sales_gm', 'sales_reports'), inc.listAssignments);
router.post(  '/incentive-assignments',             requireAny('sales_admin_settings'), inc.createAssignment);
router.post(  '/incentive-assignments/:id/deactivate', requireAny('sales_admin_settings'), inc.deactivateAssignment);

router.get(   '/incentives/balances',               requireAny('sales_admin_settings', 'sales_gm', 'sales_reports'), inc.balances);
router.get(   '/incentives/accruals',               requireAny('sales_admin_settings', 'sales_gm', 'sales_reports'), inc.listAccruals);
router.post(  '/incentives/disburse',               requireAny('sales_admin_settings'), inc.disburse);

module.exports = router;
