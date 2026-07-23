-- =============================================================================
-- 092: Care-Off discount cap elevation requests
--
-- Workflow so a privileged user (careoff_request_elevation permission) can
-- ask an admin to raise a specific Job Card's care-off cap above the
-- assigned employee's normal MaxDiscountPct. Admin (careoff_approve_
-- elevation) decides.
--
-- Approval is per-JC and single-use — once the JC is saved with the
-- elevated cap, the admin can revoke the row by hand. Every request row
-- carries the original cap AND the requested cap so the audit trail
-- shows exactly what was elevated and by whom.
--
-- Owner ask 2026-07-23.
-- =============================================================================
SET NOCOUNT ON;

IF OBJECT_ID('dbo.dms_CareOffElevationRequests', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_CareOffElevationRequests (
        RequestID           INT IDENTITY(1,1) PRIMARY KEY,
        JobCardID           INT           NOT NULL,
        CareOffID           INT           NOT NULL,
        CareOffEmployeeID   INT           NULL,
        CareOffEmployeeName NVARCHAR(200) NULL,
        OriginalCapPct      DECIMAL(5,2)  NOT NULL,
        RequestedCapPct     DECIMAL(5,2)  NOT NULL,
        Reason              NVARCHAR(500) NULL,
        Status              NVARCHAR(20)  NOT NULL DEFAULT 'PENDING',
        RequestedBy         INT           NULL,
        RequestedByName     NVARCHAR(100) NULL,
        RequestedAt         DATETIME      NOT NULL DEFAULT GETDATE(),
        DecidedBy           INT           NULL,
        DecidedByName       NVARCHAR(100) NULL,
        DecidedAt           DATETIME      NULL,
        DecisionReason      NVARCHAR(500) NULL,
        CONSTRAINT CK_ElevReq_Status CHECK (Status IN ('PENDING','APPROVED','REJECTED')),
        CONSTRAINT CK_ElevReq_Cap    CHECK (RequestedCapPct > OriginalCapPct AND RequestedCapPct <= 100)
    );
    CREATE INDEX IX_ElevReq_JC        ON dbo.dms_CareOffElevationRequests(JobCardID);
    CREATE INDEX IX_ElevReq_Status    ON dbo.dms_CareOffElevationRequests(Status);
    CREATE INDEX IX_ElevReq_Requested ON dbo.dms_CareOffElevationRequests(RequestedAt DESC);
    PRINT 'dms_CareOffElevationRequests created.';
END
ELSE
    PRINT 'dms_CareOffElevationRequests already exists — skipped.';
GO

-- Seed the two workflow permissions for admin group (GroupID = 1).
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'careoff_request_elevation')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'careoff_request_elevation');
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'careoff_approve_elevation')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'careoff_approve_elevation');
GO

PRINT '092 done — care-off elevation requests ready.';
