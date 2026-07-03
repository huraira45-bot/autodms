-- 062_per_voucher_type_sequences.sql
-- Owner request 2026-07-02: give every voucher type its own numbering
-- sequence so CPV / BPV / CRV / BRV / SI / SS / etc. each stay strictly
-- sequential in their own type-space (no more "CPV jumped 140 numbers"
-- because every voucher type shared one seq_FinanceVoucherNo).
--
-- Per-type sequences:
--   seq_Voucher_SI   / seq_Voucher_SS   / seq_Voucher_SSR
--   seq_Voucher_GRN  / seq_Voucher_GRTN
--   seq_Voucher_CRV  / seq_Voucher_BRV  / seq_Voucher_CPV  / seq_Voucher_BPV
--   seq_Voucher_JV   (also used by JV-OB opening balance and JV-REV reversals)
--
-- Reversals ({originalType}-REV-NNNN) draw from their originating type's
-- sequence — so an SI reversal (SI-REV-NNNN) uses seq_Voucher_SI. This
-- keeps the "SI number space" strictly monotonic (an SI-REV creates one
-- tiny hole in the SI numbering, but never leaves the space).
--
-- Idempotent — safe to re-run. Each block creates the sequence if missing
-- and then RESTARTs it at MAX(current suffix for that prefix) + 1 so no
-- new voucher can collide with an existing numbered voucher.
SET QUOTED_IDENTIFIER ON;
GO

-- Helper procedure: (re)seed a per-type sequence to MAX(existing suffix)+1
-- Returns the seed value chosen (for the PRINT log).
IF OBJECT_ID('dbo.usp_SeedVoucherTypeSeq', 'P') IS NOT NULL
    DROP PROCEDURE dbo.usp_SeedVoucherTypeSeq;
GO

CREATE PROCEDURE dbo.usp_SeedVoucherTypeSeq
    @seqName SYSNAME,
    @likePattern NVARCHAR(50),   -- e.g. 'SI-%', 'CPV-%', 'JV-%'
    @stripPrefix INT              -- how many chars to strip before parsing numeric suffix
AS
BEGIN
    SET NOCOUNT ON;
    -- Look at every voucher whose number matches the pattern; extract the
    -- final numeric suffix. Also match reversal-style '{TYPE}-REV-NNNN' and
    -- '{TYPE}-OB-YYYY-MM-NNNN' — those numbers came from the same pool.
    DECLARE @maxSuffix INT;
    DECLARE @sql NVARCHAR(MAX) = N'
        SELECT @m = ISNULL(MAX(TRY_CAST(RIGHT(VoucherNo, PATINDEX(''%[^0-9]%'', REVERSE(VoucherNo)) - 1) AS INT)), 0)
        FROM data_FinanceVoucherInfo
        WHERE VoucherNo LIKE @p';
    EXEC sp_executesql @sql,
        N'@m INT OUTPUT, @p NVARCHAR(50)',
        @m = @maxSuffix OUTPUT,
        @p = @likePattern;

    IF @maxSuffix IS NULL SET @maxSuffix = 0;
    DECLARE @next INT = @maxSuffix + 1;

    IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = @seqName)
    BEGIN
        DECLARE @createSql NVARCHAR(MAX) = N'CREATE SEQUENCE dbo.' + QUOTENAME(@seqName)
            + N' AS BIGINT START WITH ' + CAST(@next AS NVARCHAR(20))
            + N' INCREMENT BY 1 NO CACHE';
        EXEC sp_executesql @createSql;
        PRINT '  Created ' + @seqName + ' starting at ' + CAST(@next AS NVARCHAR(10));
    END
    ELSE
    BEGIN
        DECLARE @restartSql NVARCHAR(MAX) = N'ALTER SEQUENCE dbo.' + QUOTENAME(@seqName)
            + N' RESTART WITH ' + CAST(@next AS NVARCHAR(20));
        EXEC sp_executesql @restartSql;
        PRINT '  Re-seeded ' + @seqName + ' to ' + CAST(@next AS NVARCHAR(10));
    END
END
GO

PRINT 'Seeding per-type voucher sequences...';
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_SI',   'SI-%',   3;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_SS',   'SS-%',   3;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_SSR',  'SSR-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_PV',   'PV-%',   3;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_PRV',  'PRV-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_CRV',  'CRV-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_BRV',  'BRV-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_CPV',  'CPV-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_BPV',  'BPV-%',  4;
EXEC dbo.usp_SeedVoucherTypeSeq 'seq_Voucher_JV',   'JV-%',   3;
GO

DROP PROCEDURE dbo.usp_SeedVoucherTypeSeq;
GO

PRINT '062_per_voucher_type_sequences.sql complete.';
GO
