New regular vehicle bookings require a **DMS booking number**, entered manually from Changan / Master Motors' DMS. This requirement begins when the update is deployed. It is separate from the existing automatically generated `BK-YYYY-NNNN` number.

The external reference is stored as `dms_SalesBookings.DMSBookingNumber` (up to 100 Unicode characters). Surrounding whitespace is trimmed; leading zeros, separators and case are preserved. The server rejects missing/blank numbers, non-text values, excessive length and embedded control characters. The creation audit records the number and acting user in the same transaction; audit failure rolls back the new booking.

The number is shown in booking details, the booking lists and both booking registers, including their printouts. Booking-list search matches the external DMS number as well as the existing booking number, customer and corporate PO. Existing bookings are not backfilled and historical booking entry does not require the new field. Pricing, payments, incentives and normal booking workflow retain their existing behavior.

Deploy migration 164 **before** restarting the updated backend:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 164_booking_dms_number.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh with Ctrl+F5. The migration adds one nullable column with no default and does not alter existing booking data. Validation: focused Jest suites and local rollback-only `node scripts/verify-booking-dms-number.js`.
