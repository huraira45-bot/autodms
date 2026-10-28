# Change booking date

Open **Sales → Bookings → a booking → Change booking date**. Admins and Sales GMs can choose the actual booking day, enter a reason and save. The control is available for regular and historical bookings, including closed records. Existing Admin group, `sales_admin_settings` and `sales_gm` authority is used; no role grants are added.

The form starts with the stored booking date, or the existing entry date when no explicit booking date has been recorded. Future dates are rejected using the Pakistan calendar day. Invalid dates are rejected rather than silently rounded. The server locks the booking and compares the original date so that an older open form cannot overwrite another correction.

Only `BookingDate` and the normal modification metadata are updated. `CreatedAt`, `HistoricalEnteredAt`, promised month, status, prices, payments, vehicle assignments and voucher dates remain unchanged. Registers and report date filters already use `COALESCE(BookingDate,CreatedAt)`, so they reflect the corrected date.

The correction records old/new dates, editing user and reason in `dms_SalesAuditLog`, plus a same-state entry in the booking history. If either history write fails, the date update rolls back. Saving an unchanged explicit date does not manufacture another history entry.

The new API is `PATCH /api/sales/bookings/:id/date` with `{ BookingDate, ExpectedDate, Reason }`. `ExpectedDate` is the previous stored booking day, or `null` when unset. The previous historical date URL delegates to the same implementation and now needs the same payload; refresh older browser tabs before using it. It no longer rewrites `CreatedAt` when correcting a historical booking.

## Server installation

No migration or dependency change is required. Run this single line in the server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
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

The SQL verifier refuses remote targets, uses synthetic regular/closed-historical bookings, and rolls back all fixtures. It checks persisted dates, list filtering and an existing report, unchanged entry timestamps and all unrelated booking fields, financial record counts/amounts, audit/timeline evidence, stale-save rejection and rollback on audit failure. The production build validates frontend compilation; no browser interaction test is claimed.
