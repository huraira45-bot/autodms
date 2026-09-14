const express = require('express');
const router = express.Router();
const c = require('../controllers/serviceIntakeController');
const workshop = require('../controllers/workshopController');
const { requireAccess } = require('../middleware/permissions');
const { uploadDiagnostic, uploadServiceMedia, withUploadErrors } = require('../middleware/serviceMediaUpload');

// Service tablet app. The public reachability check (/ping) is registered in
// server.js ahead of the auth middleware; everything here needs a signed-in
// user holding workshop_tablet.
//
// On the upload routes the permission check runs BEFORE multer, so an
// unauthorised request is refused before a single byte reaches disk.
const tablet = requireAccess('workshop_tablet');

// Phase 0 — diagnostics
router.post('/diagnostics/upload', tablet, withUploadErrors(uploadDiagnostic.single('video')), c.diagnosticsUpload);

// Phase 1 — lookups. Customer search and a customer's vehicles are read-only
// and served by the desk's own handlers; adding goes through wrappers that
// can only insert, never edit.
router.get(   '/lookups/job-types',               tablet, c.lookupJobTypes);
router.get(   '/catalog',                         tablet, c.searchCatalog);
router.get(   '/customers',                       tablet, workshop.getCustomers);
router.post(  '/customers',                       tablet, c.createCustomer);
router.get(   '/customers/:id/vehicles',          tablet, workshop.getCustomerVehicles);
router.post(  '/customers/:id/vehicles',          tablet, c.addVehicle);

// Phase 1 — estimates
router.get(   '/estimates',                       tablet, c.listEstimates);
router.post(  '/estimates',                       tablet, c.createEstimate);
router.get(   '/estimates/:id',                   tablet, c.getEstimate);
router.get(   '/estimates/:id/print-data',        tablet, c.getEstimatePrintData);
router.put(   '/estimates/:id',                   tablet, c.updateEstimate);
router.post(  '/estimates/:id/cancel',            tablet, c.cancelEstimate);
router.post(  '/estimates/:id/media',             tablet, withUploadErrors(uploadServiceMedia.single('media')), c.uploadEstimateMedia);
router.delete('/estimates/:id/media/:mediaId',    tablet, c.deleteEstimateMedia);

module.exports = router;
