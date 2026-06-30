-- 049_storesale_ntn_delivery.sql
-- Adds two new fields on the Store Sale header to support the printed invoice:
--   • NTNNo           — customer's National Tax Number (distinct from CNIC/NICNo)
--   • DeliveryExpense — money charged for delivery (shown as a separate line on
--                       the invoice; bundled into NetPayable so the total ties).

IF COL_LENGTH('data_StoreSaleInfo', 'NTNNo') IS NULL
BEGIN
    ALTER TABLE data_StoreSaleInfo ADD NTNNo NVARCHAR(50) NULL;
    PRINT 'Added column NTNNo to data_StoreSaleInfo.';
END
ELSE PRINT 'NTNNo already exists.';
GO

IF COL_LENGTH('data_StoreSaleInfo', 'DeliveryExpense') IS NULL
BEGIN
    ALTER TABLE data_StoreSaleInfo ADD DeliveryExpense DECIMAL(18,2) NOT NULL CONSTRAINT DF_StoreSale_DeliveryExpense DEFAULT 0;
    PRINT 'Added column DeliveryExpense to data_StoreSaleInfo.';
END
ELSE PRINT 'DeliveryExpense already exists.';
GO

PRINT '049_storesale_ntn_delivery applied.';
