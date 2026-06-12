/*
 * Migration 029 — Sales Module Phase 0: System-account role registry NOTE
 *
 * This migration is intentionally empty of GL changes.
 *
 * Per §14 (and locked decision #7), system-account roles point to admin-chosen
 * COA leaf accounts via the existing /accounting/setup UI. dms_SystemAccounts.GLCAID
 * is NOT NULL — every role must be mapped to a real, named CoA account before
 * the corresponding posting service can fire.
 *
 * The following 14 new role keys must be configured by admin via the existing
 * /accounting/setup screen BEFORE any sales posting service (VBV / VSV / VIV /
 * MSV / MRV) can post:
 *
 *   ASSETS
 *     - VEHICLE_INVENTORY                       Asset (Current)
 *     - BOOKING_CLEARING                        Asset OR Liability (control account, sub-ledger by BookingID)
 *     - MASTER_INCENTIVE_RECEIVABLE             Asset, subsidiary by Party=Master
 *     - WHT_RECEIVABLE                          Asset, subsidiary by Party — UNIFIED with customer-side WHT
 *
 *   LIABILITIES
 *     - MASTER_PAYABLE                          Liability, subsidiary by Party=Master
 *     - ACCRUED_SALES_INCENTIVE_PAYABLE         Liability, subsidiary by EmployeeID
 *     - OUTPUT_GST_INCENTIVE_PAYABLE            Liability (GST owed on Master incentive payments)
 *
 *   REVENUE
 *     - VEHICLE_SALE_REVENUE                    Revenue (gross at delivery)
 *     - VEHICLE_PREMIUM_INCOME                  Revenue (premium retained over standard)
 *     - VEHICLE_SALES_DISCOUNT                  Contra-revenue / Expense
 *     - MASTER_INCENTIVE_INCOME_STANDARD        Revenue / Other Income
 *     - MASTER_INCENTIVE_INCOME_SPECIAL         Revenue / Other Income
 *     - MASTER_INCENTIVE_INCOME_ADDITIONAL      Revenue / Other Income
 *
 *   EXPENSES
 *     - VEHICLE_COGS                            Expense
 *     - SALES_INCENTIVE_EXPENSE                 Expense
 *
 * Optional / open-allocation only:
 *     - MASTER_CUSTOMER_ORIGIN_ADVANCE          Asset (when customer pays Master directly for an open-allocation car)
 *
 * Each Sales posting service (built in later phases) calls `resolveRole(roleKey)`
 * and throws HTTP 412 with a clear error if the role hasn't been mapped to a
 * GLCAID. This forces the admin to configure the CoA mapping before the first
 * sales transaction tries to post.
 *
 * NO ROWS INSERTED — this migration is documentation-only.
 */

-- Intentionally empty. See header comment.
PRINT 'Migration 029: System-account role registry documented. Admin must map roles via /accounting/setup.';
GO
