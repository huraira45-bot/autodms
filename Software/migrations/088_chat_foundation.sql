-- 088_chat_foundation.sql
-- Owner ask 2026-07-18: internal Slack-style chat.
--   * DMs + public/private channels + file attachments
--   * Real-time via Socket.io (server integration is separate)
--   * Admin can audit all messages (banner told to users)
--
-- Tables:
--   dms_ChatChannels   — one row per DM pair or channel
--   dms_ChatMembers    — who belongs to which channel + last-read cursor
--   dms_ChatMessages   — messages, optional file attachment metadata
--
-- Idempotent — safe to re-run.
SET NOCOUNT ON;

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_ChatChannels')
BEGIN
    CREATE TABLE dms_ChatChannels (
        ChannelID     INT IDENTITY(1,1) PRIMARY KEY,
        Kind          NVARCHAR(20) NOT NULL CHECK (Kind IN ('public','private','dm')),
        Name          NVARCHAR(100) NULL,      -- DM channels leave this NULL
        Description   NVARCHAR(500) NULL,
        CreatedBy     INT NOT NULL,             -- GLUser.UserId
        CreatedAt     DATETIME NOT NULL DEFAULT GETDATE(),
        LastMessageAt DATETIME NULL             -- denormalised for cheap sort
    );
    CREATE INDEX IX_ChatChannels_Kind_LastMsg
        ON dms_ChatChannels (Kind, LastMessageAt DESC);
    PRINT '088: created dms_ChatChannels.';
END
ELSE PRINT '088: dms_ChatChannels already present.';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_ChatMembers')
BEGIN
    CREATE TABLE dms_ChatMembers (
        ChannelID          INT NOT NULL,
        UserID             INT NOT NULL,        -- GLUser.UserId
        Role               NVARCHAR(20) NOT NULL DEFAULT 'member' CHECK (Role IN ('member','owner')),
        JoinedAt           DATETIME NOT NULL DEFAULT GETDATE(),
        LastReadMessageID  INT NULL,
        CONSTRAINT PK_ChatMembers PRIMARY KEY (ChannelID, UserID),
        CONSTRAINT FK_ChatMembers_Channel FOREIGN KEY (ChannelID)
            REFERENCES dms_ChatChannels (ChannelID) ON DELETE CASCADE
    );
    CREATE INDEX IX_ChatMembers_User
        ON dms_ChatMembers (UserID);
    PRINT '088: created dms_ChatMembers.';
END
ELSE PRINT '088: dms_ChatMembers already present.';

IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_ChatMessages')
BEGIN
    CREATE TABLE dms_ChatMessages (
        MessageID       INT IDENTITY(1,1) PRIMARY KEY,
        ChannelID       INT NOT NULL,
        SenderID        INT NOT NULL,           -- GLUser.UserId
        Content         NVARCHAR(MAX) NULL,     -- may be NULL when a pure attachment is sent
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        EditedAt        DATETIME NULL,
        DeletedAt       DATETIME NULL,          -- soft delete; keeps audit trail
        AttachmentPath  NVARCHAR(300) NULL,     -- relative to uploads/chat/
        AttachmentName  NVARCHAR(200) NULL,     -- original filename
        AttachmentType  NVARCHAR(100) NULL,     -- MIME type
        AttachmentSize  BIGINT NULL,
        CONSTRAINT FK_ChatMessages_Channel FOREIGN KEY (ChannelID)
            REFERENCES dms_ChatChannels (ChannelID) ON DELETE CASCADE
    );
    CREATE INDEX IX_ChatMessages_Channel_Created
        ON dms_ChatMessages (ChannelID, CreatedAt DESC);
    PRINT '088: created dms_ChatMessages.';
END
ELSE PRINT '088: dms_ChatMessages already present.';

-- Permissions:
--   chat_use   — send/receive messages, create channels, upload files.
--                Granted to EVERY group by default (owner ask 2026-07-18:
--                chat is universal — no per-user gating).
--   chat_admin — audit any channel + delete channels/messages.
--                Granted to admin (group 1) only.
INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
SELECT g.GroupId, 'chat_use'
FROM   GLUserGroup g
WHERE  NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions mp
    WHERE  mp.GroupID = g.GroupId AND mp.PermissionKey = 'chat_use'
);
IF NOT EXISTS (SELECT 1 FROM dms_ModulePermissions WHERE GroupID = 1 AND PermissionKey = 'chat_admin')
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey) VALUES (1, 'chat_admin');

PRINT '088_chat_foundation complete.';
