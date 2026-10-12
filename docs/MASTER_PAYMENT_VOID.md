# Master Motors payment void

Implemented 2026-10-12.

On a booking, the Paid to Master panel offers Void for original draft PAY_MASTER vouchers and Request Void for original posted vouchers. Access uses the same sales_master_settlement/sales_admin_settings grants as Pay Master. Reversal history cannot be voided again; bookings that reached delivery are refused.

A draft void removes its voucher inside a transaction and records the full voucher snapshot, actor and reason in dms_SalesAuditLog. Posted voids use the existing VOUCHER unfinalize workflow: PENDING -> AM_APPROVED -> COMPLETED. The payment stays counted until the admin posts its reversal. Open approval status is shown on the payment row.

After a completed void, reload recalculates the outstanding amount and removes the draft blocker. Pay Master is available again for an eligible active booking with customer funds and an outstanding Master balance. Historical bookings keep their existing link-to-ledger workflow.

API: POST /api/sales/bookings/:id/master-payments/:voucherId/void with { Reason }. The reason must contain at least five trimmed characters. Wrong bookings, unrelated/reversal vouchers, duplicate requests, terminal bookings and downstream allocations are refused. Draft void returns 200; posted approval request returns 201 and requiresApproval: true.

Pay Master creation and voids share a booking row lock, preventing concurrent replacement drafts. Voucher posting conditionally updates Draft only and refuses a voucher deleted or posted by another request. Master reversal rechecks voucher and booking state after locking, preventing duplicate reversal and execution after delivery.

Reversal details now preserve BookingID. AmountPaidToMaster includes the reversed original and posted mirror, with source/original-source fallback for older PAY_MASTER reversals missing the booking tag. It retains the BOOKING_VARIANT_RECEIVABLE account filter.

Main sources:

- Software/frontend/src/pages/sales/BookingDetail.jsx
- Software/controllers/salesLifecycleController.js
- Software/controllers/salesBookingController.js
- Software/controllers/finalizeController.js
- Software/routes/salesRoutes.js
- Software/services/masterPaymentVoidService.js
- Software/services/voucherReversalService.js
- Software/__tests__/masterPaymentVoid.test.js

Verification:

- 27 focused Jest tests pass, including void scope/reasons, requests/allocations, reversal tags, delivery/concurrency protection and conditional posting.
- SQL Server balance checks use synthetic CTE rows only: partial reversal leaves 250, full reversal leaves 0, including an old mirror without BookingID.
- Final frontend production build passes, with the existing large-bundle warning.
- No existing customer/Master payment was voided during testing. No schema migration or dependency changes are needed.
- In-app browser testing could not start because the browser tool reported missing sandbox-policy metadata; no browser interaction is claimed.

Live update for this release: pull the feature commit, build the frontend with the server's existing configuration, and restart PM2 autodms. No dependency reinstall or migration runner is required for this change.

```powershell
# On CHANGAN-SERVER (192.168.3.10)
Set-Location -LiteralPath 'D:\saher 2.0\autodms'
git pull --ff-only
Set-Location -LiteralPath 'Software\frontend'
npm run build
Set-Location -LiteralPath '..'
pm2 restart ecosystem.config.js --update-env
```
