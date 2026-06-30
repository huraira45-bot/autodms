-- 043_master_incentive_receipts.sql
-- Master Receipt Voucher (MRV) — records the cash/bank receipt when Master
-- Changan actually pays out the accrued incentive. The matching accrual was
-- posted automatically at Master Invoice time (Dr MASTER_INCENTIVE_RECEIVABLE
-- / Cr MASTER_INCENTIVE_INCOME); this receipt closes that asset.
--
-- GL effect at post: Dr <chosen bank> / Cr MASTER_INCENTIVE_RECEIVABLE
-- A revoked receipt reverses its voucher (re-opening the receivable).

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='dms_MasterIncentiveReceipts')
BEGIN
    CREATE TABLE dms_MasterIncentiveReceipts (
        ReceiptID         INT IDENTITY(1,1) PRIMARY KEY,
        ReceiptNo         NVARCHAR(50) NOT NULL,
        ReceiptDate       DATE         NOT NULL,
        Amount            DECIMAL(18,2) NOT NULL,
        Mode              NVARCHAR(20) NOT NULL,   -- 'Bank' | 'Cash' | 'CreditNote'
        BankAccountGLCAID INT          NULL,        -- FK-style → GLChartOFAccount.GLCAID (when Mode='Bank')
        ReferenceNo       NVARCHAR(100) NULL,       -- bank slip / cheque # / credit-memo #
        Notes             NVARCHAR(500) NULL,

        -- GL stamping
        VoucherID         INT          NULL,
        VoucherNo         NVARCHAR(50) NULL,

        -- Audit
        CreatedAt         DATETIME NOT NULL CONSTRAINT DF_MIR_CreatedAt DEFAULT GETDATE(),
        CreatedBy         INT          NULL,
        CreatedByName     NVARCHAR(100) NULL,

        -- Optional revocation (also reverses the voucher)
        RevokedAt         DATETIME NULL,
        RevokedBy         INT NULL,
        RevokedByName     NVARCHAR(100) NULL,
        RevokeReason      NVARCHAR(500) NULL,
        ReversalVoucherID INT NULL,

        CONSTRAINT CHK_MIR_Mode CHECK (Mode IN ('Bank','Cash','CreditNote')),
        CONSTRAINT CHK_MIR_Amount CHECK (Amount > 0),
        CONSTRAINT UX_MIR_No UNIQUE (ReceiptNo)
    );

    CREATE INDEX IX_MIR_Date ON dms_MasterIncentiveReceipts (ReceiptDate DESC);
    PRINT 'dms_MasterIncentiveReceipts created.';
END
ELSE
    PRINT 'dms_MasterIncentiveReceipts already exists.';
GO

-- Receipt number sequence — MRV-0001, MRV-0002, ...
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_MasterIncentiveReceiptNo')
BEGIN
    CREATE SEQUENCE dbo.seq_MasterIncentiveReceiptNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT 'seq_MasterIncentiveReceiptNo created.';
END
GO

-- Extend SourceDocType whitelist on data_FinanceVoucherInfo
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherInfo_SourceDocType')
    ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
GO

ALTER TABLE data_FinanceVoucherInfo ADD CONSTRAINT CK_VoucherInfo_SourceDocType CHECK (
    SourceDocType IS NULL OR SourceDocType IN (
        'VOUCHER', 'JOBCARD', 'GRN', 'GRTN', 'STORE_SALE', 'SSR',
        'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
        'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
        'MASTER_INCENTIVE_RECEIPT',
        'CHEQUE'
    )
);
GO

PRINT '043_master_incentive_receipts applied.';
