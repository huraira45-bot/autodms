-- ================================================================
-- 098 — HR: month-level WorkingDays
-- ================================================================
-- Owner ask 2026-07-29: Working days is a month-level number (same
-- for every employee that month), not per-employee. Adds a
-- WorkingDays column on hr_MonthlySettings.
--
-- When WorkingDays is set for a month, the salary calculator uses
-- it as the pro-ration base instead of calendar days:
--   prorated = basic × (WorkingDays − Absents) / WorkingDays
-- Otherwise it falls back to the existing calendar-days behaviour.
--
-- The per-row WorkingDays on hr_AttendanceRecords is kept in the
-- schema for backward compat but no longer surfaced or written to
-- from the UI.
-- ================================================================
SET NOCOUNT ON;
SET QUOTED_IDENTIFIER ON;
PRINT '=== 098_hr_monthly_working_days ===';

IF COL_LENGTH('dbo.hr_MonthlySettings', 'WorkingDays') IS NULL
BEGIN
    ALTER TABLE dbo.hr_MonthlySettings
        ADD WorkingDays DECIMAL(6,2) NULL;
    PRINT '  hr_MonthlySettings.WorkingDays added (nullable).';
END
ELSE
    PRINT '  hr_MonthlySettings.WorkingDays already exists.';
GO

PRINT '=== 098_hr_monthly_working_days: done ===';
