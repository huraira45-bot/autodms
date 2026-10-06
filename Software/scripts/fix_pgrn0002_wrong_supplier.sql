-- fix_pgrn0002_wrong_supplier.sql
--
-- Owner, 2026-10-06: "PGRN-0002 is actually PROTECTIVE FILM SERVICE, we need
-- to change the party of it."
--
-- PGRN-0002 (10 Jul 2026, 325,000.00) was entered against Shaukat Paint House
-- (party 7769). It belongs to PROTECTIVE FILM SERVICE (party 7770).
--
-- That one wrong supplier is what made PGRN-0007 disappear from Make Payment.
-- BPV-0418 (18 Sep, 500,500.00 out of BOP WAPDA TOWN BR) paid PROTECTIVE FILM
-- SERVICE for two bills -- its narration says "Payment of PGR # 0002 & 0006".
-- Both its legs were correctly posted to that supplier's payable account, but
-- PGRN-0002's bill sat on a different party, so the 325,000 leg could not be
-- allocated to it and was pointed at PV-0169 (PGRN-0007, a 175,500 bill)
-- instead. PGRN-0007 then looked over-paid and dropped off the list.
--
-- Four corrections, no amount changes anywhere:
--   1. paint_GRN PGRN-0002           party 7769 -> 7770
--   2. PV-0145 supplier credit leg   Shaukat's payable -> PROTECTIVE FILM's
--   3. its dms_PartyLedger mirror    the same
--   4. BPV-0418's 325,000 leg        allocated PV-0169 -> PV-0145
--
-- Leg 4's account and party are already right; only the allocation moves.
--
-- Afterwards:
--   PV-0145  PGRN-0002  325,000  PROTECTIVE FILM SERVICE  paid in full
--   PV-0168  PGRN-0006  175,500  PROTECTIVE FILM SERVICE  paid in full
--   PV-0169  PGRN-0007  175,500  PROTECTIVE FILM SERVICE  owed in full, back on the list
--   Shaukat Paint House loses a 325,000 payable that was never theirs.
--
--   dry run:  sqlcmd ... -v Apply=0 -i scripts\fix_pgrn0002_wrong_supplier.sql
--   apply:    sqlcmd ... -v Apply=1 -i scripts\fix_pgrn0002_wrong_supplier.sql
--
-- Apply must be passed either way. A :setvar default is deliberately not used:
-- sqlcmd lets a :setvar inside the file override -v from the command line.
--
-- Safe to re-run: once corrected, the target rows no longer match.

-- sqlcmd runs with QUOTED_IDENTIFIER OFF and these tables carry indexes that
-- require it ON. Its own batch, because it is applied when a batch is parsed.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Apply BIT = CASE WHEN '$(Apply)' = '1' THEN 1 ELSE 0 END;

DECLARE @GrnNo    NVARCHAR(50) = 'PGRN-0002';
DECLARE @BillNo   NVARCHAR(50) = 'PV-0145';   -- PGRN-0002's voucher
DECLARE @PayNo    NVARCHAR(50) = 'BPV-0418';  -- the bank payment
DECLARE @WrongNo  NVARCHAR(50) = 'PV-0169';   -- PGRN-0007, wrongly settled
DECLARE @FromParty INT = 7769;                -- Shaukat Paint House
DECLARE @ToParty   INT = 7770;                -- PROTECTIVE FILM SERVICE
DECLARE @Amount DECIMAL(18,2) = 325000.00;

DECLARE @Bill      INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @BillNo);
DECLARE @Pay       INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @PayNo);
DECLARE @WrongBill INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @WrongNo);
DECLARE @FromGL    INT = (SELECT PartyGLID FROM gen_PartiesInfo WHERE PartyID = @FromParty);
DECLARE @ToGL      INT = (SELECT PartyGLID FROM gen_PartiesInfo WHERE PartyID = @ToParty);

-- ---- refuse on anything unexpected -------------------------------------
IF @Bill IS NULL      BEGIN RAISERROR('The GRN voucher was not found.', 16, 1); RETURN; END
IF @Pay IS NULL       BEGIN RAISERROR('The payment voucher was not found.', 16, 1); RETURN; END
IF @WrongBill IS NULL BEGIN RAISERROR('The wrongly-settled bill was not found.', 16, 1); RETURN; END
IF @ToGL IS NULL      BEGIN RAISERROR('The receiving supplier has no PartyGLID mapped. Map it first.', 16, 1); RETURN; END
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID = @Bill AND Status = 'Posted')
    BEGIN RAISERROR('The GRN voucher is not Posted.', 16, 1); RETURN; END
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID = @Pay AND Status = 'Posted')
    BEGIN RAISERROR('The payment voucher is not Posted.', 16, 1); RETURN; END

-- Nothing but this payment may be settled against the bill, or moving the
-- party would strand somebody else's allocation.
DECLARE @OtherAllocs INT = (
    SELECT COUNT(*) FROM data_FinanceVoucherDetail
    WHERE AllocatedToVoucherID = @Bill AND VoucherID <> @Pay);
IF @OtherAllocs > 0
BEGIN
    RAISERROR('Another voucher is already allocated to this bill. Stopping: that allocation would be left on the old party.', 16, 1);
    RETURN;
END

DECLARE @GrnRows  INT = (SELECT COUNT(*) FROM paint_GRN WHERE GRNNo = @GrnNo AND PartyID = @FromParty);
DECLARE @BillLegs INT = (SELECT COUNT(*) FROM data_FinanceVoucherDetail
                         WHERE VoucherID = @Bill AND PartyID = @FromParty AND Credit = @Amount);
DECLARE @PayLegs  INT = (SELECT COUNT(*) FROM data_FinanceVoucherDetail
                         WHERE VoucherID = @Pay AND PartyID = @ToParty
                           AND Debit = @Amount AND AllocatedToVoucherID = @WrongBill);

-- ---- how things stand now ----------------------------------------------
PRINT '--- the GRN ---';
SELECT  g.GRNNo, g.GRNDate, g.Status, g.PaymentMode, g.GrandTotal, g.PartyID, p.PartyName
FROM    paint_GRN g LEFT JOIN gen_PartiesInfo p ON p.PartyID = g.PartyID
WHERE   g.GRNNo = @GrnNo;

PRINT '--- its voucher, and the payment ---';
SELECT  v.VoucherNo, a.GLCode, a.GLTitle, d.Debit, d.Credit, d.PartyID,
        t.VoucherNo AS AllocatedTo
FROM    data_FinanceVoucherDetail d
JOIN    data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
LEFT    JOIN GLChartOFAccount a ON a.GLCAID = d.GLCAID
LEFT    JOIN data_FinanceVoucherInfo t ON t.VoucherID = d.AllocatedToVoucherID
WHERE   d.VoucherID IN (@Bill, @Pay)
ORDER   BY v.VoucherNo, d.VoucherDetailID;

PRINT '';
PRINT CONCAT('to change: GRN rows ', @GrnRows, ', bill legs ', @BillLegs, ', payment legs ', @PayLegs,
             '  (expected 1, 1, 1)');

IF @GrnRows <> 1 OR @BillLegs <> 1 OR @PayLegs <> 1
BEGIN
    PRINT 'Nothing to do -- if all three are 0 the correction has already been applied.';
    RETURN;
END

IF @Apply = 0
BEGIN
    PRINT '';
    PRINT 'DRY RUN - nothing written. Re-run with  -v Apply=1  to apply.';
    RETURN;
END

-- ---- apply --------------------------------------------------------------
BEGIN TRANSACTION;

    -- 1. the GRN itself
    UPDATE paint_GRN SET PartyID = @ToParty WHERE GRNNo = @GrnNo AND PartyID = @FromParty;
    IF @@ROWCOUNT <> 1 BEGIN ROLLBACK TRANSACTION; RAISERROR('Expected one GRN row. Rolled back.', 16, 1); RETURN; END

    -- 2. the supplier credit leg on its voucher
    UPDATE data_FinanceVoucherDetail
    SET    GLCAID = @ToGL, PartyID = @ToParty
    WHERE  VoucherID = @Bill AND PartyID = @FromParty AND Credit = @Amount;
    IF @@ROWCOUNT <> 1 BEGIN ROLLBACK TRANSACTION; RAISERROR('Expected one bill leg. Rolled back.', 16, 1); RETURN; END

    -- 3. the subsidiary mirror of that leg. An older posting may have none;
    --    0 is acceptable, 2+ means something unexpected.
    UPDATE dms_PartyLedger
    SET    GLCAID = @ToGL, PartyID = @ToParty
    WHERE  VoucherID = @Bill AND PartyID = @FromParty;
    IF @@ROWCOUNT > 1 BEGIN ROLLBACK TRANSACTION; RAISERROR('More than one party-ledger row on the bill. Rolled back.', 16, 1); RETURN; END

    -- 4. point the payment at the bill it actually paid. Its account and
    --    party are already right -- only the allocation was adrift.
    UPDATE data_FinanceVoucherDetail
    SET    AllocatedToVoucherID = @Bill,
           Narration = N'Settle bill voucher #' + CAST(@Bill AS NVARCHAR(20)) + N' - ' + @BillNo
                     + N' (' + @GrnNo + N'). Corrected 2026-10-06: the GRN was entered against the '
                     + N'wrong supplier, so this leg had been allocated to ' + @WrongNo + N'.'
    WHERE  VoucherID = @Pay AND PartyID = @ToParty
      AND  Debit = @Amount AND AllocatedToVoucherID = @WrongBill;
    IF @@ROWCOUNT <> 1 BEGIN ROLLBACK TRANSACTION; RAISERROR('Expected one payment leg. Rolled back.', 16, 1); RETURN; END

    UPDATE dms_PartyLedger
    SET    AllocatedToVoucherID = @Bill
    WHERE  VoucherID = @Pay AND PartyID = @ToParty
      AND  Debit = @Amount AND AllocatedToVoucherID = @WrongBill;
    IF @@ROWCOUNT > 1 BEGIN ROLLBACK TRANSACTION; RAISERROR('More than one party-ledger row on the payment. Rolled back.', 16, 1); RETURN; END

    -- Only accounts and tags moved, so both vouchers must still balance.
    IF EXISTS (SELECT 1 FROM data_FinanceVoucherDetail
               WHERE VoucherID IN (@Bill, @Pay)
               GROUP BY VoucherID
               HAVING ABS(SUM(Debit) - SUM(Credit)) > 0.005)
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('A voucher would no longer balance. Rolled back.', 16, 1);
        RETURN;
    END

COMMIT TRANSACTION;
PRINT 'Applied.';

-- ---- where the three bills stand afterwards -----------------------------
PRINT '';
PRINT '--- the three bills now ---';
SELECT  v.VoucherNo, p.PartyName, SUM(d.Credit) AS Billed,
        ISNULL((SELECT SUM(d2.Debit) FROM data_FinanceVoucherDetail d2
                JOIN data_FinanceVoucherInfo v2 ON v2.VoucherID = d2.VoucherID
                WHERE d2.AllocatedToVoucherID = v.VoucherID
                  AND v2.Status = 'Posted' AND v2.ReversesVoucherID IS NULL), 0) AS Paid
FROM    data_FinanceVoucherInfo v
JOIN    data_FinanceVoucherDetail d ON d.VoucherID = v.VoucherID AND d.Credit > 0
LEFT    JOIN gen_PartiesInfo p ON p.PartyID = d.PartyID
WHERE   v.VoucherNo IN (@BillNo, 'PV-0168', @WrongNo)
GROUP   BY v.VoucherID, v.VoucherNo, p.PartyName
ORDER   BY v.VoucherNo;
