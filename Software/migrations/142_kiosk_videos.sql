-- =============================================================================
-- 142: Videos on the lobby job board
--
-- Owner ask 2026-09-23: the lobby TV should show the job board for a minute,
-- then play a video, then the board again for a minute, then the next video,
-- looping back to the first after the last one.
--
-- Videos are uploaded through DealerDesk rather than dropped on the server, so
-- marketing can change them without anyone logging into the live machine. The
-- files live under Software/uploads/kiosk-videos/, which is inside the public
-- /uploads mount — the lobby TV has no login, so it has to be able to fetch
-- them anonymously, exactly like the job data it already reads.
-- =============================================================================
SET NOCOUNT ON;

IF OBJECT_ID('dbo.dms_KioskVideos', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_KioskVideos (
        VideoID              INT IDENTITY(1,1) NOT NULL
            CONSTRAINT PK_KioskVideos PRIMARY KEY,
        Title                NVARCHAR(200) NOT NULL,
        FileName             NVARCHAR(260) NOT NULL,   -- as stored on disk
        OriginalName         NVARCHAR(260) NULL,       -- as the uploader named it
        MimeType             NVARCHAR(100) NULL,
        SizeBytes            BIGINT        NULL,
        -- Play order on the TV. Ties break on VideoID, so a fresh upload
        -- without an explicit order lands at the end.
        SortOrder            INT           NOT NULL CONSTRAINT DF_KioskVideos_Sort    DEFAULT (0),
        -- Switched off rather than deleted, so a seasonal clip can be brought
        -- back without uploading it again.
        IsActive             BIT           NOT NULL CONSTRAINT DF_KioskVideos_Active  DEFAULT (1),
        UploadedByEmployeeID INT           NULL,
        UploadedByName       NVARCHAR(200) NULL,
        UploadedAt           DATETIME      NOT NULL CONSTRAINT DF_KioskVideos_At      DEFAULT (GETDATE())
    );
    PRINT 'dms_KioskVideos created.';
END
ELSE PRINT 'dms_KioskVideos already exists — skipped.';
GO

-- What the TV plays next is read on every rotation, so keep the lookup cheap.
IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_KioskVideos_Play')
BEGIN
    CREATE INDEX IX_KioskVideos_Play ON dbo.dms_KioskVideos (IsActive, SortOrder, VideoID);
    PRINT 'IX_KioskVideos_Play created.';
END
ELSE PRINT 'IX_KioskVideos_Play already exists — skipped.';
GO

-- A couple of numbers the lobby screen reads. Kept as rows rather than code so
-- they can be changed from the admin screen without a deploy.
IF OBJECT_ID('dbo.dms_KioskSettings', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.dms_KioskSettings (
        SettingKey   NVARCHAR(60)  NOT NULL CONSTRAINT PK_KioskSettings PRIMARY KEY,
        SettingValue NVARCHAR(200) NOT NULL,
        UpdatedAt    DATETIME      NOT NULL CONSTRAINT DF_KioskSettings_At DEFAULT (GETDATE()),
        UpdatedByName NVARCHAR(200) NULL
    );
    PRINT 'dms_KioskSettings created.';
END
ELSE PRINT 'dms_KioskSettings already exists — skipped.';
GO

IF NOT EXISTS (SELECT 1 FROM dbo.dms_KioskSettings WHERE SettingKey = 'BoardSeconds')
BEGIN
    -- The owner asked for a minute of job board between videos.
    INSERT INTO dbo.dms_KioskSettings (SettingKey, SettingValue) VALUES ('BoardSeconds', '60');
    PRINT 'BoardSeconds defaulted to 60.';
END
ELSE PRINT 'BoardSeconds already set — left alone.';
GO

IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'workshop_kiosk_videos:view')
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'workshop_kiosk_videos:view'),
           (1, 'workshop_kiosk_videos:insert'),
           (1, 'workshop_kiosk_videos:edit'),
           (1, 'workshop_kiosk_videos:delete');
    PRINT 'workshop_kiosk_videos granted to the admin group.';
END
ELSE PRINT 'admin group already has workshop_kiosk_videos — skipped.';
GO

PRINT '142 done — the lobby board can play videos between refreshes.';
