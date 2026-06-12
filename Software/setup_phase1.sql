USE temp_db1;
GO

-- ==========================================
-- 1. gen_BranchInfo (Branches)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveBranches AS
SELECT 
    BranchID,
    CompanyID,
    BranchName,
    BranchCode,
    BranchNumber,
    BranchEmail,
    BranchAddress
FROM gen_BranchInfo;
GO

CREATE OR ALTER PROCEDURE sp_InsertBranch
    @CompanyID INT = NULL,
    @BranchName VARCHAR(100),
    @BranchCode VARCHAR(50),
    @BranchNumber VARCHAR(50),
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        INSERT INTO gen_BranchInfo (CompanyID, BranchName, BranchCode, BranchNumber, EntryUserID, EntryUserDateTime)
        VALUES (@CompanyID, @BranchName, @BranchCode, @BranchNumber, @ActionUserID, GETDATE());
        
        SELECT SCOPE_IDENTITY() AS NewBranchID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO

-- ==========================================
-- 2. gen_PartiesInfo (Customers / Vendors)
-- ==========================================
CREATE OR ALTER VIEW vw_ActiveParties AS
SELECT 
    PartyID,
    PartyName,
    PhoneOne,
    Email,
    AddressOne,
    CNIC,
    ContactPerson
FROM gen_PartiesInfo;
GO

CREATE OR ALTER PROCEDURE sp_InsertParty
    @PartyName VARCHAR(100),
    @PhoneOne VARCHAR(50),
    @Email NVARCHAR(100),
    @CNIC VARCHAR(50),
    @ActionUserID INT
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM gen_PartiesInfo WHERE PhoneOne = @PhoneOne AND PhoneOne IS NOT NULL)
        BEGIN
            THROW 50002, 'A Party with this Phone Number already exists.', 1;
        END

        INSERT INTO gen_PartiesInfo (PartyName, PhoneOne, Email, CNIC, EntryUserID, EntryUserDateTime)
        VALUES (@PartyName, @PhoneOne, @Email, @CNIC, @ActionUserID, GETDATE());
        
        SELECT SCOPE_IDENTITY() AS NewPartyID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
