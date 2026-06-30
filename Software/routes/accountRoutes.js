const express = require('express');
const router = express.Router();
const accountController = require('../controllers/accountController');
const { requirePerm, requireAnyAccess } = require('../middleware/permissions');

// Chart of Accounts (finance_coa). The COA picker is used by MANY pages
// (employee form, party-coa-link, voucher entry…), so the GET is allowed for
// any role that needs to look up an account.
router.get(  '/coa',           requireAnyAccess(
                                  'finance_coa:view', 'finance_vouchers:view',
                                  'crm_parties:view',  'hr_employees:view',
                                  'accounting_setup:view', 'payments',
                                ), accountController.getCOA);
router.post( '/coa',           requirePerm('finance_coa', 'insert'),  accountController.addAccount);

// Banks (under accounting_setup)
router.get(  '/banks',          requireAnyAccess('accounting_setup:view', 'finance_vouchers:view', 'payments', 'finance_cheques'), accountController.getBanks);
router.get(  '/bank-configs',   requirePerm('accounting_setup', 'view'),  accountController.getBankConfigs);
router.patch('/banks/:glcaid/toggle',  requirePerm('accounting_setup', 'edit'), accountController.toggleBank);
router.patch('/banks/:glcaid/config',  requirePerm('accounting_setup', 'edit'), accountController.updateBankConfig);

// Vouchers (finance_vouchers)
router.get(   '/voucher-types',     requirePerm('finance_vouchers', 'view'),   accountController.getVoucherTypes);
router.post(  '/vouchers',          requirePerm('finance_vouchers', 'insert'), accountController.saveVoucher);
router.get(   '/vouchers/drafts',   requirePerm('finance_vouchers', 'view'),   accountController.getDraftVouchers);
router.get(   '/vouchers/search',   requirePerm('finance_vouchers', 'view'),   accountController.searchVouchers);
router.get(   '/vouchers/:id',      requirePerm('finance_vouchers', 'view'),   accountController.getVoucher);
router.put(   '/vouchers/:id',      requirePerm('finance_vouchers', 'edit'),   accountController.updateVoucher);
router.delete('/vouchers/:id',      requirePerm('finance_vouchers', 'delete'), accountController.deleteVoucher);

module.exports = router;
