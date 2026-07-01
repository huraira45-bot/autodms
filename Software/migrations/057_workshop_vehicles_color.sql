-- 057_workshop_vehicles_color.sql
-- Owner request (2026-07-01): capture vehicle color on the customer vehicle
-- master. Job Card already carries VehicleColor (Addata_JobCardInfo); this
-- adds the same field to WorkshopVehicles so it can be entered at customer
-- setup time and copied forward onto every JC for that vehicle.
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME='WorkshopVehicles' AND COLUMN_NAME='VehicleColor'
)
    ALTER TABLE WorkshopVehicles ADD VehicleColor NVARCHAR(100) NULL;
GO

PRINT '057_workshop_vehicles_color.sql complete.';
GO
