const express = require('express');
const router = express.Router();
const partyController = require('../controllers/partyController');
const { requirePerm, requireAccess, requireAnyAccess } = require('../middleware/permissions');

// The party list is used by JC create, GRN, GRTN, payments, etc., so the GET
// allows anyone with the relevant business module too.
router.get( '/',                          requireAnyAccess(
                                              'crm_parties:view', 'workshop_jobs:view',
                                              'procurement_grn:view', 'procurement_grtn:view',
                                              'sales_store:view',     'sales_ssr:view',
                                              'payments', 'finance_vouchers:view',
                                          ), partyController.getParties);

router.post('/',                          requirePerm('crm_parties', 'insert'), partyController.createParty);
router.get( '/groups',                    requirePerm('crm_parties', 'view'),   partyController.getPartyGroups);
router.get( '/coa-pickable',              requirePerm('crm_parties', 'view'),   partyController.listPickableAccounts);

// Business-access matrix — a sub-permission of its own
router.get( '/business-access',           requireAccess('crm_party_access'),    partyController.getBusinessAccessMatrix);
router.post('/business-access',           requireAccess('crm_party_access'),    partyController.savePartyBusinessAccess);
router.post('/business-access/grant-all', requireAccess('crm_party_access'),    partyController.grantAllPartyBusinessAccess);

router.get( '/:id',                       requirePerm('crm_parties', 'view'),   partyController.getParty);
router.put( '/:id',                       requirePerm('crm_parties', 'edit'),   partyController.updateParty);

module.exports = router;
