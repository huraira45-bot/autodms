# Booking Payment Status

Open **Sale Module Reports → Booking Payment Status**.
Route: `/reports/sales/booking-payments`.

Filter bookings by vehicle model, variant, salesperson, booking date range,
customer payment status, Master payment status, and booking/customer/phone/chassis
search. Changing model resets the variant selection. All filters combine, so
selecting Customer = Complete and Master = Balance remaining finds fully paid
customers whose Master settlement is still outstanding. Clear filters returns
to all non-cancelled bookings. Closed/delivered bookings remain included.

Each payment filter provides:

| Option | Meaning |
| --- | --- |
| Complete | Recorded payment covers or exceeds the amount due |
| Partial | Positive payment received/sent, with a balance still due |
| Unpaid | No positive net payment recorded |
| Balance remaining | Partial and unpaid bookings together |
| Price not set | No positive amount due is available; never labelled complete |

## Amounts

- Customer due is the current negotiated vehicle price after discounts. Received
  uses `AmountPaidToDate`, the booking's recorded vehicle receipts; historical
  receipts count before voucher matching. Premium is excluded. This is a booking
  report, not an assertion that every recorded receipt has a posted voucher.
- Master due uses the existing `masterAmountDue` rule: explicit accepted Master
  agreement, then variant wholesale, then original pre-discount Master price,
  then negotiated price as fallback. A customer discount alone does not reduce
  Master's rate.
- Master posted remittances use existing current/legacy booking accounts, direct
  pay orders and historical voucher allocations, with genuine reversals netted.
  Delivery settlements and their reversals are excluded: clearing the account
  when delivering a car does not undo money sent to Master.
- Explicit historical Master approvals count according to the existing booking
  rule: the greater of approval and posted remittance, never their sum. Rows
  relying on approval are marked. Excel includes approval and posted amounts
  separately. Unrelated voucher references do not count as payments.
- Remaining amounts cannot be negative. Excess payments are displayed separately
  and cannot offset another booking's outstanding balance. Comparisons and totals
  use whole paisa.

Amounts show the current payment position; date filters select bookings by their
booking date (creation date fallback). They do not reconstruct a payment balance
as of a past date. Summary totals and Excel include all matching rows, independent
of the displayed page. Print uses the existing full-report landscape layout.

## Access and deployment

Both `GET /api/reports/sales/booking-payments` and its `/options` endpoint require
`sales_reports` OR `report:booking_register`, with the existing admin bypass.
Lookups are part of report access, so users do not need sales-management
permissions. Referenced inactive variants/former employees remain selectable.
No new migration, dependency, ledger posting or stock movement is introduced.

## Verification

137 focused tests passed across bookingPaymentReport, salesReportModule,
masterSourceLocking, historicalMasterApproval, historicalMasterAllocation and
salesMasterAgreement. Both new endpoints returned 200 against development SQL.
Production frontend build passed with the existing bundle-size warning.

Run `node scripts/verify-booking-payment-report.js` from Software to execute ten
read-only SQL scenarios. Its CTE fixtures shadow real table names within a single
SELECT; no permanent data is changed. It checks delivered payments, voids,
drafts, direct pay orders, shared opening allocations, original-source reversal
handling, legacy accounts, and unchanged existing booking-account balances.
