const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/inventoryConfigController');

router.get('/categories', ctrl.getCategories);
router.post('/categories', ctrl.createCategory);

router.get('/brands', ctrl.getBrands);
router.post('/brands', ctrl.createBrand);

router.get('/uoms', ctrl.getUOMs);
router.post('/uoms', ctrl.createUOM);

router.get('/warehouses', ctrl.getWarehouses);
router.post('/warehouses', ctrl.createWarehouse);

module.exports = router;
