SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Single global voucher-no sequence for data_FinanceVoucherInfo writes.
-- Start above the current MAX so we don't collide with existing IDs.
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_FinanceVoucherNo')
BEGIN
    DECLARE @start BIGINT;
    SELECT @start = ISNULL(MAX(VoucherID), 0) + 1000 FROM data_FinanceVoucherInfo;
    DECLARE @sql NVARCHAR(400) = 'CREATE SEQUENCE dbo.seq_FinanceVoucherNo AS BIGINT START WITH ' + CAST(@start AS NVARCHAR(20)) + ' INCREMENT BY 1 NO CACHE;';
    EXEC sp_executesql @sql;
END
GO

-- Sequence for next 102006xxx campaign GL leaf code.
-- Start above current max suffix so codes stay monotonic.
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_CampaignGLLeaf')
BEGIN
    DECLARE @startC INT;
    SELECT @startC = ISNULL(MAX(CAST(SUBSTRING(GLCode,7,3) AS INT)), 0) + 1
    FROM GLChartOFAccount WHERE GLCode LIKE '102006___' AND LEN(GLCode) = 9;
    DECLARE @sqlC NVARCHAR(400) = 'CREATE SEQUENCE dbo.seq_CampaignGLLeaf AS INT START WITH ' + CAST(@startC AS NVARCHAR(20)) + ' INCREMENT BY 1 NO CACHE;';
    EXEC sp_executesql @sqlC;
END
GO

PRINT 'Sequences created.';
SELECT name, current_value, start_value FROM sys.sequences WHERE name IN ('seq_FinanceVoucherNo', 'seq_CampaignGLLeaf');
