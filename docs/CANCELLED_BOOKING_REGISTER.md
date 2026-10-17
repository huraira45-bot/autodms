# Cancelled Booking Register

**Reports → Vehicle Sales → Booking Register** now excludes bookings whose current status is `Cancelled`, including their amounts in the totals. Passing a status/query flag cannot bring them back into this report. Bookings awaiting cancellation approval remain in the main register until cancellation is completed.

Open **Reports → Vehicle Sales → Cancelled Booking Register** to view cancelled bookings separately. Both registers include a link to the other report. The new register uses the existing `report:booking_register` permission and shows booking/customer/vehicle, original amounts and recorded payments, cancellation date and reason. Recorded payments are not a refund calculation; cancelled bookings are not presented as collectible outstanding vehicle debt.

Both reports retain the existing register period behavior: the selected dates filter booking creation date, rather than the date cancellation was performed. The separate cancellation date is shown in the new register. The reports do not change any booking, payment, voucher or stock record.

API: `/api/reports/sales/cancelled-booking-register`.
Page: `/reports/sales/cancelled-booking-register`.

No new database migration is required. Deploy with the normal Git pull, frontend build and PM2 restart. If the two preceding feature migrations (158 and 159) remain pending, apply them before restarting:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 158_voucher_edit_history.sql && node scripts\run-pending-migrations.js --only 159_booking_delivery_month.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Validation: 36 tests across the cancellation-register and delivery-month suites; production frontend build; read-only local SQL comparison against independent status counts (7 non-cancelled and 1 cancelled booking), including zero cancelled collectible outstanding. No browser interaction test or live deployment performed.
