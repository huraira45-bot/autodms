-- ============================================================
-- Migration 003 — Seed default tax rates (GST 17%, PST 16%)
-- Source: SYSTEM_DOCUMENTATION.md §14.4
-- Date:   2026-05-12
-- ============================================================
-- Idempotent: only inserts if no current rate exists for the tax type.
-- ============================================================

SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM dms_TaxRates WHERE TaxType='GST' AND EffectiveTo IS NULL)
    INSERT INTO dms_TaxRates (TaxType, Rate, EffectiveFrom, EffectiveTo, ChangedBy, ChangedByName)
        VALUES ('GST', 17.00, CAST(GETDATE() AS DATE), NULL, NULL, 'system-seed');

IF NOT EXISTS (SELECT 1 FROM dms_TaxRates WHERE TaxType='PST' AND EffectiveTo IS NULL)
    INSERT INTO dms_TaxRates (TaxType, Rate, EffectiveFrom, EffectiveTo, ChangedBy, ChangedByName)
        VALUES ('PST', 16.00, CAST(GETDATE() AS DATE), NULL, NULL, 'system-seed');

PRINT '003_seed_default_tax_rates.sql complete.';
