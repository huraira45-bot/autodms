SET QUOTED_IDENTIFIER ON;
GO

-- Phase 1 supporting changes:
--   - addata_CustomerInfo.DoNotContact bit  (campaign opt-out)
--   - rename "Suzuki Customer Relations" → "Customer Relations"
--   - seed dms_CRO_EscalationRules (decision #4 + #9)
--   - seed dms_CRO_SurveyTemplates with v1 PostJobCard + PostComplaint
--   - seed dms_CRO_SystemRoles slots (CRO_MANAGER, EXECUTIVE)

-------------------------------------------------------------------------------
-- DoNotContact opt-out flag on customer master
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('addata_CustomerInfo') AND name = 'DoNotContact')
BEGIN
    ALTER TABLE addata_CustomerInfo ADD DoNotContact BIT NOT NULL CONSTRAINT DF_CustomerDoNotContact DEFAULT 0;
    PRINT 'addata_CustomerInfo.DoNotContact added.';
END
ELSE PRINT 'addata_CustomerInfo.DoNotContact already exists.';
GO

-------------------------------------------------------------------------------
-- Rename legacy CRO dept row (best-effort — only if the legacy name is present)
-------------------------------------------------------------------------------
UPDATE gen_DepartmentInfo
SET DepartmentName = 'Customer Relations'
WHERE DepartmentName = 'Suzuki Customer Relations';
PRINT 'Suzuki Customer Relations renamed: ' + CAST(@@ROWCOUNT AS NVARCHAR) + ' row(s).';
GO

-------------------------------------------------------------------------------
-- Seed dms_CRO_EscalationRules — 3-tier chain per decisions #4 + #9
-- L0 already at filing (no rule needed). L1 at 72h, L2 at 96h.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dms_CRO_EscalationRules)
BEGIN
    -- Normal severity (default for all severities other than Critical/Low)
    INSERT INTO dms_CRO_EscalationRules (AppliesToDepartmentID, Severity, Level, HoursElapsed, EscalateToType, NotificationChannels, IsActive)
    VALUES
        (NULL, NULL,       1, 72,  'CROManager', 'InApp,Email', 1),
        (NULL, NULL,       2, 96,  'Executive',  'InApp,Email', 1),
        -- Critical: halved
        (NULL, 'Critical', 1, 36,  'CROManager', 'InApp,Email', 1),
        (NULL, 'Critical', 2, 48,  'Executive',  'InApp,Email', 1),
        -- Low: doubled
        (NULL, 'Low',      1, 144, 'CROManager', 'InApp,Email', 1),
        (NULL, 'Low',      2, 192, 'Executive',  'InApp,Email', 1);
    PRINT 'Escalation rules seeded (6 rules).';
END
ELSE PRINT 'Escalation rules already seeded.';
GO

-------------------------------------------------------------------------------
-- Seed dms_CRO_SurveyTemplates — v1 PostJobCard + PostComplaint
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dms_CRO_SurveyTemplates WHERE SurveyType = 'PostJobCard')
BEGIN
    INSERT INTO dms_CRO_SurveyTemplates (SurveyType, Version, QuestionsJSON, IsActive, CreatedByName)
    VALUES (
        'PostJobCard', 1,
        N'[
          {"id":"q1","type":"rating","scale":5,"text":"How would you rate the overall service quality?"},
          {"id":"q2","type":"rating","scale":5,"text":"How would you rate the service advisor?"},
          {"id":"q3","type":"yesno","text":"Was your vehicle delivered on time?"},
          {"id":"q4","type":"yesno","text":"Would you recommend us to a friend?"},
          {"id":"q5","type":"text","text":"Anything else you would like to share?"}
        ]',
        1, 'system-seed'
    );
    PRINT 'PostJobCard survey template seeded.';
END
ELSE PRINT 'PostJobCard survey template already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM dms_CRO_SurveyTemplates WHERE SurveyType = 'PostComplaint')
BEGIN
    INSERT INTO dms_CRO_SurveyTemplates (SurveyType, Version, QuestionsJSON, IsActive, CreatedByName)
    VALUES (
        'PostComplaint', 1,
        N'[
          {"id":"q1","type":"rating","scale":5,"text":"How satisfied are you with the resolution?"},
          {"id":"q2","type":"yesno","text":"Was the issue fully resolved?"},
          {"id":"q3","type":"text","text":"How could we have handled this better?"}
        ]',
        1, 'system-seed'
    );
    PRINT 'PostComplaint survey template seeded.';
END
ELSE PRINT 'PostComplaint survey template already exists.';
GO

-------------------------------------------------------------------------------
-- Seed dms_CRO_SystemRoles  (admin re-points via UI later)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM dms_CRO_SystemRoles WHERE RoleKey = 'CRO_MANAGER')
    INSERT INTO dms_CRO_SystemRoles (RoleKey, EmployeeID, UpdatedByName) VALUES ('CRO_MANAGER', NULL, 'system-seed');

IF NOT EXISTS (SELECT 1 FROM dms_CRO_SystemRoles WHERE RoleKey = 'EXECUTIVE')
    INSERT INTO dms_CRO_SystemRoles (RoleKey, EmployeeID, UpdatedByName) VALUES ('EXECUTIVE', NULL, 'system-seed');
PRINT 'System roles seeded (CRO_MANAGER, EXECUTIVE — both NULL pending assignment).';
GO

PRINT '=== Phase 1 supporting changes complete ===';
GO
