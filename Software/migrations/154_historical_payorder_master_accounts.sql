-- Preserve the vehicle Master-account snapshot on historical direct pay orders.
SET QUOTED_IDENTIFIER ON;
SET XACT_ABORT ON;
BEGIN TRANSACTION;
IF COL_LENGTH('dbo.dms_SalesPayments','HistoricalMasterGLCAID') IS NULL
    ALTER TABLE dbo.dms_SalesPayments ADD HistoricalMasterGLCAID INT NULL;
GO
UPDATE p SET HistoricalMasterGLCAID=coa.GLCAID
FROM dbo.dms_SalesPayments p
JOIN dbo.dms_SalesBookings booking ON booking.BookingID=p.BookingID
JOIN dbo.dms_VehicleVariant variant ON variant.VariantID=booking.VehicleVariantID
JOIN (SELECT GLCode,MIN(GLCAID) AS GLCAID FROM dbo.GLChartOFAccount GROUP BY GLCode HAVING COUNT(*)=1) coa ON coa.GLCode=CASE
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%DEEPAL%S05%' OR UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%DEEPAL%SO5%' THEN '102001011'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%DEEPAL%L07%' OR UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%DEEPAL%LO7%' THEN '102001008'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%OSHAN%' THEN '102001006'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%ALSVIN%' OR UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%ASLVIN%' THEN '102001005'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%SHERPA%' THEN '102001002'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%HUNTER%' THEN '102001012'
        WHEN UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%KARV%' OR UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%KARW%' OR UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,'')) LIKE '%KAVAN%' THEN '102001001'
        ELSE NULL END
WHERE booking.IsHistorical=1 AND p.PaymentMode='PayOrder' AND ISNULL(p.PremiumPortion,0)=0
    AND p.HistoricalMasterGLCAID IS NULL;
IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_SalesPayments_HistoricalMasterGL')
    ALTER TABLE dbo.dms_SalesPayments ADD CONSTRAINT FK_SalesPayments_HistoricalMasterGL
        FOREIGN KEY (HistoricalMasterGLCAID) REFERENCES dbo.GLChartOFAccount(GLCAID);
COMMIT TRANSACTION;
PRINT '154: historical direct pay orders can recognize separate Master opening balances.';
GO
