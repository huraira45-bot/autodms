-- 050_full_operational_wipe.sql
-- Full operational data reset per owner instruction (2026-06-28).
-- See conversation for the agreed KEEP / WIPE list.
--
-- Strategy: temporarily disable all FK constraints, delete operational rows,
-- re-enable FKs. Safer than chasing every individual FK chain on this schema.

SET XACT_ABORT ON;
SET NOCOUNT ON;
BEGIN TRAN wipe;

PRINT '--- BEFORE wipe: current rows ---';
SELECT 'Vouchers'              AS Tbl, COUNT(*) AS N FROM data_FinanceVoucherInfo
UNION ALL SELECT 'PartyLedger',          COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'PendingCheques',       COUNT(*) FROM dms_PendingCheques
UNION ALL SELECT 'Job Cards',            COUNT(*) FROM Addata_JobCardInfo
UNION ALL SELECT 'GRN',                  COUNT(*) FROM data_PurchaseInfo
UNION ALL SELECT 'GRTN',                 COUNT(*) FROM data_PurchaseReturnInfo
UNION ALL SELECT 'StoreSale',            COUNT(*) FROM data_StoreSaleInfo
UNION ALL SELECT 'SSR',                  COUNT(*) FROM data_StoreSaleReturnInfo
UNION ALL SELECT 'SalesBookings',        COUNT(*) FROM dms_SalesBookings
UNION ALL SELECT 'InventItems',          COUNT(*) FROM InventItems
UNION ALL SELECT '*** WorkshopVehicles', COUNT(*) FROM WorkshopVehicles
UNION ALL SELECT '*** Parties',          COUNT(*) FROM gen_PartiesInfo
UNION ALL SELECT '*** COA',              COUNT(*) FROM GLChartOFAccount
UNION ALL SELECT '*** GLUser',           COUNT(*) FROM GLUser;

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

-- JOB CARDS + child tables + supplementary
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

-- VEHICLE CHASSIS + VEHICLE CATALOG
IF OBJECT_ID('dms_OpenAllocationLedger') IS NOT NULL DELETE FROM dms_OpenAllocationLedger;
IF OBJECT_ID('dms_Vehicle')              IS NOT NULL DELETE FROM dms_Vehicle;
IF OBJECT_ID('dms_VehicleVariant')       IS NOT NULL DELETE FROM dms_VehicleVariant;
IF OBJECT_ID('dms_VehicleModel')         IS NOT NULL DELETE FROM dms_VehicleModel;

-- LEGACY OPERATIONAL TABLES that also reference InventItems / JobCards / etc.
IF OBJECT_ID('addata_CustomerInvoiceInfo')             IS NOT NULL DELETE FROM addata_CustomerInvoiceInfo;
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
IF OBJECT_ID('data_ManufacturingOverheadDetail')       IS NOT NULL DELETE FROM data_ManufacturingOverheadDetail;
IF OBJECT_ID('data_ManufacturingDetailParamsFG')       IS NOT NULL DELETE FROM data_ManufacturingDetailParamsFG;
IF OBJECT_ID('data_ManufacturingDetailParams')         IS NOT NULL DELETE FROM data_ManufacturingDetailParams;
IF OBJECT_ID('data_ManufacturingDetail')               IS NOT NULL DELETE FROM data_ManufacturingDetail;
IF OBJECT_ID('data_ManufacturingFormulaDetail')        IS NOT NULL DELETE FROM data_ManufacturingFormulaDetail;
IF OBJECT_ID('data_ManufacturingInfo')                 IS NOT NULL DELETE FROM data_ManufacturingInfo;
IF OBJECT_ID('data_OutwardGatePassDetail')             IS NOT NULL DELETE FROM data_OutwardGatePassDetail;
IF OBJECT_ID('data_PertaFormDetail')                   IS NOT NULL DELETE FROM data_PertaFormDetail;
IF OBJECT_ID('data_PertaFormInfo')                     IS NOT NULL DELETE FROM data_PertaFormInfo;
IF OBJECT_ID('data_pes_SalesManTargetDetail')          IS NOT NULL DELETE FROM data_pes_SalesManTargetDetail;
IF OBJECT_ID('data_ProductInflowBatch')                IS NOT NULL DELETE FROM data_ProductInflowBatch;
IF OBJECT_ID('data_ProductInflow')                     IS NOT NULL DELETE FROM data_ProductInflow;
IF OBJECT_ID('data_ProductOutflowBatch')               IS NOT NULL DELETE FROM data_ProductOutflowBatch;
IF OBJECT_ID('data_ProductOutflow')                    IS NOT NULL DELETE FROM data_ProductOutflow;
IF OBJECT_ID('data_PrReleaseOrder')                    IS NOT NULL DELETE FROM data_PrReleaseOrder;
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
IF OBJECT_ID('data_SaleOrder')                         IS NOT NULL DELETE FROM data_SaleOrder;
IF OBJECT_ID('data_SalePosReturnDetail')               IS NOT NULL DELETE FROM data_SalePosReturnDetail;
IF OBJECT_ID('data_SalePosReturn')                     IS NOT NULL DELETE FROM data_SalePosReturn;
IF OBJECT_ID('data_SalesManTargetDetail')              IS NOT NULL DELETE FROM data_SalesManTargetDetail;
IF OBJECT_ID('data_SaleTrackerDetailParams')           IS NOT NULL DELETE FROM data_SaleTrackerDetailParams;
IF OBJECT_ID('data_SaleTrackerDetail')                 IS NOT NULL DELETE FROM data_SaleTrackerDetail;
IF OBJECT_ID('data_SODeductionDetail')                 IS NOT NULL DELETE FROM data_SODeductionDetail;
IF OBJECT_ID('data_StockDispatchAgainstTransferDetail') IS NOT NULL DELETE FROM data_StockDispatchAgainstTransferDetail;
IF OBJECT_ID('data_StockInOutDetailParams')            IS NOT NULL DELETE FROM data_StockInOutDetailParams;
IF OBJECT_ID('data_StockInOutDetail')                  IS NOT NULL DELETE FROM data_StockInOutDetail;
IF OBJECT_ID('data_StockInOut')                        IS NOT NULL DELETE FROM data_StockInOut;
IF OBJECT_ID('data_StockTransferDetailParams')         IS NOT NULL DELETE FROM data_StockTransferDetailParams;
IF OBJECT_ID('data_StockTransferDetail')               IS NOT NULL DELETE FROM data_StockTransferDetail;
IF OBJECT_ID('data_StockTransfer')                     IS NOT NULL DELETE FROM data_StockTransfer;
IF OBJECT_ID('data_ZoneFreightDetail')                 IS NOT NULL DELETE FROM data_ZoneFreightDetail;
IF OBJECT_ID('gen_BOMDetail')                          IS NOT NULL DELETE FROM gen_BOMDetail;
IF OBJECT_ID('gen_BOMInfo')                            IS NOT NULL DELETE FROM gen_BOMInfo;
IF OBJECT_ID('gen_BOMPlanning')                        IS NOT NULL DELETE FROM gen_BOMPlanning;
IF OBJECT_ID('gen_SchemeDetailInfo')                   IS NOT NULL DELETE FROM gen_SchemeDetailInfo;
IF OBJECT_ID('gen_SchemeInfo')                         IS NOT NULL DELETE FROM gen_SchemeInfo;

-- PARTS CATALOG + WAREHOUSES + STOCK BALANCES
IF OBJECT_ID('data_StockBalance') IS NOT NULL DELETE FROM data_StockBalance;
IF OBJECT_ID('InvtBalances')      IS NOT NULL DELETE FROM InvtBalances;
IF OBJECT_ID('InvtStockBalance')  IS NOT NULL DELETE FROM InvtStockBalance;
IF OBJECT_ID('InvtPartsMaster')   IS NOT NULL DELETE FROM InvtPartsMaster;
DELETE FROM InventItems;
DELETE FROM InventWareHouse;

-- HR
IF OBJECT_ID('gen_EmployeeIncrementDetail')  IS NOT NULL DELETE FROM gen_EmployeeIncrementDetail;
IF OBJECT_ID('gen_EmployeeEducationDetail')  IS NOT NULL DELETE FROM gen_EmployeeEducationDetail;
IF OBJECT_ID('gen_EmployeeExperienceDetail') IS NOT NULL DELETE FROM gen_EmployeeExperienceDetail;
IF OBJECT_ID('data_AttendanceDetail')        IS NOT NULL DELETE FROM data_AttendanceDetail;
IF OBJECT_ID('data_AttendanceInfo')          IS NOT NULL DELETE FROM data_AttendanceInfo;
IF OBJECT_ID('data_PayRollDetail')           IS NOT NULL DELETE FROM data_PayRollDetail;
IF OBJECT_ID('data_PayRollInfo')             IS NOT NULL DELETE FROM data_PayRollInfo;
IF OBJECT_ID('data_LoanInfo')                IS NOT NULL DELETE FROM data_LoanInfo;
IF OBJECT_ID('data_ToolsIssuenceDetail')     IS NOT NULL DELETE FROM data_ToolsIssuenceDetail;
IF OBJECT_ID('data_ToolsIssuence')           IS NOT NULL DELETE FROM data_ToolsIssuence;
IF OBJECT_ID('data_ToolsReturnFormDetail')   IS NOT NULL DELETE FROM data_ToolsReturnFormDetail;
IF OBJECT_ID('data_ToolsReturnForm')         IS NOT NULL DELETE FROM data_ToolsReturnForm;
UPDATE GLUser SET LinkedEmployeeID = NULL WHERE LinkedEmployeeID IS NOT NULL;
DELETE FROM gen_EmployeeInfo;
IF OBJECT_ID('gen_DepartmentInfo')  IS NOT NULL DELETE FROM gen_DepartmentInfo;
IF OBJECT_ID('gen_DesignationInfo') IS NOT NULL DELETE FROM gen_DesignationInfo;

-- CRO / CRD
IF OBJECT_ID('dms_CRO_ComplaintActions')         IS NOT NULL DELETE FROM dms_CRO_ComplaintActions;
IF OBJECT_ID('dms_CRO_Attachments')              IS NOT NULL DELETE FROM dms_CRO_Attachments;
IF OBJECT_ID('dms_CRO_KYCFlags_Acknowledgments') IS NOT NULL DELETE FROM dms_CRO_KYCFlags_Acknowledgments;
IF OBJECT_ID('dms_CRO_Complaints')               IS NOT NULL DELETE FROM dms_CRO_Complaints;
IF OBJECT_ID('dms_CRO_KYCFlags')                 IS NOT NULL DELETE FROM dms_CRO_KYCFlags;
IF OBJECT_ID('dms_CRO_Inquiries')                IS NOT NULL DELETE FROM dms_CRO_Inquiries;
IF OBJECT_ID('dms_CRO_Campaigns')                IS NOT NULL DELETE FROM dms_CRO_Campaigns;
IF OBJECT_ID('dms_CRO_Notifications')            IS NOT NULL DELETE FROM dms_CRO_Notifications;
IF OBJECT_ID('dms_CRO_AdminAudit')               IS NOT NULL DELETE FROM dms_CRO_AdminAudit;
IF OBJECT_ID('dms_CRO_Surveys')                  IS NOT NULL DELETE FROM dms_CRO_Surveys;
IF OBJECT_ID('dms_CRO_SurveyTemplates')          IS NOT NULL DELETE FROM dms_CRO_SurveyTemplates;
IF OBJECT_ID('dms_CRO_SystemRoles')              IS NOT NULL DELETE FROM dms_CRO_SystemRoles;
IF OBJECT_ID('dms_CRO_ServiceCampaigns')         IS NOT NULL DELETE FROM dms_CRO_ServiceCampaigns;
IF OBJECT_ID('dms_CRO_ServiceReminders')         IS NOT NULL DELETE FROM dms_CRO_ServiceReminders;
IF OBJECT_ID('dms_CRD_FollowUps')                IS NOT NULL DELETE FROM dms_CRD_FollowUps;
IF OBJECT_ID('dms_Reminders')                    IS NOT NULL DELETE FROM dms_Reminders;
IF OBJECT_ID('dms_CampaignApplications')         IS NOT NULL DELETE FROM dms_CampaignApplications;

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
-- Re-enable all FK constraints
-- =========================================================================
-- Re-enable with NOCHECK: constraints will enforce future INSERT/UPDATE but
-- won't validate existing legacy orphan rows (manufacturing/layer/hatchery
-- tables that pre-date this DMS install and reference InventItems/Warehouses).
PRINT '--- Re-enabling FK constraints (NOCHECK on existing rows) ---';
EXEC sp_MSforeachtable 'ALTER TABLE ? CHECK CONSTRAINT ALL';

PRINT '--- AFTER wipe: row counts ---';
SELECT 'Vouchers'              AS Tbl, COUNT(*) AS N FROM data_FinanceVoucherInfo
UNION ALL SELECT 'PartyLedger',          COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'PendingCheques',       COUNT(*) FROM dms_PendingCheques
UNION ALL SELECT 'Job Cards',            COUNT(*) FROM Addata_JobCardInfo
UNION ALL SELECT 'GRN',                  COUNT(*) FROM data_PurchaseInfo
UNION ALL SELECT 'GRTN',                 COUNT(*) FROM data_PurchaseReturnInfo
UNION ALL SELECT 'StoreSale',            COUNT(*) FROM data_StoreSaleInfo
UNION ALL SELECT 'SSR',                  COUNT(*) FROM data_StoreSaleReturnInfo
UNION ALL SELECT 'SalesBookings',        COUNT(*) FROM dms_SalesBookings
UNION ALL SELECT 'InventItems',          COUNT(*) FROM InventItems
UNION ALL SELECT 'gen_EmployeeInfo',     COUNT(*) FROM gen_EmployeeInfo
UNION ALL SELECT 'dms_VehicleVariant',   COUNT(*) FROM dms_VehicleVariant
UNION ALL SELECT 'dms_Vehicle',          COUNT(*) FROM dms_Vehicle
UNION ALL SELECT '*** WorkshopVehicles', COUNT(*) FROM WorkshopVehicles
UNION ALL SELECT '*** Parties',          COUNT(*) FROM gen_PartiesInfo
UNION ALL SELECT '*** COA',              COUNT(*) FROM GLChartOFAccount
UNION ALL SELECT '*** GLUser',           COUNT(*) FROM GLUser
UNION ALL SELECT '*** JobCardType',      COUNT(*) FROM gen_JobCardType
UNION ALL SELECT '*** SystemAccounts',   COUNT(*) FROM dms_SystemAccounts
UNION ALL SELECT '*** BankAccounts',     COUNT(*) FROM dms_BankAccounts;

PRINT '050_full_operational_wipe applied.';
COMMIT TRAN wipe;
