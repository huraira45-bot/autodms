# Extreme Historical Booking

Vehicle Sales > Historical Booking now offers **Extreme Historical Booking** at creation. Existing historical bookings default to the regular matching flow. The selected mode is stored permanently; existing edit routes do not change it.

The same customer, vehicle variant, executive, agreed price, old booking date, promised month and recorded state can be entered. Customer accounts are not required for this mode. Optional fields record an old voucher number as text, entry notes, initial customer vehicle payment and its payment mode, and the amount already paid to Master. Additional customer payments can be recorded from the booking, including after its recorded Closed state.

No accounting voucher, ledger/subsidiary entry, voucher allocation, stock movement or incentive is created. Customer amounts are stored as historical sales payment rows with no voucher or account link; the existing amount-total trigger maintains the booking totals. Master amounts use historical Master confirmation metadata (no voucher or ledger write). A voucher reference is plain text and does not reserve or modify a voucher. The creation timeline records the mode and initial amounts.

The server rejects customer/Master voucher matching and voucher-reference attachments in this mode. It also blocks operational allocation, stock changes, Master payment/invoice posting, normal cancellation processing, and gate-pass issuance. Documents, existing admin scheduling corrections and metadata entry remain available; existing main-Admin closed cancellation retains its record-only behavior. Ordinary historical bookings retain their current behavior and appear in matching queues; extreme bookings do not appear in those queues. Booking screens label recorded payments as plain data and do not imply they were posted to the ledger.

## Validation

267 tests passed across 13 suites covering creation, initial/additional amounts, no-account PayOrder entry, matching rejection, operational guard, audit-failure rollback and ordinary historical matching. The existing approved historical gate-pass fixture was updated to include its allocated vehicle and assert delivery marking. Frontend production build passed. SQL migration is idempotent and defaults existing rows to regular mode; live migration has not been applied by the coding agent.

## Manual server deployment

Pull the update, run `node scripts\run-pending-migrations.js --only 172_extreme_historical_booking.sql` from Software, rebuild frontend, then restart the PM2 app. Refresh the browser after deployment. No existing booking is converted automatically.
