-- 089_perf_customer_indexes.sql
-- Owner report 2026-07-18: Workshop Customers screen takes ~15s to load.
-- The `SELECT * FROM vw_WorkshopCustomers` underneath has no supporting
-- indexes so every browse is a full 8,800-row scan and every LIKE search
-- is a filtered scan on top of it. Add indexes on the columns the workshop
-- customer search actually filters on:
--   endUserName, PhoneNo, CNIC, RegistrationNo, ChasisNo, CustomerCode
-- LIKE '%foo%' still can't seek an index, but SQL Server can use a nonclus-
-- tered index as a narrower scan target — cuts I/O sharply on this table.
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_endUserName' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_endUserName    ON addata_CustomerInfo (endUserName);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_PhoneNo' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_PhoneNo        ON addata_CustomerInfo (PhoneNo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_CNIC' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_CNIC           ON addata_CustomerInfo (CNIC);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_RegistrationNo' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_RegistrationNo ON addata_CustomerInfo (RegistrationNo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_ChasisNo' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_ChasisNo       ON addata_CustomerInfo (ChasisNo);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CustomerInfo_CustomerCode' AND object_id = OBJECT_ID('addata_CustomerInfo'))
    CREATE INDEX IX_CustomerInfo_CustomerCode   ON addata_CustomerInfo (CustomerCode);

PRINT '089_perf_customer_indexes complete.';
