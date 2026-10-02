const express = require('express');
const router = express.Router();
const saleController = require('../controllers/saleController');
const { requirePerm, requireAccess } = require('../middleware/permissions');

router.get( '/',               requirePerm('sales_store', 'view'),   saleController.getSales);
router.get( '/:id/print-data', requirePerm('sales_store', 'view'),   saleController.getStoreSalePrintData);
router.get( '/:id',            requirePerm('sales_store', 'view'),   saleController.getStoreSaleById);
router.post('/',               requirePerm('sales_store', 'insert'), saleController.saveStoreSale);
router.put( '/:id',            requirePerm('sales_store', 'edit'),   saleController.updateStoreSale);

// Admin-only: drop the auto-finalize lock so the sale can be edited.
// Reverses the SS voucher (and any auto-settle CRV), flips IsFinalized=0.
// Unfinalizing a store sale goes through the same request-and-approve road as
// a job card (owner ask 2026-10-02). This endpoint let one person undo a
// finalized sale alone, and it DELETED the vouchers rather than reversing
// them -- including party-ledger rows allocated to it, which are the record
// of money the customer had already paid.
//
// Kept, refusing, rather than removed: an older browser tab still pointing at
// it should be told where to go, not get a 404.
router.post('/:id/unfinalize', requireAccess('admin_unfinalize'), (req, res) => res.status(410).json({
    error: 'Store sales are unfinalized through the approval process now. '
         + 'Raise an unfinalize request on the sale, have the Account Manager approve it, '
         + 'then an admin completes it. That reverses the vouchers instead of deleting them.',
    use: `/api/finalize/STORE_SALE/${req.params.id}/request-unfinalize`,
}));

module.exports = router;
