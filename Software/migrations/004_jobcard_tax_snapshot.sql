-- ============================================================
-- Migration 004 — Tax snapshot columns on Job Card detail tables
-- Source: SYSTEM_DOCUMENTATION.md §14.4 (per-line tax snapshot rule)
-- Date:   2026-05-12
-- ============================================================
-- Each labour / sublet / parts-issue line on a Job Card snapshots the
-- TaxRate and TaxAmount at save time. Nullable for legacy rows; the
-- save controller populates them going forward.
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

-- Labour lines (PST)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='TaxRate')
    ALTER TABLE Addata_JobCardInfoDetail ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoDetail' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE Addata_JobCardInfoDetail ADD TaxAmount DECIMAL(18,2) NULL;
GO

-- Sublet lines (PST)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoSubletJobDetail' AND COLUMN_NAME='TaxRate')
    ALTER TABLE Addata_JobCardInfoSubletJobDetail ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='Addata_JobCardInfoSubletJobDetail' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE Addata_JobCardInfoSubletJobDetail ADD TaxAmount DECIMAL(18,2) NULL;
GO

-- Parts issued to Job Card (GST)
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCard' AND COLUMN_NAME='TaxRate')
    ALTER TABLE data_StockIssuetoJobCard ADD TaxRate DECIMAL(8,4) NULL;
GO

IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCard' AND COLUMN_NAME='TaxAmount')
    ALTER TABLE data_StockIssuetoJobCard ADD TaxAmount DECIMAL(18,2) NULL;
GO

-- Per-line landed cost on parts-issue lines (for COGS at finalize).
-- Defaults from InventItems.WeightedRate at issue time; can be backfilled if missing.
IF NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME='data_StockIssuetoJobCard' AND COLUMN_NAME='UnitLandedCost')
    ALTER TABLE data_StockIssuetoJobCard ADD UnitLandedCost DECIMAL(18,4) NULL;
GO

PRINT '004_jobcard_tax_snapshot.sql complete.';
