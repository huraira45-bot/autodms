# Account Booking Links

Open **Vehicle Sales → Sale Module Reports → Account Booking Links**, under
**Payments & Reconciliation**. Direct route:
`/reports/sales/account-bookings`.

Enter an account code, part of a code, or account name and click **Find bookings**.
The report shows matching accounts and every sales booking linked through their
customer records. It includes booking number/date, promised month, customer/CNIC,
vehicle/chassis, salesperson, status and Historical/Regular marker. Booking numbers
open the booking detail page. Closed, cancelled and historical bookings are all
included so an existing link remains discoverable.

An account with no customer or no booking is shown as **No booking linked**.
Multiple bookings on one account appear separately. Totals count distinct matched
accounts, linked accounts, unlinked accounts and bookings; an account is unlinked
only if none of its customers has a booking. Print and Excel/CSV export include
all results across the report's pages.

The initial page prompts for a search and avoids loading the entire chart of
accounts. Searches are parameterized and treat wildcard punctuation literally.
Exact account-code matches appear first.

## Data and access

`GET /api/reports/sales/account-bookings?search=...` requires `sales_reports` or
`report:booking_register`; Admin retains access. No new role permission is added.
The current relationship is:

`GLChartOFAccount.GLCAID → gen_PartiesInfo.PartyGLID → dms_SalesBookings.PartyID`.

This lookup reports the customer's current account assignment. It does not infer
ownership from name similarity, shared vouchers, voucher reference attachments or
transaction history. It reads account/customer/booking/catalog data without
calculating balances or reading financial voucher/ledger lines. The report does
not modify accounts, bookings, payments or stock.

## Verification

- 72 focused tests pass for account lookup, navigation/access and related booking
  date behavior.
- `node scripts/verify-account-booking-report.js` runs against the local
  development database with all synthetic records rolled back. It checks code and
  title search, literal punctuation, multiple bookings, closed/cancelled/historical
  records, accounts without customers/bookings, current account reassignment and
  absence of financial writes.
- Read-only live checks verified code/title searches against an independent
  account-to-customer-to-booking query, plus an unlinked account and the initial
  search prompt. The sample lookup completed in 41 ms.
- Production frontend build passes. On a workstation with little free memory,
  setting `RAYON_NUM_THREADS=1` for the build reduced worker memory usage. No
  application configuration was changed. The existing bundle-size warning remains.

## Server update

No new migration or dependency is required for this report. Run in the live
server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Press **Ctrl+F5**, then open the report. These verification steps did not deploy
the report or modify live data.
