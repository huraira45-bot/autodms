# Delivered Vehicles — Master Invoice Pending

Open **Sale Module Reports → Inventory & Master Motors → Delivered Vehicles —
Master Invoice Pending**. Direct path:
`/reports/sales/delivered-master-invoices`.

The report lists non-historical bookings with a recorded delivery date, gate-pass
issue date, or active booking gate pass, whose Master invoice file has not been
recorded. Closed bookings remain visible until the file is uploaded. Historical
and cancelled bookings are excluded. A Closed status by itself does not establish
delivery.

Search by customer name or CNIC; CNIC can include or omit hyphens and spaces.
CNIC recorded within the customer name is also searchable. Booking number and
chassis searches are supported. Optional From/To filters apply to the delivery
date and include both selected calendar days. The report includes delivery date,
days pending, customer/CNIC, model/variant, chassis/engine, gate pass, salesperson
and booking status. Print and Excel/CSV export include all matching rows.

Click **Upload Master Invoice** on a row to open the existing invoice form
without leaving the report. Enter invoice number/date and select the actual
invoice file (PDF or supported image, up to 10 MB). Successful save refreshes the
report, removing that booking. Failed uploads show the error and remain pending.
Deleting the linked document makes the booking pending again. An invoice voucher
or unattached reference alone does not satisfy the upload requirement.

The report uses `GET /api/reports/sales/delivered-master-invoices`, guarded by
`sales_reports` or `report:master_invoice_aging` (Admin also allowed). Uploading
uses the existing `/api/sales/bookings/:id/master-invoice-document` endpoint and
requires `sales_master_settlement`, `sales_admin_settings` or `sales_gm`. Report
read access does not grant upload access. Existing upload transaction, audit,
duplicate protection and file validation are retained. Uploading paperwork does
not post a voucher, accrue incentives, or change delivery/status/stock.

## Validation

- Focused report, report-navigation/access and invoice-upload tests pass.
- `node scripts/verify-delivered-master-invoices.js` exercises real development
  SQL with rolled-back fixtures: delivery evidence, historical/cancelled
  exclusions, closed-without-delivery exclusion, gate-pass-only delivery,
  revoked-only exclusion, literal name punctuation, formatted/unformatted and
  embedded CNIC, inclusive delivery dates, upload removing the row, soft deletion
  restoring it, and unchanged financial/status data.
- Production frontend build passes; the existing bundle-size warning remains.
- Read-only live query check found 43 pending bookings, matching an independent
  scope query, and verified customer/CNIC searches and delivery-date filtering.
  No live deployment or data changes were performed by these checks.

## Server update

No new migration or dependency is required. Existing Master invoice upload setup
(migration 160) must already be installed. Run in the live server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Then press **Ctrl+F5** and open the report from Sale Module Reports.
