/*
 * Migration 017 — CRD ↔ CRO bridge.
 *
 * When a CRD follow-up reaches Outcome='Complaint', we now spawn a real CRO
 * complaint and link the follow-up row to it so the CRD agent can see where it
 * went and the CRO team can see why it landed (the JC + the follow-up notes).
 *
 * Adds a nullable LinkedComplaintID column. Safe to re-run (IF NOT EXISTS).
 */

IF NOT EXISTS (
    SELECT 1 FROM sys.columns
    WHERE object_id = OBJECT_ID('dbo.dms_CRDFollowUps') AND name = 'LinkedComplaintID'
)
BEGIN
    ALTER TABLE dbo.dms_CRDFollowUps
        ADD LinkedComplaintID INT NULL
            CONSTRAINT FK_CRDFollowUps_Complaint FOREIGN KEY (LinkedComplaintID)
                REFERENCES dbo.dms_CRO_Complaints(ComplaintID);
END
GO

-- Lookup index: "which follow-up was the origin of complaint X?"
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_CRDFollowUps_LinkedComplaint')
BEGIN
    CREATE INDEX IX_CRDFollowUps_LinkedComplaint
        ON dbo.dms_CRDFollowUps(LinkedComplaintID)
        WHERE LinkedComplaintID IS NOT NULL;
END
GO
