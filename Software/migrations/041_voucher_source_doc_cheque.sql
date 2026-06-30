-- 041_voucher_source_doc_cheque.sql
-- Extend the SourceDocType whitelist on data_FinanceVoucherInfo to include
-- 'CHEQUE' so cheque-clearance / bounce / revert vouchers can be posted.
-- (Required by chequeController.js after migration 040 introduced separate
-- clearance posting for issued + received cheques.)

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherInfo_SourceDocType')
    ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
GO

ALTER TABLE data_FinanceVoucherInfo ADD CONSTRAINT CK_VoucherInfo_SourceDocType CHECK (
    SourceDocType IS NULL OR SourceDocType IN (
        'VOUCHER', 'JOBCARD', 'GRN', 'GRTN', 'STORE_SALE', 'SSR',
        'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
        'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
        'CHEQUE'
    )
);
GO

PRINT '041_voucher_source_doc_cheque applied.';
