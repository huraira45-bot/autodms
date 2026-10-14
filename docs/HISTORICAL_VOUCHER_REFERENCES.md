# Historical voucher number/type lookup and references

Historical bookings now support searching any voucher in the system by voucher number and selecting its voucher type. The type list comes from GLVoucherType, including legacy type codes; duplicate IDs with the same code appear once. Numbers can be entered in full or in part. Literal %, _ and [ characters are treated as part of the number. Exact number matches appear first; results are limited to 50.

## Use

- On a historical booking, open **Voucher references**, select a type, enter the voucher number, click **Find any voucher**, select the result, then **Link ... as reference**.
- In customer **Link voucher** and **Match Master Payment**, choose **Any voucher as reference** to attach a reference to that customer payment or to Master.
- Existing customer and Master payment link searches also have the voucher-type selector.
- References can be reviewed and removed through **Voucher references**, including after a booking is closed or fully paid. The Historical Payment Links list also provides this button.

As requested, an unrelated voucher can be attached. References accept any voucher account, source and status, including Draft or Reversed, and show its current status. They are supporting documentation only: they never update SalesPayments, Master allocations, GL entries, customer paid totals or gate-pass readiness. Actual payment links retain the existing posted-voucher, account-capacity and ownership checks. A reference-only customer payment therefore remains awaiting a financial voucher link in the linking queue.

References are stored separately in dms_HistoricalVoucherReferences, scoped to a booking and optionally a customer payment. Add/remove actions are audited in the booking timeline. Customer payment ownership is checked; duplicate scoped references are rejected; removal is restricted to the specified booking. The existing sales_admin_settings/sales_gm permissions apply.

## Deploy on the live server

Run in Windows Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 153_historical_voucher_references.sql && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh with Ctrl+F5. Migration 153 creates only the new reference table and its constraints/index; it does not change existing payment/ledger amounts. It is idempotent and requires the existing sales/finance tables. No new npm dependency is required.

## Validation

144 focused tests across seven historical payment/Master void suites pass. Production frontend build passes. The actual search/type/reference-list SELECT queries passed SQL Server checks against synthetic CTE fixtures, including duplicate legacy type IDs, identical numbers under different types, unrelated accounts, Draft/Reversed sources and literal wildcard characters. Migration 153 applied locally and a targeted rerun skipped it correctly. No real booking/payment/reference records were created during verification. Browser interaction was not performed.
