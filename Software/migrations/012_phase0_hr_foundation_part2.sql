SET QUOTED_IDENTIFIER ON;
GO

-- Part 2 of migration 012 — finish IsActive and view recreation.
-- (Split into separate batches because SQL Server parses the whole batch
--  before execution, so an UPDATE referencing a just-added column fails.)

-------------------------------------------------------------------------------
-- 3a. Add IsActive column
-------------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id = OBJECT_ID('gen_EmployeeInfo') AND name = 'IsActive')
BEGIN
    ALTER TABLE gen_EmployeeInfo ADD IsActive BIT NOT NULL CONSTRAINT DF_Employee_IsActive DEFAULT 1;
    PRINT 'gen_EmployeeInfo.IsActive added.';
END
ELSE PRINT 'gen_EmployeeInfo.IsActive already exists.';
GO

-------------------------------------------------------------------------------
-- 3b. Backfill IsActive=0 for resigned employees (separate batch — column now exists)
-------------------------------------------------------------------------------
UPDATE gen_EmployeeInfo SET IsActive = 0 WHERE ResignDate IS NOT NULL;
PRINT 'IsActive backfilled — resigned employees marked inactive: ' + CAST(@@ROWCOUNT AS NVARCHAR);
GO

-------------------------------------------------------------------------------
-- 7. Recreate vw_ActiveEmployees (now that IsActive exists)
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
PRINT 'vw_ActiveEmployees recreated.';
GO

PRINT '=== Phase 0 part 2 complete ===';
GO
