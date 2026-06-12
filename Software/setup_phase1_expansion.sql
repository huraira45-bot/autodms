USE temp_db1;
GO

-- ==========================================
-- 1. Update Party Procedure to accept PartyGLID manually
-- ==========================================
CREATE OR ALTER PROCEDURE sp_InsertParty
    @PartyName VARCHAR(100),
    @PhoneOne VARCHAR(50),
    @Email NVARCHAR(100),
    @CNIC VARCHAR(50),
    @PartyGLID INT = NULL -- Manually pass the existing Ledger Account ID
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM gen_PartiesInfo WHERE PhoneOne = @PhoneOne AND PhoneOne IS NOT NULL)
        BEGIN
            THROW 50002, 'A Party with this Phone Number already exists.', 1;
        END

        INSERT INTO gen_PartiesInfo (PartyName, PhoneOne, Email, CNIC, PartyGLID)
        VALUES (@PartyName, @PhoneOne, @Email, @CNIC, @PartyGLID);
        
        SELECT SCOPE_IDENTITY() AS NewPartyID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- ==========================================
-- 2. gen_DepartmentInfo (Departments)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveDepartments AS
SELECT 
    DepartmentID,
    CompanyID,
    DepartmentName
FROM gen_DepartmentInfo;
GO

CREATE OR ALTER PROCEDURE sp_InsertDepartment
    @CompanyID INT = NULL,
    @DepartmentName VARCHAR(100),
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO gen_DepartmentInfo (CompanyID, DepartmentName, EntryUserID, EntryUserDateTime)
        VALUES (@CompanyID, @DepartmentName, @ActionUserID, GETDATE());
        
        SELECT SCOPE_IDENTITY() AS NewDepartmentID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- ==========================================
-- 3. gen_DesignationInfo (Job Titles / Roles)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveDesignations AS
SELECT 
    DesignationID,
    CompanyID,
    DesignationName
FROM gen_DesignationInfo;
GO

CREATE OR ALTER PROCEDURE sp_InsertDesignation
    @CompanyID INT = NULL,
    @DesignationName VARCHAR(100),
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO gen_DesignationInfo (CompanyID, DesignationName, EntryUserID, EntryUserDateTime)
        VALUES (@CompanyID, @DesignationName, @ActionUserID, GETDATE());
        
        SELECT SCOPE_IDENTITY() AS NewDesignationID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
