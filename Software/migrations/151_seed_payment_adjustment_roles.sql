-- 151_seed_payment_adjustment_roles.sql
--
-- Owner report 2026-10-06: "on Receive Payment the tax and other things we
-- subtract, can't find their linkage in Accounting Setup."
--
-- The five settlement deductions were pinned to the GL codes the owner
-- dictated on 2026-06-20, resolved by code in paymentController.js with no way
-- to see or change them from the app. They now each have a system-account role
-- that Accounting Setup can map.
--
-- Two things happen here.
--
-- 1. dms_SystemAccounts.RoleKey is pinned by a CHECK constraint listing every
--    known role, so a new one cannot be saved from Accounting Setup until the
--    constraint knows about it. It is rebuilt to admit the eight roles added
--    for payment deductions -- including the three on the Make Payment side
--    from earlier today, which would otherwise have failed the first time
--    anyone tried to map them. The existing list is read out of the current
--    constraint and carried over in full, so a role that is allowed today but
--    not yet mapped is not quietly lost.
--
-- 2. The five receive-side roles are seeded with the codes already in use, so
--    Accounting Setup opens showing where each one currently points instead of
--    blank. No posting behaviour changes: before this the code was used, after
--    it the role resolves to the same account.
--
-- Safe to re-run: the constraint is rebuilt from itself plus the new keys, and
-- a role is seeded only when it is unmapped and its default GL leaf exists.
-- The FOR XML .value() below needs QUOTED_IDENTIFIER ON and sqlcmd runs it
-- OFF, so it goes in its own batch: the setting is applied at parse time.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @keys TABLE (RoleKey NVARCHAR(50) PRIMARY KEY);

-- The roles this migration introduces.
INSERT INTO @keys (RoleKey) VALUES
    ('WHT_PAYABLE_GOODS'), ('WHT_PAYABLE_SERVICES'), ('SALES_TAX_WITHHELD_PAYABLE'),
    ('WHT_RECEIVABLE_GOODS'), ('WHT_RECEIVABLE_SERVICES'), ('SALES_TAX_WITHHELD_RECEIVABLE'),
    ('SALVAGE_EXPENSE'), ('RO_SHORTAGE_EXPENSE');

-- Anything already mapped must stay allowed, whatever the constraint says.
INSERT INTO @keys (RoleKey)
SELECT DISTINCT a.RoleKey FROM dms_SystemAccounts a
WHERE NOT EXISTS (SELECT 1 FROM @keys k WHERE k.RoleKey = a.RoleKey);

-- And every key the current constraint allows, read straight out of it, so a
-- role that is permitted but unmapped survives the rebuild.
DECLARE @def NVARCHAR(MAX) = (
    SELECT definition FROM sys.check_constraints WHERE name = 'CK_SystemAccounts_RoleKey');

IF @def IS NOT NULL
BEGIN
    DECLARE @marker NVARCHAR(20) = N'[RoleKey]=''';
    DECLARE @pos INT = CHARINDEX(@marker, @def);
    WHILE @pos > 0
    BEGIN
        DECLARE @start INT = @pos + LEN(@marker);
        DECLARE @end INT = CHARINDEX('''', @def, @start);
        IF @end = 0 BREAK;
        DECLARE @key NVARCHAR(50) = SUBSTRING(@def, @start, @end - @start);
        IF NOT EXISTS (SELECT 1 FROM @keys k WHERE k.RoleKey = @key)
            INSERT INTO @keys (RoleKey) VALUES (@key);
        SET @pos = CHARINDEX(@marker, @def, @end);
    END
END

DECLARE @n INT = (SELECT COUNT(*) FROM @keys);
PRINT CONCAT('Rebuilding CK_SystemAccounts_RoleKey with ', @n, ' roles.');
IF @n < 40
BEGIN
    RAISERROR('Refusing to rebuild the constraint with fewer roles than expected - the existing list was not read properly.', 16, 1);
    RETURN;
END

DECLARE @sql NVARCHAR(MAX) =
    'ALTER TABLE dms_SystemAccounts ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK ('
  + STUFF((SELECT ' OR [RoleKey]=' + QUOTENAME(RoleKey, '''')
           FROM @keys ORDER BY RoleKey
           FOR XML PATH(''), TYPE).value('.', 'NVARCHAR(MAX)'), 1, 4, '')
  + ')';

BEGIN TRANSACTION;
    IF @def IS NOT NULL
        ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
    EXEC sp_executesql @sql;
COMMIT TRANSACTION;
PRINT 'Constraint rebuilt.';

-- ---- seed the five receive-side roles from the codes already in use --------
DECLARE @seed TABLE (RoleKey NVARCHAR(50), GLCode NVARCHAR(40));
INSERT INTO @seed (RoleKey, GLCode) VALUES
    ('SALVAGE_EXPENSE',               '502002038'),
    ('WHT_RECEIVABLE_SERVICES',       '102005005'),
    ('WHT_RECEIVABLE_GOODS',          '102005006'),
    ('SALES_TAX_WITHHELD_RECEIVABLE', '102005007'),
    ('RO_SHORTAGE_EXPENSE',           '502002039');

SELECT  s.RoleKey, s.GLCode,
        CASE
            WHEN EXISTS (SELECT 1 FROM dms_SystemAccounts a WHERE a.RoleKey = s.RoleKey)
                THEN 'already mapped - left alone'
            WHEN g.GLCAID IS NULL
                THEN 'default GL not found - map it by hand in Accounting Setup'
            ELSE 'will seed -> ' + g.GLTitle
        END AS Verdict
FROM    @seed s
LEFT    JOIN GLChartOFAccount g ON g.GLCode = s.GLCode AND g.isParent = 0
ORDER   BY s.RoleKey;

INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName)
SELECT  s.RoleKey, g.GLCAID, 'migration 151 (was hard-coded)'
FROM    @seed s
JOIN    GLChartOFAccount g ON g.GLCode = s.GLCode AND g.isParent = 0
WHERE   NOT EXISTS (SELECT 1 FROM dms_SystemAccounts a WHERE a.RoleKey = s.RoleKey);

PRINT CONCAT(@@ROWCOUNT, ' settlement-deduction role(s) seeded from their hard-coded defaults.');
PRINT '151_seed_payment_adjustment_roles complete.';
