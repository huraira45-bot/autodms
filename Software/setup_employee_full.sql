USE temp_db1;
GO

-- 1. Create the View for Active Employees
CREATE OR ALTER VIEW vw_ActiveEmployees AS
SELECT 
    EmployeeID,
    EmployeeNo,
    EmployeeName,
    FatherName,
    CNICno,
    MobileNo,
    EmployeeGender,
    PermanentAddress,
    DOB,
    EmailAddress,
    JoiningDate,
    DepartmentID,
    DesignationID,
    MachineId,
    BasicSalary,
    EmployeeGLID
FROM gen_EmployeeInfo
WHERE ResignDate IS NULL;
GO

-- 2. Create the Stored Procedure for Inserting an Employee
CREATE OR ALTER PROCEDURE sp_InsertEmployee
    @EmployeeName VARCHAR(100),
    @EmployeeNo VARCHAR(50) = NULL,
    @FatherName VARCHAR(100) = NULL,
    @CNICno VARCHAR(50) = NULL,
    @MobileNo VARCHAR(50) = NULL,
    @EmployeeGender VARCHAR(20) = NULL,
    @PermanentAddress VARCHAR(MAX) = NULL,
    @DOB DATE = NULL,
    @EmailAddress NVARCHAR(100) = NULL,
    @DepartmentID INT = NULL,
    @DesignationID INT = NULL,
    @MachineId INT = NULL,
    @BasicSalary DECIMAL(18,2) = NULL,
    @EmployeeGLID INT = NULL,
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Check for duplicate CNIC (more reliable than phone)
        IF @CNICno IS NOT NULL AND EXISTS (SELECT 1 FROM gen_EmployeeInfo WHERE CNICno = @CNICno)
        BEGIN
            THROW 50001, 'An employee with this NIC Number already exists.', 1;
        END
        
        -- Insert the Employee
        INSERT INTO gen_EmployeeInfo (
            EmployeeName, EmployeeNo, FatherName, CNICno, MobileNo, 
            EmployeeGender, PermanentAddress, DOB, EmailAddress,
            DepartmentID, DesignationID, MachineId, BasicSalary, EmployeeGLID,
            EntryUserID, EntryUserDateTime
        )
        VALUES (
            @EmployeeName, @EmployeeNo, @FatherName, @CNICno, @MobileNo, 
            @EmployeeGender, @PermanentAddress, @DOB, @EmailAddress,
            @DepartmentID, @DesignationID, @MachineId, @BasicSalary, @EmployeeGLID,
            @ActionUserID, GETDATE()
        );
        
        -- Return the newly created EmployeeID
        SELECT SCOPE_IDENTITY() AS NewEmployeeID;
        
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
