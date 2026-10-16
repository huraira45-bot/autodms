# Booking promised month and customer balance payments

New and historical booking forms now have an optional **Promised delivery month** field. Existing bookings show it in the Vehicle section; authorized sales users can click **Promised month** to set, change or clear it. The bookings list also shows the month.

Dates are stored as the first day of the chosen calendar month and displayed as month/year. Existing bookings remain unset. This scheduling field does not change the booking state, vehicle price, payments, stock or general ledger. Changes on existing bookings require a reason and save the previous/new month and actor to the sales audit log and booking timeline in the same transaction. A stale month is rejected rather than overwriting a competing change. Sales executives, AGMs, GMs and sales settings admins may update it, including corrections to completed historical records.

## Customer balance report

Open **Sales → Sales Reports → Customer Balance Payments**, or **Reports → Vehicle Sales → Customer Balance Payments**. Direct URL: `/reports/sales/customer-balances`.

The report shows current unpaid vehicle balances:

**Balance payment = current negotiated vehicle price after discounts − recorded vehicle payments.**

- Uses `AmountPaidToDate`, maintained by the payment trigger from Posted payment rows' vehicle `Amount`. Premium amounts are tracked separately and excluded.
- Includes historical receipts when recorded, even if the old voucher is not yet linked, matching the booking screen. A booking balance is not a verification that the linked GL contains the same amount.
- Excludes Cancelled bookings and balances of zero or less. A delivered/closed booking with an outstanding amount remains visible.
- Payments made to Master do not reduce the customer's balance.
- Booking-date filters use the original `BookingDate`, falling back to `CreatedAt`, with inclusive calendar dates. They select bookings, not a historical payment cutoff. With no filters, the report includes all outstanding bookings.
- Filter by promised month, bookings without a promised month, status, or booking/customer/phone/chassis text.
- Shows customer, contact, vehicle/chassis, executive, booking date, promised month, vehicle price, received vehicle payments and outstanding amount, with totals. Booking links open details. Print and Excel-compatible CSV export include the full filtered report across pages.
- Viewing requires existing `sales_reports` or `report:booking_register` permission; no new permission grant is required.

## Manual server update

After this feature is pushed, paste the following as **one line in Command Prompt** on the server. Migration 158 is also included so the preceding voucher-edit-history update is installed if it is still pending; it is skipped if already applied.

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 158_voucher_edit_history.sql && node scripts\run-pending-migrations.js --only 159_booking_delivery_month.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Refresh the browser after deployment. Existing months are not inferred or filled automatically.

## Verification

- 157 tests across seven relevant booking, discount, historical and gate-pass suites passed.
- Local SQL migration 159 applied successfully.
- `node Software/scripts/verify-booking-delivery-balances.js` refuses remote targets and rolls back its fixture records. It verifies month set/clear and audit, unchanged financial data/state, partial/discounted/premium/historical balances, exclusion of full/cancelled bookings, completed-booking debt and date/month/status filters.
- Frontend production build passed. Browser interaction was not tested.
- No live database updates or server deployment were performed by the agent.
