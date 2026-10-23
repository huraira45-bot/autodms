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

Run `node scripts/verify-booking-payment-report.js` from Software to execute twenty
read-only SQL scenarios. Its CTE fixtures shadow real table names within a single
SELECT; no permanent data is changed. It checks delivered payments, voids,
drafts, direct pay orders, shared opening allocations, original-source reversal
handling, legacy accounts, unchanged existing booking-account balances, and
shared pay-order capacity consumed by bookings outside the selected filters.
It also checks ambiguous accounts (including zero balances), explicitly selected
opening accounts, separate opening vouchers, insufficient customer credits, and
the gross debit/credit totals used by account reconciliation.

## 2026-10-24: live query timeout correction

The initial query correlated the entire Master payment calculation with each
booking. The live database has 359 bookings, 44,082 voucher lines and 147 linked
historical pay orders; repeated eligibility/window calculations produced an
expensive query on that data size.

`bookingPaymentReportQuery` now materializes the filtered booking scope and
global historical pay-order eligibility in session-local temporary tables. It
aggregates tagged voucher lines, source-linked payments/reversals, historical
allocations and eligible pay orders in one batch, then joins totals to bookings.
The per-line UNION of booking/source IDs prevents duplicate counting. Global
historical capacity is evaluated before report scope is applied. The batch uses
MAXDOP 1 to avoid the expensive parallel plan. No timeout was increased.

The candidate query returned all 322 non-cancelled live bookings in about 8
seconds (a subsequent stage timing was approximately 6.8 seconds). A read-only
comparison of every live booking against the original accounting expression
found zero differences. Twelve SQL fixtures and 138 focused Jest tests passed.
Only calculation queries were run remotely; no live source files, processes or
permanent financial data were changed. This fix needs a server pull and backend
restart, with no migration or frontend rebuild.

The subsequent shared-query optimization reduced the live candidate report from
6.93 seconds to 0.86 seconds, with all 322 booking totals unchanged. See
[Sales performance](SALES_PERFORMANCE.md) for the shared calculation and
reconciliation improvements.
