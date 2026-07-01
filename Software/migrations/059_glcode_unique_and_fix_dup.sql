-- 059_glcode_unique_and_fix_dup.sql
-- Owner report (2026-07-01): two COA leaves live at GLCode='2010021000':
--   GLCAID 32968 PARAMOUNT AGRO CHEMICALS A/C BOP  (4 posted voucher lines)
--   GLCAID 32969 ADEEL TRADERS A/C FBL             (zero postings)
-- Root cause: the "Add Account" UI computes next code as MAX(GLCode)+1
-- without a locking / uniqueness guarantee, so two admins clicking Save at
-- the same time under the same parent can compute the same next code, and
-- the DB silently accepts both (GLCode has only a non-unique index).
--
-- Fix:
--   1. Rename the unused ADEEL TRADERS leaf to the next free code under the
--      same 201002 parent (highest existing is 201002199, so 201002200 is
--      the next slot). Postings key off GLCAID, not GLCode, so no ledger
--      references need updating.
--   2. Add a unique index on GLCode so a duplicate insert fails fast on the
--      next collision instead of quietly creating a second leaf.
SET QUOTED_IDENTIFIER ON;
GO

-- Guard against re-running: only rename if the ADEEL row is still on the
-- duplicate code and no one has taken 201002200 in the meantime.
IF EXISTS (
    SELECT 1 FROM GLChartOFAccount
    WHERE GLCAID = 32969 AND GLCode = '2010021000'
)
AND NOT EXISTS (
    SELECT 1 FROM GLChartOFAccount WHERE GLCode = '201002200'
)
BEGIN
    UPDATE GLChartOFAccount
    SET GLCode = '201002200',
        AccountLevelFour = '201002200'
    WHERE GLCAID = 32969 AND GLCode = '2010021000';
    PRINT 'Renamed ADEEL TRADERS A/C FBL from 2010021000 to 201002200.';
END
ELSE
    PRINT 'ADEEL TRADERS rename skipped (already done or target code taken).';
GO

-- Fail loudly if any other duplicate GLCodes remain — the unique index below
-- will refuse to build if there are collisions, so surface them explicitly
-- rather than watching a cryptic index-create error.
IF EXISTS (
    SELECT GLCode FROM GLChartOFAccount
    GROUP BY GLCode HAVING COUNT(*) > 1
)
BEGIN
    DECLARE @dups NVARCHAR(MAX) = '';
    SELECT @dups = @dups + GLCode + ' (x' + CAST(COUNT(*) AS NVARCHAR(10)) + ') '
    FROM GLChartOFAccount GROUP BY GLCode HAVING COUNT(*) > 1;
    RAISERROR('GLCode duplicates still exist — resolve before rerunning: %s', 16, 1, @dups);
END
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('GLChartOFAccount') AND name = 'UX_GLChartOFAccount_GLCode'
)
BEGIN
    CREATE UNIQUE NONCLUSTERED INDEX UX_GLChartOFAccount_GLCode
    ON GLChartOFAccount(GLCode);
    PRINT 'Unique index UX_GLChartOFAccount_GLCode created.';
END
ELSE
    PRINT 'Unique index UX_GLChartOFAccount_GLCode already present.';
GO

PRINT '059_glcode_unique_and_fix_dup.sql complete.';
GO
