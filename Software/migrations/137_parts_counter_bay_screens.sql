-- 137_parts_counter_bay_screens.sql
-- Service tablet app, Phase 3 (plan 2026-09-14).
--
--   dms_BayScreenDevices   screens fixed at a bay. Each holds a long-lived
--                          device token that works only for its own bay's
--                          jobs; revoking the row cuts the screen off at once.
--   parts_requisition      parts counter: issue tablet parts requests
--   workshop_bay_screen    register and unregister bay screens
--
-- Both permissions are granted to admin only; which roles get them is the
-- owner's call in Role Permissions.
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF OBJECT_ID('dms_BayScreenDevices', 'U') IS NULL
BEGIN
    CREATE TABLE dms_BayScreenDevices (
        DeviceID           INT IDENTITY(1,1) CONSTRAINT PK_BayScreenDevices PRIMARY KEY,
        BayID              INT              NOT NULL
                           CONSTRAINT FK_BayScreenDevices_Bay REFERENCES dms_Bays (BayID),
        DeviceName         NVARCHAR(100)    NOT NULL,
        TokenID            UNIQUEIDENTIFIER NOT NULL CONSTRAINT UQ_BayScreenDevices_Token UNIQUE,
        RegisteredByUserID INT              NULL,
        RegisteredByName   NVARCHAR(100)    NULL,
        RegisteredAt       DATETIME         NOT NULL CONSTRAINT DF_BayScreenDevices_RegisteredAt DEFAULT GETDATE(),
        LastSeenAt         DATETIME         NULL,
        RevokedAt          DATETIME         NULL,
        RevokedByName      NVARCHAR(100)    NULL
    );
    CREATE INDEX IX_BayScreenDevices_Bay ON dms_BayScreenDevices (BayID, RevokedAt);
    PRINT '137: created dms_BayScreenDevices.';
END
GO

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'parts_requisition')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'parts_requisition');
    PRINT '137: granted parts_requisition to admin.';
END
GO

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'workshop_bay_screen')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'workshop_bay_screen');
    PRINT '137: granted workshop_bay_screen to admin.';
END
GO

PRINT '137_parts_counter_bay_screens complete.';
