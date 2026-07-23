const express = require('express');
const router = express.Router();
const c = require('../controllers/careOffElevationController');

// All routes sit behind the app-level authMiddleware. Permission checks
// happen inside the controller (careoff_request_elevation for create;
// careoff_approve_elevation for approve/reject; either one for list).
router.get('/',              c.list);
router.get('/for-jc/:id',    c.forJC);
router.post('/',             c.create);
router.patch('/:id/approve', c.approve);
router.patch('/:id/reject',  c.reject);

module.exports = router;
