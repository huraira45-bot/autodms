-- 052_clear_stock_and_jc.sql
-- Clear all stock movements + job-card activity + downstream effects, in prep
-- for fresh data. Same FK-disable / NOCHECK-reenable pattern as migration 050.
--
-- WIPES:
--   • Job Cards + 14+ JC child tables (parts, labour, sublet, checkboxes, etc.)
--   • Parts Issue to JC + Detail
--   • GRN / GRTN / Store Sale / SSR  (header + detail)
--   • Stock movements (data_StockInOutInfo + Detail)
--   • Stock arrivals (data_StockArrivalInfo + Detail) — opening stock is gone
--   • Finance vouchers + Detail (everything posted by the above flows)
--   • Party ledger, pending cheques, POS pending, unfinalize requests
--   • Cheque clearance audit + POS settlement
--
-- PRESERVES: parties, COA, system accounts, banks, JC types, JobInfo,
-- employees, workshop vehicles, users, roles, permissions.

SET XACT_ABORT ON;
SET NOCOUNT ON;

PRINT '--- BEFORE wipe ---';
SELECT 'Job Cards' AS T, COUNT(*) AS N FROM Addata_JobCardInfo
UNION ALL SELECT 'Stock IO rows', COUNT(*) FROM data_StockInOutInfo
UNION ALL SELECT 'Stock Arrival rows', COUNT(*) FROM data_StockArrivalDetail
UNION ALL SELECT 'Vouchers', COUNT(*) FROM data_FinanceVoucherInfo
UNION ALL SELECT 'Party ledger', COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'GRN', COUNT(*) FROM data_PurchaseInfo;
GO

BEGIN TRAN g;

EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL';

-- Job Cards + child tables
DELETE FROM Addata_JobCardInfoDetailLog;
DELETE FROM Addata_JobCardInfoLog;
DELETE FROM Addata_JobCardInfoDetail;
DELETE FROM Addata_JobCardInfoPartsDetail;
DELETE FROM Addata_JobCardInfocheckboxDetail;
DELETE FROM Addata_JobCardInfolubricantDetail;
DELETE FROM Addata_JobCardInfosubjobDetail;
DELETE FROM Addata_JobCardInfoSubletJobDetail;
DELETE FROM Addata_JobCardInfosubpartsDetail;
DELETE FROM addata_StockReturnFromJobCardInfoDetail;
DELETE FROM addata_StockReturnFromJobCardInfo;
DELETE FROM addata_CustomerInvoiceSubletJobDetail;
DELETE FROM addata_VehicleServicesPaymentDetail;
DELETE FROM addata_VehicleServicesPaymentInformation;
DELETE FROM Addata_JobCardInfo;

-- Insurance + schedules tied to JC
IF OBJECT_ID('adgen_InsuranceJobEstimateDetail') IS NOT NULL DELETE FROM adgen_InsuranceJobEstimateDetail;
IF OBJECT_ID('adgen_ScheduleMaintainceDetail') IS NOT NULL DELETE FROM adgen_ScheduleMaintainceDetail;

-- Parts Issue to JC
DELETE FROM data_StockIssuetoJobCardDetail;
DELETE FROM data_StockIssuetoJobCard;

-- GRN, GRTN, Store Sale, SSR (headers + details)
DELETE FROM data_PurchaseDetailParams;
DELETE FROM data_PurchaseDetail;
DELETE FROM data_PurchaseInfo;
DELETE FROM data_PurchaseReturnDetail;
DELETE FROM data_PurchaseReturnInfo;
DELETE FROM data_SaleDetailParams;
DELETE FROM data_SaleDetail;
DELETE FROM data_SaleInfo;
DELETE FROM data_SaleReturnDetailParams;
DELETE FROM data_SaleReturnDetail;
DELETE FROM data_SaleReturnInfo;

-- Stock movement ledger (all of it)
DELETE FROM data_StockInOutDetail;
DELETE FROM data_StockInOutInfo;
DELETE FROM data_StockArrivalDetail;
DELETE FROM data_StockArrivalInfo;

-- Vouchers + party ledger + cheques + POS + unfinalize
DELETE FROM data_FinanceVoucherDetail;
DELETE FROM data_FinanceVoucherInfo;
DELETE FROM dms_PartyLedger;
IF OBJECT_ID('dms_PendingCheques') IS NOT NULL DELETE FROM dms_PendingCheques;
IF OBJECT_ID('dms_ChequeAudit') IS NOT NULL DELETE FROM dms_ChequeAudit;
IF OBJECT_ID('dms_POSPendingSettlement') IS NOT NULL DELETE FROM dms_POSPendingSettlement;
IF OBJECT_ID('dms_POSSettlement') IS NOT NULL DELETE FROM dms_POSSettlement;
IF OBJECT_ID('dms_UnfinalizeRequests') IS NOT NULL DELETE FROM dms_UnfinalizeRequests;
IF OBJECT_ID('dms_UnfinalizeAuditLog') IS NOT NULL DELETE FROM dms_UnfinalizeAuditLog;

-- Gate Pass (per-JC gate-out records)
IF OBJECT_ID('dms_GatePassLog') IS NOT NULL DELETE FROM dms_GatePassLog;
IF OBJECT_ID('dms_GatePass') IS NOT NULL DELETE FROM dms_GatePass;

-- Reset sequences
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_FinanceVoucherNo')
    ALTER SEQUENCE seq_FinanceVoucherNo RESTART WITH 1;
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_GatePassNo')
    ALTER SEQUENCE seq_GatePassNo RESTART WITH 1;

EXEC sp_MSforeachtable 'ALTER TABLE ? CHECK CONSTRAINT ALL';

COMMIT TRAN g;
GO

PRINT '--- AFTER wipe ---';
SELECT 'Job Cards' AS T, COUNT(*) AS N FROM Addata_JobCardInfo
UNION ALL SELECT 'Stock IO rows', COUNT(*) FROM data_StockInOutInfo
UNION ALL SELECT 'Stock Arrival rows', COUNT(*) FROM data_StockArrivalDetail
UNION ALL SELECT 'Vouchers', COUNT(*) FROM data_FinanceVoucherInfo
UNION ALL SELECT 'Party ledger', COUNT(*) FROM dms_PartyLedger
UNION ALL SELECT 'GRN', COUNT(*) FROM data_PurchaseInfo
UNION ALL SELECT 'Inventory Items', COUNT(*) FROM InventItems
UNION ALL SELECT '*** Parties', COUNT(*) FROM gen_PartiesInfo
UNION ALL SELECT '*** Employees', COUNT(*) FROM gen_EmployeeInfo
UNION ALL SELECT '*** COA', COUNT(*) FROM GLChartOFAccount
UNION ALL SELECT '*** JC Types', COUNT(*) FROM gen_JobCardType;

PRINT '052_clear_stock_and_jc applied.';
