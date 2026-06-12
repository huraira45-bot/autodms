/*
 * Migration 026 — Sales Module Phase 0: Sales-side customer profile + corporate authorized persons
 *
 * Source spec: .claude/planning/sales-module-design.md §7.
 *
 * Decision #16: single gen_PartiesInfo + PartyType flag. This table is a 1:1
 * extension capturing CNIC/NTN/etc. for vehicle-sales customers without
 * polluting the universal AR party row.
 *
 * Decision #17: corporate authorized signatories + intended drivers are a
 * multi-row child of the corporate Party.
 */

SET QUOTED_IDENTIFIER ON;

-- =========================================================================
-- dms_SalesCustomerProfile (1:1 with gen_PartiesInfo)
-- Only created when sales-specific data exists for a Party.
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesCustomerProfile')
BEGIN
    CREATE TABLE dbo.dms_SalesCustomerProfile (
        PartyID                  INT            NOT NULL PRIMARY KEY,  -- 1:1 with gen_PartiesInfo
        CNIC                     NVARCHAR(20)   NULL,
        NTN                      NVARCHAR(20)   NULL,
        STRN                     NVARCHAR(20)   NULL,
        PreferredContactMethod   NVARCHAR(20)   NULL,  -- 'Phone' | 'WhatsApp' | 'Email'
        DateOfBirth              DATE           NULL,
        CompanyName              NVARCHAR(200)  NULL,
        CompanyType              NVARCHAR(100)  NULL,
        Address                  NVARCHAR(MAX)  NULL,
        City                     NVARCHAR(100)  NULL,
        Notes                    NVARCHAR(MAX)  NULL,
        CreatedAt                DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID      INT            NULL,
        CreatedByName            NVARCHAR(100)  NULL,
        UpdatedAt                DATETIME       NULL,
        UpdatedByEmployeeID      INT            NULL,
        UpdatedByName            NVARCHAR(100)  NULL,
        CONSTRAINT FK_SalesCustomerProfile_Party FOREIGN KEY (PartyID) REFERENCES dbo.gen_PartiesInfo(PartyID),
        CONSTRAINT CK_SalesCustomerProfile_Contact CHECK (
            PreferredContactMethod IS NULL OR PreferredContactMethod IN (N'Phone', N'WhatsApp', N'Email')
        )
    );

    CREATE INDEX IX_SalesCustomerProfile_CNIC ON dbo.dms_SalesCustomerProfile(CNIC) WHERE CNIC IS NOT NULL;
    CREATE INDEX IX_SalesCustomerProfile_NTN  ON dbo.dms_SalesCustomerProfile(NTN)  WHERE NTN  IS NOT NULL;
END
GO

-- =========================================================================
-- dms_SalesCorpAuthorizedPersons — multi-row per corporate Party
-- =========================================================================
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SalesCorpAuthorizedPersons')
BEGIN
    CREATE TABLE dbo.dms_SalesCorpAuthorizedPersons (
        PersonID                 INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        PartyID                  INT            NOT NULL,
        PersonName               NVARCHAR(200)  NOT NULL,
        CNIC                     NVARCHAR(20)   NULL,
        Role                     NVARCHAR(30)   NOT NULL,
        ContactPhone             NVARCHAR(50)   NULL,
        DesignationAtCompany     NVARCHAR(100)  NULL,
        AuthorityLetterDocID     INT            NULL,  -- FK to dms_SalesDocuments
        IsActive                 BIT            NOT NULL DEFAULT 1,
        CreatedAt                DATETIME       NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID      INT            NULL,
        CreatedByName            NVARCHAR(100)  NULL,
        DeactivatedAt            DATETIME       NULL,
        DeactivatedByEmployeeID  INT            NULL,
        DeactivationReason       NVARCHAR(MAX)  NULL,
        CONSTRAINT FK_CorpAuthPersons_Party FOREIGN KEY (PartyID) REFERENCES dbo.gen_PartiesInfo(PartyID),
        CONSTRAINT FK_CorpAuthPersons_Doc   FOREIGN KEY (AuthorityLetterDocID) REFERENCES dbo.dms_SalesDocuments(DocumentID),
        CONSTRAINT CK_CorpAuthPersons_Role CHECK (Role IN (N'Signatory', N'IntendedDriver', N'Both'))
    );

    CREATE INDEX IX_CorpAuthPersons_Party ON dbo.dms_SalesCorpAuthorizedPersons(PartyID) WHERE IsActive = 1;
END
GO
