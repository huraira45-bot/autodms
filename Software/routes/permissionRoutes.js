const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/permissionController');

router.use(auth);

router.get('/modules', c.getModules);
router.get('/roles', c.getRoles);
router.post('/roles', c.createRole);
router.get('/roles/:groupId/permissions', c.getRolePermissions);
router.put('/roles/:groupId/permissions', c.setRolePermissions);
router.get('/users', c.getUsers);
router.post('/users', c.createUser);
router.put('/users/:userId', c.updateUser);
router.put('/users/:userId/reset-password', c.resetPassword);

module.exports = router;
