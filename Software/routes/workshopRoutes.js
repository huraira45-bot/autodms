const express = require('express');
const router = express.Router();
const wc = require('../controllers/workshopController');

// Customers
router.get('/customers', wc.getCustomers);
router.get('/customers/:id', wc.getCustomerById);
router.post('/customers', wc.saveCustomer);
router.get('/customers/:id/vehicles', wc.getCustomerVehicles);
router.post('/customers/:id/vehicles', wc.addCustomerVehicle);

// Parties (for Credit jobs)
router.get('/parties', wc.getParties);

// Job Types (Business Types)
router.get('/job-types', wc.getJobCardTypes);
router.post('/job-types', wc.saveJobCardType);
router.delete('/job-types/:id', wc.deleteJobCardType);
router.patch('/job-types/:id/manager', wc.setJobCardTypeManager);

// Order Types
router.get('/order-types', wc.getOrderTypes);
router.post('/order-types', wc.saveOrderType);
router.delete('/order-types/:id', wc.deleteOrderType);

// Job Cards
router.get('/job-cards', wc.getJobCards);
router.get('/job-cards/resolve-ro', wc.resolveByRO);  // BEFORE /:id so the literal route wins
router.get('/job-cards/:id', wc.getJobCardById);
router.post('/job-cards', wc.saveJobCard);
router.patch('/job-cards/:id/status', wc.updateJobStatus);
router.get('/job-cards/:id/navigation', wc.getNavigation);
router.post('/job-cards/:id/damage-marks', wc.saveDamageMarks);

// Birthdays
router.get('/birthdays', wc.getBirthdays);

// Job Controller
router.get('/job-controller', wc.getTodayJobs);
router.get('/job-controller/:id/detail', wc.getJobControllerDetail);
router.patch('/job-controller/:id/status', wc.updateWorkshopStatus);
router.patch('/job-controller/detail/:detailId/assign', wc.updateLabourAssignment);
router.get('/bays', wc.getBays);
router.get('/bays/all', wc.getAllBays);
router.post('/bays', wc.saveBay);
router.put('/bays/:id', wc.saveBay);
router.delete('/bays/:id', wc.deleteBay);

// Sublet Repairs
router.get('/sublets', wc.getSublets);
router.post('/sublets', wc.saveSublet);
router.delete('/sublets/:id', wc.deleteSublet);

// Parts Issue
router.get('/parts-issue', wc.getPartsIssues);
router.post('/parts-issue', wc.issuePartsToJobCard);

// RO & Doc Counters (admin)
router.get('/ro-counters', wc.getROCounters);
router.put('/ro-counters/:CardCode', wc.updateROCounter);
router.get('/doc-counters', wc.getDocCounters);
router.put('/doc-counters/:DocType', wc.updateDocCounter);

module.exports = router;
