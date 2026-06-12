-- ============================================================
-- Migration 001 — Accounting Module Foundation
-- Source: SYSTEM_DOCUMENTATION.md §14.22 items 1–5
-- Date:   2026-05-12
-- ============================================================
-- Adds: system accounts registry + audit, tax rates history,
--       party / login / password / permission audit tables,
--       voucher Status lifecycle, source-doc reference,
--       voucher detail party tagging, bank POS commission,
--       subsidiary ledger table, gen_PartiesInfo party type,
--       balanced-entry trigger, 5 new voucher types seeded.
-- All changes additive. Idempotent (re-running is safe).
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

------------------------------------------------------------
-- 1. dms_SystemAccounts — 12 system roles, single account per role
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_SystemAccounts')
BEGIN
    CREATE TABLE dms_SystemAccounts (
        RoleKey         NVARCHAR(50)  NOT NULL PRIMARY KEY,
        GLCAID          INT           NOT NULL,
        AssignedBy      INT           NULL,
        AssignedByName  NVARCHAR(100) NULL,
        AssignedAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT FK_SystemAccounts_GLCAID FOREIGN KEY (GLCAID) REFERENCES GLChartOFAccount(GLCAID),
        CONSTRAINT CK_SystemAccounts_RoleKey CHECK (RoleKey IN (
            'CASH_BOOK','GENERAL_CUSTOMER','GST_PAYABLE','INPUT_GST',
            'PST_PAYABLE','POS_CLEARING','DEFAULT_DISCOUNT_GIVEN',
            'ROUNDING_ADJUSTMENT','PURCHASE_RETURN_VARIANCE',
            'CUSTOMER_ADVANCE_RECEIVED','SUPPLIER_ADVANCE_PAID',
            'CHEQUES_ON_HAND'
        ))
    );
END;

------------------------------------------------------------
-- 2. dms_SystemAccountAudit — reassignment history
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_SystemAccountAudit')
BEGIN
    CREATE TABLE dms_SystemAccountAudit (
        AuditID        INT           IDENTITY(1,1) PRIMARY KEY,
        RoleKey        NVARCHAR(50)  NOT NULL,
        OldGLCAID      INT           NULL,
        NewGLCAID      INT           NOT NULL,
        ChangedBy      INT           NULL,
        ChangedByName  NVARCHAR(100) NULL,
        ChangedAt      DATETIME      NOT NULL DEFAULT GETDATE(),
        Reason         NVARCHAR(500) NULL
    );
    CREATE INDEX IX_SystemAccountAudit_RoleKey ON dms_SystemAccountAudit(RoleKey, ChangedAt);
END;

------------------------------------------------------------
-- 3. dms_TaxRates — effective-dated history
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_TaxRates')
BEGIN
    CREATE TABLE dms_TaxRates (
        TaxRateID       INT           IDENTITY(1,1) PRIMARY KEY,
        TaxType         NVARCHAR(10)  NOT NULL,
        Rate            DECIMAL(8,4)  NOT NULL,
        EffectiveFrom   DATE          NOT NULL,
        EffectiveTo     DATE          NULL,
        ChangedBy       INT           NULL,
        ChangedByName   NVARCHAR(100) NULL,
        ChangedAt       DATETIME      NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_TaxRates_Type CHECK (TaxType IN ('GST','PST')),
        CONSTRAINT CK_TaxRates_Rate CHECK (Rate >= 0 AND Rate <= 100)
    );
END;
GO

-- Filtered unique index in its own batch so QUOTED_IDENTIFIER setting applies and re-runs find it idempotently
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_TaxRates_Current' AND object_id = OBJECT_ID('dms_TaxRates'))
    CREATE UNIQUE INDEX UX_TaxRates_Current ON dms_TaxRates(TaxType) WHERE EffectiveTo IS NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_TaxRates_Type_From' AND object_id = OBJECT_ID('dms_TaxRates'))
    CREATE INDEX IX_TaxRates_Type_From ON dms_TaxRates(TaxType, EffectiveFrom);
GO

------------------------------------------------------------
-- 4. dms_PartyAudit — party master data changes
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_PartyAudit')
BEGIN
    CREATE TABLE dms_PartyAudit (
        AuditID        INT            IDENTITY(1,1) PRIMARY KEY,
        PartyID        INT            NOT NULL,
        FieldName      NVARCHAR(100)  NOT NULL,
        OldValue       NVARCHAR(MAX)  NULL,
        NewValue       NVARCHAR(MAX)  NULL,
        ChangedBy      INT            NULL,
        ChangedByName  NVARCHAR(100)  NULL,
        ChangedAt      DATETIME       NOT NULL DEFAULT GETDATE()
    );
    CREATE INDEX IX_PartyAudit_PartyID ON dms_PartyAudit(PartyID, ChangedAt);
END;

------------------------------------------------------------
-- 5. dms_LoginAudit — Tier 3 security audit
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_LoginAudit')
BEGIN
    CREATE TABLE dms_LoginAudit (
        AuditID    INT            IDENTITY(1,1) PRIMARY KEY,
        UserID     INT            NULL,
        UserName   NVARCHAR(100)  NULL,
        EventType  NVARCHAR(20)   NOT NULL,
        IPAddress  NVARCHAR(50)   NULL,
        UserAgent  NVARCHAR(500)  NULL,
        EventAt    DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_LoginAudit_Event CHECK (EventType IN ('LOGIN_SUCCESS','LOGIN_FAILED','LOGOUT'))
    );
    CREATE INDEX IX_LoginAudit_User ON dms_LoginAudit(UserID, EventAt);
    CREATE INDEX IX_LoginAudit_When ON dms_LoginAudit(EventAt);
END;

------------------------------------------------------------
-- 6. dms_PasswordAudit
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_PasswordAudit')
BEGIN
    CREATE TABLE dms_PasswordAudit (
        AuditID        INT            IDENTITY(1,1) PRIMARY KEY,
        UserID         INT            NOT NULL,
        EventType      NVARCHAR(20)   NOT NULL,
        ChangedBy      INT            NULL,
        ChangedByName  NVARCHAR(100)  NULL,
        ChangedAt      DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_PasswordAudit_Event CHECK (EventType IN ('CHANGE','RESET'))
    );
    CREATE INDEX IX_PasswordAudit_User ON dms_PasswordAudit(UserID, ChangedAt);
END;

------------------------------------------------------------
-- 7. dms_PermissionAudit
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_PermissionAudit')
BEGIN
    CREATE TABLE dms_PermissionAudit (
        AuditID        INT            IDENTITY(1,1) PRIMARY KEY,
        GroupID        INT            NOT NULL,
        ModuleKey      NVARCHAR(50)   NOT NULL,
        EventType      NVARCHAR(20)   NOT NULL,
        ChangedBy      INT            NULL,
        ChangedByName  NVARCHAR(100)  NULL,
        ChangedAt      DATETIME       NOT NULL DEFAULT GETDATE(),
        CONSTRAINT CK_PermissionAudit_Event CHECK (EventType IN ('GRANTED','REVOKED'))
    );
    CREATE INDEX IX_PermissionAudit_Group ON dms_PermissionAudit(GroupID, ChangedAt);
END;

------------------------------------------------------------
-- 8. dms_PartyLedger — subsidiary ledger (per-party balances)
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME='dms_PartyLedger')
BEGIN
    CREATE TABLE dms_PartyLedger (
        LedgerID         INT            IDENTITY(1,1) PRIMARY KEY,
        PartyID          INT            NULL,
        JobCardID        INT            NULL,
        VoucherID        INT            NOT NULL,
        VoucherDetailID  INT            NULL,
        GLCAID           INT            NOT NULL,
        Debit            DECIMAL(18,2)  NOT NULL DEFAULT 0,
        Credit           DECIMAL(18,2)  NOT NULL DEFAULT 0,
        Narration        NVARCHAR(500)  NULL,
        EntryDate        DATETIME       NOT NULL DEFAULT GETDATE(),
        -- Each row tags either a named party OR a job card (walk-in advance), never neither
        CONSTRAINT CK_PartyLedger_Tag      CHECK (PartyID IS NOT NULL OR JobCardID IS NOT NULL),
        -- Exactly one of Debit/Credit non-zero per line
        CONSTRAINT CK_PartyLedger_DebCred  CHECK (NOT (Debit > 0 AND Credit > 0)),
        CONSTRAINT CK_PartyLedger_NonNeg   CHECK (Debit >= 0 AND Credit >= 0),
        CONSTRAINT FK_PartyLedger_Party    FOREIGN KEY (PartyID) REFERENCES gen_PartiesInfo(PartyID),
        CONSTRAINT FK_PartyLedger_Voucher  FOREIGN KEY (VoucherID) REFERENCES data_FinanceVoucherInfo(VoucherID),
        CONSTRAINT FK_PartyLedger_Account  FOREIGN KEY (GLCAID) REFERENCES GLChartOFAccount(GLCAID)
    );
    CREATE INDEX IX_PartyLedger_Party    ON dms_PartyLedger(PartyID, EntryDate);
    CREATE INDEX IX_PartyLedger_JobCard  ON dms_PartyLedger(JobCardID);
    CREATE INDEX IX_PartyLedger_Voucher  ON dms_PartyLedger(VoucherID);
END;

------------------------------------------------------------
-- 9. Extend data_FinanceVoucherInfo (Voucher Status lifecycle)
--    Each ALTER TABLE ADD COLUMN is in its own batch (GO)
--    so subsequent constraints can reference the new columns.
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='Status')
    ALTER TABLE data_FinanceVoucherInfo ADD Status NVARCHAR(20) NOT NULL DEFAULT 'Draft';
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='ReversesVoucherID')
    ALTER TABLE data_FinanceVoucherInfo ADD ReversesVoucherID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='SourceDocType')
    ALTER TABLE data_FinanceVoucherInfo ADD SourceDocType NVARCHAR(20) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='SourceDocID')
    ALTER TABLE data_FinanceVoucherInfo ADD SourceDocID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='CreatedBy')
    ALTER TABLE data_FinanceVoucherInfo ADD CreatedBy INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='CreatedByName')
    ALTER TABLE data_FinanceVoucherInfo ADD CreatedByName NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='PostedBy')
    ALTER TABLE data_FinanceVoucherInfo ADD PostedBy INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='PostedAt')
    ALTER TABLE data_FinanceVoucherInfo ADD PostedAt DATETIME NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='ReversedBy')
    ALTER TABLE data_FinanceVoucherInfo ADD ReversedBy INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='ReversedByName')
    ALTER TABLE data_FinanceVoucherInfo ADD ReversedByName NVARCHAR(100) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherInfo' AND COLUMN_NAME='ReversedAt')
    ALTER TABLE data_FinanceVoucherInfo ADD ReversedAt DATETIME NULL;
GO

-- CHECK constraint on Status (now that Status column exists)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherInfo_Status')
    ALTER TABLE data_FinanceVoucherInfo
        ADD CONSTRAINT CK_VoucherInfo_Status CHECK (Status IN ('Draft','Posted','Reversed'));
GO

-- Self-referencing FK for reversal pointer
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_VoucherInfo_ReversesVoucherID')
    ALTER TABLE data_FinanceVoucherInfo
        ADD CONSTRAINT FK_VoucherInfo_ReversesVoucherID
            FOREIGN KEY (ReversesVoucherID) REFERENCES data_FinanceVoucherInfo(VoucherID);
GO

-- CHECK on SourceDocType (matches finalizeController.ENTITY_MAP keys + VOUCHER for manual)
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherInfo_SourceDocType')
    ALTER TABLE data_FinanceVoucherInfo
        ADD CONSTRAINT CK_VoucherInfo_SourceDocType
            CHECK (SourceDocType IS NULL OR SourceDocType IN ('JOBCARD','GRN','GRTN','STORE_SALE','SSR','VOUCHER'));
GO

-- Backfill Status from legacy Posted bit (if any rows exist)
UPDATE data_FinanceVoucherInfo
SET Status = CASE WHEN Posted = 1 THEN 'Posted' ELSE 'Draft' END
WHERE Status IS NULL OR Status = 'Draft';
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_VoucherInfo_Source')
    CREATE NONCLUSTERED INDEX IX_VoucherInfo_Source
        ON data_FinanceVoucherInfo(SourceDocType, SourceDocID)
        WHERE SourceDocType IS NOT NULL;
GO

------------------------------------------------------------
-- 10. Extend data_FinanceVoucherDetail (party tagging + balanced rules)
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherDetail' AND COLUMN_NAME='PartyID')
    ALTER TABLE data_FinanceVoucherDetail ADD PartyID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherDetail' AND COLUMN_NAME='JobCardID')
    ALTER TABLE data_FinanceVoucherDetail ADD JobCardID INT NULL;
GO

-- Each line is one-sided: not both Debit > 0 AND Credit > 0
IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherDetail_OneSided')
    ALTER TABLE data_FinanceVoucherDetail
        ADD CONSTRAINT CK_VoucherDetail_OneSided
            CHECK (NOT (Debit > 0 AND Credit > 0));
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherDetail_NonNeg')
    ALTER TABLE data_FinanceVoucherDetail
        ADD CONSTRAINT CK_VoucherDetail_NonNeg
            CHECK (Debit >= 0 AND Credit >= 0);
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_VoucherDetail_Party')
    ALTER TABLE data_FinanceVoucherDetail
        ADD CONSTRAINT FK_VoucherDetail_Party
            FOREIGN KEY (PartyID) REFERENCES gen_PartiesInfo(PartyID);
GO

------------------------------------------------------------
-- 11. Extend dms_BankAccounts (per-bank POS commission)
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='dms_BankAccounts' AND COLUMN_NAME='POSCommissionPct')
    ALTER TABLE dms_BankAccounts ADD POSCommissionPct DECIMAL(5,2) NOT NULL DEFAULT 0;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='dms_BankAccounts' AND COLUMN_NAME='BankChargesGLCAID')
    ALTER TABLE dms_BankAccounts ADD BankChargesGLCAID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_BankAccounts_BankCharges')
    ALTER TABLE dms_BankAccounts
        ADD CONSTRAINT FK_BankAccounts_BankCharges
            FOREIGN KEY (BankChargesGLCAID) REFERENCES GLChartOFAccount(GLCAID);
GO

------------------------------------------------------------
-- 12. Extend gen_PartiesInfo (PartyType for filtering insurance/sublet/etc.)
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='gen_PartiesInfo' AND COLUMN_NAME='PartyType')
    ALTER TABLE gen_PartiesInfo ADD PartyType NVARCHAR(50) NULL;
GO

------------------------------------------------------------
-- 13. Seed 5 new voucher types in GLVoucherType (idempotent)
------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM GLVoucherType WHERE Title = 'SI')
    INSERT INTO GLVoucherType (Title, Description) VALUES ('SI', 'Sales Invoice (Job Card)');
IF NOT EXISTS (SELECT 1 FROM GLVoucherType WHERE Title = 'PV')
    INSERT INTO GLVoucherType (Title, Description) VALUES ('PV', 'Purchase Voucher (GRN)');
IF NOT EXISTS (SELECT 1 FROM GLVoucherType WHERE Title = 'PRV')
    INSERT INTO GLVoucherType (Title, Description) VALUES ('PRV', 'Purchase Return Voucher (GRTN)');
IF NOT EXISTS (SELECT 1 FROM GLVoucherType WHERE Title = 'SS')
    INSERT INTO GLVoucherType (Title, Description) VALUES ('SS', 'Store Sale Voucher');
IF NOT EXISTS (SELECT 1 FROM GLVoucherType WHERE Title = 'SSR')
    INSERT INTO GLVoucherType (Title, Description) VALUES ('SSR', 'Store Sale Return Voucher');
GO

------------------------------------------------------------
-- 14. Balanced-entry trigger on voucher Status transition
--     Fires when Status transitions to 'Posted'.
--     Verifies SUM(Debit) = SUM(Credit) across the voucher's lines
--     with a tolerance of 0.01 PKR (rounding orphans).
------------------------------------------------------------
IF OBJECT_ID('trg_VoucherInfo_PostBalanced','TR') IS NOT NULL
    DROP TRIGGER trg_VoucherInfo_PostBalanced;
GO

CREATE TRIGGER trg_VoucherInfo_PostBalanced
ON data_FinanceVoucherInfo
AFTER UPDATE
AS
BEGIN
    SET NOCOUNT ON;
    -- Only check rows transitioning into 'Posted' from a non-Posted state
    IF NOT EXISTS (
        SELECT 1
        FROM inserted i
        JOIN deleted d ON d.VoucherID = i.VoucherID
        WHERE i.Status = 'Posted' AND ISNULL(d.Status,'Draft') <> 'Posted'
    )
        RETURN;

    -- For each such voucher, compute totals from details
    DECLARE @VoucherID INT, @DebTot DECIMAL(18,2), @CrTot DECIMAL(18,2);
    DECLARE @Msg NVARCHAR(400);
    DECLARE cur CURSOR LOCAL FAST_FORWARD FOR
        SELECT i.VoucherID
        FROM inserted i
        JOIN deleted d ON d.VoucherID = i.VoucherID
        WHERE i.Status = 'Posted' AND ISNULL(d.Status,'Draft') <> 'Posted';

    OPEN cur;
    FETCH NEXT FROM cur INTO @VoucherID;
    WHILE @@FETCH_STATUS = 0
    BEGIN
        SELECT @DebTot = ISNULL(SUM(Debit),0), @CrTot = ISNULL(SUM(Credit),0)
        FROM data_FinanceVoucherDetail
        WHERE VoucherID = @VoucherID;

        IF ABS(@DebTot - @CrTot) > 0.01
        BEGIN
            SET @Msg = N'Voucher ' + CAST(@VoucherID AS NVARCHAR(20))
                + N' cannot be posted: debits ('
                + CONVERT(NVARCHAR(40), @DebTot)
                + N') do not equal credits ('
                + CONVERT(NVARCHAR(40), @CrTot)
                + N').';
            CLOSE cur; DEALLOCATE cur;
            RAISERROR(@Msg, 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        IF @DebTot = 0 AND @CrTot = 0
        BEGIN
            SET @Msg = N'Voucher ' + CAST(@VoucherID AS NVARCHAR(20))
                + N' cannot be posted: no journal lines.';
            CLOSE cur; DEALLOCATE cur;
            RAISERROR(@Msg, 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
        END

        FETCH NEXT FROM cur INTO @VoucherID;
    END
    CLOSE cur;
    DEALLOCATE cur;
END;
GO

PRINT '001_accounting_foundation.sql complete.';
