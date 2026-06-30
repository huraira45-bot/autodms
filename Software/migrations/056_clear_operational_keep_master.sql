-- 056_clear_operational_keep_master.sql
-- Owner-requested operational wipe (2026-07-01). Targeted reset that
-- preserves the master + config data the dealership has invested time
-- in setting up.
--
-- KEEP:
--   * Chart of Accounts (GLChartOFAccount)
--   * Employees (gen_EmployeeInfo) and their logins (GLUser, GLUserGroup,
--     dms_ModulePermissions)
--   * Job Card settings (gen_JobCardType, gen_OrderType, gen_JobInfo,
--     dms_ROCounters)
--   * Accounting setup (dms_SystemAccounts, gen_TaxInfo, dms_TaxRates,
--     gen_BankInformation)
--   * Bank accounts (dms_BankAccounts)
--   * Parties (gen_PartiesInfo + linked subsidiary records)
--   * Reference data (InventWareHouse, InventCategory, InventItemBrands,
--     InventUOM, dms_AccessoriesMaster, dms_CareOff)
--   * HR config (gen_DepartmentInfo, gen_DesignationInfo)
--
-- WIPE:
--   * InventItems (parts catalog — explicit owner instruction)
--   * All transactional data: Job Cards (+children), GRN, GRTN, Store Sale,
--     SSR, Vouchers (+details), dms_PartyLedger, Stock arrivals/movements,
--     Payments, Cheques, Sales Bookings, Vehicles, CRO data, etc.
--
-- Strategy: disable all FK constraints, delete operational rows, re-enable
-- FKs with NOCHECK on existing rows (legacy tables may carry orphans that
-- pre-date this DMS install).

SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRAN wipe056;

PRINT '--- BEFORE wipe: current rows ---';
SELECT 'Vouchers'              AS Tbl, COUNT(*) AS N FROM data_FinanceVoucherInfo
UNION ALL SELECT 'PartyLedger',          COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'Job Cards',            COUNT(*) FROM Addata_JobCardInfo
UNION ALL SELECT 'GRN',                  COUNT(*) FROM data_PurchaseInfo
UNION ALL SELECT 'GRTN',                 COUNT(*) FROM data_PurchaseReturnInfo
UNION ALL SELECT 'StoreSale',            COUNT(*) FROM data_StoreSaleInfo
UNION ALL SELECT 'SSR',                  COUNT(*) FROM data_StoreSaleReturnInfo
UNION ALL SELECT 'InventItems',          COUNT(*) FROM InventItems
UNION ALL SELECT '*** Parties (KEEP)',   COUNT(*) FROM gen_PartiesInfo
UNION ALL SELECT '*** Employees (KEEP)', COUNT(*) FROM gen_EmployeeInfo
UNION ALL SELECT '*** Warehouses (KEEP)',COUNT(*) FROM InventWareHouse
UNION ALL SELECT '*** COA (KEEP)',       COUNT(*) FROM GLChartOFAccount
UNION ALL SELECT '*** GLUser (KEEP)',    COUNT(*) FROM GLUser;

-- =========================================================================
-- Disable ALL foreign keys so we can delete in any order
-- =========================================================================
PRINT '--- Disabling all FK constraints ---';
EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL';

-- =========================================================================
-- DELETE operational tables (order no longer matters; FKs are disabled)
-- =========================================================================

-- VOUCHERS / LEDGER / CHEQUES / POS / UNFINALIZE
DELETE FROM dms_PartyLedger;
DELETE FROM data_FinanceVoucherDetail;
DELETE FROM data_FinanceVoucherInfo;
IF OBJECT_ID('dms_PendingCheques')         IS NOT NULL DELETE FROM dms_PendingCheques;
IF OBJECT_ID('dms_POSSettlementLines')     IS NOT NULL DELETE FROM dms_POSSettlementLines;
IF OBJECT_ID('dms_POSSettlements')         IS NOT NULL DELETE FROM dms_POSSettlements;
IF OBJECT_ID('dms_UnfinalizeRequests')     IS NOT NULL DELETE FROM dms_UnfinalizeRequests;

-- SALES MODULE
IF OBJECT_ID('dms_SalesRecoveryInstallments') IS NOT NULL DELETE FROM dms_SalesRecoveryInstallments;
IF OBJECT_ID('dms_SalesRecoveryPlans')        IS NOT NULL DELETE FROM dms_SalesRecoveryPlans;
IF OBJECT_ID('dms_SalesAuditLog')             IS NOT NULL DELETE FROM dms_SalesAuditLog;
IF OBJECT_ID('dms_BookingStateTransitions')   IS NOT NULL DELETE FROM dms_BookingStateTransitions;
IF OBJECT_ID('dms_MasterIncentiveReceipts')   IS NOT NULL DELETE FROM dms_MasterIncentiveReceipts;
IF OBJECT_ID('dms_SalesIncentiveAccruals')    IS NOT NULL DELETE FROM dms_SalesIncentiveAccruals;
IF OBJECT_ID('dms_SalesIncentiveAssignments') IS NOT NULL DELETE FROM dms_SalesIncentiveAssignments;
IF OBJECT_ID('dms_SalesIncentivePolicies')    IS NOT NULL DELETE FROM dms_SalesIncentivePolicies;
IF OBJECT_ID('dms_SalesTargets')              IS NOT NULL DELETE FROM dms_SalesTargets;
IF OBJECT_ID('dms_SalesHierarchyAssignments') IS NOT NULL DELETE FROM dms_SalesHierarchyAssignments;
IF OBJECT_ID('dms_NegotiationRequests')       IS NOT NULL DELETE FROM dms_NegotiationRequests;
IF OBJECT_ID('dms_SalesBookingCancellations') IS NOT NULL DELETE FROM dms_SalesBookingCancellations;
IF OBJECT_ID('dms_SalesDocuments')            IS NOT NULL DELETE FROM dms_SalesDocuments;
IF OBJECT_ID('dms_SalesPayments')             IS NOT NULL DELETE FROM dms_SalesPayments;
IF OBJECT_ID('dms_SalesCorpAuthorizedPersons') IS NOT NULL DELETE FROM dms_SalesCorpAuthorizedPersons;
IF OBJECT_ID('dms_SalesCustomerProfile')      IS NOT NULL DELETE FROM dms_SalesCustomerProfile;
IF OBJECT_ID('dms_GatePasses')                IS NOT NULL DELETE FROM dms_GatePasses;
IF OBJECT_ID('dms_SalesBookings')             IS NOT NULL DELETE FROM dms_SalesBookings;
IF OBJECT_ID('dms_MasterIncentiveCampaigns')  IS NOT NULL DELETE FROM dms_MasterIncentiveCampaigns;

-- JOB CARDS + child tables
IF OBJECT_ID('dms_DamageMarks')                       IS NOT NULL DELETE FROM dms_DamageMarks;
IF OBJECT_ID('dms_JobCardAccessories')                IS NOT NULL DELETE FROM dms_JobCardAccessories;
IF OBJECT_ID('dms_JobCardDepreciationPayments')       IS NOT NULL DELETE FROM dms_JobCardDepreciationPayments;
IF OBJECT_ID('dms_JobCardPartsDepreciation')          IS NOT NULL DELETE FROM dms_JobCardPartsDepreciation;
IF OBJECT_ID('dms_JobCardInsurance')                  IS NOT NULL DELETE FROM dms_JobCardInsurance;
IF OBJECT_ID('Addata_JobCardInfoDetailLog')           IS NOT NULL DELETE FROM Addata_JobCardInfoDetailLog;
IF OBJECT_ID('Addata_JobCardInfoLog')                 IS NOT NULL DELETE FROM Addata_JobCardInfoLog;
IF OBJECT_ID('Addata_JobCardInfocheckboxDetail')      IS NOT NULL DELETE FROM Addata_JobCardInfocheckboxDetail;
IF OBJECT_ID('Addata_JobCardInfoPartsDetail')         IS NOT NULL DELETE FROM Addata_JobCardInfoPartsDetail;
IF OBJECT_ID('Addata_JobCardInfosubjobDetail')        IS NOT NULL DELETE FROM Addata_JobCardInfosubjobDetail;
IF OBJECT_ID('Addata_JobCardInfoSubletJobDetail')     IS NOT NULL DELETE FROM Addata_JobCardInfoSubletJobDetail;
IF OBJECT_ID('Addata_JobCardInfosubpartsDetail')      IS NOT NULL DELETE FROM Addata_JobCardInfosubpartsDetail;
IF OBJECT_ID('Addata_JobCardInfolubricantDetail')     IS NOT NULL DELETE FROM Addata_JobCardInfolubricantDetail;
IF OBJECT_ID('Addata_JobCardInfoDetail')              IS NOT NULL DELETE FROM Addata_JobCardInfoDetail;
IF OBJECT_ID('addata_CustomerInvoiceSubletJobDetail') IS NOT NULL DELETE FROM addata_CustomerInvoiceSubletJobDetail;
IF OBJECT_ID('addata_CustomerInvoiceInfo')            IS NOT NULL DELETE FROM addata_CustomerInvoiceInfo;
IF OBJECT_ID('adgen_InsuranceJobEstimateDetail')      IS NOT NULL DELETE FROM adgen_InsuranceJobEstimateDetail;
IF OBJECT_ID('adgen_InsuranceJobEstimateInfo')        IS NOT NULL DELETE FROM adgen_InsuranceJobEstimateInfo;
IF OBJECT_ID('data_StockIssuetoJobCardDetail')        IS NOT NULL DELETE FROM data_StockIssuetoJobCardDetail;
IF OBJECT_ID('data_StockIssuetoJobCard')              IS NOT NULL DELETE FROM data_StockIssuetoJobCard;
IF OBJECT_ID('addata_StockReturnFromJobCardInfoDetail') IS NOT NULL DELETE FROM addata_StockReturnFromJobCardInfoDetail;
IF OBJECT_ID('addata_StockReturnFromJobCardInfo')     IS NOT NULL DELETE FROM addata_StockReturnFromJobCardInfo;
DELETE FROM Addata_JobCardInfo;

-- GRN / GRTN / STORE SALE / SSR / COUNTER SALES
IF OBJECT_ID('data_PurchaseReturnDetail')   IS NOT NULL DELETE FROM data_PurchaseReturnDetail;
IF OBJECT_ID('data_PurchaseReturnInfo')     IS NOT NULL DELETE FROM data_PurchaseReturnInfo;
IF OBJECT_ID('data_PurchaseDetailLog')      IS NOT NULL DELETE FROM data_PurchaseDetailLog;
IF OBJECT_ID('data_PurchaseDetailParams')   IS NOT NULL DELETE FROM data_PurchaseDetailParams;
IF OBJECT_ID('data_PurchaseDetailTax')      IS NOT NULL DELETE FROM data_PurchaseDetailTax;
IF OBJECT_ID('data_PurchaseDetail')         IS NOT NULL DELETE FROM data_PurchaseDetail;
IF OBJECT_ID('data_PurchaseInfoLog')        IS NOT NULL DELETE FROM data_PurchaseInfoLog;
IF OBJECT_ID('data_PurchaseInfo')           IS NOT NULL DELETE FROM data_PurchaseInfo;
IF OBJECT_ID('PData_PurchaseInfo')          IS NOT NULL DELETE FROM PData_PurchaseInfo;
IF OBJECT_ID('data_StoreSaleReturnDetail')  IS NOT NULL DELETE FROM data_StoreSaleReturnDetail;
IF OBJECT_ID('data_StoreSaleReturnInfo')    IS NOT NULL DELETE FROM data_StoreSaleReturnInfo;
IF OBJECT_ID('data_SaleReturnDetailTax')    IS NOT NULL DELETE FROM data_SaleReturnDetailTax;
IF OBJECT_ID('data_SaleReturnDetailParams') IS NOT NULL DELETE FROM data_SaleReturnDetailParams;
IF OBJECT_ID('data_SaleReturnDetail')       IS NOT NULL DELETE FROM data_SaleReturnDetail;
IF OBJECT_ID('data_SaleReturnInfo')         IS NOT NULL DELETE FROM data_SaleReturnInfo;
IF OBJECT_ID('data_StoreSaleDetail')        IS NOT NULL DELETE FROM data_StoreSaleDetail;
IF OBJECT_ID('data_StoreSaleInfo')          IS NOT NULL DELETE FROM data_StoreSaleInfo;
IF OBJECT_ID('data_CounterSaleReturnDetailLog') IS NOT NULL DELETE FROM data_CounterSaleReturnDetailLog;
IF OBJECT_ID('data_CounterSaleReturnLog')       IS NOT NULL DELETE FROM data_CounterSaleReturnLog;
IF OBJECT_ID('data_CounterSaleReturnDetail')    IS NOT NULL DELETE FROM data_CounterSaleReturnDetail;
IF OBJECT_ID('data_CounterSaleReturn')          IS NOT NULL DELETE FROM data_CounterSaleReturn;
IF OBJECT_ID('data_CounterSaleDetail')          IS NOT NULL DELETE FROM data_CounterSaleDetail;
IF OBJECT_ID('data_CounterSale')                IS NOT NULL DELETE FROM data_CounterSale;
IF OBJECT_ID('data_CounterPurchaseDetailTax')   IS NOT NULL DELETE FROM data_CounterPurchaseDetailTax;
IF OBJECT_ID('data_CounterPurchaseDetail')      IS NOT NULL DELETE FROM data_CounterPurchaseDetail;
IF OBJECT_ID('data_CounterPurchase')            IS NOT NULL DELETE FROM data_CounterPurchase;

-- VEHICLE CHASSIS + VEHICLE CATALOG (these are sales-pipeline records, wipe)
IF OBJECT_ID('dms_OpenAllocationLedger') IS NOT NULL DELETE FROM dms_OpenAllocationLedger;
IF OBJECT_ID('dms_Vehicle')              IS NOT NULL DELETE FROM dms_Vehicle;
IF OBJECT_ID('dms_VehicleVariant')       IS NOT NULL DELETE FROM dms_VehicleVariant;
IF OBJECT_ID('dms_VehicleModel')         IS NOT NULL DELETE FROM dms_VehicleModel;

-- STOCK ARRIVALS / IN-OUT (movements that point at InventItems)
IF OBJECT_ID('data_StockArrivalDetail') IS NOT NULL DELETE FROM data_StockArrivalDetail;
IF OBJECT_ID('data_StockArrivalInfo')   IS NOT NULL DELETE FROM data_StockArrivalInfo;
IF OBJECT_ID('data_StockInOutDetailParams') IS NOT NULL DELETE FROM data_StockInOutDetailParams;
IF OBJECT_ID('data_StockInOutDetail')   IS NOT NULL DELETE FROM data_StockInOutDetail;
IF OBJECT_ID('data_StockInOutInfo')     IS NOT NULL DELETE FROM data_StockInOutInfo;
IF OBJECT_ID('data_StockTransferDetailParams') IS NOT NULL DELETE FROM data_StockTransferDetailParams;
IF OBJECT_ID('data_StockTransferDetail') IS NOT NULL DELETE FROM data_StockTransferDetail;
IF OBJECT_ID('data_StockTransferInfo')  IS NOT NULL DELETE FROM data_StockTransferInfo;
IF OBJECT_ID('data_StockBalance')       IS NOT NULL DELETE FROM data_StockBalance;
IF OBJECT_ID('InvtBalances')            IS NOT NULL DELETE FROM InvtBalances;
IF OBJECT_ID('InvtStockBalance')        IS NOT NULL DELETE FROM InvtStockBalance;
IF OBJECT_ID('InvtPartsMaster')         IS NOT NULL DELETE FROM InvtPartsMaster;

-- LEGACY OPERATIONAL TABLES that reference InventItems / JobCards
IF OBJECT_ID('addata_SaleDetail')                      IS NOT NULL DELETE FROM addata_SaleDetail;
IF OBJECT_ID('addata_TrackerAssigmentDetailParams')    IS NOT NULL DELETE FROM addata_TrackerAssigmentDetailParams;
IF OBJECT_ID('addata_TrackerAssigmentDetail')          IS NOT NULL DELETE FROM addata_TrackerAssigmentDetail;
IF OBJECT_ID('adgen_ScheduleMaintainceDetail')         IS NOT NULL DELETE FROM adgen_ScheduleMaintainceDetail;
IF OBJECT_ID('data_DailyIssuenceDetail')               IS NOT NULL DELETE FROM data_DailyIssuenceDetail;
IF OBJECT_ID('data_DailyIssuence')                     IS NOT NULL DELETE FROM data_DailyIssuence;
IF OBJECT_ID('data_DisassemblingDetailParamsDG')       IS NOT NULL DELETE FROM data_DisassemblingDetailParamsDG;
IF OBJECT_ID('data_DisassemblingDetailParams')         IS NOT NULL DELETE FROM data_DisassemblingDetailParams;
IF OBJECT_ID('data_DisassemblingDetail')               IS NOT NULL DELETE FROM data_DisassemblingDetail;
IF OBJECT_ID('data_DisassemblingInfo')                 IS NOT NULL DELETE FROM data_DisassemblingInfo;
IF OBJECT_ID('data_InventItemsBarcode')                IS NOT NULL DELETE FROM data_InventItemsBarcode;
IF OBJECT_ID('data_InwardGatePassDetail')              IS NOT NULL DELETE FROM data_InwardGatePassDetail;
IF OBJECT_ID('data_ItemChangeDetail')                  IS NOT NULL DELETE FROM data_ItemChangeDetail;
IF OBJECT_ID('data_OutwardGatePassDetail')             IS NOT NULL DELETE FROM data_OutwardGatePassDetail;
IF OBJECT_ID('data_PurchaseOrderDetail')               IS NOT NULL DELETE FROM data_PurchaseOrderDetail;
IF OBJECT_ID('data_PurchaseOrder')                     IS NOT NULL DELETE FROM data_PurchaseOrder;
IF OBJECT_ID('data_PurchaseRequisitionDetail')         IS NOT NULL DELETE FROM data_PurchaseRequisitionDetail;
IF OBJECT_ID('data_PurchaseRequisition')               IS NOT NULL DELETE FROM data_PurchaseRequisition;
IF OBJECT_ID('data_QuotationDetail')                   IS NOT NULL DELETE FROM data_QuotationDetail;
IF OBJECT_ID('data_QuotationInfo')                     IS NOT NULL DELETE FROM data_QuotationInfo;
IF OBJECT_ID('data_SaleDetailParams')                  IS NOT NULL DELETE FROM data_SaleDetailParams;
IF OBJECT_ID('data_SaleDetail')                        IS NOT NULL DELETE FROM data_SaleDetail;
IF OBJECT_ID('data_SaleInfo')                          IS NOT NULL DELETE FROM data_SaleInfo;
IF OBJECT_ID('data_SaleOrderDetail')                   IS NOT NULL DELETE FROM data_SaleOrderDetail;
IF OBJECT_ID('data_SaleOrderInfo')                     IS NOT NULL DELETE FROM data_SaleOrderInfo;
IF OBJECT_ID('data_SalePosReturnDetail')               IS NOT NULL DELETE FROM data_SalePosReturnDetail;
IF OBJECT_ID('data_SalePosReturnInfo')                 IS NOT NULL DELETE FROM data_SalePosReturnInfo;
IF OBJECT_ID('data_SalePosInfo')                       IS NOT NULL DELETE FROM data_SalePosInfo;
IF OBJECT_ID('gen_BOMDetail')                          IS NOT NULL DELETE FROM gen_BOMDetail;
IF OBJECT_ID('gen_BOMInfo')                            IS NOT NULL DELETE FROM gen_BOMInfo;
IF OBJECT_ID('gen_BOMPlanning')                        IS NOT NULL DELETE FROM gen_BOMPlanning;

-- PARTS CATALOG — explicit owner instruction to wipe
DELETE FROM InventItems;

-- CRO / CRD
IF OBJECT_ID('dms_CRO_ComplaintActions')         IS NOT NULL DELETE FROM dms_CRO_ComplaintActions;
IF OBJECT_ID('dms_CRO_Attachments')              IS NOT NULL DELETE FROM dms_CRO_Attachments;
IF OBJECT_ID('dms_CRO_KYCFlags_Acknowledgments') IS NOT NULL DELETE FROM dms_CRO_KYCFlags_Acknowledgments;
IF OBJECT_ID('dms_CRO_Complaints')               IS NOT NULL DELETE FROM dms_CRO_Complaints;
IF OBJECT_ID('dms_CRO_KYCFlags')                 IS NOT NULL DELETE FROM dms_CRO_KYCFlags;
IF OBJECT_ID('dms_CRO_Inquiries')                IS NOT NULL DELETE FROM dms_CRO_Inquiries;
IF OBJECT_ID('dms_CRO_Campaigns')                IS NOT NULL DELETE FROM dms_CRO_Campaigns;
IF OBJECT_ID('dms_CRO_CampaignSends')            IS NOT NULL DELETE FROM dms_CRO_CampaignSends;
IF OBJECT_ID('dms_CRO_Notifications')            IS NOT NULL DELETE FROM dms_CRO_Notifications;
IF OBJECT_ID('dms_CRO_AdminAudit')               IS NOT NULL DELETE FROM dms_CRO_AdminAudit;
IF OBJECT_ID('dms_CRO_Surveys')                  IS NOT NULL DELETE FROM dms_CRO_Surveys;
IF OBJECT_ID('dms_CRO_WhatsAppMessages')         IS NOT NULL DELETE FROM dms_CRO_WhatsAppMessages;
IF OBJECT_ID('dms_CRO_ServiceReminders')         IS NOT NULL DELETE FROM dms_CRO_ServiceReminders;
IF OBJECT_ID('dms_CRDFollowUps')                 IS NOT NULL DELETE FROM dms_CRDFollowUps;
IF OBJECT_ID('dms_ServiceCampaignApplications')  IS NOT NULL DELETE FROM dms_ServiceCampaignApplications;
IF OBJECT_ID('dms_ServiceCampaignEligibleItems') IS NOT NULL DELETE FROM dms_ServiceCampaignEligibleItems;
IF OBJECT_ID('dms_ServiceCampaignEligibleJobs')  IS NOT NULL DELETE FROM dms_ServiceCampaignEligibleJobs;
IF OBJECT_ID('dms_ServiceCampaigns')             IS NOT NULL DELETE FROM dms_ServiceCampaigns;

-- AUDIT TABLES (keep schema, wipe rows)
IF OBJECT_ID('dms_LoginAudit')         IS NOT NULL DELETE FROM dms_LoginAudit;
IF OBJECT_ID('dms_PasswordAudit')      IS NOT NULL DELETE FROM dms_PasswordAudit;
IF OBJECT_ID('dms_PermissionAudit')    IS NOT NULL DELETE FROM dms_PermissionAudit;
IF OBJECT_ID('dms_PartyAudit')         IS NOT NULL DELETE FROM dms_PartyAudit;
IF OBJECT_ID('dms_CareOffAudit')       IS NOT NULL DELETE FROM dms_CareOffAudit;
IF OBJECT_ID('dms_SystemAccountAudit') IS NOT NULL DELETE FROM dms_SystemAccountAudit;

-- =========================================================================
-- Reset sequences + IDENTITY counters + doc counters
-- =========================================================================
PRINT '--- Resetting sequences ---';

IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_FinanceVoucherNo')        ALTER SEQUENCE dbo.seq_FinanceVoucherNo RESTART WITH 1;
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_SalesBookingNo')          ALTER SEQUENCE dbo.seq_SalesBookingNo RESTART WITH 1;
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_GatePassNo')              ALTER SEQUENCE dbo.seq_GatePassNo RESTART WITH 1;
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_MasterIncentiveReceiptNo') ALTER SEQUENCE dbo.seq_MasterIncentiveReceiptNo RESTART WITH 1;

IF OBJECT_ID('dms_DocCounters') IS NOT NULL
    UPDATE dms_DocCounters SET CurrentCounter = 0;

-- =========================================================================
-- Re-enable all FK constraints (NOCHECK on existing rows)
-- =========================================================================
PRINT '--- Re-enabling FK constraints ---';
EXEC sp_MSforeachtable 'ALTER TABLE ? CHECK CONSTRAINT ALL';

PRINT '--- AFTER wipe: row counts ---';
SELECT 'Vouchers'              AS Tbl, COUNT(*) AS N FROM data_FinanceVoucherInfo
UNION ALL SELECT 'PartyLedger',          COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'Job Cards',            COUNT(*) FROM Addata_JobCardInfo
UNION ALL SELECT 'GRN',                  COUNT(*) FROM data_PurchaseInfo
UNION ALL SELECT 'GRTN',                 COUNT(*) FROM data_PurchaseReturnInfo
UNION ALL SELECT 'StoreSale',            COUNT(*) FROM data_StoreSaleInfo
UNION ALL SELECT 'SSR',                  COUNT(*) FROM data_StoreSaleReturnInfo
UNION ALL SELECT 'InventItems',          COUNT(*) FROM InventItems
UNION ALL SELECT '*** Parties (kept)',   COUNT(*) FROM gen_PartiesInfo
UNION ALL SELECT '*** Employees (kept)', COUNT(*) FROM gen_EmployeeInfo
UNION ALL SELECT '*** Warehouses (kept)',COUNT(*) FROM InventWareHouse
UNION ALL SELECT '*** COA (kept)',       COUNT(*) FROM GLChartOFAccount
UNION ALL SELECT '*** GLUser (kept)',    COUNT(*) FROM GLUser;

COMMIT TRAN wipe056;
PRINT '056_clear_operational_keep_master.sql complete.';
GO
