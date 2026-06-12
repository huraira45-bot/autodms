-- ============================================================
-- Migration 008 — Store Sale finalize columns + landed-cost snapshot
-- Source: SYSTEM_DOCUMENTATION.md §14.9 + §14.5
-- Date:   2026-05-12
-- ============================================================
-- Design §14.5 says STORE_SALE → data_SaleInfo, but the actual existing tables
-- are data_StoreSaleInfo / data_StoreSaleDetail. Using the actual table names.
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Header: finalize lifecycle + creator + bank for Bank Transfer mode
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='IsFinalized')
    ALTER TABLE data_StoreSaleInfo ADD IsFinalized BIT NOT NULL DEFAULT 0;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='FinalizedBy')
    ALTER TABLE data_StoreSaleInfo ADD FinalizedBy INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='FinalizedByName')
    ALTER TABLE data_StoreSaleInfo ADD FinalizedByName NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='FinalizedAt')
    ALTER TABLE data_StoreSaleInfo ADD FinalizedAt DATETIME NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='CreatedBy')
    ALTER TABLE data_StoreSaleInfo ADD CreatedBy INT NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='CreatedByName')
    ALTER TABLE data_StoreSaleInfo ADD CreatedByName NVARCHAR(100) NULL;
GO
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleInfo' AND COLUMN_NAME='PaymentBankID')
    ALTER TABLE data_StoreSaleInfo ADD PaymentBankID INT NULL;
GO

-- Detail: landed cost snapshot for COGS at finalize
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StoreSaleDetail' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_StoreSaleDetail ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

PRINT '008_storesale_finalize_and_snapshot.sql complete.';
