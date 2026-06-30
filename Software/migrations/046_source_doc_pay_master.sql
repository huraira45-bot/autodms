-- 046_source_doc_pay_master.sql
-- Extend the SourceDocType whitelist on data_FinanceVoucherInfo to include
-- 'PAY_MASTER' (agency-model payment to Master Motors against a booking).

IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_VoucherInfo_SourceDocType')
    ALTER TABLE data_FinanceVoucherInfo DROP CONSTRAINT CK_VoucherInfo_SourceDocType;
GO

ALTER TABLE data_FinanceVoucherInfo ADD CONSTRAINT CK_VoucherInfo_SourceDocType CHECK (
    SourceDocType IS NULL OR SourceDocType IN (
        'VOUCHER', 'JOBCARD', 'GRN', 'GRTN', 'STORE_SALE', 'SSR',
        'SALES_PAYMENT', 'MASTER_INVOICE', 'SALES_DELIVERY',
        'SALES_INCENTIVE_ACCRUAL', 'SALES_INCENTIVE_DISB',
        'MASTER_INCENTIVE_RECEIPT', 'PAY_MASTER',
        'CHEQUE'
    )
);
GO

PRINT '046_source_doc_pay_master applied.';
