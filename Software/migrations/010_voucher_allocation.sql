-- ============================================================
-- Migration 010 — Voucher line allocation column
-- Source: SYSTEM_DOCUMENTATION.md §14.11
-- Date:   2026-05-12
-- ============================================================
-- Adds AllocatedToVoucherID to data_FinanceVoucherDetail so a Receive Payment
-- or Make Payment line can point at the specific invoice voucher it settles.
-- Self-FK to data_FinanceVoucherInfo.VoucherID.
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_FinanceVoucherDetail' AND COLUMN_NAME='AllocatedToVoucherID')
    ALTER TABLE data_FinanceVoucherDetail ADD AllocatedToVoucherID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_VoucherDetail_AllocatedTo')
    ALTER TABLE data_FinanceVoucherDetail
        ADD CONSTRAINT FK_VoucherDetail_AllocatedTo
            FOREIGN KEY (AllocatedToVoucherID) REFERENCES data_FinanceVoucherInfo(VoucherID);
GO

-- Mirror on subsidiary ledger for consistency
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='dms_PartyLedger' AND COLUMN_NAME='AllocatedToVoucherID')
    ALTER TABLE dms_PartyLedger ADD AllocatedToVoucherID INT NULL;
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name='FK_PartyLedger_AllocatedTo')
    ALTER TABLE dms_PartyLedger
        ADD CONSTRAINT FK_PartyLedger_AllocatedTo
            FOREIGN KEY (AllocatedToVoucherID) REFERENCES data_FinanceVoucherInfo(VoucherID);
GO

PRINT '010_voucher_allocation.sql complete.';
