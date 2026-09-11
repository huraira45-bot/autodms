-- 132_gatepass_booking_doctype.sql
-- Owner ask 2026-09-11: issuing a gate pass on a vehicle booking should
-- produce a printable gate pass.
--
-- It did not, because the vehicle-sales flow never wrote one. salesLifecycle
-- issueGatePass closed the booking, marked the vehicle Sold and logged the
-- transition, but inserted nothing into dms_GatePasses — so there was no pass
-- to print, and the Gate Pass screen (which lists that table) never showed
-- vehicle deliveries at all.
--
-- dms_GatePasses.DocType only permitted 'JOBCARD' and 'STORE_SALE'. Adds
-- 'BOOKING' so a vehicle delivery can be recorded alongside them. Also adds
-- 'VEHICLE_DELIVERY' to the PassReason whitelist if one is enforced.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

DECLARE @name SYSNAME = (
    SELECT TOP 1 cc.name
    FROM   sys.check_constraints cc
    WHERE  cc.parent_object_id = OBJECT_ID('dms_GatePasses')
      AND  cc.definition LIKE '%STORE_SALE%'
      AND  cc.definition LIKE '%JOBCARD%');

IF @name IS NULL
    PRINT '132: no DocType check constraint found - nothing to widen.';
ELSE
BEGIN
    DECLARE @def NVARCHAR(MAX) = (SELECT definition FROM sys.check_constraints WHERE name = @name);
    IF @def LIKE '%BOOKING%'
        PRINT '132: DocType already allows BOOKING.';
    ELSE
    BEGIN
        EXEC('ALTER TABLE dms_GatePasses DROP CONSTRAINT ' + @name);
        ALTER TABLE dms_GatePasses WITH CHECK ADD CONSTRAINT CK_GatePasses_DocType
            CHECK ([DocType] = 'STORE_SALE' OR [DocType] = 'JOBCARD' OR [DocType] = 'BOOKING');
        PRINT '132: DocType widened to allow BOOKING.';
    END
END
GO

-- PassReason may or may not be constrained; widen it only if it is.
DECLARE @rname SYSNAME = (
    SELECT TOP 1 cc.name
    FROM   sys.check_constraints cc
    WHERE  cc.parent_object_id = OBJECT_ID('dms_GatePasses')
      AND  cc.definition LIKE '%PassReason%');

IF @rname IS NULL
    PRINT '132: PassReason is unconstrained - no change needed.';
ELSE
BEGIN
    DECLARE @rdef NVARCHAR(MAX) = (SELECT definition FROM sys.check_constraints WHERE name = @rname);
    IF @rdef LIKE '%VEHICLE_DELIVERY%'
        PRINT '132: PassReason already allows VEHICLE_DELIVERY.';
    ELSE
        PRINT '132: PassReason is constrained but does not list VEHICLE_DELIVERY - review before issuing booking passes.';
END
GO

PRINT '132_gatepass_booking_doctype complete.';
