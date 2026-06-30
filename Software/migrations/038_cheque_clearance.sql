-- 038_cheque_clearance.sql
-- Tracks cheques received but not yet cleared (or bounced).
-- Receipt path inserts a Pending row; the Cheque Clearance screen flips
-- it to Cleared (Dr deposit-bank / Cr CHEQUES_ON_HAND) or Bounced
-- (Dr customer A/R / Cr CHEQUES_ON_HAND) and back-references the clearance voucher.

IF OBJECT_ID('dms_PendingCheques', 'U') IS NOT NULL
    DROP TABLE dms_PendingCheques;
GO

CREATE TABLE dms_PendingCheques (
    ChequeID            INT IDENTITY(1,1) PRIMARY KEY,
    ReceiptVoucherID    INT          NOT NULL,
    ReceiptDetailID     INT          NOT NULL,
    ChequeNo            NVARCHAR(50) NOT NULL,
    ChequeDate          DATE         NOT NULL,
    Amount              DECIMAL(18,2) NOT NULL,
    DrawerBank          NVARCHAR(150) NULL,
    DepositBankGLCAID   INT          NOT NULL,
    PartyID             INT          NULL,
    JobCardID           INT          NULL,
    Status              NVARCHAR(20) NOT NULL CONSTRAINT DF_PendingCheques_Status DEFAULT 'Pending',
    ClearedAt           DATETIME     NULL,
    ClearanceVoucherID  INT          NULL,
    Notes               NVARCHAR(500) NULL,
    CreatedAt           DATETIME     NOT NULL CONSTRAINT DF_PendingCheques_CreatedAt DEFAULT GETDATE(),
    CreatedBy           INT          NULL,
    CreatedByName       NVARCHAR(100) NULL,
    UpdatedAt           DATETIME     NULL,
    UpdatedBy           INT          NULL,
    UpdatedByName       NVARCHAR(100) NULL,
    CONSTRAINT CK_PendingCheques_Status     CHECK (Status IN ('Pending','Cleared','Bounced')),
    CONSTRAINT CK_PendingCheques_Amount     CHECK (Amount > 0),
    CONSTRAINT FK_PendingCheques_Receipt    FOREIGN KEY (ReceiptVoucherID)   REFERENCES data_FinanceVoucherInfo(VoucherID),
    CONSTRAINT FK_PendingCheques_ReceiptDet FOREIGN KEY (ReceiptDetailID)    REFERENCES data_FinanceVoucherDetail(VoucherDetailID),
    CONSTRAINT FK_PendingCheques_Bank       FOREIGN KEY (DepositBankGLCAID)  REFERENCES dms_BankAccounts(GLCAID),
    CONSTRAINT FK_PendingCheques_Party      FOREIGN KEY (PartyID)            REFERENCES gen_PartiesInfo(PartyID),
    CONSTRAINT FK_PendingCheques_Clearance  FOREIGN KEY (ClearanceVoucherID) REFERENCES data_FinanceVoucherInfo(VoucherID)
);
GO

CREATE INDEX IX_PendingCheques_Status      ON dms_PendingCheques(Status, ChequeDate);
CREATE INDEX IX_PendingCheques_DepositBank ON dms_PendingCheques(DepositBankGLCAID);
CREATE INDEX IX_PendingCheques_Receipt     ON dms_PendingCheques(ReceiptVoucherID);
CREATE INDEX IX_PendingCheques_Party       ON dms_PendingCheques(PartyID) WHERE PartyID IS NOT NULL;
GO

PRINT '038_cheque_clearance applied.';
