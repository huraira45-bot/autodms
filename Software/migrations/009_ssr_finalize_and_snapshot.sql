-- ============================================================
-- Migration 009 — SSR finalize columns + landed-cost snapshot + refund mode
-- Source: SYSTEM_DOCUMENTATION.md §14.9 (SSR section)
-- Date:   2026-05-12
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Header: finalize lifecycle + creator + refund mode
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='IsFinalized')
    ALTER TABLE data_StoreSaleReturnInfo ADD IsFinalized BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='FinalizedBy')
    ALTER TABLE data_StoreSaleReturnInfo ADD FinalizedBy INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='FinalizedByName')
    ALTER TABLE data_StoreSaleReturnInfo ADD FinalizedByName NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='FinalizedAt')
    ALTER TABLE data_StoreSaleReturnInfo ADD FinalizedAt DATETIME NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='CreatedBy')
    ALTER TABLE data_StoreSaleReturnInfo ADD CreatedBy INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='CreatedByName')
    ALTER TABLE data_StoreSaleReturnInfo ADD CreatedByName NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='RefundMode')
    ALTER TABLE data_StoreSaleReturnInfo ADD RefundMode NVARCHAR(20) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnInfo' AND COLUMN_NAME='RefundBankID')
    ALTER TABLE data_StoreSaleReturnInfo ADD RefundBankID INT NULL;
GO

-- Detail: landed cost snapshot (looked up from original Store Sale line at save time)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleReturnDetail' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_StoreSaleReturnDetail ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

PRINT '009_ssr_finalize_and_snapshot.sql complete.';
