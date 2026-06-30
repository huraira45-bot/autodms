-- 040_cheques_issued_uncleared.sql
-- Create a dedicated "Cheques Issued — Uncleared" current-liability leaf and map
-- it to a new system role. Used by Make Payment (Cheque mode) so issued-cheque
-- balances don't muddy the CHEQUES_ON_HAND (received asset) account.

DECLARE @ParentCAID INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201001' AND Status=1);
DECLARE @ExistingCAID INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201001017');

IF @ParentCAID IS NULL BEGIN
    RAISERROR('Parent 201001 (Trade Payables) not found — abort.', 16, 1);
    RETURN;
END

IF @ExistingCAID IS NULL
BEGIN
    INSERT INTO GLChartOFAccount
        (GLCode, GLTitle, GLType, isParent, GLNature, Status, GLLevel, ReadOnly, Companyid,
         AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour)
    SELECT '201001017', 'Cheques Issued — Uncleared',
           GLType, 0, GLNature, 1, 4, 0, Companyid,
           AccountLevelOne, AccountLevelTwo, AccountlevelThree,
           CAST('201001017' AS NVARCHAR(50))
    FROM GLChartOFAccount WHERE GLCAID=@ParentCAID;

    SET @ExistingCAID = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201001017');
    PRINT 'Created COA leaf 201001017 (Cheques Issued — Uncleared).';
END
ELSE
BEGIN
    PRINT 'COA leaf 201001017 already exists; reusing GLCAID.';
END

-- Extend the RoleKey whitelist to include the new role.
IF EXISTS (SELECT 1 FROM sys.check_constraints WHERE name='CK_SystemAccounts_RoleKey')
    ALTER TABLE dms_SystemAccounts DROP CONSTRAINT CK_SystemAccounts_RoleKey;
GO

ALTER TABLE dms_SystemAccounts ADD CONSTRAINT CK_SystemAccounts_RoleKey CHECK (
    RoleKey IN (
        'CASH_BOOK','GENERAL_CUSTOMER','GST_PAYABLE','INPUT_GST','PST_PAYABLE',
        'POS_CLEARING','DEFAULT_DISCOUNT_GIVEN','ROUNDING_ADJUSTMENT',
        'PURCHASE_RETURN_VARIANCE','CUSTOMER_ADVANCE_RECEIVED','SUPPLIER_ADVANCE_PAID',
        'CHEQUES_ON_HAND','CHEQUES_ISSUED_UNCLEARED',
        'VEHICLE_INVENTORY','BOOKING_RECEIVABLE','BOOKING_ADVANCE',
        'MASTER_VEHICLE_PAYABLE','MASTER_INCENTIVE_RECEIVABLE','STAFF_INCENTIVE_PAYABLE',
        'VEHICLE_SALES_REVENUE','PREMIUM_INCOME','MASTER_INCENTIVE_INCOME',
        'COGS_VEHICLES','STAFF_INCENTIVE_EXPENSE','SALES_DISCOUNT_GIVEN',
        'INVENTORY_PARTS','PARTS_REVENUE','SERVICE_REVENUE','SUBLET_REVENUE',
        'COGS_PARTS','SUBLET_COST','TRADE_DEBTORS','TRADE_CREDITORS'
    )
);
GO

-- System role mapping
DECLARE @LeafCAID INT = (SELECT GLCAID FROM GLChartOFAccount WHERE GLCode='201001017');
IF NOT EXISTS (SELECT 1 FROM dms_SystemAccounts WHERE RoleKey='CHEQUES_ISSUED_UNCLEARED')
    INSERT INTO dms_SystemAccounts (RoleKey, GLCAID, AssignedByName, AssignedAt)
    VALUES ('CHEQUES_ISSUED_UNCLEARED', @LeafCAID, 'migration-040', GETDATE());
ELSE
    UPDATE dms_SystemAccounts SET GLCAID = @LeafCAID WHERE RoleKey='CHEQUES_ISSUED_UNCLEARED';

PRINT '040_cheques_issued_uncleared applied.';
