-- 042_gate_passes.sql
-- Workshop / Store-Sale gate pass module.
--
-- Rules (set by owner):
--   1. Credit-party JC / Sale → gate pass without payment check
--   2. Cash / Bank / Cheque-cleared → posted recovery must equal the walk-out customer
--      portion (Gen-Cust Dr − Gen-Cust Cr tagged with the doc ID)
--   3. Same vehicle (RegNo+Chassis) with another open RO that is non-warranty AND
--      (not finalized OR has unpaid Gen-Cust balance) → block
--   4. POS-mode receipt against the doc → warning to confirm physical swipe
--
-- Only one active gate pass per (DocType, DocID) — a revoked pass releases the doc
-- so it can be re-issued.

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name='dms_GatePasses')
BEGIN
    CREATE TABLE dms_GatePasses (
        GatePassID      INT IDENTITY(1,1) PRIMARY KEY,
        GatePassNo      NVARCHAR(50) NOT NULL,
        DocType         NVARCHAR(20) NOT NULL,
        DocID           INT          NOT NULL,
        -- Customer + vehicle snapshot for the printed slip; immutable after issue
        CustomerName    NVARCHAR(200) NULL,
        VehicleRegNo    NVARCHAR(100) NULL,
        VehicleChassis  NVARCHAR(100) NULL,
        -- Why the gate was opened (paid-cash / credit-party / free-service / etc.)
        PassReason      NVARCHAR(40) NOT NULL,
        AmountInvoiced  DECIMAL(18,2) NULL,
        AmountReceived  DECIMAL(18,2) NULL,
        PaymentModes    NVARCHAR(200) NULL,
        Notes           NVARCHAR(500) NULL,
        -- Issuance audit
        IssuedAt        DATETIME NOT NULL CONSTRAINT DF_GatePass_IssuedAt DEFAULT GETDATE(),
        IssuedBy        INT          NOT NULL,
        IssuedByName    NVARCHAR(100) NOT NULL,
        -- Optional revocation
        RevokedAt       DATETIME      NULL,
        RevokedBy       INT           NULL,
        RevokedByName   NVARCHAR(100) NULL,
        RevokeReason    NVARCHAR(500) NULL,

        CONSTRAINT CHK_GatePass_DocType CHECK (DocType IN ('JOBCARD', 'STORE_SALE')),
        CONSTRAINT UX_GatePass_No       UNIQUE (GatePassNo)
    );

    -- Only one active gate pass per (DocType, DocID); revoking releases the slot.
    CREATE UNIQUE INDEX UX_GatePass_DocActive
        ON dms_GatePasses (DocType, DocID)
        WHERE RevokedAt IS NULL;

    CREATE INDEX IX_GatePass_Doc ON dms_GatePasses (DocType, DocID);
    CREATE INDEX IX_GatePass_IssuedAt ON dms_GatePasses (IssuedAt DESC);

    PRINT 'dms_GatePasses created.';
END
ELSE
    PRINT 'dms_GatePasses already exists.';
GO

-- GatePassNo sequence: GP-0001, GP-0002, ...
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name='seq_GatePassNo')
BEGIN
    CREATE SEQUENCE dbo.seq_GatePassNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT 'seq_GatePassNo created.';
END
GO

PRINT '042_gate_passes applied.';
