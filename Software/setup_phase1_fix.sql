USE temp_db1;
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
    @CNIC VARCHAR(50)
AS
BEGIN
    SET NOCOUNT ON;
    BEGIN TRY
        IF EXISTS (SELECT 1 FROM gen_PartiesInfo WHERE PhoneOne = @PhoneOne AND PhoneOne IS NOT NULL)
        BEGIN
            THROW 50002, 'A Party with this Phone Number already exists.', 1;
        END

        INSERT INTO gen_PartiesInfo (PartyName, PhoneOne, Email, CNIC)
        VALUES (@PartyName, @PhoneOne, @Email, @CNIC);
        
        SELECT SCOPE_IDENTITY() AS NewPartyID;
    END TRY
    BEGIN CATCH
        THROW;
    END CATCH
END;
GO
