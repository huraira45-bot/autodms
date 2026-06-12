SET QUOTED_IDENTIFIER ON;
GO

IF OBJECT_ID('vw_ActiveDepartments', 'V') IS NOT NULL DROP VIEW vw_ActiveDepartments;
GO

CREATE VIEW vw_ActiveDepartments AS
SELECT
    d.DepartmentID, d.CompanyID, d.DepartmentName,
    d.ManagerEmployeeID,
    e.EmployeeName AS ManagerEmployeeName
FROM gen_DepartmentInfo d
LEFT JOIN gen_EmployeeInfo e ON d.ManagerEmployeeID = e.EmployeeID;
GO
PRINT 'vw_ActiveDepartments recreated with manager join.';
GO
