-- ============================================================
-- Migration 006 — GRN tax snapshot + freight-taxable flag
-- Source: SYSTEM_DOCUMENTATION.md §14.4 + §14.7 + Decision #15
-- Date:   2026-05-12
-- ============================================================
-- Adds per-GRN FreightTaxable checkbox and per-line tax + landed-cost snapshot
-- on data_PurchaseDetail (the GRN line table).
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseInfo' AND COLUMN_NAME='FreightTaxable')
    ALTER TABLE data_PurchaseInfo ADD FreightTaxable BIT NOT NULL DEFAULT 1;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='TaxRate')
    ALTER TABLE data_PurchaseDetail ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE data_PurchaseDetail ADD TaxAmount DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseDetail' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_PurchaseDetail ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

PRINT '006_grn_tax_snapshot.sql complete.';
