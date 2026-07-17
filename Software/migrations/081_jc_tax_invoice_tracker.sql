-- 081_jc_tax_invoice_tracker.sql
-- Owner ask 2026-07-17: track the external GST/PST tax invoice number
-- (issued to FBR / PRA) for each Job Card, plus a "paid" flag per side.
-- Backing table for the new Tax Invoice Tracker report/form.
--
-- One row per JobCardId. Rows are created lazily on first PATCH; JCs
-- without a row are treated as "no invoice yet, not paid" by the report.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_JCTaxInvoice')
BEGIN
    CREATE TABLE dbo.dms_JCTaxInvoice (
        JobCardId       INT           NOT NULL PRIMARY KEY,
        GSTInvoiceNo    NVARCHAR(50)  NULL,
        PSTInvoiceNo    NVARCHAR(50)  NULL,
        GSTPaid         BIT           NOT NULL DEFAULT 0,
        PSTPaid         BIT           NOT NULL DEFAULT 0,
        UpdatedBy       INT           NULL,
        UpdatedByName   NVARCHAR(100) NULL,
        UpdatedAt       DATETIME      NULL,
        CONSTRAINT FK_JCTaxInvoice_JC FOREIGN KEY (JobCardId)
            REFERENCES dbo.Addata_JobCardInfo (JobCardId)
    );
    PRINT 'dms_JCTaxInvoice created.';
END
ELSE
    PRINT 'dms_JCTaxInvoice already exists (no-op).';

-- Grant the new report permission to the admin group so the report is
-- visible immediately on live (matches pattern used by 051 seed).
IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:tax_invoice_tracker'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:tax_invoice_tracker');
    PRINT 'Granted report:tax_invoice_tracker to admin group.';
END
ELSE
    PRINT 'report:tax_invoice_tracker already granted to admin.';

PRINT '081_jc_tax_invoice_tracker complete.';
