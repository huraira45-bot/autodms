/*
 * Migration 021 — Sales Module Phase 0: Document store
 *
 * Source spec: .claude/planning/sales-module-design.md §17 (Document Management).
 *
 * Decision #4: every document must have a user-typed Description before the file
 * picker enables. Enforced at the controller layer; schema only requires non-null.
 *
 * Soft-delete via DeletedAt — never hard delete (audit trail).
 *
 * LinkedPaymentID lets a ProofOfPayment row tie to the exact dms_SalesPayments
 * row it documents, so the payment screen can show the proof inline.
 *
 * MasterIncentivePolicyLetter (decision #24) uses this same table tied to
 * dms_MasterIncentiveCampaigns (created in migration 023) via LinkedCampaignID.
 */

SET QUOTED_IDENTIFIER ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesDocuments')
BEGIN
    CREATE TABLE dbo.dms_SalesDocuments (
        DocumentID              INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        DocType                 NVARCHAR(40)   NOT NULL,
        Description             NVARCHAR(500)  NOT NULL,            -- mandatory (decision #4)
        FilePath                NVARCHAR(500)  NOT NULL,            -- relative path under Software/uploads/sales/
        OriginalFileName        NVARCHAR(255)  NULL,
        MimeType                NVARCHAR(100)  NULL,
        SizeBytes               BIGINT         NULL,
        -- Link to source entity (mutually exclusive)
        BookingID               INT            NULL,                -- FK to dms_SalesBookings
        LinkedPaymentID         INT            NULL,                -- FK to dms_SalesPayments (only for ProofOfPayment)
        LinkedCampaignID        INT            NULL,                -- soft link to dms_MasterIncentiveCampaigns (mig 023)
        LinkedAuthorizedPersonID INT           NULL,                -- soft link to dms_SalesCorpAuthorizedPersons (mig 026)
        -- Audit
        UploadedAt              DATETIME       NOT NULL DEFAULT GETDATE(),
        UploadedByEmployeeID    INT            NULL,
        UploadedByName          NVARCHAR(100)  NULL,
        DeletedAt               DATETIME       NULL,
        DeletedByEmployeeID     INT            NULL,
        DeletedByName           NVARCHAR(100)  NULL,
        DeleteReason            NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_SalesDocuments_Booking  FOREIGN KEY (BookingID)        REFERENCES dbo.dms_SalesBookings(BookingID),
        CONSTRAINT FK_SalesDocuments_Payment  FOREIGN KEY (LinkedPaymentID)  REFERENCES dbo.dms_SalesPayments(PaymentID),
        CONSTRAINT CK_SalesDocuments_DocType  CHECK (DocType IN (
            N'ProofOfPayment', N'PBO', N'CNIC', N'AuthorityLetter',
            N'MasterIncentivePolicyLetter', N'Other'
        )),
        CONSTRAINT CK_SalesDocuments_Description CHECK (LEN(LTRIM(RTRIM(Description))) >= 5),
        -- Exactly one source link must be set
        CONSTRAINT CK_SalesDocuments_OneSource CHECK (
            (CASE WHEN BookingID                IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN LinkedCampaignID         IS NOT NULL THEN 1 ELSE 0 END) +
            (CASE WHEN LinkedAuthorizedPersonID IS NOT NULL THEN 1 ELSE 0 END) >= 1
        )
    );

    CREATE INDEX IX_SalesDocuments_Booking  ON dbo.dms_SalesDocuments(BookingID) WHERE BookingID IS NOT NULL;
    CREATE INDEX IX_SalesDocuments_Payment  ON dbo.dms_SalesDocuments(LinkedPaymentID) WHERE LinkedPaymentID IS NOT NULL;
    CREATE INDEX IX_SalesDocuments_Campaign ON dbo.dms_SalesDocuments(LinkedCampaignID) WHERE LinkedCampaignID IS NOT NULL;
    CREATE INDEX IX_SalesDocuments_Active   ON dbo.dms_SalesDocuments(DocType, BookingID) WHERE DeletedAt IS NULL;
END
GO

-- Back-FK from dms_SalesCorpAuthorizedPersons.AuthorityLetterDocID → dms_SalesDocuments.DocumentID
-- will be added in migration 026 when the corp authorized persons table is created.
