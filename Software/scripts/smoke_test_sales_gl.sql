/*
 * Sales-GL smoke test — pure SQL.
 *
 * Simulates what each of the four posting services would write to GL when
 * called for booking BK-2026-0013 (the most recent BookingConfirmed booking
 * in the live DB). Verifies that each voucher's lines balance (Dr = Cr).
 *
 * Runs INSERT INTO #temp_voucher_detail then aggregates per-voucher Dr/Cr.
 * Does NOT mutate any production tables.
 */
SET NOCOUNT ON;

DECLARE @BookingID INT = 15;     -- BK-2026-0013 — BookingConfirmed, paid 500,000 of 5,650,000
DECLARE @Negotiated DECIMAL(18,2) = 5650000;
DECLARE @Paid DECIMAL(18,2) = 500000;
DECLARE @Wholesale DECIMAL(18,2) = 5000000;        -- variant wholesale price
DECLARE @Premium DECIMAL(18,2) = 0;
DECLARE @StdMasterIncentive DECIMAL(18,2) = 25000; -- variant standard incentive
DECLARE @StaffIncentive DECIMAL(18,2) = 10000;     -- per-booking staff accrual

-- Resolve role → GLCAID
DECLARE @CashBook       INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='CASH_BOOK');
DECLARE @BookingAdvance INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='BOOKING_ADVANCE');
DECLARE @BookingRecv    INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='BOOKING_RECEIVABLE');
DECLARE @VehInv         INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='VEHICLE_INVENTORY');
DECLARE @MasterPayable  INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='MASTER_VEHICLE_PAYABLE');
DECLARE @MasterIncRecv  INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='MASTER_INCENTIVE_RECEIVABLE');
DECLARE @MasterIncInc   INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='MASTER_INCENTIVE_INCOME');
DECLARE @VehSalesRev    INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='VEHICLE_SALES_REVENUE');
DECLARE @PremiumInc     INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='PREMIUM_INCOME');
DECLARE @COGSVeh        INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='COGS_VEHICLES');
DECLARE @StaffExp       INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='STAFF_INCENTIVE_EXPENSE');
DECLARE @StaffPayable   INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='STAFF_INCENTIVE_PAYABLE');

CREATE TABLE #sim (VoucherTag NVARCHAR(60), GLCAID INT, Dr DECIMAL(18,2), Cr DECIMAL(18,2));

-- V1. PAYMENT (Cash 100,000 simulated)
INSERT INTO #sim VALUES
    ('1-PAYMENT (Cash 100k)', @CashBook, 100000, 0),
    ('1-PAYMENT (Cash 100k)', @BookingAdvance, 0, 100000);

-- V2. MASTER INVOICE
INSERT INTO #sim VALUES
    ('2-MASTER INVOICE', @VehInv, @Wholesale, 0),
    ('2-MASTER INVOICE', @MasterPayable, 0, @Wholesale),
    ('2-MASTER INVOICE', @MasterIncRecv, @StdMasterIncentive, 0),
    ('2-MASTER INVOICE', @MasterIncInc, 0, @StdMasterIncentive);

-- V3. DELIVERY / GATE PASS
DECLARE @AdvApplied DECIMAL(18,2) = CASE WHEN @Paid < @Negotiated THEN @Paid ELSE @Negotiated END;
DECLARE @RecvOpened DECIMAL(18,2) = @Negotiated - @AdvApplied;
INSERT INTO #sim VALUES
    ('3-DELIVERY', @BookingAdvance, @AdvApplied, 0),
    ('3-DELIVERY', @BookingRecv,    @RecvOpened, 0),
    ('3-DELIVERY', @VehSalesRev,    0, @Negotiated),
    ('3-DELIVERY', @COGSVeh,        @Wholesale, 0),
    ('3-DELIVERY', @VehInv,         0, @Wholesale);

-- V4. STAFF INCENTIVE ACCRUAL
INSERT INTO #sim VALUES
    ('4-STAFF ACCRUAL', @StaffExp, @StaffIncentive, 0),
    ('4-STAFF ACCRUAL', @StaffPayable, 0, @StaffIncentive);

-- V5. STAFF DISBURSEMENT
INSERT INTO #sim VALUES
    ('5-STAFF DISBURSE (cash)', @StaffPayable, @StaffIncentive, 0),
    ('5-STAFF DISBURSE (cash)', @CashBook, 0, @StaffIncentive);

PRINT '===== Per-voucher balance check ====='
SELECT VoucherTag,
       SUM(Dr) AS TotalDebit,
       SUM(Cr) AS TotalCredit,
       SUM(Dr) - SUM(Cr) AS Difference,
       CASE WHEN SUM(Dr) = SUM(Cr) THEN 'BALANCED' ELSE 'UNBALANCED' END AS Status
FROM #sim
GROUP BY VoucherTag
ORDER BY VoucherTag;

PRINT ''
PRINT '===== Detailed lines ====='
SELECT s.VoucherTag,
       c.GLCode + ' - ' + c.GLTitle AS Account,
       s.Dr, s.Cr
FROM #sim s
JOIN GLChartOFAccount c ON c.GLCAID = s.GLCAID
ORDER BY s.VoucherTag, s.Dr DESC, s.Cr DESC;

DROP TABLE #sim;
