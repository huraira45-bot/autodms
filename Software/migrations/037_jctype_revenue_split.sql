-- 037_jctype_revenue_split.sql
-- Give each MCML-claim JC type its own revenue leaf so P&L per category is
-- visible. Today FFS/SFS/PDS/PPM all share 401002001 Workshop Income;
-- after this migration each posts to its own leaf.
--
-- New leaves created under 401002 (Income - Service Department):
--   401002008 FFS Income
--   401002009 SFS Income
--   401002010 PDS Income
--   401002011 PPM Income
--
-- The JC types are rewired to point at their new leaf. GR keeps Workshop
-- Income (401002001), B&P keeps Paint & Body Shop Income (401002003), CT
-- keeps CT INCOME (401002007), WR keeps WARRANTY INCOME (401002004).
--
-- Historical SI vouchers (already posted to 401002001) are NOT retroactively
-- repointed — that would distort the audit trail. Only future finalizes go
-- to the new leaves.

SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

DECLARE @parentId INT, @parentNature TINYINT;
SELECT @parentId = GLCAID, @parentNature = GLNature
FROM GLChartOFAccount
WHERE GLCode = '401002' AND Status = 1;

IF @parentId IS NULL THROW 50000, 'Parent 401002 Income - Service Department not found.', 1;

-- Make sure parent is marked as a group
UPDATE GLChartOFAccount SET isParent = 1 WHERE GLCAID = @parentId AND isParent = 0;

-- Helper: create a leaf only if missing, return its GLCAID
DECLARE @ffsId INT, @sfsId INT, @pdsId INT, @ppmId INT;

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401002008')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
    VALUES ('401002008', 'FFS Income', 4, @parentNature, 0, 0, 1, 1, '01', 0);
SELECT @ffsId = GLCAID FROM GLChartOFAccount WHERE GLCode = '401002008';

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401002009')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
    VALUES ('401002009', 'SFS Income', 4, @parentNature, 0, 0, 1, 1, '01', 0);
SELECT @sfsId = GLCAID FROM GLChartOFAccount WHERE GLCode = '401002009';

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401002010')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
    VALUES ('401002010', 'PDS Income', 4, @parentNature, 0, 0, 1, 1, '01', 0);
SELECT @pdsId = GLCAID FROM GLChartOFAccount WHERE GLCode = '401002010';

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '401002011')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
    VALUES ('401002011', 'PPM Income', 4, @parentNature, 0, 0, 1, 1, '01', 0);
SELECT @ppmId = GLCAID FROM GLChartOFAccount WHERE GLCode = '401002011';

-- Re-point the JC types
UPDATE gen_JobCardType SET JobRevenueAccount = @ffsId WHERE CardCode = 'FFS';
UPDATE gen_JobCardType SET JobRevenueAccount = @sfsId WHERE CardCode = 'SFS';
UPDATE gen_JobCardType SET JobRevenueAccount = @pdsId WHERE CardCode = 'PDS';
UPDATE gen_JobCardType SET JobRevenueAccount = @ppmId WHERE CardCode = 'PPM';

PRINT 'Migration 037 complete.';

SELECT jt.CardCode, jt.Title, jt.JobRevenueAccount, jra.GLCode, jra.GLTitle
FROM gen_JobCardType jt
LEFT JOIN GLChartOFAccount jra ON jra.GLCAID = jt.JobRevenueAccount
ORDER BY jt.JobCardTypeId;
