-- 106_ss_receivables_custom.sql
-- Owner ask 2026-08-01: a second "Store Sale Receivables" report with the
-- exact same working as the original, except certain parties can be hidden
-- from it (e.g. internal/GL-suspense "parties" like CMM goodwill accounts
-- that clutter a real collections-facing receivables view). Which parties
-- are hidden is managed from a separate settings form, not the report
-- itself.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SSReceivablesHiddenParties')
BEGIN
    CREATE TABLE dms_SSReceivablesHiddenParties (
        PartyID      INT           NOT NULL PRIMARY KEY,
        HiddenAt     DATETIME      NOT NULL DEFAULT GETDATE(),
        HiddenBy     INT           NULL,
        HiddenByName NVARCHAR(100) NULL,
        CONSTRAINT FK_SSRecvHidden_Party FOREIGN KEY (PartyID) REFERENCES gen_PartiesInfo(PartyID)
    );
    PRINT 'dms_SSReceivablesHiddenParties created.';
END
ELSE
    PRINT 'dms_SSReceivablesHiddenParties already exists.';
GO

IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:store_sale_receivables_custom'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:store_sale_receivables_custom');
    PRINT 'Granted report:store_sale_receivables_custom to admin group.';
END
ELSE
    PRINT 'report:store_sale_receivables_custom already granted to admin.';

PRINT '106_ss_receivables_custom complete.';
