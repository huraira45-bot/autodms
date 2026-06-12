-- ============================================================
-- Migration 007 — GTRN tax + carrying-cost snapshot
-- Source: SYSTEM_DOCUMENTATION.md §14.4 + §14.8 + Decision #16
-- Date:   2026-05-12
-- ============================================================
-- Per-line snapshot of the supplier's credit-note rate/amount AND our
-- carrying cost on the returned units. UnitLandedCost is looked up
-- from the original GRN line (data_PurchaseReturnDetail.PurchaseDetailId
-- already exists for that back-reference).
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseReturnDetail' AND COLUMN_NAME='TaxRate')
    ALTER TABLE data_PurchaseReturnDetail ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseReturnDetail' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE data_PurchaseReturnDetail ADD TaxAmount DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_PurchaseReturnDetail' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_PurchaseReturnDetail ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

PRINT '007_grtn_tax_snapshot.sql complete.';
