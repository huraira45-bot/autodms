-- 147_bay_stream_links.sql
-- A watch link for the bay camera, created when work starts on a car.
--
-- Owner ask 2026-09-26: each bay screen is a Windows all-in-one with a camera.
-- The customer should be able to watch their own car being worked on, and the
-- footage should be kept. THIS MIGRATION IS ONLY THE LINK -- the streaming
-- itself, the recording, and giving the link to the customer are a later job,
-- by the owner's own instruction.
--
-- The link is built now rather than later because the things that are awkward
-- to retrofit are decided here:
--
--   * The token is unguessable (32 random bytes, base64url). A link that can
--     be guessed is a camera pointed at someone else's car.
--   * It is revocable and it expires. Once a link is out in the world it
--     cannot be recalled, so there has to be a way to kill one.
--   * It belongs to the JOB CARD, not to a labour line. The customer wants to
--     watch their car, not one operation on it -- so the first job started
--     creates the link and every later job on the same car reuses it.
--
-- Nothing streams yet. A token that resolves says live = 0, which is honest
-- rather than a broken page.
--
-- Idempotent -- safe to re-run.
SET NOCOUNT ON;

IF OBJECT_ID('dms_BayStreamLinks', 'U') IS NULL
BEGIN
    CREATE TABLE dms_BayStreamLinks (
        StreamLinkID   INT IDENTITY(1,1) CONSTRAINT PK_BayStreamLinks PRIMARY KEY,
        -- 43 chars of base64url from 32 random bytes.
        Token          NVARCHAR(64)  NOT NULL CONSTRAINT UQ_BayStreamLinks_Token UNIQUE,
        JobCardID      INT           NOT NULL,
        JobCardNo      NVARCHAR(100) NULL,
        VehicleRegNo   NVARCHAR(150) NULL,
        BayID          INT           NULL,
        BayName        NVARCHAR(50)  NULL,
        -- Which bay screen opened it, and which job line was starting. Kept
        -- for the record; the link itself is not tied to that line.
        DeviceID       INT           NULL,
        StartedDetailID INT          NULL,
        Status         NVARCHAR(20)  NOT NULL CONSTRAINT DF_BayStreamLinks_Status DEFAULT 'Active',
        CreatedAt      DATETIME      NOT NULL CONSTRAINT DF_BayStreamLinks_Created DEFAULT GETDATE(),
        -- A link that never dies is a camera anyone can watch forever.
        ExpiresAt      DATETIME      NOT NULL,
        RevokedAt      DATETIME      NULL,
        RevokedByName  NVARCHAR(100) NULL,
        CONSTRAINT CK_BayStreamLinks_Status CHECK (Status IN ('Active', 'Revoked'))
    );
    CREATE INDEX IX_BayStreamLinks_JobCard ON dms_BayStreamLinks (JobCardID, Status);
    PRINT '147: created dms_BayStreamLinks.';
END
GO

-- One live link per car. A second Active row for the same job card would mean
-- two links to the same camera with no way to tell which the customer holds.
-- Filtered index, so it needs QUOTED_IDENTIFIER -- sqlcmd defaults it off.
SET QUOTED_IDENTIFIER ON;
SET ANSI_NULLS ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'UX_BayStreamLinks_ActivePerJobCard')
BEGIN
    CREATE UNIQUE INDEX UX_BayStreamLinks_ActivePerJobCard
        ON dms_BayStreamLinks (JobCardID)
        WHERE Status = 'Active';
    PRINT '147: added UX_BayStreamLinks_ActivePerJobCard.';
END
GO

PRINT '147_bay_stream_links complete.';
