const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceIntakeController');
const workshop = require('../controllers/workshopController');
const requisitions = require('../controllers/partsRequisitionController');
const bayScreens = require('../controllers/bayScreenController');
const accounts = require('../controllers/accountController');
const qc = require('../controllers/qcInspectionController');
const jobCards = require('../controllers/serviceJobCardsController');
const { requireAccess } = require('../middleware/permissions');
const { uploadDiagnostic, uploadServiceMedia, withUploadErrors } = require('../middleware/serviceMediaUpload');

// Service tablet app. The public reachability check (/ping) is registered in
// server.js ahead of the auth middleware; everything here needs a signed-in
// user holding workshop_tablet.
//
// On the upload routes the permission check runs BEFORE multer, so an
// unauthorised request is refused before a single byte reaches disk.
const tablet = requireAccess('workshop_tablet');

// Signature PNGs arrive as multipart; a refused upload answers in JSON.
const signatureUpload = (req, res, next) => c.signatureUpload(req, res, (err) => {
    if (!err) return next();
    const tooBig = err.code === 'LIMIT_FILE_SIZE';
    res.status(tooBig ? 413 : 400).json({ error: tooBig ? 'The signature image is too large.' : err.message });
});

// Phase 0 — diagnostics
router.post('/diagnostics/upload', tablet, withUploadErrors(uploadDiagnostic.single('video')), c.diagnosticsUpload);

// Phase 1 — lookups. Customer search, a customer's vehicles and the bay list
// are read-only and served by the desk's own handlers; adding goes through
// wrappers that can only insert, never edit.
router.get(   '/lookups/job-types',               tablet, c.lookupJobTypes);
router.get(   '/lookups/bays',                    tablet, workshop.getBays);
// Who to charge on Credit, and where the money lands on Bank Transfer (owner
// ask 2026-09-25). Both are the desk's own read-only handlers, so the tablet
// and the desk form offer exactly the same lists.
router.get(   '/lookups/parties',                 tablet, workshop.getParties);
router.get(   '/lookups/banks',                   tablet, accounts.getBanks);
router.get(   '/catalog',                         tablet, c.searchCatalog);
router.get(   '/customers',                       tablet, workshop.getCustomers);
router.post(  '/customers',                       tablet, c.createCustomer);
router.get(   '/customers/:id/vehicles',          tablet, workshop.getCustomerVehicles);
router.post(  '/customers/:id/vehicles',          tablet, c.addVehicle);
router.post(  '/customers/:id/missing-details',   tablet, c.fillMissingCustomerDetails);

// Phase 1 — estimates
router.get(   '/estimates',                       tablet, c.listEstimates);
router.post(  '/estimates',                       tablet, c.createEstimate);
router.get(   '/estimates/:id',                   tablet, c.getEstimate);
router.get(   '/estimates/:id/print-data',        tablet, c.getEstimatePrintData);
router.put(   '/estimates/:id',                   tablet, c.updateEstimate);
router.post(  '/estimates/:id/cancel',            tablet, c.cancelEstimate);
router.post(  '/estimates/:id/media',             tablet, withUploadErrors(uploadServiceMedia.single('media')), c.uploadEstimateMedia);
router.delete('/estimates/:id/media/:mediaId',    tablet, c.deleteEstimateMedia);

// Phase 2 — the customer's signature opens the job card
router.post(  '/estimates/:id/sign',              tablet, signatureUpload, c.signEstimate);
router.get(   '/estimates/:id/signature',         tablet, c.getSignatureImage);

// Watching a walk-around video. The ticket is issued here, to a signed-in
// user; the stream itself is mounted in server.js ahead of the auth
// middleware, because a <video> tag cannot send an Authorization header.
router.get(   '/media/:mediaId/ticket',           tablet, c.getMediaTicket);

// Phase 3 — parts counter: requisitions from signed estimates
const counter = requireAccess('parts_requisition');
router.get(   '/requisitions',                    counter, requisitions.listRequisitions);
router.get(   '/requisitions/:id',                counter, requisitions.getRequisition);
router.post(  '/requisitions/:id/issue',          counter, requisitions.issueRequisition);
router.post(  '/requisitions/:id/cancel',         counter, requisitions.cancelRequisition);

// Phase 3 — bay screen devices. The screens themselves call /api/bay-screen
// with a device token (routes/bayScreenRoutes.js).
const bayAdmin = requireAccess('workshop_bay_screen');
router.get(   '/bay-devices/bays',                bayAdmin, workshop.getBays);
router.get(   '/bay-devices',                     bayAdmin, bayScreens.listDevices);
router.post(  '/bay-devices',                     bayAdmin, bayScreens.registerDevice);
router.post(  '/bay-devices/:id/revoke',          bayAdmin, bayScreens.revokeDevice);

// Phase 4 — job cards opened on the tablet. Only job cards that came from a
// signed tablet estimate are reachable (tabletJobCardOnly).
const tabletJobCard = [tablet, jobCards.tabletJobCardOnly];
router.get(   '/job-cards',                       tablet, jobCards.listJobCards);
router.get(   '/job-cards/:id',                   ...tabletJobCard, jobCards.getJobCard);
router.post(  '/job-cards/:id/additional-work',   ...tabletJobCard, jobCards.startAdditionalWork);
router.post(  '/job-cards/:id/finalize',          tablet, requireAccess('finalize'), jobCards.tabletJobCardOnly, jobCards.finalizeJobCard);
router.post(  '/job-cards/:id/dms-number',        ...tabletJobCard, jobCards.setDmsNumber);
router.get(   '/job-cards/:id/print-data',        ...tabletJobCard, workshop.getJobCardPrintData);
// The same signature and walk-around video from the job card, so the tablet's
// own copy of the work-order print and its job card screen can show them.
router.get(   '/job-cards/:id/signature/:signatureId', ...tabletJobCard, c.getJobCardSignatureImage);
router.get(   '/job-cards/:id/media/:mediaId/ticket',  ...tabletJobCard, c.getJobCardMediaTicket);

// The QC checksheet at delivery, from the tablet. The points list is read-only
// here -- editing it is a workshop setting, done at a desk.
// Ordered before '/qc/:inspectionId' so "points" is never read as an id.
router.get(   '/qc/points',                       tablet, qc.listPoints);
router.get(   '/job-cards/:id/qc',                ...tabletJobCard, qc.listForJobCard);
router.post(  '/job-cards/:id/qc',                ...tabletJobCard, qc.startForJobCard);
router.get(   '/qc/:inspectionId',                tablet, qc.getInspection);
router.put(   '/qc/:inspectionId',                tablet, qc.saveResults);
router.get(   '/job-cards/:id/insurance',         ...tabletJobCard, workshop.getJobCardInsurance);

module.exports = router;
