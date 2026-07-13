-- 079_fix_sal118_bp1016_receipts_wrong_gl.sql
-- Owner report 2026-07-13:
--   CRV-0372 (28,000.00 for SAL-00118) and CRV-0371 (649.00 for B&P-1016)
--   were both posted through the walk-in Receive Payment flow. They Cr'd
--   Gen-Cust instead of the parties' own credit GLs:
--     SAL-00118 -> Party 7788 C/O HASSAN SB (Customer), GL 102008061
--     B&P-1016  -> Party 7669 C/O HASSAN SB (Insurance), GL 102007026
--   Both SI vouchers correctly Dr'd the party GLs. The wrong receipt Crs
--   are stranded on Gen-Cust and the aging on both parties still shows
--   the invoices open even though bank got the money.
--
-- Post one correcting JV backdated to 2026-07-10 (both receipts' date
-- per owner ask 2026-07-13, so Gen-Cust reconciliation for 07-10 lines
-- up cleanly):
--   Dr Gen-Cust                        28,000.00  (AllocTo=SS-0242 VoucherID)
--   Cr 102008061 HASSAN SB (Customer)  28,000.00  (Party=7788, AllocTo=SS-0242)
--   Dr Gen-Cust                           649.00  (JC=391, AllocTo=SI-0390 VoucherID)
--   Cr 102007026 HASSAN SB (Insurance)    649.00  (Party=7669, AllocTo=SI-0390)
-- Total Dr = Total Cr = 28,649.00. Balanced-entry trigger passes.
-- Also writes dms_PartyLedger rows so both parties' aging buckets flip
-- to settled (B&P-1016 leaves 0.60 as small underpayment residue since
-- CRV-0371 received 649 vs SI-0390's 649.60).
--
-- Idempotent: skips if the marker JV is already present. Sanity check
-- confirms both wrong Gen-Cust Crs are still there before posting.
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @businessDate DATETIME = '2026-07-10';

BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Anchors
    DECLARE @gcGL INT = (SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER');

    DECLARE @partyGL1     INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='102008061');
    DECLARE @partyId1     INT = 7788;
    DECLARE @amount1      DECIMAL(18,2) = 28000.00;
    DECLARE @siVoucherId1 INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo
                                 WHERE SourceDocType='STORE_SALE' AND SourceDocID=118
                                   AND Status='Posted' AND ReversesVoucherID IS NULL
                                 ORDER BY VoucherID);
    DECLARE @crv1Id       INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo='CRV-0372');

    DECLARE @partyGL2     INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='102007026');
    DECLARE @partyId2     INT = 7669;
    DECLARE @jcId2        INT = (SELECT JobCardId FROM Addata_JobCardInfo WHERE JobCardNo='B&P-1016');
    DECLARE @amount2      DECIMAL(18,2) = 649.00;
    DECLARE @siVoucherId2 INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo
                                 WHERE SourceDocType='JOBCARD' AND SourceDocID=@jcId2
                                   AND Status='Posted' AND ReversesVoucherID IS NULL
                                 ORDER BY VoucherID);
    DECLARE @crv2Id       INT = (SELECT TOP 1 VoucherID FROM data_FinanceVoucherInfo WHERE VoucherNo='CRV-0371');

    IF @gcGL         IS NULL THROW 51001, 'GENERAL_CUSTOMER role not found', 1;
    IF @partyGL1     IS NULL THROW 51002, 'GL 102008061 (Hassan Customer) not found', 1;
    IF @partyGL2     IS NULL THROW 51003, 'GL 102007026 (Hassan Insurance) not found', 1;
    IF @siVoucherId1 IS NULL THROW 51004, 'SI for SAL-00118 not found', 1;
    IF @siVoucherId2 IS NULL THROW 51005, 'SI for B&P-1016 not found', 1;
    IF @jcId2        IS NULL THROW 51006, 'JC B&P-1016 not found', 1;
    IF @crv1Id       IS NULL THROW 51007, 'CRV-0372 not found', 1;
    IF @crv2Id       IS NULL THROW 51008, 'CRV-0371 not found', 1;

    -- 2. Idempotency
    DECLARE @marker NVARCHAR(200) = 'Fix wrong-GL Crs: reclassify Gen-Cust to party GLs (SAL-00118 + B&P-1016)';
    IF EXISTS (SELECT 1 FROM data_FinanceVoucherInfo WHERE Remarks=@marker AND Status='Posted')
    BEGIN
        PRINT '079: correcting JV already posted — no-op.';
        COMMIT TRANSACTION;
        RETURN;
    END

    -- 3. Sanity — the wrong Gen-Cust Crs must still be there.
    DECLARE @crv1GcCr DECIMAL(18,2) = (
        SELECT ISNULL(SUM(d.Credit), 0)
        FROM data_FinanceVoucherDetail d
        JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
        WHERE v.VoucherID=@crv1Id AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
          AND d.GLCAID=@gcGL
    );
    DECLARE @crv2GcCr DECIMAL(18,2) = (
        SELECT ISNULL(SUM(d.Credit), 0)
        FROM data_FinanceVoucherDetail d
        JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
        WHERE v.VoucherID=@crv2Id AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
          AND d.GLCAID=@gcGL AND d.JobCardID=@jcId2
    );
    IF @crv1GcCr <> @amount1
    BEGIN
        PRINT '079: CRV-0372 Gen-Cust Cr no longer matches ' + CAST(@amount1 AS NVARCHAR(20)) +
              ' (found ' + CAST(@crv1GcCr AS NVARCHAR(20)) + '). Aborting.';
        ROLLBACK TRANSACTION;
        RETURN;
    END
    IF @crv2GcCr <> @amount2
    BEGIN
        PRINT '079: CRV-0371 Gen-Cust Cr no longer matches ' + CAST(@amount2 AS NVARCHAR(20)) +
              ' (found ' + CAST(@crv2GcCr AS NVARCHAR(20)) + '). Aborting.';
        ROLLBACK TRANSACTION;
        RETURN;
    END

    -- 4. Voucher type
    DECLARE @jvTypeId INT = (SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid);
    IF @jvTypeId IS NULL THROW 51009, 'JV voucher type missing', 1;

    DECLARE @seqN INT = NEXT VALUE FOR dbo.seq_Voucher_JV;
    DECLARE @voucherNo NVARCHAR(50) = 'JV-' + RIGHT('0000' + CAST(@seqN AS NVARCHAR(10)), 4);
    DECLARE @totalAmount DECIMAL(18,2) = @amount1 + @amount2;
    DECLARE @voucherId INT;

    -- 5. Header (Draft first)
    INSERT INTO data_FinanceVoucherInfo
        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
         Status, Posted, SourceDocType, SourceDocID)
    VALUES
        (@businessDate, @voucherNo, @jvTypeId, @marker, @totalAmount,
         'Draft', 0, 'VOUCHER', NULL);
    SET @voucherId = SCOPE_IDENTITY();

    -- 6. Details
    -- Case A: SAL-00118
    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @gcGL,
         'Reclassify CRV-0372 Cr off Gen-Cust (SAL-00118 credit party)',
         @amount1, 0, NULL, NULL, @siVoucherId1);

    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @partyGL1,
         'Settle SS-0242 (SAL-00118) via reclassified CRV-0372 — Party 7788',
         0, @amount1, @partyId1, NULL, @siVoucherId1);

    -- Case B: B&P-1016
    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @gcGL,
         'Reclassify CRV-0371 Cr off Gen-Cust (B&P-1016 credit party)',
         @amount2, 0, NULL, @jcId2, @siVoucherId2);

    INSERT INTO data_FinanceVoucherDetail
        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
    VALUES
        (@voucherId, @partyGL2,
         'Settle SI-0390 (B&P-1016) via reclassified CRV-0371 — Party 7669',
         0, @amount2, @partyId2, NULL, @siVoucherId2);

    -- 7. Party ledger mirrors
    -- Case A settle: Cr on Party 7788 GL, allocated to SS-0242.
    INSERT INTO dms_PartyLedger
        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
    VALUES
        (@partyId1, NULL, @voucherId, @partyGL1,
         0, @amount1,
         'Settle SS-0242 (SAL-00118) via reclassified CRV-0372',
         @siVoucherId1);

    -- Case B offset: Dr on Gen-Cust JC subsidiary — cancels CRV-0371's walk-in row.
    INSERT INTO dms_PartyLedger
        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
    VALUES
        (NULL, @jcId2, @voucherId, @gcGL,
         @amount2, 0,
         'Reclassify CRV-0371 Cr off Gen-Cust (B&P-1016)');

    -- Case B settle: Cr on Party 7669 GL, allocated to SI-0390.
    INSERT INTO dms_PartyLedger
        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration, AllocatedToVoucherID)
    VALUES
        (@partyId2, NULL, @voucherId, @partyGL2,
         0, @amount2,
         'Settle SI-0390 (B&P-1016) via reclassified CRV-0371',
         @siVoucherId2);

    -- 8. Flip to Posted
    UPDATE data_FinanceVoucherInfo
    SET Status='Posted', Posted=1, PostedAt=GETDATE()
    WHERE VoucherID=@voucherId;

    PRINT '079: correcting JV ' + @voucherNo + ' posted for PKR ' + CAST(@totalAmount AS NVARCHAR(20)) +
          ' (backdated ' + CONVERT(NVARCHAR(10), @businessDate, 121) + ').';
    PRINT '     SAL-00118: Dr Gen-Cust 28000 / Cr 102008061 (Party 7788, AllocTo=' + CAST(@siVoucherId1 AS NVARCHAR(10)) + ')';
    PRINT '     B&P-1016 : Dr Gen-Cust 649   / Cr 102007026 (Party 7669, AllocTo=' + CAST(@siVoucherId2 AS NVARCHAR(10)) + ')';

    COMMIT TRANSACTION;
    PRINT '079_fix_sal118_bp1016_receipts_wrong_gl complete.';
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    DECLARE @errMsg NVARCHAR(4000) = ERROR_MESSAGE();
    PRINT 'FAILED: ' + @errMsg;
    THROW;
END CATCH;
