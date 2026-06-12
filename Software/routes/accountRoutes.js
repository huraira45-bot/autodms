const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');

router.get('/coa', accountController.getCOA);
router.post('/coa', accountController.addAccount);
router.get('/banks', accountController.getBanks);
router.get('/bank-configs', accountController.getBankConfigs);
router.patch('/banks/:glcaid/toggle', accountController.toggleBank);
router.patch('/banks/:glcaid/config', accountController.updateBankConfig);
router.get('/voucher-types', accountController.getVoucherTypes);
router.post('/vouchers', accountController.saveVoucher);
router.get('/vouchers/drafts', accountController.getDraftVouchers);
router.get('/vouchers/search', accountController.searchVouchers);
router.get('/vouchers/:id', accountController.getVoucher);
router.put('/vouchers/:id', accountController.updateVoucher);
router.delete('/vouchers/:id', accountController.deleteVoucher);

module.exports = router;
