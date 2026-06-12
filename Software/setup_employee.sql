USE temp_db1;
GO

-- 1. Create the View for Active Employees
CREATE OR ALTER VIEW vw_ActiveEmployees AS
SELECT 
    EmployeeID,
    EmployeeName,
    PhoneNo,
    EmailAddress,
    JoiningDate,
    DepartmentID,
    DesignationID
FROM gen_EmployeeInfo
WHERE ResignDate IS NULL;
GO

-- 2. Create the Stored Procedure for Inserting an Employee
CREATE OR ALTER PROCEDURE sp_InsertEmployee
    @EmployeeName VARCHAR(100),
    @PhoneNo VARCHAR(50),
    @DepartmentID INT = NULL,
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    
    BEGIN TRY
        -- Check for duplicate PhoneNo to prevent bad data
        IF EXISTS (SELECT 1 FROM gen_EmployeeInfo WHERE PhoneNo = @PhoneNo)
        BEGIN
            THROW 50001, 'An employee with this Phone Number already exists.', 1;
        END
        
        -- Insert the Employee
        INSERT INTO gen_EmployeeInfo (
            EmployeeName, 
            PhoneNo, 
            DepartmentID,
            EntryUserID, 
            EntryUserDateTime
        )
        VALUES (
            @EmployeeName, 
            @PhoneNo, 
            @DepartmentID,
            @ActionUserID, 
            GETDATE()
        );
        
        -- Return the newly created EmployeeID so Node.js can confirm success
        SELECT SCOPE_IDENTITY() AS NewEmployeeID;
        
    END TRY
    BEGIN CATCH
        -- Cleanly throw the error back to Node.js
        THROW;
    END CATCH
END;
GO
