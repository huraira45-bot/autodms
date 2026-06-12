-- ============================================================
-- Migration 002 — Seed Chart of Accounts + auto-assign 12 system roles
-- Source: SYSTEM_DOCUMENTATION.md §14.2 + §14.3
-- Date:   2026-05-12
-- ============================================================
-- Builds the full workshop COA hierarchy described in §14.2:
--   - 5 root classes (ASSETS, LIABILITIES, EQUITY, REVENUE, EXPENSES)
--   - 6 mid-level parent accounts
--   - 22 leaf accounts (12 are system roles, 10 supporting accounts)
-- Then auto-seeds dms_SystemAccounts with all 12 role assignments
-- and writes corresponding audit rows.
--
-- NOTE: Soft-deletes the 3 existing test entries by setting Status=0.
--       Those entries were 'Cash', 'General Customer', 'Cash Book' from
--       early manual testing and don't match the design (wrong nature,
--       wrong parent flag, wrong title for the root class).
--
-- Idempotent: re-running is safe (every account / role insert is guarded).
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

------------------------------------------------------------
-- Soft-delete the 3 test entries (data fix; flagged in migration header)
------------------------------------------------------------
UPDATE GLChartOFAccount SET Status = 0
WHERE GLCode IN ('1','101','102')
  AND GLTitle IN ('Cash','General Customer','Cash Book');
GO

------------------------------------------------------------
-- Helper: insert if not exists by GLCode
------------------------------------------------------------
-- (No stored procedure — using inline IF NOT EXISTS pattern for clarity)

------------------------------------------------------------
-- Level 1: 5 root classes
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='1' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('1', 'ASSETS', 1, 1, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='2' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('2', 'LIABILITIES', 1, 2, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='3' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('3', 'EQUITY', 1, 2, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='4' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('4', 'REVENUE', 1, 2, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='5' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('5', 'EXPENSES', 1, 1, 0, 1, 1, 1, '01', 0);
GO

------------------------------------------------------------
-- Level 2: 6 mid-level parents
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101', 'Current Assets', 2, 1, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('201', 'Current Liabilities', 2, 2, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='401' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('401', 'Workshop Revenue', 2, 2, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='501' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('501', 'Cost of Goods Sold', 2, 1, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='502' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('502', 'Cost of Services', 2, 1, 0, 1, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='503' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('503', 'Operating Expenses', 2, 1, 0, 1, 1, 1, '01', 0);
GO

------------------------------------------------------------
-- Level 3: 22 leaf accounts
-- Nature: 1 = Debit (Assets, Expenses), 2 = Credit (Liabilities, Equity, Revenue)
------------------------------------------------------------

-- Under 101 (Current Assets) — all Debit nature
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101001', 'Cash Book', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101002' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101002', 'POS Clearing', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101003' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101003', 'Cheques on Hand', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101004' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101004', 'Inventory - Parts', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101005' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101005', 'Trade Debtors', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101006' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101006', 'General Customer', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101007' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101007', 'Input GST', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='101008' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('101008', 'Supplier Advance Paid', 3, 1, 0, 0, 1, 1, '01', 0);

-- Under 201 (Current Liabilities) — all Credit nature
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('201001', 'Trade Creditors', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201002' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('201002', 'GST Payable', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201003' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('201003', 'PST Payable', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='201004' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('201004', 'Customer Advance Received', 3, 2, 0, 0, 1, 1, '01', 0);

-- Under 401 (Workshop Revenue) — all Credit nature
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='401001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('401001', 'Service Revenue', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='401002' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('401002', 'Parts Sales Revenue', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='401003' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('401003', 'Sublet Revenue', 3, 2, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='401004' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('401004', 'Purchase Return Variance', 3, 2, 0, 0, 1, 1, '01', 0);

-- Under 501 (COGS) — Debit
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='501001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('501001', 'COGS - Parts', 3, 1, 0, 0, 1, 1, '01', 0);

-- Under 502 (Cost of Services) — Debit
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='502001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('502001', 'Sublet Cost', 3, 1, 0, 0, 1, 1, '01', 0);

-- Under 503 (Operating Expenses) — Debit
IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='503001' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('503001', 'Default Discount Given', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='503002' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('503002', 'Rounding Adjustment', 3, 1, 0, 0, 1, 1, '01', 0);

IF NOT EXISTS (SELECT 1 FROM GLChartOFAccount WHERE GLCode='503003' AND Status=1)
    INSERT INTO GLChartOFAccount (GLCode, GLTitle, GLLevel, GLNature, GLType, isParent, Companyid, Status, AccountLevelOne, ReadOnly)
        VALUES ('503003', 'Bank Charges', 3, 1, 0, 0, 1, 1, '01', 0);
GO

------------------------------------------------------------
-- Auto-seed dms_SystemAccounts: assign all 12 system roles
-- to their corresponding leaf accounts (looked up by GLCode).
-- Write an audit row for each (atomic with the insert via batch ordering).
------------------------------------------------------------

-- Helper variable to assign atomically: only insert if RoleKey row doesn't exist.
-- Each block: resolve GLCAID by code → insert into dms_SystemAccounts + audit.

DECLARE @gl INT;

-- CASH_BOOK → 101001
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='CASH_BOOK')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101001' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('CASH_BOOK', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('CASH_BOOK', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- POS_CLEARING → 101002
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='POS_CLEARING')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101002' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('POS_CLEARING', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('POS_CLEARING', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- CHEQUES_ON_HAND → 101003
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='CHEQUES_ON_HAND')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101003' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('CHEQUES_ON_HAND', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('CHEQUES_ON_HAND', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- GENERAL_CUSTOMER → 101006
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101006' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('GENERAL_CUSTOMER', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('GENERAL_CUSTOMER', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- INPUT_GST → 101007
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='INPUT_GST')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101007' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('INPUT_GST', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('INPUT_GST', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- SUPPLIER_ADVANCE_PAID → 101008
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='SUPPLIER_ADVANCE_PAID')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='101008' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('SUPPLIER_ADVANCE_PAID', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('SUPPLIER_ADVANCE_PAID', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- GST_PAYABLE → 201002
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='GST_PAYABLE')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='201002' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('GST_PAYABLE', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('GST_PAYABLE', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- PST_PAYABLE → 201003
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='PST_PAYABLE')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='201003' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('PST_PAYABLE', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('PST_PAYABLE', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- CUSTOMER_ADVANCE_RECEIVED → 201004
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='CUSTOMER_ADVANCE_RECEIVED')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='201004' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('CUSTOMER_ADVANCE_RECEIVED', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('CUSTOMER_ADVANCE_RECEIVED', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- PURCHASE_RETURN_VARIANCE → 401004
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='PURCHASE_RETURN_VARIANCE')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='401004' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('PURCHASE_RETURN_VARIANCE', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('PURCHASE_RETURN_VARIANCE', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- DEFAULT_DISCOUNT_GIVEN → 503001
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='DEFAULT_DISCOUNT_GIVEN')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='503001' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('DEFAULT_DISCOUNT_GIVEN', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('DEFAULT_DISCOUNT_GIVEN', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;

-- ROUNDING_ADJUSTMENT → 503002
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='ROUNDING_ADJUSTMENT')
BEGIN
    SELECT @gl = GLCAID FROM GLChartOFAccount WHERE GLCode='503002' AND Status=1;
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedBy, AssignedByName) VALUES ('ROUNDING_ADJUSTMENT', @gl, NULL, 'system-seed');
    INSERT INTO dms_SystemAccountAudit (RoleKey, OldGLCAID, NewGLCAID, ChangedBy, ChangedByName, Reason)
        VALUES ('ROUNDING_ADJUSTMENT', NULL, @gl, NULL, 'system-seed', 'Initial assignment via migration 002');
END;
GO

PRINT '002_seed_coa_and_system_accounts.sql complete.';
