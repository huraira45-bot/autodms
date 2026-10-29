-- Preserve a separate immutable amount for every variant/date range.
SET XACT_ABORT ON;
IF COL_LENGTH('dbo.dms_SalesBookings','DMSBookingNumber') IS NULL
    THROW 51067,'Apply migration 164 before master incentive rates.',1;
BEGIN TRANSACTION;
IF OBJECT_ID('dbo.dms_MasterIncentiveRates','U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_MasterIncentiveRates (
        RateID INT IDENTITY(1,1) NOT NULL PRIMARY KEY,
        VariantID INT NOT NULL REFERENCES dbo.dms_VehicleVariant(VariantID),
        EffectiveFrom DATE NOT NULL,
        EffectiveTo DATE NOT NULL,
        AmountPerBooking DECIMAL(18,2) NOT NULL,
        Notes NVARCHAR(500) NULL,
        CreatedAtUtc DATETIME2(3) NOT NULL DEFAULT SYSUTCDATETIME(),
        CreatedByUserID INT NOT NULL,
        CreatedByName NVARCHAR(100) NOT NULL,
        CONSTRAINT CK_MasterIncentiveRates_Dates CHECK(EffectiveTo>=EffectiveFrom),
        CONSTRAINT CK_MasterIncentiveRates_Amount CHECK(AmountPerBooking>=0)
    );
    CREATE INDEX IX_MasterIncentiveRates_VariantDates
        ON dbo.dms_MasterIncentiveRates(VariantID,EffectiveFrom,EffectiveTo);
END;
GO
-- Extend, rather than replace, the installed voucher-source whitelist.
DECLARE @sourceCheck NVARCHAR(MAX)=(SELECT definition FROM sys.check_constraints
    WHERE parent_object_id=OBJECT_ID('dbo.data_FinanceVoucherInfo') AND name='CK_VoucherInfo_SourceDocType');
IF @sourceCheck IS NULL THROW 51067,'Voucher source constraint is missing.',1;
IF CHARINDEX('MASTER_BOOKING_INC',@sourceCheck)=0
BEGIN
    ALTER TABLE dbo.data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
    EXEC(N'ALTER TABLE dbo.data_FinanceVoucherInfo WITH CHECK ADD CONSTRAINT CK_VoucherInfo_SourceDocType CHECK ('+@sourceCheck+N' OR SourceDocType=''MASTER_BOOKING_INC'')');
END;
GO
IF COL_LENGTH('dbo.dms_SalesBookings','MasterIncentiveRateID') IS NULL
    ALTER TABLE dbo.dms_SalesBookings ADD MasterIncentiveRateID INT NULL,
        MasterIncentiveAmount DECIMAL(18,2) NULL;
IF COL_LENGTH('dbo.dms_SalesIncentiveAccruals','MasterRateID') IS NULL
    ALTER TABLE dbo.dms_SalesIncentiveAccruals ADD MasterRateID INT NULL,
        MasterRateDate DATE NULL,MasterReceivableGLCAID INT NULL,MasterIncomeGLCAID INT NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Booking_MasterIncentiveRate')
    ALTER TABLE dbo.dms_SalesBookings ADD CONSTRAINT FK_Booking_MasterIncentiveRate FOREIGN KEY(MasterIncentiveRateID) REFERENCES dbo.dms_MasterIncentiveRates(RateID);
IF NOT EXISTS(SELECT 1 FROM sys.foreign_keys WHERE name='FK_Accrual_MasterIncentiveRate')
    ALTER TABLE dbo.dms_SalesIncentiveAccruals ADD CONSTRAINT FK_Accrual_MasterIncentiveRate FOREIGN KEY(MasterRateID) REFERENCES dbo.dms_MasterIncentiveRates(RateID);
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Booking_MasterRate' AND object_id=OBJECT_ID('dbo.dms_SalesBookings'))
    CREATE INDEX IX_Booking_MasterRate ON dbo.dms_SalesBookings(MasterIncentiveRateID)
        INCLUDE(BookingDate,CreatedAt) WHERE MasterIncentiveRateID IS NOT NULL;
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='IX_Accrual_MasterRateDate' AND object_id=OBJECT_ID('dbo.dms_SalesIncentiveAccruals'))
    CREATE INDEX IX_Accrual_MasterRateDate ON dbo.dms_SalesIncentiveAccruals(MasterRateID,MasterRateDate) WHERE MasterRateID IS NOT NULL;
GO
IF NOT EXISTS(SELECT 1 FROM sys.indexes WHERE name='UX_MasterBookingRate_Accrual' AND object_id=OBJECT_ID('dbo.dms_SalesIncentiveAccruals'))
    CREATE UNIQUE INDEX UX_MasterBookingRate_Accrual ON dbo.dms_SalesIncentiveAccruals(BookingID)
        WHERE EarnerType='Master' AND MasterRateID IS NOT NULL AND Status<>'Reversed';
GO
-- New booking-date rates are an explicit alternative to invoice recognition.
-- Existing invoice-driven accruals retain their original guard.
CREATE OR ALTER TRIGGER dbo.trg_MasterAccrual_RequiresInvoice ON dbo.dms_SalesIncentiveAccruals
AFTER INSERT,UPDATE AS
BEGIN
    SET NOCOUNT ON;
    IF EXISTS(SELECT 1 FROM inserted i LEFT JOIN deleted old ON old.AccrualID=i.AccrualID
        JOIN dbo.dms_SalesBookings b ON b.BookingID=i.BookingID
        WHERE i.EarnerType='Master' AND i.Status<>'Reversed'
          AND (old.AccrualID IS NULL OR old.EarnerType<>'Master' OR old.Status='Reversed' OR old.BookingID<>i.BookingID OR old.AmountAccrued<>i.AmountAccrued)
          AND (b.IsHistorical=1 OR
              (i.MasterRateID IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.dms_MasterIncentiveRates r
                  WHERE r.RateID=i.MasterRateID AND r.VariantID=b.VehicleVariantID AND r.AmountPerBooking=i.AmountAccrued
                    AND i.MasterRateDate BETWEEN r.EffectiveFrom AND r.EffectiveTo)) OR
              (i.MasterRateID IS NULL AND NOT EXISTS(SELECT 1 FROM dbo.dms_BookingMasterInvoices m
                  JOIN dbo.dms_SalesDocuments d ON d.DocumentID=m.DocumentID AND d.BookingID=m.BookingID
                  WHERE m.BookingID=i.BookingID AND d.DocType='MasterInvoice' AND d.DeletedAt IS NULL))))
        THROW 51001,'Master incentive requires a dated booking rate or uploaded invoice on a non-historical booking.',1;
END;
GO
COMMIT TRANSACTION;
GO
