# Paid-to-Master display after delivery

Closed bookings must continue to show money remitted to Master after a delivery journal clears the booking account. The booking detail endpoint previously displayed the net account balance, including the delivery settlement, so a fully paid booking could display zero paid to Master after delivery.

`masterNetSql` now accepts optional position filters. Only the booking detail Paid-to-Master calculation opts into excluding SALES_DELIVERY vouchers and their reversals, matching the existing Booking Payment Status report. Default account-position calculations remain unchanged. Posted remittances, genuine remittance reversals, linked historical pay orders and approved historical amounts retain their existing rules.

Validation: 103 tests passed in four suites (booking payment report, historical pay-order delivery/readiness and Master allocation). A read-only/live correction verification for BK-2026-0122 confirmed valid linked remittance of PKR 3,380,000 and zero remaining after the owner-approved transfer of JV-1119's link from cancelled BK-2026-0345. Both payment amounts, booking states, voucher headers/lines, party ledger, gate passes and reference attachments were verified unchanged. Separate strict audit/timeline entries record both link changes. Private evidence is excluded from source control.

Deploy: pull the update and restart the backend. No migration is required. The live link correction is already complete; this source change needs deployment to update the booking-detail display.
