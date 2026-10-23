# Sale Module Reports

Open **Dashboard → Sale Module Reports**, or select **Sale Module Reports** in
the sidebar. The Vehicle Sales module also has a shortcut to this report hub.
Direct route: `/module/sales-reports`.

The hub gathers thirteen vehicle-sales reports:

| Section | Report | Route |
| --- | --- | --- |
| Bookings | Booking Register | `/reports/sales/booking-register` |
| Bookings | Cancelled Booking Register | `/reports/sales/cancelled-booking-register` |
| Bookings | Booking Pipeline | `/sales/reports?tab=pipeline` |
| Payments & Reconciliation | Customer Balance Payments | `/reports/sales/customer-balances` |
| Payments & Reconciliation | Booking Payment Status | `/reports/sales/booking-payments` |
| Payments & Reconciliation | Customer Advances Aging | `/reports/sales/customer-advances-aging` |
| Payments & Reconciliation | Booking Account Reconciliation | `/sales/reports?tab=bvrRecon` |
| Inventory & Master Motors | Vehicle Inventory | `/reports/sales/vehicle-inventory` |
| Inventory & Master Motors | Vehicle Inventory by Variant | `/reports/sales/vehicle-inventory-by-variant` |
| Inventory & Master Motors | Vehicle Inventory Ledger | `/reports/sales/vehicle-inventory-ledger` |
| Inventory & Master Motors | Master Invoice Aging | `/sales/reports?tab=miAging` |
| Inventory & Master Motors | Incentive Receivable Aging | `/sales/reports?tab=incAging` |
| Performance | Executive Performance | `/reports/sales/executive-performance` |

These reports also remain discoverable in Dashboard → My Reports and command
search. Financial, workshop and parts reports remain in their existing groups.
Existing report URLs continue to work. Report calculations, filters and export
options are retained apart from the query corrections below.

## Access

The existing `sales_reports` permission is now labelled **Sale Module Reports
(read-only)** in Role Permissions. It grants all thirteen read-only reports.
Individual `report:*` grants continue to allow only their corresponding reports;
`report:booking_register` covers both registers, Customer Balance Payments and
Booking Payment Status (including its filter-options endpoint).
The hub and analytics tabs show only accessible reports. Server endpoints enforce
the same rules independently. Admin retains access. No new permission key or
permission migration is required. The vehicle inventory ledger requires schema
migration 161; see [vehicle stock ledger setup](VEHICLE_STOCK_LEDGER.md).

## Existing report query corrections

- Booking Pipeline uses inquiry `OpenedAt` and booking `CancelledAt` rather than
  nonexistent inquiry `CreatedAt` or cancellation `RequestedAt` columns. Its
  cancellation total counts bookings actually cancelled within the period.
- Master Invoice Aging uses `VehicleVariantID`, the allocated vehicle's chassis,
  and the latest real transition into `Allocated`. Where allocation history is
  missing, it uses booking date (or creation date) and marks that date with `*`.
  Its existing scope remains bookings currently in `Allocated` status.

## Verification

- Initial hub: 61 focused tests; all ten original controllers passed read-only
  development database checks.
- Booking Payment Status addition: 137 focused tests passed, both new endpoints
  passed read-only development checks, and ten SQL fixture scenarios verified
  remittances, delivery, reversals, drafts and historical payments.
- Production frontend build passed. The existing bundle-size warning remains.
- No live deployment or financial/stock data changes were performed.

## Deploy from the server's Command Prompt

For the vehicle inventory/ledger update, use the migration-aware command in
[Vehicle stock ledger](VEHICLE_STOCK_LEDGER.md). The command below is for
subsequent application-only updates once required migrations are applied.

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Then press Ctrl+F5 in the browser. Roles whose permissions were changed should
sign out and sign in again to refresh their permission list.
