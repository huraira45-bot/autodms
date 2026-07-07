/**
 * Paint Lab — routes (Phase 0: master data + settings).
 *
 * GRN, GRTN, and Issue routes ship in follow-up phases and mount at
 * /api/paint/grn, /api/paint/grtn, /api/paint/issue respectively.
 */
const express = require('express');
const router = express.Router();
const c = require('../controllers/paintLabController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Read-broad, write-narrow. Anyone with any Paint Lab view perm can list
// the master lookups so pickers work across screens.
const ANY_PAINT_VIEW = [
    'paint_lab_dashboard:view', 'paint_lab_items:view',
    'paint_lab_grn:view', 'paint_lab_grtn:view',
    'paint_lab_issue:view', 'paint_lab_reports:view',
    'paint_lab_settings:view',
];

// ── UOM ────────────────────────────────────────────────────────
router.get(   '/uom',       requireAnyAccess(...ANY_PAINT_VIEW),               c.uomList);
router.post(  '/uom',       requirePerm('paint_lab_settings', 'insert'),       c.uomCreate);
router.delete('/uom/:id',   requirePerm('paint_lab_settings', 'delete'),       c.uomDelete);

// ── Categories ────────────────────────────────────────────────
router.get(   '/categories',     requireAnyAccess(...ANY_PAINT_VIEW),          c.categoryList);
router.post(  '/categories',     requirePerm('paint_lab_settings', 'insert'),  c.categoryCreate);
router.delete('/categories/:id', requirePerm('paint_lab_settings', 'delete'),  c.categoryDelete);

// ── Brands ────────────────────────────────────────────────────
router.get(   '/brands',       requireAnyAccess(...ANY_PAINT_VIEW),            c.brandList);
router.post(  '/brands',       requirePerm('paint_lab_settings', 'insert'),    c.brandCreate);
router.delete('/brands/:id',   requirePerm('paint_lab_settings', 'delete'),    c.brandDelete);

// ── Warehouses ────────────────────────────────────────────────
router.get(   '/warehouses',       requireAnyAccess(...ANY_PAINT_VIEW),        c.warehouseList);
router.post(  '/warehouses',       requirePerm('paint_lab_settings', 'insert'), c.warehouseCreate);
router.delete('/warehouses/:id',   requirePerm('paint_lab_settings', 'delete'), c.warehouseDelete);

// ── Paint Item master ─────────────────────────────────────────
router.get( '/items',      requireAnyAccess(...ANY_PAINT_VIEW),           c.itemList);
router.post('/items',      requirePerm('paint_lab_items', 'insert'),      c.itemCreate);
router.put( '/items/:id',  requirePerm('paint_lab_items', 'edit'),        c.itemUpdate);
// Alternate units per item — used by GRN/Issue UoM pickers + item form.
router.get( '/item-uoms',      requireAnyAccess(...ANY_PAINT_VIEW),       c.itemUomAll);
router.get( '/items/:id/uoms', requireAnyAccess(...ANY_PAINT_VIEW),       c.itemUomList);
router.put( '/items/:id/uoms', requirePerm('paint_lab_items', 'edit'),    c.itemUomReplace);

// ── Settings: allowed JC business types + system-account status ──
router.get( '/settings/business-types',      requireAnyAccess(...ANY_PAINT_VIEW),          c.allowedBusinessTypesList);
router.put( '/settings/business-types',      requirePerm('paint_lab_settings', 'edit'),    c.allowedBusinessTypesReplace);
router.get( '/settings/setup-status',        requireAnyAccess(...ANY_PAINT_VIEW),          c.setupStatus);

module.exports = router;
