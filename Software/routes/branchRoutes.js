const express = require('express');
const router = express.Router();
const branchController = require('../controllers/branchController');
const { requirePerm } = require('../middleware/permissions');

// Branches are admin-managed org data; lock to admin_users perms.
router.get( '/', requirePerm('admin_users', 'view'),   branchController.getBranches);
router.post('/', requirePerm('admin_users', 'insert'), branchController.createBranch);

module.exports = router;
