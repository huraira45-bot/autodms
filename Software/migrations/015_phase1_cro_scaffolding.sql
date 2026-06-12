SET QUOTED_IDENTIFIER ON;
GO

/*
 * Migration 015 — Phase 1: CRO scaffolding
 *
 * Creates all 15 dms_CRO_* tables defined in §5 of the design doc, plus the
 * 1-bit `DoNotContact` flag on addata_CustomerInfo for campaign opt-out.
 *
 * Idempotent: every CREATE is guarded by IF NOT EXISTS.
 * No data is inserted here — that's a separate seed step.
 */

-------------------------------------------------------------------------------
-- 1. dms_CRO_Complaints
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Complaints')
BEGIN
    CREATE TABLE dms_CRO_Complaints (
        ComplaintID            INT IDENTITY(1,1) PRIMARY KEY,
        ComplaintNo            NVARCHAR(20) NOT NULL UNIQUE,
        ComplaintType          NVARCHAR(20) NOT NULL,
            -- 'Product' | 'Service'
        Source                 NVARCHAR(30) NOT NULL,
            -- 'Phone'|'WalkIn'|'Online'|'WhatsApp'|'Inquiry'|'PostJobSurvey'|'CRO_OutboundCall'

        Subject                NVARCHAR(500) NOT NULL,
        Description            NVARCHAR(MAX),

        -- Decision #1: every complaint references an existing JC
        JobCardID              INT NOT NULL,
        OriginalItemID         INT NULL,                -- for product complaints
        CustomerProfileID      INT NULL,                -- addata_CustomerInfo.ProfileID
        PartyID                INT NULL,                -- credit customer if applicable

        ContactName            NVARCHAR(200) NOT NULL,  -- snapshot at file time
        ContactPhone           NVARCHAR(50)  NOT NULL,
        ChasisNo               NVARCHAR(50)  NULL,
        EngineNo               NVARCHAR(50)  NULL,

        AssignedDepartmentID   INT NULL,
        AssignedEmployeeID     INT NULL,

        CurrentEscalationLevel TINYINT NOT NULL DEFAULT 0,    -- 0..2 (3 tiers per decision #4)
        LastEscalationAt       DATETIME NULL,

        Status                 NVARCHAR(20) NOT NULL DEFAULT 'New',
            -- 'New'|'Assigned'|'InProgress'|'PendingCROVerify'|'Closed'|'ReOpened'

        Severity               NVARCHAR(10) NOT NULL DEFAULT 'Normal',
            -- 'Low'|'Normal'|'High'|'Critical'

        OpenedAt               DATETIME NOT NULL DEFAULT GETDATE(),
        ClosedAt               DATETIME NULL,
        CreatedBy              INT NULL,
        CreatedByName          NVARCHAR(100) NULL,
        UpdatedAt              DATETIME NULL,
        UpdatedBy              INT NULL,

        CONSTRAINT FK_CROComp_JC      FOREIGN KEY (JobCardID)         REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_CROComp_Party   FOREIGN KEY (PartyID)           REFERENCES gen_PartiesInfo(PartyID),
        CONSTRAINT FK_CROComp_Profile FOREIGN KEY (CustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID),
        CONSTRAINT FK_CROComp_Dept    FOREIGN KEY (AssignedDepartmentID) REFERENCES gen_DepartmentInfo(DepartmentID),
        CONSTRAINT FK_CROComp_Emp     FOREIGN KEY (AssignedEmployeeID)   REFERENCES gen_EmployeeInfo(EmployeeID),
        CONSTRAINT FK_CROComp_Item    FOREIGN KEY (OriginalItemID)       REFERENCES InventItems(ItemId)
    );

    CREATE INDEX IX_CROComp_Status_DueByEscalation ON dms_CRO_Complaints (Status, CurrentEscalationLevel, LastEscalationAt);
    CREATE INDEX IX_CROComp_JobCardID ON dms_CRO_Complaints (JobCardID);
    CREATE INDEX IX_CROComp_Party     ON dms_CRO_Complaints (PartyID)             WHERE PartyID IS NOT NULL;
    CREATE INDEX IX_CROComp_Profile   ON dms_CRO_Complaints (CustomerProfileID)   WHERE CustomerProfileID IS NOT NULL;
    CREATE INDEX IX_CROComp_AssignedEmp ON dms_CRO_Complaints (AssignedEmployeeID) WHERE AssignedEmployeeID IS NOT NULL;
    PRINT 'dms_CRO_Complaints created.';
END
ELSE PRINT 'dms_CRO_Complaints already exists.';
GO

-------------------------------------------------------------------------------
-- 2. dms_CRO_ComplaintActions  (per-complaint audit trail)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_ComplaintActions')
BEGIN
    CREATE TABLE dms_CRO_ComplaintActions (
        ActionID                INT IDENTITY(1,1) PRIMARY KEY,
        ComplaintID             INT NOT NULL,
        ActionType              NVARCHAR(30) NOT NULL,
            -- 'Note'|'Routed'|'Resolved'|'WhatsAppProof'|'WhatsAppProofOverride'
            -- |'CROCallLogged'|'CustomerVerdict'|'Escalated'|'Reassigned'
            -- |'ReOpened'|'Closed'|'Deleted'
        PerformedByEmployeeID   INT NULL,
        PerformedByName         NVARCHAR(100) NULL,
        PerformedAt             DATETIME NOT NULL DEFAULT GETDATE(),
        Notes                   NVARCHAR(MAX) NULL,
        EscalationLevelBefore   TINYINT NULL,
        EscalationLevelAfter    TINYINT NULL,
        CustomerVerdict         NVARCHAR(20) NULL,
            -- 'Satisfied'|'NotSatisfied'|'NoResponse'  (only on CustomerVerdict actions)

        CONSTRAINT FK_CROAct_Complaint FOREIGN KEY (ComplaintID)         REFERENCES dms_CRO_Complaints(ComplaintID),
        CONSTRAINT FK_CROAct_Emp       FOREIGN KEY (PerformedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROAct_Complaint   ON dms_CRO_ComplaintActions (ComplaintID, PerformedAt DESC);
    -- Idempotency for escalation engine: at most one Escalated row per (Complaint, Level)
    CREATE UNIQUE INDEX UX_CROAct_EscalationLevel
        ON dms_CRO_ComplaintActions (ComplaintID, EscalationLevelAfter)
        WHERE ActionType = 'Escalated' AND EscalationLevelAfter IS NOT NULL;
    PRINT 'dms_CRO_ComplaintActions created.';
END
ELSE PRINT 'dms_CRO_ComplaintActions already exists.';
GO

-------------------------------------------------------------------------------
-- 3. dms_CRO_Attachments  (WhatsApp screenshots + photos + docs)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Attachments')
BEGIN
    CREATE TABLE dms_CRO_Attachments (
        AttachmentID           INT IDENTITY(1,1) PRIMARY KEY,
        ComplaintID            INT NOT NULL,
        AttachmentType         NVARCHAR(30) NOT NULL,
            -- 'WhatsAppScreenshot'|'Photo'|'Document'
        FilePath               NVARCHAR(500) NOT NULL,    -- relative to uploads/cro/
        OriginalFileName       NVARCHAR(300) NULL,
        MimeType               NVARCHAR(100) NULL,
        SizeBytes              INT NULL,
        UploadedByEmployeeID   INT NULL,
        UploadedByName         NVARCHAR(100) NULL,
        UploadedAt             DATETIME NOT NULL DEFAULT GETDATE(),
        Description            NVARCHAR(500) NULL,
        DeletedAt              DATETIME NULL,
        DeletedByEmployeeID    INT NULL,

        CONSTRAINT FK_CROAtt_Complaint FOREIGN KEY (ComplaintID)         REFERENCES dms_CRO_Complaints(ComplaintID),
        CONSTRAINT FK_CROAtt_Uploader  FOREIGN KEY (UploadedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID),
        CONSTRAINT FK_CROAtt_Deleter   FOREIGN KEY (DeletedByEmployeeID)  REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROAtt_Complaint ON dms_CRO_Attachments (ComplaintID, AttachmentType)
        WHERE DeletedAt IS NULL;
    PRINT 'dms_CRO_Attachments created.';
END
ELSE PRINT 'dms_CRO_Attachments already exists.';
GO

-------------------------------------------------------------------------------
-- 4. dms_CRO_EscalationRules  (cron-driven thresholds — pre-seeded later)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_EscalationRules')
BEGIN
    CREATE TABLE dms_CRO_EscalationRules (
        RuleID                  INT IDENTITY(1,1) PRIMARY KEY,
        AppliesToDepartmentID   INT NULL,           -- NULL = global default
        Severity                NVARCHAR(10) NULL,  -- NULL = applies to all severities
        Level                   TINYINT NOT NULL,   -- 1 = L1 (e.g. 72h), 2 = L2 (96h)
        HoursElapsed            INT NOT NULL,       -- threshold in hours from OpenedAt or LastEscalationAt
        EscalateToType          NVARCHAR(30) NOT NULL,
            -- 'BusinessUnitManager'|'CROManager'|'Executive'|'DirectReportTo'
        NotificationChannels    NVARCHAR(100) NOT NULL DEFAULT 'InApp,Email',
            -- CSV: InApp,Email,WhatsApp
        IsActive                BIT NOT NULL DEFAULT 1,

        CONSTRAINT FK_CRORule_Dept FOREIGN KEY (AppliesToDepartmentID) REFERENCES gen_DepartmentInfo(DepartmentID)
    );
    CREATE INDEX IX_CRORule_Active ON dms_CRO_EscalationRules (IsActive, Level);
    PRINT 'dms_CRO_EscalationRules created.';
END
ELSE PRINT 'dms_CRO_EscalationRules already exists.';
GO

-------------------------------------------------------------------------------
-- 5. dms_CRO_SurveyTemplates  (versioned per-type templates)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_SurveyTemplates')
BEGIN
    CREATE TABLE dms_CRO_SurveyTemplates (
        TemplateID      INT IDENTITY(1,1) PRIMARY KEY,
        SurveyType      NVARCHAR(30) NOT NULL,
            -- 'PostJobCard'|'PostComplaint'|'PostCampaign'
        Version         INT NOT NULL DEFAULT 1,
        QuestionsJSON   NVARCHAR(MAX) NOT NULL,    -- JSON array of questions
        IsActive        BIT NOT NULL DEFAULT 1,
        CreatedAt       DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID INT NULL,
        CreatedByName   NVARCHAR(100) NULL,

        CONSTRAINT FK_CROSurvTpl_Creator FOREIGN KEY (CreatedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    -- Only one active template per SurveyType
    CREATE UNIQUE INDEX UX_CROSurvTpl_ActivePerType
        ON dms_CRO_SurveyTemplates (SurveyType)
        WHERE IsActive = 1;
    PRINT 'dms_CRO_SurveyTemplates created.';
END
ELSE PRINT 'dms_CRO_SurveyTemplates already exists.';
GO

-------------------------------------------------------------------------------
-- 6. dms_CRO_Surveys  (individual survey instances)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Surveys')
BEGIN
    CREATE TABLE dms_CRO_Surveys (
        SurveyID            INT IDENTITY(1,1) PRIMARY KEY,
        SurveyType          NVARCHAR(30) NOT NULL,
        TemplateID          INT NOT NULL,          -- snapshot of which template version was used
        JobCardID           INT NULL,
        ComplaintID         INT NULL,
        CampaignID          INT NULL,
        CustomerProfileID   INT NULL,
        ContactPhone        NVARCHAR(50) NULL,
        TriggeredAt         DATETIME NOT NULL DEFAULT GETDATE(),
        SentVia             NVARCHAR(20) NULL,     -- 'WhatsApp'|'PhoneCall'|'SMS'
        SentAt              DATETIME NULL,
        RespondedAt         DATETIME NULL,
        QuestionsJSON       NVARCHAR(MAX) NULL,    -- snapshotted from template at send time
        ResponsesJSON       NVARCHAR(MAX) NULL,
        OverallRating       DECIMAL(3,2) NULL,     -- aggregated from numeric ratings
        Status              NVARCHAR(20) NOT NULL DEFAULT 'Triggered',
            -- 'Triggered'|'Sent'|'Responded'|'NoResponse'|'Expired'|'Cancelled'
        ResponseToken       NVARCHAR(40) NULL UNIQUE,  -- public URL slug
        TokenExpiresAt      DATETIME NULL,
        CapturedByEmployeeID INT NULL,             -- if CRO entered on phone

        CONSTRAINT FK_CROSurv_Template  FOREIGN KEY (TemplateID)        REFERENCES dms_CRO_SurveyTemplates(TemplateID),
        CONSTRAINT FK_CROSurv_JC        FOREIGN KEY (JobCardID)         REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_CROSurv_Complaint FOREIGN KEY (ComplaintID)       REFERENCES dms_CRO_Complaints(ComplaintID),
        CONSTRAINT FK_CROSurv_Profile   FOREIGN KEY (CustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID),
        CONSTRAINT FK_CROSurv_Captured  FOREIGN KEY (CapturedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROSurv_Status_Triggered ON dms_CRO_Surveys (Status, TriggeredAt);
    CREATE INDEX IX_CROSurv_JC                ON dms_CRO_Surveys (JobCardID)   WHERE JobCardID IS NOT NULL;
    CREATE INDEX IX_CROSurv_Complaint         ON dms_CRO_Surveys (ComplaintID) WHERE ComplaintID IS NOT NULL;
    PRINT 'dms_CRO_Surveys created.';
END
ELSE PRINT 'dms_CRO_Surveys already exists.';
GO

-------------------------------------------------------------------------------
-- 7. dms_CRO_Inquiries  (lighter-weight than complaints — no escalation)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Inquiries')
BEGIN
    CREATE TABLE dms_CRO_Inquiries (
        InquiryID            INT IDENTITY(1,1) PRIMARY KEY,
        Category             NVARCHAR(50) NOT NULL,
            -- 'Sales — New Vehicle'|'Sales — Used Vehicle'|'Service Booking'
            -- |'Parts'|'Insurance'|'Warranty Question'|'Complaint'|'Other'
        Source               NVARCHAR(30) NOT NULL,   -- 'Phone'|'WalkIn'|'WhatsApp'|'WebForm'
        Subject              NVARCHAR(500) NOT NULL,
        Body                 NVARCHAR(MAX) NULL,

        ContactName          NVARCHAR(200) NOT NULL,
        ContactPhone         NVARCHAR(50)  NOT NULL,
        ContactEmail         NVARCHAR(100) NULL,

        CustomerProfileID    INT NULL,                -- set if existing customer recognised
        AssignedDepartmentID INT NULL,
        AssignedEmployeeID   INT NULL,

        Status               NVARCHAR(20) NOT NULL DEFAULT 'New',
            -- 'New'|'Assigned'|'InProgress'|'Closed'|'Closed (Converted)'

        LinkedJobCardID      INT NULL,            -- if converted to booking
        LinkedComplaintID    INT NULL,            -- if converted to complaint

        OpenedAt             DATETIME NOT NULL DEFAULT GETDATE(),
        ClosedAt             DATETIME NULL,
        CreatedBy            INT NULL,
        CreatedByName        NVARCHAR(100) NULL,

        CONSTRAINT FK_CROInq_Profile    FOREIGN KEY (CustomerProfileID)    REFERENCES addata_CustomerInfo(ProfileID),
        CONSTRAINT FK_CROInq_Dept       FOREIGN KEY (AssignedDepartmentID) REFERENCES gen_DepartmentInfo(DepartmentID),
        CONSTRAINT FK_CROInq_Emp        FOREIGN KEY (AssignedEmployeeID)   REFERENCES gen_EmployeeInfo(EmployeeID),
        CONSTRAINT FK_CROInq_LinkedJC   FOREIGN KEY (LinkedJobCardID)      REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_CROInq_LinkedComp FOREIGN KEY (LinkedComplaintID)    REFERENCES dms_CRO_Complaints(ComplaintID)
    );
    CREATE INDEX IX_CROInq_Status ON dms_CRO_Inquiries (Status, OpenedAt DESC);
    PRINT 'dms_CRO_Inquiries created.';
END
ELSE PRINT 'dms_CRO_Inquiries already exists.';
GO

-------------------------------------------------------------------------------
-- 8. dms_CRO_KYCFlags
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_KYCFlags')
BEGIN
    CREATE TABLE dms_CRO_KYCFlags (
        FlagID                  INT IDENTITY(1,1) PRIMARY KEY,
        OriginalCustomerProfileID INT NULL,
        ChasisNo                NVARCHAR(50) NULL,    -- snapshot — flag survives profile changes
        EngineNo                NVARCHAR(50) NULL,    -- snapshot
        FlagType                NVARCHAR(30) NOT NULL,
            -- 'BadNumber'|'NotOwner'|'IncorrectAddress'|'Other'
        Notes                   NVARCHAR(MAX) NOT NULL,

        FlaggedByEmployeeID     INT NULL,
        FlaggedByName           NVARCHAR(100) NULL,
        FlaggedAt               DATETIME NOT NULL DEFAULT GETDATE(),

        ResolvedAt              DATETIME NULL,
        ResolvedByEmployeeID    INT NULL,
        ResolvedByName          NVARCHAR(100) NULL,
        ResolutionNotes         NVARCHAR(MAX) NULL,

        CONSTRAINT FK_CROKYC_Profile  FOREIGN KEY (OriginalCustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID),
        CONSTRAINT FK_CROKYC_Flagger  FOREIGN KEY (FlaggedByEmployeeID)       REFERENCES gen_EmployeeInfo(EmployeeID),
        CONSTRAINT FK_CROKYC_Resolver FOREIGN KEY (ResolvedByEmployeeID)      REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROKYC_OpenByChassis ON dms_CRO_KYCFlags (ChasisNo) WHERE ResolvedAt IS NULL AND ChasisNo IS NOT NULL;
    CREATE INDEX IX_CROKYC_OpenByEngine  ON dms_CRO_KYCFlags (EngineNo) WHERE ResolvedAt IS NULL AND EngineNo IS NOT NULL;
    PRINT 'dms_CRO_KYCFlags created.';
END
ELSE PRINT 'dms_CRO_KYCFlags already exists.';
GO

-------------------------------------------------------------------------------
-- 9. dms_CRO_KYCFlags_Acknowledgments  (per-visit advisor confirmations)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_KYCFlags_Acknowledgments')
BEGIN
    CREATE TABLE dms_CRO_KYCFlags_Acknowledgments (
        AckID                INT IDENTITY(1,1) PRIMARY KEY,
        FlagID               INT NOT NULL,
        JobCardID            INT NULL,            -- the JC being acknowledged on (may be NULL pre-save)
        AdvisorEmployeeID    INT NULL,
        AdvisorName          NVARCHAR(100) NULL,
        AcknowledgedAt       DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_CROKYCAck_Flag    FOREIGN KEY (FlagID)            REFERENCES dms_CRO_KYCFlags(FlagID),
        CONSTRAINT FK_CROKYCAck_JC      FOREIGN KEY (JobCardID)         REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_CROKYCAck_Advisor FOREIGN KEY (AdvisorEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROKYCAck_Flag ON dms_CRO_KYCFlags_Acknowledgments (FlagID, AcknowledgedAt DESC);
    PRINT 'dms_CRO_KYCFlags_Acknowledgments created.';
END
ELSE PRINT 'dms_CRO_KYCFlags_Acknowledgments already exists.';
GO

-------------------------------------------------------------------------------
-- 10. dms_CRO_Campaigns
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Campaigns')
BEGIN
    CREATE TABLE dms_CRO_Campaigns (
        CampaignID         INT IDENTITY(1,1) PRIMARY KEY,
        Name               NVARCHAR(200) NOT NULL,
        Channel            NVARCHAR(20) NOT NULL DEFAULT 'WhatsApp',  -- 'WhatsApp'|'SMS'
        SegmentRulesJSON   NVARCHAR(MAX) NOT NULL,
        MessageTemplate    NVARCHAR(MAX) NULL,
        TemplateSid        NVARCHAR(100) NULL,           -- Twilio approved template SID
        ScheduledAt        DATETIME NULL,
        ExecutedAt         DATETIME NULL,
        Status             NVARCHAR(20) NOT NULL DEFAULT 'Draft',
            -- 'Draft'|'Scheduled'|'Sending'|'Sent'|'Cancelled'
        TotalRecipients    INT NULL,
        SentCount          INT NULL,
        RespondedCount     INT NULL,
        CreatedAt          DATETIME NOT NULL DEFAULT GETDATE(),
        CreatedByEmployeeID INT NULL,
        CreatedByName      NVARCHAR(100) NULL,

        CONSTRAINT FK_CROCamp_Creator FOREIGN KEY (CreatedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROCamp_Status ON dms_CRO_Campaigns (Status, ScheduledAt);
    PRINT 'dms_CRO_Campaigns created.';
END
ELSE PRINT 'dms_CRO_Campaigns already exists.';
GO

-------------------------------------------------------------------------------
-- 11. dms_CRO_CampaignSends  (per-recipient send record)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_CampaignSends')
BEGIN
    CREATE TABLE dms_CRO_CampaignSends (
        SendID              INT IDENTITY(1,1) PRIMARY KEY,
        CampaignID          INT NOT NULL,
        CustomerProfileID   INT NULL,
        ContactPhone        NVARCHAR(50) NOT NULL,
        SentAt              DATETIME NULL,
        DeliveryStatus      NVARCHAR(20) NOT NULL DEFAULT 'Queued',
            -- 'Queued'|'Sent'|'Delivered'|'Read'|'Failed'|'OptedOut'
        TwilioMessageSid    NVARCHAR(100) NULL,
        RespondedAt         DATETIME NULL,
        Response            NVARCHAR(MAX) NULL,
        ErrorCode           NVARCHAR(20) NULL,
        ErrorMessage        NVARCHAR(500) NULL,

        CONSTRAINT FK_CROCampSend_Campaign FOREIGN KEY (CampaignID)        REFERENCES dms_CRO_Campaigns(CampaignID),
        CONSTRAINT FK_CROCampSend_Profile  FOREIGN KEY (CustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID)
    );
    CREATE INDEX IX_CROCampSend_Campaign ON dms_CRO_CampaignSends (CampaignID, DeliveryStatus);
    PRINT 'dms_CRO_CampaignSends created.';
END
ELSE PRINT 'dms_CRO_CampaignSends already exists.';
GO

-------------------------------------------------------------------------------
-- 12. dms_CRO_ServiceReminders  (FFS / SFS / regular-service queue)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_ServiceReminders')
BEGIN
    CREATE TABLE dms_CRO_ServiceReminders (
        ReminderID         INT IDENTITY(1,1) PRIMARY KEY,
        CustomerProfileID  INT NOT NULL,
        JobCardID          INT NOT NULL,                 -- the trigger event
        ChasisNo           NVARCHAR(50) NULL,
        VehicleRegNo       NVARCHAR(50) NULL,
        ReminderType       NVARCHAR(20) NOT NULL,
            -- 'FFS'|'SFS'|'NextService'|'WarrantyExpiry'
        DueDate            DATE NOT NULL,
        DueMileage         INT NULL,
        DueByKmDate        DATE NULL,                    -- analytic: km-projected date
        DueByTimeDate      DATE NULL,                    -- analytic: month-threshold date
        Status             NVARCHAR(20) NOT NULL DEFAULT 'Pending',
            -- 'Pending'|'Sent'|'Acknowledged'|'Booked'|'Stale'|'Cancelled'
        SentAt             DATETIME NULL,
        AcknowledgedAt     DATETIME NULL,
        BookedJobCardID    INT NULL,
        CreatedAt          DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_CROReminder_Profile FOREIGN KEY (CustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID),
        CONSTRAINT FK_CROReminder_JC      FOREIGN KEY (JobCardID)         REFERENCES Addata_JobCardInfo(JobCardId),
        CONSTRAINT FK_CROReminder_Booked  FOREIGN KEY (BookedJobCardID)   REFERENCES Addata_JobCardInfo(JobCardId)
    );
    CREATE INDEX IX_CROReminder_Status_Due ON dms_CRO_ServiceReminders (Status, DueDate);
    CREATE INDEX IX_CROReminder_Profile    ON dms_CRO_ServiceReminders (CustomerProfileID, Status);
    PRINT 'dms_CRO_ServiceReminders created.';
END
ELSE PRINT 'dms_CRO_ServiceReminders already exists.';
GO

-------------------------------------------------------------------------------
-- 13. dms_CRO_Notifications  (in-app bell)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_Notifications')
BEGIN
    CREATE TABLE dms_CRO_Notifications (
        NotificationID         INT IDENTITY(1,1) PRIMARY KEY,
        RecipientEmployeeID    INT NOT NULL,
        Channel                NVARCHAR(20) NOT NULL DEFAULT 'InApp',
            -- 'InApp'|'WhatsApp'|'Email'
        Subject                NVARCHAR(200) NOT NULL,
        Body                   NVARCHAR(MAX) NULL,
        LinkURL                NVARCHAR(500) NULL,
        SourceType             NVARCHAR(30) NULL,
            -- 'Complaint'|'Escalation'|'Survey'|'Inquiry'|'KYCFlag'|'ServiceReminder'|'Campaign'
        SourceID               INT NULL,
        SentAt                 DATETIME NOT NULL DEFAULT GETDATE(),
        ReadAt                 DATETIME NULL,

        CONSTRAINT FK_CRONotif_Recipient FOREIGN KEY (RecipientEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CRONotif_Recipient_Unread ON dms_CRO_Notifications (RecipientEmployeeID, SentAt DESC)
        WHERE ReadAt IS NULL;
    PRINT 'dms_CRO_Notifications created.';
END
ELSE PRINT 'dms_CRO_Notifications already exists.';
GO

-------------------------------------------------------------------------------
-- 14. dms_CRO_WhatsAppMessages  (Twilio inbound/outbound audit)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_WhatsAppMessages')
BEGIN
    CREATE TABLE dms_CRO_WhatsAppMessages (
        MessageID            INT IDENTITY(1,1) PRIMARY KEY,
        TwilioMessageSid     NVARCHAR(100) NOT NULL UNIQUE,
        Direction            NVARCHAR(10) NOT NULL,
            -- 'Outbound'|'Inbound'
        Status               NVARCHAR(20) NOT NULL DEFAULT 'Queued',
            -- 'Queued'|'Sent'|'Delivered'|'Read'|'Failed'|'Received'
        FromNumber           NVARCHAR(50) NOT NULL,
        ToNumber             NVARCHAR(50) NOT NULL,
        Body                 NVARCHAR(MAX) NULL,
        MediaUrls            NVARCHAR(MAX) NULL,        -- JSON array
        TemplateName         NVARCHAR(100) NULL,
        SourceType           NVARCHAR(30) NULL,
            -- 'Complaint'|'Survey'|'ServiceReminder'|'Campaign'|'InboundUnsolicited'
        SourceID             INT NULL,
        CustomerProfileID    INT NULL,
        SentAt               DATETIME NULL,
        DeliveredAt          DATETIME NULL,
        ReadAt               DATETIME NULL,
        ErrorCode            NVARCHAR(20) NULL,
        ErrorMessage         NVARCHAR(500) NULL,
        CreatedAt            DATETIME NOT NULL DEFAULT GETDATE(),

        CONSTRAINT FK_CROWhatsApp_Profile FOREIGN KEY (CustomerProfileID) REFERENCES addata_CustomerInfo(ProfileID)
    );
    CREATE INDEX IX_CROWhatsApp_Source ON dms_CRO_WhatsAppMessages (SourceType, SourceID);
    CREATE INDEX IX_CROWhatsApp_From   ON dms_CRO_WhatsAppMessages (FromNumber);
    CREATE INDEX IX_CROWhatsApp_To     ON dms_CRO_WhatsAppMessages (ToNumber);
    PRINT 'dms_CRO_WhatsAppMessages created.';
END
ELSE PRINT 'dms_CRO_WhatsAppMessages already exists.';
GO

-------------------------------------------------------------------------------
-- 15. dms_CRO_SystemRoles  (admin-repointable role → employee map)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_SystemRoles')
BEGIN
    CREATE TABLE dms_CRO_SystemRoles (
        RoleKey         NVARCHAR(50) PRIMARY KEY,
            -- 'CRO_MANAGER'|'EXECUTIVE'
        EmployeeID      INT NULL,
        UpdatedAt       DATETIME NULL,
        UpdatedByEmployeeID INT NULL,
        UpdatedByName   NVARCHAR(100) NULL,

        CONSTRAINT FK_CROSysRole_Employee FOREIGN KEY (EmployeeID)         REFERENCES gen_EmployeeInfo(EmployeeID),
        CONSTRAINT FK_CROSysRole_Updater  FOREIGN KEY (UpdatedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    PRINT 'dms_CRO_SystemRoles created.';
END
ELSE PRINT 'dms_CRO_SystemRoles already exists.';
GO

-------------------------------------------------------------------------------
-- 16. dms_CRO_AdminAudit  (config changes — escalation rules, templates, opt-outs)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.tables WHERE name = 'dms_CRO_AdminAudit')
BEGIN
    CREATE TABLE dms_CRO_AdminAudit (
        AuditID                 INT IDENTITY(1,1) PRIMARY KEY,
        EntityType              NVARCHAR(50) NOT NULL,
            -- 'EscalationRule'|'SurveyTemplate'|'SystemRole'|'Campaign'|'CustomerOptOut'
        EntityID                INT NULL,
        Action                  NVARCHAR(20) NOT NULL,
            -- 'Created'|'Updated'|'Deleted'|'Activated'|'Deactivated'
        BeforeJSON              NVARCHAR(MAX) NULL,
        AfterJSON               NVARCHAR(MAX) NULL,
        ChangedByEmployeeID     INT NULL,
        ChangedByName           NVARCHAR(100) NULL,
        ChangedAt               DATETIME NOT NULL DEFAULT GETDATE(),
        Reason                  NVARCHAR(500) NULL,

        CONSTRAINT FK_CROAdminAud_Changer FOREIGN KEY (ChangedByEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID)
    );
    CREATE INDEX IX_CROAdminAud_Entity ON dms_CRO_AdminAudit (EntityType, EntityID, ChangedAt DESC);
    PRINT 'dms_CRO_AdminAudit created.';
END
ELSE PRINT 'dms_CRO_AdminAudit already exists.';
GO

PRINT '=== Phase 1 CRO scaffolding migration complete ===';
GO
