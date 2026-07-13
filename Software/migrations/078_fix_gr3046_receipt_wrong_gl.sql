-- 078_fix_gr3046_receipt_wrong_gl.sql
-- Owner report 2026-07-13:
--   BRV-0348 (Rs 56,773.54 receipt for GR-3046 against Insurance party
--   PAKISTAN FRUIT JUICE CO.PVT LTD.) was posted through the walk-in
--   Receive Payment flow. It Cr'd Gen-Cust with JobCardID=291 tag
--   instead of the party's own Insurance-Receivable GL 102007046 with
--   PartyID=7689 + AllocatedToVoucherID=SI-0322. Two-sided problem:
--     (a) Gen-Cust carries a phantom Cr of 56,773.54 (reconciliation
--         residual, appears in the 1-12 Jul Gen-Cust drill).
--     (b) Pakistan Fruit Juice's aging still shows SI-0322 open even
--         though the money was actually received into bank.
--
-- Post a correcting JV backdated to 2026-07-07 (same business date
-- as BRV-0348 so Gen-Cust reconciles that day):
--     Dr 102005006 Gen-Cust                  56,773.54  (JC=291)
--     Cr 102007046 PAK FRUIT JUICE            56,773.54  (Party=7689, AllocTo=SI-0322)
-- Also writes matching dms_PartyLedger rows so the Insurance-party
-- aging bucket for SI-0322 flips to settled.
--
-- Idempotent: skips if the correcting JV has already been posted.
SET NOCOUNT ON;
SET XACT_ABORT ON;

-- Business date per owner ask 2026-07-13 — align with BRV-0348 receipt date.
DECLARE @businessDate DATETIME = '2026-07-07';

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Resolve all the anchors up front.
    DECLARE @gcGL         INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER');
    DECLARE @partyGL      INT = (SELECT GLCAID FROM GLChartOFAccount   WHERE GLCode='102007046');
    DECLARE @jcId         INT = (SELECT JobCardId FROM Addata_JobCardInfo WHERE JobCardNo='GR-3046');
    DECLARE @partyId      INT = 7689;    -- PAKISTAN FRUIT JUICE CO.PVT LTD.
    DECLARE @amount       DECIMAL(18,2) = 56773.54;
    DECLARE @siVoucherId  INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo
                                 WHERE SourceDocType='JOBCARD' AND SourceDocID=@jcId
                                   AND Status='Posted' AND ReversesVoucherID IS NULL
                                 ORDER BY VoucherID);
    DECLARE @brvVoucherId INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo='BRV-0348');

    IF @gcGL         IS NULL THROW 51001, 'GENERAL_CUSTOMER role not found',        1;
    IF @partyGL      IS NULL THROW 51002, 'GL 102007046 not found',                 1;
    IF @jcId         IS NULL THROW 51003, 'JC GR-3046 not found',                   1;
    IF @siVoucherId  IS NULL THROW 51004, 'SI voucher for GR-3046 not found',       1;
    IF @brvVoucherId IS NULL THROW 51005, 'BRV-0348 not found',                     1;

    -- 2. Idempotency check — look for a prior correcting JV with our narration.
    DECLARE @correctionMarker NVARCHAR(200) = 'Fix BRV-0348 wrong-GL: reclassify Gen-Cust Cr to 102007046 (GR-3046)';
    IF EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE Remarks = @correctionMarker AND Status='Posted')
    BEGIN
        PRINT '078: correcting JV already exists — no-op.';
        COMMIT TRANSACTION;
        RETURN;
    END

    -- 3. Sanity check — the phantom Cr on Gen-Cust must still be there.
    -- If someone already unfinalized BRV-0348 in the meantime, don't post
    -- a duplicate offset.
    DECLARE @gcCrFromBRV DECIMAL(18,2) = (
        SELECT ISNULL(SUM(d.Credit), 0)
        FROM data_FinanceVoucherDetail d
        JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
        WHERE v.VoucherID = @brvVoucherId
          AND v.Status = 'Posted' AND v.ReversesVoucherID IS NULL
          AND d.GLCAID = @gcGL AND d.JobCardID = @jcId AND d.PartyID IS NULL
    );
    IF @gcCrFromBRV <> @amount
    BEGIN
        PRINT '078: BRV-0348 Gen-Cust Cr no longer matches ' + CAST(@amount AS NVARCHAR(20)) +
              ' (found ' + CAST(@gcCrFromBRV AS NVARCHAR(20)) + '). Aborting — someone touched it.';
        ROLLBACK TRANSACTION;
        RETURN;
    END

    -- 4. Pick JV voucher type (live has duplicate 'JV' rows — same defence as migration 075).
    DECLARE @jvTypeId INT = (SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title = 'JV' ORDER BY Voucherid);
    IF @jvTypeId IS NULL THROW 51006, 'JV voucher type missing', 1;

    DECLARE @seqN INT = NEXT VALUE FOR dbo.seq_Voucher_JV;
    DECLARE @voucherNo NVARCHAR(50) = 'JV-' + RIGHT('0000' + CAST(@seqN AS NVARCHAR(10)), 4);
    DECLARE @voucherId INT;

    -- 5. Post header (Draft first so the balanced-entry trigger fires on flip).
    INSERT INTO data_FinanceVoucherInfo
        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
         Status, Posted, SourceDocType, SourceDocID)
    VALUES
        (@businessDate, @voucherNo, @jvTypeId, @correctionMarker, @amount,
         'Draft', 0, 'VOUCHER', NULL);
    SET @voucherId = SCOPE_IDENTITY();

    -- 6. Detail lines.
    -- Dr Gen-Cust (JC=291) — offsets BRV-0348's wrong Cr; Gen-Cust net for the JC returns to 0.
    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @gcGL,
         'Reclassify BRV-0348 Cr off Gen-Cust (JC GR-3046 was Insurance-party invoice)',
         @amount, 0, NULL, @jcId, NULL);

    -- Cr Party GL 102007046 (PartyID=7689, AllocTo=SI-0322) — settles the party's aging bucket.
    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @partyGL,
         'Settle Insurance receivable — BRV-0348 for GR-3046 (Party 7689)',
         0, @amount, @partyId, NULL, @siVoucherId);

    -- 7. Party ledger mirror rows.
    -- (a) Dr on Gen-Cust JC subsidiary — offsets the walk-in Cr row BRV-0348 wrote.
    INSERT INTO dms_PartyLedger
        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
    VALUES
        (NULL, @jcId, @voucherId, @gcGL,
         @amount, 0,
         'Reclassify BRV-0348 Cr off Gen-Cust (JC GR-3046)');

    -- (b) Cr on Party GL — settles SI-0322 in the party's aging bucket.
    INSERT INTO dms_PartyLedger
        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
    VALUES
        (@partyId, NULL, @voucherId, @partyGL,
         0, @amount,
         'Settle SI-0322 (GR-3046) via reclassified BRV-0348',
         @siVoucherId);

    -- 8. Flip to Posted — triggers the balanced-entry guard (Dr = Cr = @amount).
    UPDATE data_FinanceVoucherInfo
    SET Status='Posted', Posted=1, PostedAt=GETDATE()
    WHERE VoucherID=@voucherId;

    PRINT '078: correcting JV ' + @voucherNo + ' posted for PKR ' + CAST(@amount AS NVARCHAR(20)) +
          ' (backdated ' + CONVERT(NVARCHAR(10), @businessDate, 121) + ').';
    PRINT '     Dr Gen-Cust (JC=' + CAST(@jcId AS NVARCHAR(10)) + ')  Cr 102007046 (Party=' +
          CAST(@partyId AS NVARCHAR(10)) + ', AllocTo=SI-0322 VoucherID ' + CAST(@siVoucherId AS NVARCHAR(10)) + ').';

    COMMIT TRANSACTION;
    PRINT '078_fix_gr3046_receipt_wrong_gl complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
