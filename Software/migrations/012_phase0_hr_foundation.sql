SET QUOTED_IDENTIFIER ON;
GO

/*
 * Migration 012 — Phase 0: HR foundation
 *
 * Prerequisites for the CRO module + cross-module benefits:
 *   - User ↔ Employee linkage (auth attribution)
 *   - Employee reporting hierarchy (escalation chains)
 *   - Employee active flag (skip inactive in pickers / escalation)
 *   - Department manager (org-chart, future payroll, HR reports)
 *   - Job Card service-advisor FK (resolve advisor name → EmployeeID)
 *   - JC business-type manager (CRO L0 routing — CT/BP vs GR/WR)
 *
 * Source contract: .claude/planning/cro-module-design.md §4
 *
 * All adds are NULLable so existing rows keep working. Subsequent migrations
 * (or the new admin UIs) will populate the new columns.
 */

-------------------------------------------------------------------------------
-- 1. GLUser.LinkedEmployeeID  →  gen_EmployeeInfo.EmployeeID  (§4.1)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('GLUser') AND name = 'LinkedEmployeeID')
BEGIN
    ALTER TABLE GLUser ADD LinkedEmployeeID INT NULL;
    PRINT 'GLUser.LinkedEmployeeID added.';
END
ELSE PRINT 'GLUser.LinkedEmployeeID already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_GLUser_LinkedEmployee')
BEGIN
    ALTER TABLE GLUser
        ADD CONSTRAINT FK_GLUser_LinkedEmployee
        FOREIGN KEY (LinkedEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID);
    PRINT 'FK_GLUser_LinkedEmployee added.';
END
ELSE PRINT 'FK_GLUser_LinkedEmployee already exists.';
GO

-------------------------------------------------------------------------------
-- 2. gen_EmployeeInfo.ReportsToID  (self-FK)  (§4.2)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('gen_EmployeeInfo') AND name = 'ReportsToID')
BEGIN
    ALTER TABLE gen_EmployeeInfo ADD ReportsToID INT NULL;
    PRINT 'gen_EmployeeInfo.ReportsToID added.';
END
ELSE PRINT 'gen_EmployeeInfo.ReportsToID already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Employee_ReportsTo')
BEGIN
    ALTER TABLE gen_EmployeeInfo
        ADD CONSTRAINT FK_Employee_ReportsTo
        FOREIGN KEY (ReportsToID) REFERENCES gen_EmployeeInfo(EmployeeID);
    PRINT 'FK_Employee_ReportsTo added.';
END
ELSE PRINT 'FK_Employee_ReportsTo already exists.';
GO

-------------------------------------------------------------------------------
-- 3. gen_EmployeeInfo.IsActive BIT  (§4.4)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('gen_EmployeeInfo') AND name = 'IsActive')
BEGIN
    ALTER TABLE gen_EmployeeInfo ADD IsActive BIT NOT NULL CONSTRAINT DF_Employee_IsActive DEFAULT 1;
    PRINT 'gen_EmployeeInfo.IsActive added.';

    -- Backfill: mark resigned employees as inactive
    UPDATE gen_EmployeeInfo SET IsActive = 0 WHERE ResignDate IS NOT NULL;
    PRINT 'IsActive backfilled — resigned employees marked inactive: ' + CAST(@@ROWCOUNT AS NVARCHAR);
END
ELSE PRINT 'gen_EmployeeInfo.IsActive already exists.';
GO

-------------------------------------------------------------------------------
-- 4. gen_DepartmentInfo.ManagerEmployeeID  (§4.3)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('gen_DepartmentInfo') AND name = 'ManagerEmployeeID')
BEGIN
    ALTER TABLE gen_DepartmentInfo ADD ManagerEmployeeID INT NULL;
    PRINT 'gen_DepartmentInfo.ManagerEmployeeID added.';
END
ELSE PRINT 'gen_DepartmentInfo.ManagerEmployeeID already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_Department_Manager')
BEGIN
    ALTER TABLE gen_DepartmentInfo
        ADD CONSTRAINT FK_Department_Manager
        FOREIGN KEY (ManagerEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID);
    PRINT 'FK_Department_Manager added.';
END
ELSE PRINT 'FK_Department_Manager already exists.';
GO

-------------------------------------------------------------------------------
-- 5. Addata_JobCardInfo.ServiceAdvisorID  (§4.7)
--    Additive: keep existing ServiceAdvisor name string for backward compat.
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('Addata_JobCardInfo') AND name = 'ServiceAdvisorID')
BEGIN
    ALTER TABLE Addata_JobCardInfo ADD ServiceAdvisorID INT NULL;
    PRINT 'Addata_JobCardInfo.ServiceAdvisorID added.';
END
ELSE PRINT 'Addata_JobCardInfo.ServiceAdvisorID already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_JobCard_ServiceAdvisor')
BEGIN
    ALTER TABLE Addata_JobCardInfo
        ADD CONSTRAINT FK_JobCard_ServiceAdvisor
        FOREIGN KEY (ServiceAdvisorID) REFERENCES gen_EmployeeInfo(EmployeeID);
    PRINT 'FK_JobCard_ServiceAdvisor added.';
END
ELSE PRINT 'FK_JobCard_ServiceAdvisor already exists.';
GO

-- Best-effort backfill: name-match existing rows where possible. Misses stay NULL.
UPDATE j
SET j.ServiceAdvisorID = e.EmployeeID
FROM Addata_JobCardInfo j
INNER JOIN gen_EmployeeInfo e
    ON UPPER(RTRIM(LTRIM(j.ServiceAdvisor))) = UPPER(RTRIM(LTRIM(e.EmployeeName)))
WHERE j.ServiceAdvisorID IS NULL AND j.ServiceAdvisor IS NOT NULL AND LEN(j.ServiceAdvisor) > 0;
PRINT 'ServiceAdvisorID backfilled by name-match — rows: ' + CAST(@@ROWCOUNT AS NVARCHAR);
GO

-------------------------------------------------------------------------------
-- 6. gen_JobCardType.ManagerEmployeeID  (§4.8 — CRO L0 routing)
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('gen_JobCardType') AND name = 'ManagerEmployeeID')
BEGIN
    ALTER TABLE gen_JobCardType ADD ManagerEmployeeID INT NULL;
    PRINT 'gen_JobCardType.ManagerEmployeeID added.';
END
ELSE PRINT 'gen_JobCardType.ManagerEmployeeID already exists.';
GO

IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_JobCardType_Manager')
BEGIN
    ALTER TABLE gen_JobCardType
        ADD CONSTRAINT FK_JobCardType_Manager
        FOREIGN KEY (ManagerEmployeeID) REFERENCES gen_EmployeeInfo(EmployeeID);
    PRINT 'FK_JobCardType_Manager added.';
END
ELSE PRINT 'FK_JobCardType_Manager already exists.';
GO

-------------------------------------------------------------------------------
-- 7. Recreate vw_ActiveEmployees to filter on IsActive  (§4.4)
-------------------------------------------------------------------------------
IF OBJECT_ID('vw_ActiveEmployees', 'V') IS NOT NULL
    DROP VIEW vw_ActiveEmployees;
GO

CREATE VIEW vw_ActiveEmployees AS
SELECT
    EmployeeID, EmployeeNo, EmployeeName, FatherName, CNICno, MobileNo,
    EmployeeGender, PermanentAddress, DOB, EmailAddress, JoiningDate,
    DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
    IsTechnician,
    ReportsToID,
    IsActive
FROM gen_EmployeeInfo
WHERE IsActive = 1;
GO
PRINT 'vw_ActiveEmployees recreated (filters on IsActive=1, exposes ReportsToID).';
GO

PRINT '=== Phase 0 HR foundation migration complete ===';
GO
