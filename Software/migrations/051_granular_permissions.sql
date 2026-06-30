-- 051_granular_permissions.sql (idempotent — safe to re-run)
-- Permission system upgrade. See Software/config/permissions.js.

SET XACT_ABORT ON;
SET NOCOUNT ON;

-- Phase 1: schema. Idempotent on the new column name; DROP if old schema present.
IF OBJECT_ID('dms_ModulePermissions') IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.COLUMNS
                   WHERE TABLE_NAME='dms_ModulePermissions' AND COLUMN_NAME='PermissionKey')
   DROP TABLE dms_ModulePermissions;
GO
IF OBJECT_ID('dms_ModulePermissions') IS NULL
BEGIN
    CREATE TABLE dms_ModulePermissions (
        PermID        INT IDENTITY(1,1) PRIMARY KEY,
        GroupID       INT NOT NULL,
        PermissionKey NVARCHAR(80) NOT NULL,
        CONSTRAINT UX_ModulePerm_GroupKey UNIQUE (GroupID, PermissionKey)
    );
    CREATE INDEX IX_ModulePerm_Group ON dms_ModulePermissions (GroupID);
END;
GO

-- Phase 2: wipe users + groups except admin. FKs disabled across DB (same
-- pattern as the wipe migration) — many tables (gen_BankInformation,
-- gen_EmployeeInfo, vouchers, etc.) reference GLUser.UserId on EntryBy /
-- EntryUserID columns.
BEGIN TRAN g;

EXEC sp_MSforeachtable 'ALTER TABLE ? NOCHECK CONSTRAINT ALL';

DELETE FROM dms_ModulePermissions;  -- in case re-run
DELETE FROM GLUser WHERE Userid <> 1;
DELETE FROM GLUserGroup WHERE GroupId <> 1;
UPDATE GLUserGroup SET GroupTitle='admin', Inactive=0 WHERE GroupId=1;
UPDATE GLUser SET GroupID=1 WHERE Userid=1;

-- Re-enable FKs (NOCHECK on existing rows — same as wipe migration)
EXEC sp_MSforeachtable 'ALTER TABLE ? CHECK CONSTRAINT ALL';

-- Phase 3: seed admin with every permission
DECLARE @perms TABLE (PermissionKey NVARCHAR(80) PRIMARY KEY);
INSERT INTO @perms (PermissionKey) VALUES
    ('workshop_customers:view'),
    ('workshop_customers:insert'),
    ('workshop_customers:edit'),
    ('workshop_customers:delete'),
    ('workshop_jobs:view'),
    ('workshop_jobs:insert'),
    ('workshop_jobs:edit'),
    ('workshop_jobs:delete'),
    ('workshop_labour:view'),
    ('workshop_labour:insert'),
    ('workshop_labour:edit'),
    ('workshop_labour:delete'),
    ('workshop_sublet:view'),
    ('workshop_sublet:insert'),
    ('workshop_sublet:edit'),
    ('workshop_sublet:delete'),
    ('workshop_parts_issue:view'),
    ('workshop_parts_issue:insert'),
    ('workshop_parts_issue:edit'),
    ('workshop_parts_issue:delete'),
    ('workshop_settings:view'),
    ('workshop_settings:insert'),
    ('workshop_settings:edit'),
    ('workshop_settings:delete'),
    ('workshop_careoff:view'),
    ('workshop_careoff:insert'),
    ('workshop_careoff:edit'),
    ('workshop_careoff:delete'),
    ('workshop_accessories:view'),
    ('workshop_accessories:insert'),
    ('workshop_accessories:edit'),
    ('workshop_accessories:delete'),
    ('workshop_gatepass:view'),
    ('workshop_gatepass:insert'),
    ('workshop_gatepass:edit'),
    ('workshop_gatepass:delete'),
    ('workshop_controller'),
    ('parts_spare:view'),
    ('parts_spare:insert'),
    ('parts_spare:edit'),
    ('parts_spare:delete'),
    ('inventory_settings:view'),
    ('inventory_settings:insert'),
    ('inventory_settings:edit'),
    ('inventory_settings:delete'),
    ('procurement_grn:view'),
    ('procurement_grn:insert'),
    ('procurement_grn:edit'),
    ('procurement_grn:delete'),
    ('procurement_grtn:view'),
    ('procurement_grtn:insert'),
    ('procurement_grtn:edit'),
    ('procurement_grtn:delete'),
    ('sales_store:view'),
    ('sales_store:insert'),
    ('sales_store:edit'),
    ('sales_store:delete'),
    ('sales_ssr:view'),
    ('sales_ssr:insert'),
    ('sales_ssr:edit'),
    ('sales_ssr:delete'),
    ('finance_coa:view'),
    ('finance_coa:insert'),
    ('finance_coa:edit'),
    ('finance_coa:delete'),
    ('finance_vouchers:view'),
    ('finance_vouchers:insert'),
    ('finance_vouchers:edit'),
    ('finance_vouchers:delete'),
    ('accounting_setup:view'),
    ('accounting_setup:insert'),
    ('accounting_setup:edit'),
    ('accounting_setup:delete'),
    ('payments'),
    ('finance_cheques'),
    ('crm_parties:view'),
    ('crm_parties:insert'),
    ('crm_parties:edit'),
    ('crm_parties:delete'),
    ('crm_party_access'),
    ('crd_followups'),
    ('cro_workspace'),
    ('cro_admin'),
    ('cro_dept_responder'),
    ('sales_executive'),
    ('sales_agm'),
    ('sales_gm'),
    ('sales_admin_pricing'),
    ('sales_admin_settings'),
    ('sales_master_settlement'),
    ('sales_recovery'),
    ('sales_hierarchy'),
    ('hr_employees:view'),
    ('hr_employees:insert'),
    ('hr_employees:edit'),
    ('hr_employees:delete'),
    ('hr_settings:view'),
    ('hr_settings:insert'),
    ('hr_settings:edit'),
    ('hr_settings:delete'),
    ('admin_users:view'),
    ('admin_users:insert'),
    ('admin_users:edit'),
    ('admin_users:delete'),
    ('admin_permissions:view'),
    ('admin_permissions:insert'),
    ('admin_permissions:edit'),
    ('admin_permissions:delete'),
    ('finalize'),
    ('am_approve'),
    ('admin_unfinalize'),
    ('report:trial_balance'),
    ('report:gl_detail'),
    ('report:customer_statement'),
    ('report:supplier_statement'),
    ('report:daily_cash_book'),
    ('report:tax_summary'),
    ('report:pnl'),
    ('report:balance_sheet'),
    ('report:day_book'),
    ('report:receivables_aging'),
    ('report:payables_aging'),
    ('report:tax_rate_history'),
    ('report:pos_pending'),
    ('report:cheques_on_hand'),
    ('report:bank_balances'),
    ('report:discount_given'),
    ('report:sales_register'),
    ('report:insurance_aging'),
    ('report:gross_margin'),
    ('report:inventory_valuation'),
    ('report:gencust_reconciliation'),
    ('report:walkin_outstanding'),
    ('report:voucher_audit'),
    ('report:system_account_audit'),
    ('report:job_card_register'),
    ('report:revenue_summary'),
    ('report:insurance_claims'),
    ('report:mechanic_productivity'),
    ('report:stock_movement'),
    ('report:reorder_alert'),
    ('report:parts_sales_register'),
    ('report:purchase_summary'),
    ('report:booking_register'),
    ('report:vehicle_inventory'),
    ('report:executive_performance'),
    ('report:customer_advances_aging'),
    ('report:booking_pipeline'),
    ('report:master_invoice_aging'),
    ('report:incentive_receivable_aging');

INSERT INTO dms_ModulePermissions (GroupID, PermissionKey)
SELECT 1, PermissionKey FROM @perms;

DECLARE @pc INT = (SELECT COUNT(*) FROM dms_ModulePermissions WHERE GroupID=1);
DECLARE @uc INT = (SELECT COUNT(*) FROM GLUser);
DECLARE @gc INT = (SELECT COUNT(*) FROM GLUserGroup);
PRINT CONCAT('Admin seeded with ', @pc, ' permissions.');
PRINT CONCAT('Users remaining: ', @uc);
PRINT CONCAT('Groups remaining: ', @gc);

COMMIT TRAN g;
GO

PRINT '051_granular_permissions applied.';
