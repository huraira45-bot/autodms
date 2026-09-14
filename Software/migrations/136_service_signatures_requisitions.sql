-- 136_service_signatures_requisitions.sql
-- Service tablet app, Phase 2 (plan 2026-09-14).
--
-- The customer signs the estimate on the tablet. In one transaction that
-- opens the job card, records the signature, and sends the parts on the
-- estimate to the parts counter as a requisition.
--
--   dms_ServiceEstimates.BayID      bay chosen when the job card was opened
--   dms_ServiceEstimateSignatures   who signed, when (server clock), what total,
--                                   and a hash of exactly what was signed
--   dms_PartsRequisitions / Lines   parts requested for a job card
--   dms_PartsRequisitionIssues      which Parts Issue lines fulfilled them
--   seq_PartsRequisitionNo          PR-00001 numbering
--
-- Issued quantity is NOT stored on the requisition. It is read from the
-- linked Parts Issue lines, so an issued line later edited or deleted on the
-- Parts Issue screen can never leave the requisition showing a stale number.
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF COL_LENGTH('dms_ServiceEstimates', 'BayID') IS NULL
BEGIN
    ALTER TABLE dms_ServiceEstimates ADD BayID INT NULL;
    PRINT '136: added dms_ServiceEstimates.BayID.';
END
GO

IF OBJECT_ID('dms_ServiceEstimateSignatures', 'U') IS NULL
BEGIN
    CREATE TABLE dms_ServiceEstimateSignatures (
        SignatureID      INT IDENTITY(1,1) CONSTRAINT PK_ServiceEstimateSignatures PRIMARY KEY,
        EstimateID       INT           NOT NULL
                         CONSTRAINT FK_ServiceEstimateSignatures_Estimate REFERENCES dms_ServiceEstimates (EstimateID),
        JobCardID        INT           NOT NULL,
        RevisionNo       INT           NOT NULL,
        SignerName       NVARCHAR(150) NOT NULL,
        SignerMobile     NVARCHAR(30)  NULL,
        SignatureFile    NVARCHAR(260) NOT NULL,   -- name only; inside uploads/service-media/signatures
        ContentHash      CHAR(64)      NOT NULL,   -- sha256 of the lines and totals the customer saw
        GrandTotal       DECIMAL(18,2) NOT NULL,
        BayID            INT           NULL,
        BayName          NVARCHAR(50)  NULL,
        SignedAt         DATETIME      NOT NULL CONSTRAINT DF_ServiceEstimateSignatures_SignedAt DEFAULT GETDATE(),
        CapturedByUserID INT           NULL,
        CapturedByName   NVARCHAR(100) NULL,
        -- One signature per estimate. Additional work is a new estimate
        -- revision with its own signature, so every signed version is kept.
        CONSTRAINT UQ_ServiceEstimateSignatures_Estimate UNIQUE (EstimateID)
    );
    CREATE INDEX IX_ServiceEstimateSignatures_JobCard ON dms_ServiceEstimateSignatures (JobCardID);
    PRINT '136: created dms_ServiceEstimateSignatures.';
END
GO

IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'seq_PartsRequisitionNo')
BEGIN
    CREATE SEQUENCE dbo.seq_PartsRequisitionNo AS INT START WITH 1 INCREMENT BY 1;
    PRINT '136: created seq_PartsRequisitionNo.';
END
GO

IF OBJECT_ID('dms_PartsRequisitions', 'U') IS NULL
BEGIN
    CREATE TABLE dms_PartsRequisitions (
        RequisitionID     INT IDENTITY(1,1) CONSTRAINT PK_PartsRequisitions PRIMARY KEY,
        RequisitionNo     NVARCHAR(20)  NOT NULL CONSTRAINT UQ_PartsRequisitions_No UNIQUE,
        JobCardID         INT           NOT NULL,
        JobCardNo         NVARCHAR(100) NULL,
        EstimateID        INT           NULL
                          CONSTRAINT FK_PartsRequisitions_Estimate REFERENCES dms_ServiceEstimates (EstimateID),
        SignatureID       INT           NULL
                          CONSTRAINT FK_PartsRequisitions_Signature REFERENCES dms_ServiceEstimateSignatures (SignatureID),
        Status            NVARCHAR(20)  NOT NULL CONSTRAINT DF_PartsRequisitions_Status DEFAULT 'Open',
        RequestedByUserID INT           NULL,
        RequestedByName   NVARCHAR(100) NULL,
        RequestedAt       DATETIME      NOT NULL CONSTRAINT DF_PartsRequisitions_RequestedAt DEFAULT GETDATE(),
        CancelledAt       DATETIME      NULL,
        CancelledByName   NVARCHAR(100) NULL,
        CancelReason      NVARCHAR(300) NULL,
        CONSTRAINT CK_PartsRequisitions_Status CHECK (Status IN ('Open', 'Cancelled'))
    );
    CREATE INDEX IX_PartsRequisitions_JobCard ON dms_PartsRequisitions (JobCardID);
    CREATE INDEX IX_PartsRequisitions_Status  ON dms_PartsRequisitions (Status, RequestedAt);
    PRINT '136: created dms_PartsRequisitions.';
END
GO

IF OBJECT_ID('dms_PartsRequisitionLines', 'U') IS NULL
BEGIN
    CREATE TABLE dms_PartsRequisitionLines (
        RequisitionLineID INT IDENTITY(1,1) CONSTRAINT PK_PartsRequisitionLines PRIMARY KEY,
        RequisitionID     INT           NOT NULL
                          CONSTRAINT FK_PartsRequisitionLines_Requisition REFERENCES dms_PartsRequisitions (RequisitionID),
        LineSeq           INT           NOT NULL,
        ItemID            INT           NOT NULL,
        Description       NVARCHAR(300) NOT NULL,
        PartNumber        NVARCHAR(100) NULL,
        QtyRequested      DECIMAL(18,2) NOT NULL,
        Rate              DECIMAL(18,2) NOT NULL,   -- the price the customer signed for
        EstimateLineID    INT           NULL,
        CONSTRAINT CK_PartsRequisitionLines_Qty CHECK (QtyRequested > 0)
    );
    CREATE INDEX IX_PartsRequisitionLines_Requisition ON dms_PartsRequisitionLines (RequisitionID, LineSeq);
    PRINT '136: created dms_PartsRequisitionLines.';
END
GO

IF OBJECT_ID('dms_PartsRequisitionIssues', 'U') IS NULL
BEGIN
    CREATE TABLE dms_PartsRequisitionIssues (
        RequisitionLineID  INT           NOT NULL
                           CONSTRAINT FK_PartsRequisitionIssues_Line REFERENCES dms_PartsRequisitionLines (RequisitionLineID),
        StockIssueDetailID INT           NOT NULL,   -- data_StockIssuetoJobCardDetail; no FK so the Parts Issue screen can still delete lines
        QtyAtIssue         DECIMAL(18,2) NOT NULL,   -- as issued; the live figure is read from the issue line
        IssuedByUserID     INT           NULL,
        IssuedByName       NVARCHAR(100) NULL,
        IssuedAt           DATETIME      NOT NULL CONSTRAINT DF_PartsRequisitionIssues_IssuedAt DEFAULT GETDATE(),
        CONSTRAINT PK_PartsRequisitionIssues PRIMARY KEY (RequisitionLineID, StockIssueDetailID)
    );
    CREATE INDEX IX_PartsRequisitionIssues_Detail ON dms_PartsRequisitionIssues (StockIssueDetailID);
    PRINT '136: created dms_PartsRequisitionIssues.';
END
GO

PRINT '136_service_signatures_requisitions complete.';
