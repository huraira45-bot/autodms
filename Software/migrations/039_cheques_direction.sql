-- 039_cheques_direction.sql
-- Extend dms_PendingCheques to track issued cheques (CPV/BPV) alongside received ones (CRV/BRV).
-- The originating voucher columns (ReceiptVoucherID / ReceiptDetailID) now mean
-- "source voucher" regardless of direction — the column names are kept for backward compat.

IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('dms_PendingCheques') AND name='Direction')
BEGIN
    ALTER TABLE dms_PendingCheques ADD Direction NVARCHAR(20) NOT NULL CONSTRAINT DF_PendingCheques_Direction DEFAULT 'Received';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_PendingCheques_Direction')
BEGIN
    ALTER TABLE dms_PendingCheques ADD CONSTRAINT CK_PendingCheques_Direction
        CHECK (Direction IN ('Received','Issued'));
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='IX_PendingCheques_Direction_Status' AND object_id=OBJECT_ID('dms_PendingCheques'))
    CREATE INDEX IX_PendingCheques_Direction_Status ON dms_PendingCheques(Direction, Status);
GO

PRINT '039_cheques_direction applied.';
