-- ============================================================
-- Migration 005 — Tax snapshot + landed cost on parts-issue DETAIL lines
-- Source: SYSTEM_DOCUMENTATION.md §14.4 + §14.6 (parts COGS = unit landed cost × qty)
-- Date:   2026-05-12
-- ============================================================
-- Migration 004 added these columns to data_StockIssuetoJobCard (the issue HEADER),
-- which is the wrong granularity — parts tax and cost are per-line, not per-issue.
-- Adding them to data_StockIssuetoJobCardDetail (the LINE table) here.
--
-- The columns added to data_StockIssuetoJobCard in 004 are left in place (additive
-- rule), they will simply remain unused. Future cleanup can drop them.
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCardDetail' AND COLUMN_NAME='TaxRate')
    ALTER TABLE data_StockIssuetoJobCardDetail ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCardDetail' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE data_StockIssuetoJobCardDetail ADD TaxAmount DECIMAL(18,2) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCardDetail' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_StockIssuetoJobCardDetail ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCardDetail' AND COLUMN_NAME='Discount')
    ALTER TABLE data_StockIssuetoJobCardDetail ADD Discount DECIMAL(18,3) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCardDetail' AND COLUMN_NAME='DiscAmt')
    ALTER TABLE data_StockIssuetoJobCardDetail ADD DiscAmt DECIMAL(18,3) NULL;
GO

PRINT '005_partsissue_detail_tax_snapshot.sql complete.';
