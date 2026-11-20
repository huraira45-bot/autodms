# Permanent booking lock

Owner requested payment restoration and permanent protection for BK-2026-0312.

The live payment was restored on 20 November 2026 as JV-2200, VoucherID 13989, amount PKR 3,380,000, linked to existing PaymentID 494. Original vouchers and reversal history were retained. Independent verification confirmed the booking and payment amount were unchanged.

## Protection

Migration 175 creates immutable booking/voucher lock records and 25 database triggers. Once locked, application users, including the main Administrator, cannot change/delete the booking, add/change/remove payments, reverse/edit its protected vouchers or voucher lines, change subsidiary ledger entries, alter its gate pass, documents, allocated vehicle, historical links, cancellations or incentive accrual records. Audit history remains append-only. There is no application unlock function or session-context bypass. Database owners can technically alter database schema; this is application protection, not a restriction on SQL Server owners.

The CLI requires a main Administrator actor, a closed booking, fully settled customer and Master amounts, the expected posted payment voucher and enabled protection triggers. Shared voucher lines tagged to another booking and draft vouchers stop the operation. Default mode previews without writing; --commit installs the lock transactionally and records the audit event. An already installed lock returns its recorded details without writing again. The lock does not post or reverse accounting entries.

## Manual live deployment

The agent has restored the payment but has not installed the live lock/schema. Run in server CMD:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 175_permanent_booking_lock.sql && node scripts\lock-booking-permanently.js --booking BK-2026-0312 --voucher JV-2200 --reason "Owner requested permanent protection after repeated accidental payment reversals" --commit && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Migration must precede the new backend because booking detail reads the lock table. Build/restart enables the visible lock notice and hides the main closed-booking edit actions. Database protection applies immediately when the CLI commits, including to existing running application processes.

## Validation

64 tests passed across permanentBookingLock, bookingDeliveryReopen and masterPaymentVoid. Frontend production build passed. Migration and all 25 trigger bodies parsed on the production SQL Server without installing schema. A read-only candidate service check against live BK-2026-0312 validated PKR 3,380,000 paid to Master and six protected vouchers: JV-1510, JV-1541, JV-REV-1571, JV-1904, JV-REV-1918, JV-2200. No production schema or lock was installed during validation. Trigger execution on production remains pending the manual migration.
