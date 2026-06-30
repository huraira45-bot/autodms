-- 048_wipe_sales_activity.sql
-- HARD WIPE of all sales-side activity: vouchers, payments, accruals,
-- audit, state transitions, recovery plans, etc. Catalog/config data is
-- preserved (variants, models, vehicle inventory, policies, system roles).
-- Vehicle rows themselves are kept but reset to AtDealer.
--
-- This is destructive. Used for the agency-model relaunch.

SET XACT_ABORT ON;
BEGIN TRAN;

-- =========================================================================
-- 1. GL — voucher detail then header, only sales-tagged sources
-- =========================================================================
DECLARE @salesVouchers TABLE (VoucherID INT PRIMARY KEY);

INSERT INTO @salesVouchers (VoucherID)
SELECT VoucherID FROM data_FinanceVoucherInfo
WHERE SourceDocType IN (
    'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
    'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
    'MASTER_INCENTIVE_RECEIPT', 'PAY_MASTER'
)
   OR ReversesVoucherID IN (
        SELECT VoucherID FROM data_FinanceVoucherInfo WHERE SourceDocType IN (
            'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
            'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
            'MASTER_INCENTIVE_RECEIPT', 'PAY_MASTER'
        )
   );

-- dms_PartyLedger entries first (FK)
DELETE FROM dms_PartyLedger WHERE VoucherID IN (SELECT VoucherID FROM @salesVouchers);
DELETE FROM dms_PartyLedger WHERE BookingID IS NOT NULL;

-- Pending-cheque rows tied to sales vouchers (FK on ReceiptDetailID / ReceiptVoucherID)
DELETE FROM dms_PendingCheques
WHERE ReceiptVoucherID IN (SELECT VoucherID FROM @salesVouchers)
   OR ClearanceVoucherID IN (SELECT VoucherID FROM @salesVouchers)
   OR ReceiptDetailID IN (
        SELECT VoucherDetailID FROM data_FinanceVoucherDetail
        WHERE VoucherID IN (SELECT VoucherID FROM @salesVouchers)
   );

-- Null out AllocatedToVoucherID FKs from non-sales legs that point at sales vouchers
UPDATE data_FinanceVoucherDetail SET AllocatedToVoucherID = NULL
WHERE AllocatedToVoucherID IN (SELECT VoucherID FROM @salesVouchers);

-- Voucher details then headers
DELETE FROM data_FinanceVoucherDetail WHERE VoucherID IN (SELECT VoucherID FROM @salesVouchers);
DELETE FROM data_FinanceVoucherInfo   WHERE VoucherID IN (SELECT VoucherID FROM @salesVouchers);

DECLARE @nDeleted INT = (SELECT COUNT(*) FROM @salesVouchers);
PRINT CONCAT('Deleted ', @nDeleted, ' sales-tagged vouchers (incl. reversals).');

-- =========================================================================
-- 2. Sales-module activity tables
-- =========================================================================

DELETE FROM dms_SalesRecoveryInstallments;
DELETE FROM dms_SalesRecoveryPlans;
DELETE FROM dms_SalesAuditLog;
DELETE FROM dms_BookingStateTransitions;
DELETE FROM dms_MasterIncentiveReceipts;
DELETE FROM dms_SalesIncentiveAccruals;
DELETE FROM dms_NegotiationRequests;
DELETE FROM dms_SalesBookingCancellations;

-- Sales documents tied to bookings/payments
DELETE FROM dms_SalesDocuments WHERE BookingID IS NOT NULL OR LinkedPaymentID IS NOT NULL;

DELETE FROM dms_SalesPayments;

-- Clear vehicle FK back-refs before deleting bookings
UPDATE dms_Vehicle
SET CurrentBookingID = NULL,
    MasterInvoiceVoucherID = NULL,
    Status = 'AtDealer',
    SoldDeliveredAt = NULL,
    UpdatedAt = GETDATE(),
    UpdatedByName = 'migration-048';

UPDATE dms_OpenAllocationLedger
SET SoldToBookingID = NULL, Status = 'AtDealer', SoldAt = NULL;

DELETE FROM dms_SalesBookings;

PRINT 'Cleared sales activity tables.';

-- =========================================================================
-- 3. (Vehicle + ledger already reset above as part of FK clearance)
-- =========================================================================
UPDATE dms_Vehicle
SET CurrentBookingID = NULL,
    MasterInvoiceVoucherID = NULL,
    Status = 'AtDealer',
    SoldDeliveredAt = NULL,
    UpdatedAt = GETDATE(),
    UpdatedByName = 'migration-048';

UPDATE dms_OpenAllocationLedger
SET Status = 'AtDealer', SoldAt = NULL, SoldToBookingID = NULL;

PRINT 'Vehicle inventory reset to AtDealer.';

-- =========================================================================
-- 4. Reset sequences so new BookingNo / receipt # restart from 1
-- =========================================================================
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_SalesBookingNo')
    ALTER SEQUENCE dbo.seq_SalesBookingNo RESTART WITH 1;
IF EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_MasterIncentiveReceiptNo')
    ALTER SEQUENCE dbo.seq_MasterIncentiveReceiptNo RESTART WITH 1;

PRINT '048_wipe_sales_activity applied. Sales is clean.';
COMMIT;
