-- 100_ss_tax_invoice_tracker.sql
-- Owner ask 2026-07-30: same idea as the Job Card Tax Invoice Tracker
-- (migration 081) but for Store Sale. Track the external GST tax invoice
-- number (issued to FBR) per sale, plus a "paid" flag. Store Sale has no
-- PST/labour concept, so this is GST-only (unlike the JC version).
--
-- Kept as its own table (not reusing data_StoreSaleInfo.FBRInvoiceNo)
-- for the same reason as the JC tracker: a finalized sale locks the main
-- table, but tax-invoice bookkeeping happens later and shouldn't require
-- an unfinalize. The tracker pre-fills from FBRInvoiceNo on first edit
-- (handled in the API layer) but then lives independently.
--
-- One row per SaleID. Rows are created lazily on first PATCH; sales
-- without a row are treated as "no invoice tracked yet, not paid".
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_SSTaxInvoice')
BEGIN
    CREATE TABLE dbo.dms_SSTaxInvoice (
        SaleID          INT           NOT NULL PRIMARY KEY,
        GSTInvoiceNo    NVARCHAR(50)  NULL,
        GSTPaid         BIT           NOT NULL DEFAULT 0,
        UpdatedBy       INT           NULL,
        UpdatedByName   NVARCHAR(100) NULL,
        UpdatedAt       DATETIME      NULL,
        CONSTRAINT FK_SSTaxInvoice_Sale FOREIGN KEY (SaleID)
            REFERENCES dbo.data_StoreSaleInfo (SaleID)
    );
    PRINT 'dms_SSTaxInvoice created.';
END
ELSE
    PRINT 'dms_SSTaxInvoice already exists (no-op).';

-- Grant the new report permission to the admin group so the report is
-- visible immediately on live (matches pattern used by 081).
IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:store_sale_tax_invoice_tracker'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:store_sale_tax_invoice_tracker');
    PRINT 'Granted report:store_sale_tax_invoice_tracker to admin group.';
END
ELSE
    PRINT 'report:store_sale_tax_invoice_tracker already granted to admin.';

PRINT '100_ss_tax_invoice_tracker complete.';
