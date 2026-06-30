-- 034_seed_lookup_tables.sql
-- Idempotent seed for lookup tables that have FK references from active code
-- paths. Without these rows the corresponding modules fail at runtime even
-- though the schema is fine.
--
-- Lookups covered:
--   - gen_StockInOutType : referenced by sp_SaveStoreSale, sp_SavePurchaseGRN
--                          and the workshop stock-issue path.
--   - Addata_JobStatusInfo: referenced by Addata_JobCardInfo.JobStatusID at
--                           JC create. Wiped during the parts-only DB cleanup.
--   - Sequences           : voucher-no and campaign-GL-leaf (created here only
--                           if missing; the live values are managed at runtime).
--
-- Safe to re-run.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

------------------------------------------------------------
-- 1) gen_StockInOutType
------------------------------------------------------------
IF OBJECT_ID('gen_StockInOutType', 'U') IS NOT NULL
BEGIN
    -- Need a default StockTypeAccountID for the NOT NULL column. Pick the
    -- Spare Stocks leaf (102001009) if it exists, otherwise the first asset leaf.
    DECLARE @defaultAcct INT;
    SELECT @defaultAcct = GLCAID FROM GLChartOFAccount WHERE GLCode = '102001009' AND Status = 1;
    IF @defaultAcct IS NULL
        SELECT TOP 1 @defaultAcct = GLCAID FROM GLChartOFAccount WHERE GLNature = 1 AND isParent = 0 AND Status = 1 ORDER BY GLCode;

    IF @defaultAcct IS NOT NULL
    BEGIN
        SET IDENTITY_INSERT gen_StockInOutType ON;

        IF NOT EXISTS (SELECT 1 FROM gen_StockInOutType WHERE StockIOTypeID = 1)
            INSERT INTO gen_StockInOutType (StockIOTypeID, CompanyID, StockType, StockInOutType, StockTypeAccountID, EntryUserDateTime)
            VALUES (1, 1, 'Purchase', 'In', @defaultAcct, GETDATE());

        IF NOT EXISTS (SELECT 1 FROM gen_StockInOutType WHERE StockIOTypeID = 2)
            INSERT INTO gen_StockInOutType (StockIOTypeID, CompanyID, StockType, StockInOutType, StockTypeAccountID, EntryUserDateTime)
            VALUES (2, 1, 'Sale', 'Out', @defaultAcct, GETDATE());

        IF NOT EXISTS (SELECT 1 FROM gen_StockInOutType WHERE StockIOTypeID = 3)
            INSERT INTO gen_StockInOutType (StockIOTypeID, CompanyID, StockType, StockInOutType, StockTypeAccountID, EntryUserDateTime)
            VALUES (3, 1, 'Issue', 'Out', @defaultAcct, GETDATE());

        IF NOT EXISTS (SELECT 1 FROM gen_StockInOutType WHERE StockIOTypeID = 4)
            INSERT INTO gen_StockInOutType (StockIOTypeID, CompanyID, StockType, StockInOutType, StockTypeAccountID, EntryUserDateTime)
            VALUES (4, 1, 'Adjustment', 'In', @defaultAcct, GETDATE());

        SET IDENTITY_INSERT gen_StockInOutType OFF;
    END
END
GO

------------------------------------------------------------
-- 2) Addata_JobStatusInfo  (cols: Seriel int identity, Value int, Type nvarchar, AttachedCharacter nvarchar)
-- Value is the numeric status code, AttachedCharacter is the human label.
-- Seed the 5 JobStatus rows only if none exist yet (e.g. after a clean wipe).
------------------------------------------------------------
IF OBJECT_ID('Addata_JobStatusInfo', 'U') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM Addata_JobStatusInfo WHERE Type = 'JobStatus')
BEGIN
    INSERT INTO Addata_JobStatusInfo (Value, Type, AttachedCharacter) VALUES (0, 'JobStatus', 'Open');
    INSERT INTO Addata_JobStatusInfo (Value, Type, AttachedCharacter) VALUES (1, 'JobStatus', 'InProgress');
    INSERT INTO Addata_JobStatusInfo (Value, Type, AttachedCharacter) VALUES (2, 'JobStatus', 'Ready');
    INSERT INTO Addata_JobStatusInfo (Value, Type, AttachedCharacter) VALUES (3, 'JobStatus', 'Invoiced');
    INSERT INTO Addata_JobStatusInfo (Value, Type, AttachedCharacter) VALUES (4, 'JobStatus', 'Closed');
END
GO

------------------------------------------------------------
-- 3) Sequences for voucher-no and MCML campaign GL leaf
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_FinanceVoucherNo')
BEGIN
    DECLARE @startV BIGINT;
    SELECT @startV = ISNULL(MAX(VoucherID), 0) + 1 FROM data_FinanceVoucherInfo;
    DECLARE @sqlV NVARCHAR(400) =
        'CREATE SEQUENCE dbo.seq_FinanceVoucherNo AS BIGINT START WITH ' +
        CAST(@startV AS NVARCHAR(20)) + ' INCREMENT BY 1 NO CACHE;';
    EXEC sp_executesql @sqlV;
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_CampaignGLLeaf')
BEGIN
    DECLARE @startC INT;
    SELECT @startC = ISNULL(MAX(CAST(SUBSTRING(GLCode, 7, 3) AS INT)), 0) + 1
    FROM GLChartOFAccount
    WHERE GLCode LIKE '102006___' AND LEN(GLCode) = 9;
    DECLARE @sqlC NVARCHAR(400) =
        'CREATE SEQUENCE dbo.seq_CampaignGLLeaf AS INT START WITH ' +
        CAST(@startC AS NVARCHAR(20)) + ' INCREMENT BY 1 NO CACHE;';
    EXEC sp_executesql @sqlC;
END
GO

PRINT 'Migration 034 complete.';
