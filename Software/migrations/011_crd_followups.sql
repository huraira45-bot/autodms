SET QUOTED_IDENTIFIER ON;
GO

/*
 * Migration 011 — Customer Relation Department: follow-up queue
 *
 * Every Job Card finalize auto-creates one row here. CRD staff work the queue:
 * call the customer ~3 days after delivery, log outcome (satisfied / complaint /
 * needs-attention / no-answer), capture free-text notes, optionally reassign.
 *
 * The follow-up is INFORMATIONAL ONLY — it does NOT touch GL or block any other
 * workflow. Failure to insert won't roll back a JC finalize (best-effort hook).
 *
 * Source contract: post-§14.22 — CRD MVP.
 */

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRDFollowUps')
BEGIN
    CREATE TABLE dms_CRDFollowUps (
        FollowUpID       INT IDENTITY(1,1) PRIMARY KEY,
        JobCardID        INT NOT NULL,
        PartyID          INT NULL,                      -- credit customer; NULL for walk-in
        CustomerProfileID INT NULL,                     -- workshop EndUserID (snapshot link)
        CustomerName     NVARCHAR(200) NULL,            -- snapshot for display + walk-in
        PhoneOne         NVARCHAR(50) NULL,             -- snapshot for direct dialing
        VehicleRegNo     NVARCHAR(50) NULL,             -- snapshot

        DueDate          DATE NOT NULL,                 -- default JC.FinalizedAt + 3 days

        Status           NVARCHAR(20) NOT NULL DEFAULT 'Pending',
        --  'Pending' | 'Contacted' | 'Closed' | 'NoResponse'

        Outcome          NVARCHAR(20) NULL,
        --  'Satisfied' | 'Complaint' | 'NeedsAttention' | 'NoAnswer'

        Notes            NVARCHAR(MAX) NULL,

        AssignedTo       INT NULL,                      -- UserID (nullable = unassigned)
        AssignedToName   NVARCHAR(100) NULL,

        ContactedBy      INT NULL,
        ContactedByName  NVARCHAR(100) NULL,
        ContactedAt      DATETIME NULL,

        CreatedAt        DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedBy        INT NULL,
        CreatedByName    NVARCHAR(100) NULL,

        UpdatedAt        DATETIME NULL,
        UpdatedBy        INT NULL,
        UpdatedByName    NVARCHAR(100) NULL
    );

    CREATE INDEX IX_dms_CRDFollowUps_Status_DueDate ON dms_CRDFollowUps (Status, DueDate);
    CREATE INDEX IX_dms_CRDFollowUps_JobCardID ON dms_CRDFollowUps (JobCardID);
    CREATE INDEX IX_dms_CRDFollowUps_PartyID ON dms_CRDFollowUps (PartyID) WHERE PartyID IS NOT NULL;
    CREATE INDEX IX_dms_CRDFollowUps_AssignedTo ON dms_CRDFollowUps (AssignedTo) WHERE AssignedTo IS NOT NULL;

    -- One row per JC at most (idempotent for re-finalize after unfinalize)
    CREATE UNIQUE INDEX UX_dms_CRDFollowUps_JobCardID ON dms_CRDFollowUps (JobCardID);

    PRINT 'Created dms_CRDFollowUps with indexes.';
END
ELSE
    PRINT 'dms_CRDFollowUps already exists; skipping.';
GO
