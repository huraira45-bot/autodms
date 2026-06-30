-- 047_cleanup_voucher_67_68.sql
-- One-time cleanup: reverse vouchers 67 (Master Invoice) and 68 (Delivery)
-- which were posted under the wrong reseller model. After this runs, the
-- only sales-side GL entries for BK-2026-0003 are the two BRV receipts that
-- moved 1,000 PKR into BOOKING_ADVANCE — exactly correct under the new
-- agency model. The booking can then be re-walked through the corrected
-- workflow (Pay Master → Record Master Tax Invoice → Issue Gate Pass).

SET XACT_ABORT ON;
BEGIN TRAN;

-- Both target vouchers must still be Posted
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID=67 AND Status='Posted')
BEGIN PRINT 'Voucher 67 not Posted — skipping.'; ROLLBACK; RETURN; END
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID=68 AND Status='Posted')
BEGIN PRINT 'Voucher 68 not Posted — skipping.'; ROLLBACK; RETURN; END

DECLARE @jvType INT = (SELECT MIN(Voucherid) FROM GLVoucherType WHERE Title='JV');

-- =========================================================================
-- Reversal of voucher 67 (Master Invoice)
-- =========================================================================
DECLARE @rev67No NVARCHAR(50) = CONCAT('JV-REV-', FORMAT(NEXT VALUE FOR dbo.seq_FinanceVoucherNo, '0000'));
DECLARE @rev67ID INT;

INSERT INTO data_FinanceVoucherInfo
    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
     Status, Posted, ReversesVoucherID, SourceDocType, SourceDocID, CreatedByName)
VALUES (GETDATE(), @rev67No, @jvType,
        'Cleanup-047 — agency-model realignment. Reverses PV-0066 (Master Invoice; wholesale leg was wrong).',
        1020.00, 'Draft', 0, 67, 'MASTER_INVOICE', 3, 'migration-047');
SET @rev67ID = SCOPE_IDENTITY();

INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, BookingID)
SELECT @rev67ID, GLCAID, CONCAT('Reversal: ', Narration), Credit, Debit, BookingID
FROM data_FinanceVoucherDetail WHERE VoucherID=67;

UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@rev67ID;
UPDATE data_FinanceVoucherInfo SET Status='Reversed', ReversedAt=GETDATE(), ReversedByName='migration-047' WHERE VoucherID=67;

-- Roll back the accrual side (incentive reverses too — under new model the
-- accrual moves to "Record Master Tax Invoice" step which user will redo).
UPDATE dms_SalesIncentiveAccruals
SET Status='Reversed', ReversedAt=GETDATE(), ReversalReason='Cleanup 047 — voucher reversed'
WHERE BookingID=3 AND EarnerType='Master';

-- Clear the stamp on the vehicle
UPDATE dms_Vehicle SET MasterInvoiceVoucherID=NULL, UpdatedAt=GETDATE() WHERE VehicleID=1;
PRINT 'Reversed voucher 67 with reversal ' + @rev67No;

-- =========================================================================
-- Reversal of voucher 68 (Delivery)
-- =========================================================================
DECLARE @rev68No NVARCHAR(50) = CONCAT('JV-REV-', FORMAT(NEXT VALUE FOR dbo.seq_FinanceVoucherNo, '0000'));
DECLARE @rev68ID INT;

INSERT INTO data_FinanceVoucherInfo
    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
     Status, Posted, ReversesVoucherID, SourceDocType, SourceDocID, CreatedByName)
VALUES (GETDATE(), @rev68No, @jvType,
        'Cleanup-047 — agency-model realignment. Reverses SI-0067 (Delivery; revenue/COGS/inventory legs were wrong).',
        2020.00, 'Draft', 0, 68, 'SALES_DELIVERY', 3, 'migration-047');
SET @rev68ID = SCOPE_IDENTITY();

INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, BookingID)
SELECT @rev68ID, GLCAID, CONCAT('Reversal: ', Narration), Credit, Debit, PartyID, BookingID
FROM data_FinanceVoucherDetail WHERE VoucherID=68;

UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@rev68ID;
UPDATE data_FinanceVoucherInfo SET Status='Reversed', ReversedAt=GETDATE(), ReversedByName='migration-047' WHERE VoucherID=68;
PRINT 'Reversed voucher 68 with reversal ' + @rev68No;

-- =========================================================================
-- Reset booking + vehicle so user can re-walk under the new model
-- =========================================================================
UPDATE dms_SalesBookings
SET Status='Allocated',
    GatePassIssuedAt=NULL, DeliveredAt=NULL, ClosedAt=NULL,
    DeliveryVoucherID=NULL,
    UpdatedAt=GETDATE(), UpdatedByName='migration-047'
WHERE BookingID=3;

UPDATE dms_Vehicle
SET Status='Allocated', SoldDeliveredAt=NULL, UpdatedAt=GETDATE(), UpdatedByName='migration-047'
WHERE VehicleID=1;

-- Reset any open-allocation memo
UPDATE dms_OpenAllocationLedger
SET Status='AtDealer', SoldAt=NULL, SoldToBookingID=NULL
WHERE VehicleID=1 AND Status='Sold';

PRINT '047_cleanup_voucher_67_68 applied. BK-2026-0003 reset to Allocated state.';
COMMIT;
