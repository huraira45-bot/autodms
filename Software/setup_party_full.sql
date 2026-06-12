USE temp_db1;
GO

-- 1. Update View to include new fields
CREATE OR ALTER VIEW vw_ActiveParties AS
SELECT 
    PartyID,
    PartyName,
    PhoneOne,
    Email,
    AddressOne,
    CNIC,
    NTNNO,
    ContactPerson,
    PartyGLID
FROM gen_PartiesInfo;
GO

-- 2. Update Procedure to include full details
CREATE OR ALTER PROCEDURE sp_InsertParty
    @PartyName VARCHAR(100),
    @PhoneOne VARCHAR(50),
    @Email NVARCHAR(100),
    @CNIC VARCHAR(50),
    @PartyGLID INT = NULL,
    @AddressOne VARCHAR(MAX) = NULL,
    @NTNNO VARCHAR(50) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM gen_PartiesInfo WHERE PhoneOne = @PhoneOne AND PhoneOne IS NOT NULL)
        BEGIN
            THROW 50002, 'A Party with this Phone Number already exists.', 1;
        END

        INSERT INTO gen_PartiesInfo (PartyName, PhoneOne, Email, CNIC, PartyGLID, AddressOne, NTNNO)
        VALUES (@PartyName, @PhoneOne, @Email, @CNIC, @PartyGLID, @AddressOne, @NTNNO);
        
        SELECT SCOPE_IDENTITY() AS NewPartyID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
