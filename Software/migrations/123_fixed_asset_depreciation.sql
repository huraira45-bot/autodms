-- 123_fixed_asset_depreciation.sql
-- IAS 16 non-current asset depreciation (SLM) — owner ask 2026-08-20.
--
-- Adds:
--   1. Two new GL branches, mirroring the 8 existing depreciable categories
--      under 101 NON-CURRENT ASSETS (LAND excluded — IAS 16 treats land as
--      having an indefinite life, never depreciated):
--        101010 ACCUMULATED DEPRECIATION (contra-asset, one leaf/category)
--        502005 DEPRECIATION EXPENSE     (P&L, one leaf/category)
--      Every INSERT below resolves parent/category GLCAIDs by GLCode via
--      subquery — nothing is hardcoded — so this is safe to re-run on any
--      environment whose COA has already diverged from local (the lesson
--      from fix_sales_system_account_roles.sql: never assume a "free" code
--      picked on one DB is free on another. GLCode values themselves ARE
--      hardcoded here and MUST be re-verified free on live before this
--      runs there).
--   2. dms_FixedAssetCategoryGL — category -> (AccumDep, DepExpense) leaf
--      mapping, so the asset-create endpoint can resolve the right GL pair
--      automatically instead of asking the user to pick GL accounts by hand.
--   3. dms_FixedAssets — the register: one row per depreciable asset,
--      linked to its existing Cost leaf account (Cost itself is never
--      duplicated here — it's read live from that account's ledger
--      balance).
--   4. dms_FixedAssetDepreciationRuns / …Entries — one run per period
--      (Draft -> Posted via the generic VOUCHER finalize path), with a
--      per-asset entry recording what each asset was charged, for the
--      double-posting guard and the accumulated-depreciation-to-date calc.
--   5. finance_fixed_assets:view/insert/edit/delete granted to admin (group 1).
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

-- ── 1a. ACCUMULATED DEPRECIATION branch ─────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES
        ('101010', 'ACCUMULATED DEPRECIATION', 0, 1, 1, 1, 1, '01', '0', '0', '0', '0', 3, 0);
    PRINT '123: created 101010 ACCUMULATED DEPRECIATION.';
END
GO

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010001')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010001', 'ACCUMULATED DEPRECIATION - BUILDING', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010002')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010002', 'ACCUMULATED DEPRECIATION - WORKSHOP EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010003')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010003', 'ACCUMULATED DEPRECIATION - VEHICLES', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010004')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010004', 'ACCUMULATED DEPRECIATION - FURNITURE & FIXTURES', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010005')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010005', 'ACCUMULATED DEPRECIATION - OFFICE & IT EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010006')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010006', 'ACCUMULATED DEPRECIATION - POWER & ELECTRICAL EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010007')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010007', 'ACCUMULATED DEPRECIATION - AC SYSTEM', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '101010008')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('101010008', 'ACCUMULATED DEPRECIATION - FIRE FIGHTING EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);
GO

PRINT '123: ACCUMULATED DEPRECIATION leaves done.';
GO

-- ── 1b. DEPRECIATION EXPENSE branch ─────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005')
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES
        ('502005', 'DEPRECIATION EXPENSE', 0, 1, 1, 1, 1, '01', '0', '0', '0', '0', 3, 0);
    PRINT '123: created 502005 DEPRECIATION EXPENSE.';
END
GO

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005001')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005001', 'DEPRECIATION EXPENSE - BUILDING', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005002')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005002', 'DEPRECIATION EXPENSE - WORKSHOP EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005003')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005003', 'DEPRECIATION EXPENSE - VEHICLES', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005004')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005004', 'DEPRECIATION EXPENSE - FURNITURE & FIXTURES', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005005')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005005', 'DEPRECIATION EXPENSE - OFFICE & IT EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005006')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005006', 'DEPRECIATION EXPENSE - POWER & ELECTRICAL EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005007')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005007', 'DEPRECIATION EXPENSE - AC SYSTEM', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode = '502005008')
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLType, isParent, GLNature, Companyid, Status, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour, AccountLevelFive, GLLevel, ReadOnly)
    VALUES ('502005008', 'DEPRECIATION EXPENSE - FIRE FIGHTING EQUIPMENT', 0, 0, 1, 1, 1, '01', '0', '0', '0', '0', 4, 0);
GO

PRINT '123: DEPRECIATION EXPENSE leaves done.';
GO

-- ── 2. Category -> GL pair mapping ──────────────────────────────────────
IF OBJECT_ID('dms_FixedAssetCategoryGL', 'U') IS NULL
BEGIN
    CREATE TABLE dms_FixedAssetCategoryGL (
        CategoryGLCAID   INT NOT NULL PRIMARY KEY,   -- existing 101xxx category parent, e.g. 101003 WORKSHOP EQUIPMENT
        AccumDepGLCAID   INT NOT NULL,                -- matching 101010xxx leaf
        DepExpenseGLCAID INT NOT NULL,                -- matching 502005xxx leaf
        FOREIGN KEY (CategoryGLCAID)   REFERENCES GLChartOFAccount(GLCAID),
        FOREIGN KEY (AccumDepGLCAID)   REFERENCES GLChartOFAccount(GLCAID),
        FOREIGN KEY (DepExpenseGLCAID) REFERENCES GLChartOFAccount(GLCAID)
    );
    PRINT '123: created dms_FixedAssetCategoryGL.';
END
GO

;WITH cats AS (
    SELECT '101002' AS CatCode, '101010001' AS AccumCode, '502005001' AS ExpCode UNION ALL
    SELECT '101003', '101010002', '502005002' UNION ALL
    SELECT '101004', '101010003', '502005003' UNION ALL
    SELECT '101005', '101010004', '502005004' UNION ALL
    SELECT '101006', '101010005', '502005005' UNION ALL
    SELECT '101007', '101010006', '502005006' UNION ALL
    SELECT '101008', '101010007', '502005007' UNION ALL
    SELECT '101009', '101010008', '502005008'
)
INSERT INTO dms_FixedAssetCategoryGL (CategoryGLCAID, AccumDepGLCAID, DepExpenseGLCAID)
SELECT cat.GLCAID, accum.GLCAID, exp.GLCAID
FROM cats
JOIN GLChartOFAccount cat   ON cat.GLCode   = cats.CatCode
JOIN GLChartOFAccount accum ON accum.GLCode = cats.AccumCode
JOIN GLChartOFAccount exp   ON exp.GLCode   = cats.ExpCode
WHERE NOT EXISTS (SELECT 1 FROM dms_FixedAssetCategoryGL x WHERE x.CategoryGLCAID = cat.GLCAID);
GO

PRINT '123: dms_FixedAssetCategoryGL seeded.';
GO

-- ── 3. Fixed Asset Register ─────────────────────────────────────────────
IF OBJECT_ID('dms_FixedAssets', 'U') IS NULL
BEGIN
    CREATE TABLE dms_FixedAssets (
        FixedAssetID                     INT IDENTITY PRIMARY KEY,
        AssetGLCAID                      INT NOT NULL UNIQUE,   -- the existing Cost leaf, e.g. 101003001 SCISSOR LIFT
        AccumDepGLCAID                   INT NOT NULL,          -- resolved from dms_FixedAssetCategoryGL at creation
        DepExpenseGLCAID                 INT NOT NULL,
        ResidualValue                    DECIMAL(18,2) NOT NULL DEFAULT 0,
        DepreciationRatePct               DECIMAL(5,2) NOT NULL,  -- annual SLM %
        DepreciationStartDate            DATE NOT NULL,
        -- One-time brought-forward figure for assets that already had some
        -- useful life consumed before this register existed. 0 for anything
        -- starting fresh. Not itself posted to GL by this migration/module —
        -- purely lowers the depreciable base the SLM engine works from.
        OpeningAccumulatedDepreciation   DECIMAL(18,2) NOT NULL DEFAULT 0,
        Status                            NVARCHAR(20) NOT NULL DEFAULT 'ACTIVE',  -- ACTIVE | FULLY_DEPRECIATED | DISPOSED
        Notes                             NVARCHAR(500) NULL,
        CreatedBy                         INT NULL,
        CreatedByName                     NVARCHAR(100) NULL,
        CreatedAt                         DATETIME NOT NULL DEFAULT GETDATE(),
        FOREIGN KEY (AssetGLCAID)      REFERENCES GLChartOFAccount(GLCAID),
        FOREIGN KEY (AccumDepGLCAID)   REFERENCES GLChartOFAccount(GLCAID),
        FOREIGN KEY (DepExpenseGLCAID) REFERENCES GLChartOFAccount(GLCAID)
    );
    PRINT '123: created dms_FixedAssets.';
END
GO

-- ── 4. Depreciation runs (period header) + entries (per-asset detail) ──
IF OBJECT_ID('dms_FixedAssetDepreciationRuns', 'U') IS NULL
BEGIN
    CREATE TABLE dms_FixedAssetDepreciationRuns (
        RunID          INT IDENTITY PRIMARY KEY,
        PeriodYear     INT NOT NULL,
        PeriodMonth    INT NOT NULL,   -- 1-12
        VoucherID      INT NULL,       -- set once the Draft JV is created (same transaction, just after)
        CreatedBy      INT NULL,
        CreatedByName  NVARCHAR(100) NULL,
        CreatedAt      DATETIME NOT NULL DEFAULT GETDATE(),
        CONSTRAINT UQ_FixedAssetDepRun_Period UNIQUE (PeriodYear, PeriodMonth)
    );
    PRINT '123: created dms_FixedAssetDepreciationRuns.';
END
GO

IF OBJECT_ID('dms_FixedAssetDepreciationEntries', 'U') IS NULL
BEGIN
    CREATE TABLE dms_FixedAssetDepreciationEntries (
        EntryID              INT IDENTITY PRIMARY KEY,
        RunID                INT NOT NULL,
        FixedAssetID         INT NOT NULL,
        DepreciationAmount   DECIMAL(18,2) NOT NULL,
        OpeningNBV           DECIMAL(18,2) NOT NULL,
        ClosingNBV           DECIMAL(18,2) NOT NULL,
        FOREIGN KEY (RunID)        REFERENCES dms_FixedAssetDepreciationRuns(RunID),
        FOREIGN KEY (FixedAssetID) REFERENCES dms_FixedAssets(FixedAssetID),
        CONSTRAINT UQ_FixedAssetDepEntry_AssetRun UNIQUE (FixedAssetID, RunID)
    );
    PRINT '123: created dms_FixedAssetDepreciationEntries.';
END
GO

-- ── 5. Module permission ────────────────────────────────────────────────
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'finance_fixed_assets:view')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'finance_fixed_assets:view');
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'finance_fixed_assets:insert')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'finance_fixed_assets:insert');
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'finance_fixed_assets:edit')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'finance_fixed_assets:edit');
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'finance_fixed_assets:delete')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'finance_fixed_assets:delete');
GO

PRINT '123_fixed_asset_depreciation complete.';
