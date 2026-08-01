-- 109_voucher_department_tagging.sql
-- Owner ask 2026-08-01: tag CPV/BPV/JV vouchers with which HR department the
-- expense belongs to, purely for reporting -- no GL/financial impact. The
-- department list is the existing HR module master (gen_DepartmentInfo),
-- not a new list. Nullable, no CHECK on voucher type: any voucher CAN carry
-- a department, but the frontend only surfaces the picker on CPV/BPV/JV per
-- the owner's ask (CRV/BRV are cash/bank coming IN, not an expense).
SET NOCOUNT ON;

IF NOT EXISTS (
    SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
    WHERE TABLE_NAME = 'data_FinanceVoucherInfo' AND COLUMN_NAME = 'DepartmentID'
)
BEGIN
    ALTER TABLE data_FinanceVoucherInfo ADD DepartmentID INT NULL;
    PRINT 'Added DepartmentID to data_FinanceVoucherInfo.';
END
ELSE
    PRINT 'DepartmentID already exists on data_FinanceVoucherInfo.';
GO

IF NOT EXISTS (
    SELECT 1 FROM sys.foreign_keys WHERE name = 'FK_VoucherInfo_Department'
)
BEGIN
    ALTER TABLE data_FinanceVoucherInfo
        ADD CONSTRAINT FK_VoucherInfo_Department
        FOREIGN KEY (DepartmentID) REFERENCES gen_DepartmentInfo(DepartmentID);
    PRINT 'Added FK_VoucherInfo_Department.';
END
ELSE
    PRINT 'FK_VoucherInfo_Department already exists.';
GO

-- New report: Expense by Department (report:expense_by_department). Grant to
-- admin group so it's visible immediately on live, same pattern as 104/105/107.
IF NOT EXISTS (
    SELECT 1 FROM dms_ModulePermissions
    WHERE GroupID = 1 AND PermissionKey = 'report:expense_by_department'
)
BEGIN
    INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
    VALUES (1, 'report:expense_by_department');
    PRINT 'Granted report:expense_by_department to admin group.';
END
ELSE
    PRINT 'report:expense_by_department already granted to admin.';

PRINT '109_voucher_department_tagging complete.';
