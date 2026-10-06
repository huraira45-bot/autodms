-- fix_bpv0418_misdirected_leg.sql
--
-- Owner report 2026-10-06: PGRN-0007 stopped appearing in Make Payment.
--
-- BPV-0418 (18 Sep 2026, 500,500.00 out of BOP WAPDA TOWN BR) was one bank
-- transfer settling two suppliers' bills. Its own narration says so:
-- "Payment of PGR # 0002 & 0006".
--
--   175,500.00  -> PGRN-0006  PV-0168  party 7770 PROTECTIVE FILM SERVICE  correct
--   325,000.00  -> PGRN-0002  PV-0145  party 7769 Shaukat Paint House      MISDIRECTED
--
-- The second leg was posted to PROTECTIVE FILM SERVICE's payable account,
-- tagged party 7770, and allocated to PV-0169 (PGRN-0007, a 175,500 bill).
-- Three fields wrong on one row. The amounts are right and the voucher
-- balances, so nothing moves in or out of the bank -- 325,000 simply sits on
-- the wrong supplier.
--
-- What it is doing to the books today:
--   PROTECTIVE FILM SERVICE understated by 325,000 -- PGRN-0007 looks
--     over-paid and drops out of Make Payment, though its full 175,500 is owed
--   Shaukat Paint House overstated by 325,000 -- PGRN-0002 still shows unpaid
--     although the money left the bank on 18 Sep
--
-- This repoints that one leg, and its mirror row in dms_PartyLedger, to the
-- supplier and bill it was always meant for. No amount changes anywhere.
--
-- DO NOT RUN IF the 18 Sep bank statement shows anything other than a single
-- 500,500.00 transfer covering both bills. If only one supplier was actually
-- paid, PGRN-0002 is unpaid and the 325,000 is an advance -- a different fix.
--
--   dry run:  sqlcmd ... -v Apply=0 -i scripts\fix_bpv0418_misdirected_leg.sql
--   apply:    sqlcmd ... -v Apply=1 -i scripts\fix_bpv0418_misdirected_leg.sql
--
-- Apply must be passed either way. A :setvar default is deliberately not used:
-- sqlcmd lets a :setvar inside the file override -v from the command line, so
-- a default here would quietly make the apply switch do nothing.
--
-- The identifiers are variables so this can be rehearsed against a fixture
-- before it is pointed at the real vouchers.
--
-- Safe to re-run: once corrected, the target row no longer matches.
-- sqlcmd runs with QUOTED_IDENTIFIER OFF, and these tables carry indexes
-- that require it ON -- without this the UPDATE fails outright (caught
-- rehearsing this on dev, 2026-10-06). It has to be its own batch,
-- because QUOTED_IDENTIFIER is applied when a batch is parsed.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @Apply BIT = CASE WHEN '$(Apply)' = '1' THEN 1 ELSE 0 END;

DECLARE @PayNo     NVARCHAR(50) = 'BPV-0418';   -- the bank payment
DECLARE @WrongNo   NVARCHAR(50) = 'PV-0169';    -- PGRN-0007, wrongly settled
DECLARE @RightNo   NVARCHAR(50) = 'PV-0145';    -- PGRN-0002, actually paid
DECLARE @BadParty  INT = 7770;                  -- PROTECTIVE FILM SERVICE
DECLARE @GoodParty INT = 7769;                  -- Shaukat Paint House
DECLARE @Amount DECIMAL(18,2) = 325000.00;

DECLARE @PayVoucher  INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @PayNo);
DECLARE @WrongBill   INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @WrongNo);
DECLARE @RightBill   INT = (SELECT VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo = @RightNo);
DECLARE @GoodPartyGL INT = (SELECT PartyGLID FROM gen_PartiesInfo WHERE PartyID = @GoodParty);

-- ---- refuse on anything unexpected -------------------------------------
IF @PayVoucher IS NULL   BEGIN RAISERROR('Payment voucher not found.', 16, 1); RETURN; END
IF @WrongBill IS NULL    BEGIN RAISERROR('Wrongly-settled bill not found.', 16, 1); RETURN; END
IF @RightBill IS NULL    BEGIN RAISERROR('Correct bill not found.', 16, 1); RETURN; END
IF @GoodPartyGL IS NULL  BEGIN RAISERROR('The receiving supplier has no PartyGLID mapped. Map it first.', 16, 1); RETURN; END
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID = @PayVoucher AND Status = 'Posted')
    BEGIN RAISERROR('The payment voucher is not Posted. Nothing is corrected on a voucher that is not live.', 16, 1); RETURN; END
IF NOT EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE VoucherID = @RightBill AND Status = 'Posted')
    BEGIN RAISERROR('The correct bill is not Posted. Check it before repointing a payment at it.', 16, 1); RETURN; END

DECLARE @Legs INT = (
    SELECT COUNT(*) FROM data_FinanceVoucherDetail
    WHERE VoucherID = @PayVoucher AND PartyID = @BadParty
      AND Debit = @Amount AND AllocatedToVoucherID = @WrongBill);

-- ---- what it looks like now --------------------------------------------
PRINT '--- the payment as it stands ---';
SELECT  d.VoucherDetailID, a.GLCode, a.GLTitle, d.Debit, d.Credit, d.PartyID,
        t.VoucherNo AS AllocatedTo
FROM    data_FinanceVoucherDetail d
LEFT    JOIN GLChartOFAccount a ON a.GLCAID = d.GLCAID
LEFT    JOIN data_FinanceVoucherInfo t ON t.VoucherID = d.AllocatedToVoucherID
WHERE   d.VoucherID = @PayVoucher
ORDER   BY d.VoucherDetailID;

IF @Legs <> 1
BEGIN
    PRINT CONCAT('Nothing to do: found ', @Legs, ' matching leg(s), expected exactly 1.');
    PRINT 'If this says 0, the correction has already been applied.';
    RETURN;
END

DECLARE @NewNarration NVARCHAR(500) =
    N'Settle bill voucher #' + CAST(@RightBill AS NVARCHAR(20)) + N' - ' + @RightNo
    + N'. Corrected 2026-10-06: this leg was posted to the wrong supplier and '
    + N'allocated to ' + @WrongNo + N' in error.';

PRINT '';
PRINT '--- what will change ---';
SELECT  'data_FinanceVoucherDetail' AS [Table], d.VoucherDetailID,
        a.GLCode + ' ' + a.GLTitle AS FromAccount,
        g.GLCode + ' ' + g.GLTitle AS ToAccount,
        d.PartyID AS FromParty, @GoodParty AS ToParty,
        @WrongNo AS FromBill, @RightNo AS ToBill, d.Debit AS Amount
FROM    data_FinanceVoucherDetail d
LEFT    JOIN GLChartOFAccount a ON a.GLCAID = d.GLCAID
LEFT    JOIN GLChartOFAccount g ON g.GLCAID = @GoodPartyGL
WHERE   d.VoucherID = @PayVoucher AND d.PartyID = @BadParty
  AND   d.Debit = @Amount AND d.AllocatedToVoucherID = @WrongBill;

SELECT  'dms_PartyLedger' AS [Table], l.LedgerID, l.PartyID, l.GLCAID, l.Debit, l.AllocatedToVoucherID
FROM    dms_PartyLedger l
WHERE   l.VoucherID = @PayVoucher AND l.PartyID = @BadParty
  AND   l.Debit = @Amount AND l.AllocatedToVoucherID = @WrongBill;

IF @Apply = 0
BEGIN
    PRINT '';
    PRINT 'DRY RUN - nothing written. Re-run with  -v Apply=1  to apply.';
    RETURN;
END

-- ---- apply --------------------------------------------------------------
BEGIN TRANSACTION;

    UPDATE  data_FinanceVoucherDetail
    SET     GLCAID = @GoodPartyGL, PartyID = @GoodParty,
            AllocatedToVoucherID = @RightBill, Narration = @NewNarration
    WHERE   VoucherID = @PayVoucher AND PartyID = @BadParty
      AND   Debit = @Amount AND AllocatedToVoucherID = @WrongBill;

    IF @@ROWCOUNT <> 1
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('Expected to change exactly one voucher leg. Rolled back.', 16, 1);
        RETURN;
    END

    -- The payment screen mirrors each settlement into dms_PartyLedger, so the
    -- subsidiary copy has to follow or the party ledger keeps the old story.
    -- An older payment may have no mirror row; 0 is acceptable here, 2+ is not.
    UPDATE  dms_PartyLedger
    SET     GLCAID = @GoodPartyGL, PartyID = @GoodParty,
            AllocatedToVoucherID = @RightBill, Narration = @NewNarration
    WHERE   VoucherID = @PayVoucher AND PartyID = @BadParty
      AND   Debit = @Amount AND AllocatedToVoucherID = @WrongBill;

    IF @@ROWCOUNT > 1
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('More than one party-ledger mirror row matched. Rolled back.', 16, 1);
        RETURN;
    END

    -- Only an account changed, so it must still balance. This catches a
    -- mistake in the statements above, not a real risk.
    DECLARE @Dr DECIMAL(18,2), @Cr DECIMAL(18,2);
    SELECT  @Dr = SUM(Debit), @Cr = SUM(Credit)
    FROM    data_FinanceVoucherDetail WHERE VoucherID = @PayVoucher;
    IF ABS(@Dr - @Cr) > 0.005
    BEGIN
        ROLLBACK TRANSACTION;
        RAISERROR('The payment would no longer balance. Rolled back.', 16, 1);
        RETURN;
    END

COMMIT TRANSACTION;
PRINT 'Applied.';

-- ---- where the two bills stand afterwards -------------------------------
PRINT '';
PRINT '--- the two bills now ---';
SELECT  v.VoucherNo, p.PartyName, SUM(d.Credit) AS Billed,
        ISNULL((SELECT SUM(d2.Debit) FROM data_FinanceVoucherDetail d2
                JOIN data_FinanceVoucherInfo v2 ON v2.VoucherID = d2.VoucherID
                WHERE d2.AllocatedToVoucherID = v.VoucherID
                  AND v2.Status = 'Posted' AND v2.ReversesVoucherID IS NULL), 0) AS Paid
FROM    data_FinanceVoucherInfo v
JOIN    data_FinanceVoucherDetail d ON d.VoucherID = v.VoucherID AND d.Credit > 0
LEFT    JOIN gen_PartiesInfo p ON p.PartyID = d.PartyID
WHERE   v.VoucherID IN (@WrongBill, @RightBill)
GROUP   BY v.VoucherID, v.VoucherNo, p.PartyName;
