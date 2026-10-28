# Change booking date

Open **Sales → Bookings → a booking → Change booking date**. Only the main Administrator role (Group 1) can make this correction. The control is available for regular and historical bookings, including closed records.

The dedicated right is under **Admin → Role Permissions → Administrator → ADMIN & HR → Change Booking Date (Administrator only)** (`sales_booking_date`). Migration 163 grants it only to Group 1. Clearing that checkbox disables the action even for Admin. Sales GM and Catalog Admin permissions no longer grant it; other roles cannot be assigned or use this right. The server enforces the same rule on both date endpoints and the underlying service.

The form starts with the stored booking date, or the existing entry date when no explicit booking date has been recorded. Future dates are rejected using the Pakistan calendar day. Invalid dates are rejected rather than silently rounded. The server locks the booking and compares the original date so that an older open form cannot overwrite another correction.

Only `BookingDate` and the normal modification metadata are updated. `CreatedAt`, `HistoricalEnteredAt`, promised month, status, prices, payments, vehicle assignments and voucher dates remain unchanged. Registers and report date filters already use `COALESCE(BookingDate,CreatedAt)`, so they reflect the corrected date.

The correction records old/new dates, editing user and reason in `dms_SalesAuditLog`, plus a same-state entry in the booking history. If either history write fails, the date update rolls back. Saving an unchanged explicit date does not manufacture another history entry.

The new API is `PATCH /api/sales/bookings/:id/date` with `{ BookingDate, ExpectedDate, Reason }`. `ExpectedDate` is the previous stored booking day, or `null` when unset. The previous historical date URL delegates to the same implementation and now needs the same payload; refresh older browser tabs before using it. It no longer rewrites `CreatedAt` when correcting a historical booking.

## Server installation

Apply the new Admin-right migration before restarting. No dependency change is required. Run this single line in the server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 163_booking_date_admin_right.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Press **Ctrl+F5**, then open the booking and click **Change booking date**.

## Validation

```powershell
cd Software
npm.cmd test -- --runInBand __tests__/bookingDate.test.js __tests__/bookingDeliveryMonth.test.js __tests__/salesReportModule.test.js
node scripts/verify-booking-date.js
cd frontend
npm.cmd run build
```

The SQL verifier refuses remote targets, uses synthetic regular/closed-historical bookings, and rolls back all fixtures. It checks persisted dates, list filtering and an existing report, unchanged entry timestamps and all unrelated booking fields, financial record counts/amounts, audit/timeline evidence, stale-save rejection and rollback on audit failure. It also verifies that migration 163 grants only Admin once and the Admin Rights editor can revoke/regrant the key while other roles remain unchanged. The production build validates frontend compilation; no browser interaction test is claimed.
