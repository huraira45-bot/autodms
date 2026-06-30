const router = require('express').Router();
const auth = require('../middleware/auth');
const c = require('../controllers/permissionController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

router.use(auth);

// Modules list + registry are needed by both permissions admin AND by any page
// that wants to render a permission picker → allow either admin module.
router.get('/modules',                requireAnyAccess('admin_permissions:view','admin_users:view'), c.getModules);
router.get('/permission-registry',    requireAnyAccess('admin_permissions:view','admin_users:view'), c.getPermissionRegistry);

// Roles management
router.get(   '/roles',                              requirePerm('admin_permissions', 'view'),   c.getRoles);
router.post(  '/roles',                              requirePerm('admin_permissions', 'insert'), c.createRole);
router.delete('/roles/:groupId',                     requirePerm('admin_permissions', 'delete'), c.deleteRole);
router.get(   '/roles/:groupId/permissions',         requirePerm('admin_permissions', 'view'),   c.getRolePermissions);
router.put(   '/roles/:groupId/permissions',         requirePerm('admin_permissions', 'edit'),   c.setRolePermissions);

// Users management
router.get( '/users',                                requirePerm('admin_users', 'view'),    c.getUsers);
router.post('/users',                                requirePerm('admin_users', 'insert'),  c.createUser);
router.put( '/users/:userId',                        requirePerm('admin_users', 'edit'),    c.updateUser);
router.put( '/users/:userId/reset-password',         requirePerm('admin_users', 'edit'),    c.resetPassword);

module.exports = router;
