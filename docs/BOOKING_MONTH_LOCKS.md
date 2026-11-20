# Booking month locks

Main Administrator (GroupID 1) manages Vehicle Sales > Booking Month Locks (`/sales/booking-month-locks`). No delegated Sales or workflow role can use the lock/unlock API. Select a year and month, enter a reason and confirm the change. Revision checking rejects stale forms; every successful change is recorded in immutable history.

Migration 176 initially locks July, August, September and October 2026. Re-running the migration does not override later Admin decisions. Other months default to unlocked.

Month is determined by BookingDate, falling back to CreatedAt for legacy rows. Locked months block:

- Creating normal, historical or extreme historical bookings dated in the month.
- Changing the effective booking date into, out of or within that month. Admin must unlock first.
- Customer payment void requests, approval and execution, including requests created before the lock.
- Booking-linked voucher unfinalize/void requests and completion through the Accounting workflow.
- Direct draft Master-payment voids.
- Soft/hard deletion, reassignment or file replacement of existing booking documents.

New document INSERTs are allowed. Allocation, Pay to Master, customer payments, delivery, status updates, Master invoice uploads and automatic voucher creation/finalization continue as before. This is not a blanket financial-period close: direct ledger adjustments outside those void workflows are not disabled. There is no trigger on voucher posting or the vehicle table. Normal authorization still applies. The separately requested permanent per-booking lock (migration 175) is stronger and remains effective even when a month is unlocked.

Database triggers enforce entry/date, document and request protections regardless of UI entry point. The Master-payment void service checks the lock within its caller transaction. Rejected/withdrawn requests may still be cleared from queues. Successful lock/unlock changes never alter booking dates, financial values or vehicle records.

## Manual deployment

Live source/schema deployment remains manual. The agent has not installed migration 176 or changed live month controls.

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 175_permanent_booking_lock.sql && node scripts\run-pending-migrations.js --only 176_booking_month_locks.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Migration 175 is included because the preceding source update adds the permanent-lock table lookup to booking detail. Installing 175 alone does not permanently lock any booking; that uses its separate CLI. Apply both migrations before restarting the new backend.

## Validation

145 tests passed across bookingMonthLock, masterPaymentVoid, permanentBookingLock, bookingDate, bookingDeliveryMonth and historicalVoucherControllers. Production frontend build passed. Read-only SQL validation on the production engine parsed migration 176 and its six SQL bodies, and checked 34 synthetic cases against the actual trigger predicates, including unchanged-date operational updates, new uploads, void stages, locked/unlocked boundaries and document deletion. No live schema or data was changed by those checks; runtime trigger installation remains pending deployment.
