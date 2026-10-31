# Vehicle inventory, ledger and delivery lock

Open **Sale Module Reports → Vehicle Inventory by Variant** or
**Vehicle Inventory Ledger**. Both support model/variant filters, printing and
Excel export. Existing `sales_reports` or `report:vehicle_inventory` access is
used; no additional role grant is required.

## Inventory by variant

The report shows recorded vehicles, stock, at Master, in transit, at dealer,
allocated, delivered, returned and open-allocation stock. A row links to that
variant's ledger. In-stock-only and name/code search filters are available.

Stock is registered chassis quantity: AtMaster, InTransit, AtDealer and Allocated
are included. Delivered/Sold and Returned are excluded. Open allocation is a
subset of stock, not an additional quantity. These reports do not post vouchers.

### In stock means not delivered (31 October 2026)

The owner confirmed that returned vehicles remain excluded. Both **Vehicle
Inventory** and **Vehicle Inventory by Variant** now open with **In stock only
(not delivered)** selected. Booked and allocated cars remain stock until
delivery/gate-pass issuance. Delivered/Sold and Returned vehicles are excluded.
Uncheck the option to review all recorded vehicles and the delivered/returned
breakdown.

The variant report filters vehicles before aggregating quantities, rather than
only hiding variants with no stock. With the option checked, recorded quantities,
totals, printing and Excel exports describe undelivered stock only. A gate-pass
delivery overrides a stale vehicle status in both reports. This uses the existing
booking-backed delivery evidence; it does not alter vehicle records, locks,
inventory-ledger entries or accounting.

No new migration is required on an installation already running the vehicle
inventory reports. Deploy this report update with:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Then press Ctrl+F5. Focused validation: 57 Jest tests and
`node scripts/verify-vehicle-inventory.js --reports-only` against local SQL Server.
The SQL check rolls back every fixture/migration and covers booked/allocated
stock, delivered/sold/returned exclusions, stale gate-pass status, a delivered-only
variant, both report scopes and totals.

## Inventory ledger

Migration 161 establishes a timestamped opening snapshot of existing vehicles.
Previously delivered/returned vehicles have zero opening stock. Past movements
are not reconstructed from incomplete timestamps. The screen states when
tracking began, and requests wholly before that point return a clear message
instead of a misleading zero historical balance.

Subsequent vehicle changes are captured by a database trigger in the same
transaction as the change:

- Registration adds one unit; delivery, return or permitted deletion removes it.
- Moving between Master/transit/dealer/allocated states changes location/status
  without adding another unit.
- Restoring a returned vehicle adds it back; a variant transfer records an issue
  from the old variant and a receipt into the new variant.
- The movement retains chassis/engine, variant/model snapshots, status/location,
  booking reference, time and actor. History remains after a permitted vehicle
  deletion and after deletion of an unused variant.
- Ledger rows are immutable; there is no ledger edit/delete endpoint.

Date filters are inclusive Pakistan calendar dates; stored movement timestamps
are UTC. Each variant has a separate running balance. Summaries include opening,
in, out and closing quantities across all matching records, independently of
pagination. Excel includes variant summary rows as well as all movement rows.

## Delivery and permanent lock

Issuing a sales gate pass now sets `dms_Vehicle.Status='Delivered'` and its
delivery date in the gate-pass transaction, including cases whose delivery
voucher is still Draft. It records a single stock issue. Booking accounting can
remain GatePassIssued until the voucher is finalized; finalization closes the
booking while preserving the original delivery date and stock movement.

Vehicle inventory edit/delete actions and booking chassis swaps are blocked
after a booking-backed delivery for every application role, including administrators. API guards
check booking links, delivery dates and booking gate-pass/ledger evidence. Database
protection independently prevents changes to delivered inventory/identity fields
or deletion, including case-only and trailing-space alterations. There is no
application unlock permission. Internal late Master invoice/accounting reference
updates remain possible, preserving the existing after-delivery invoice process.

Migration 161 normalizes existing vehicles with issued booking passes to
Delivered and preserves known delivery dates. Legacy Sold vehicles are also
treated as delivered; a booking-backed delivery is locked. Live read-only inspection found two gate-pass
vehicles still in other statuses; applying the migration corrects those records.

### Unlinked vehicle corrections (migration 162)

A saved Delivered/Sold label or delivery date alone no longer locks a vehicle
that has no booking delivery link. Inventory edit/delete uses the server's
`IsDeliveryLocked` result rather than locking every Delivered label in the browser.
An authorized user can correct that record or delete it when unused. Existing
permissions are unchanged. Manual creation of a new Delivered/Sold status still
requires the gate-pass process; an unlinked existing label may be retained when
editing other details.

The vehicle's saved status and stock quantity are not changed automatically.
Choose AtDealer in the editor only when the vehicle is actually in stock. An
explicit status correction clears a stale delivery timestamp and records the
stock restoration in the inventory ledger. Existing ledger entries are retained.

Real delivery protection includes booking header links, a gate pass identifying
the chassis and immutable delivered/opening ledger entries linked to a booking.
Clearing a displayed current-booking link does not erase those references or
unlock a genuine delivery. The database uses the same booking-evidence policy;
the first completion of an already-issued gate pass can set delivery status/date
without changing vehicle identity. Later edits/deletion remain prohibited.

For an installation already running migration 161, deploy this correction with:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 stop autodms && node scripts\run-pending-migrations.js --only 162_booking_backed_vehicle_delivery_lock.sql && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

This migration changes the trigger's lock predicate and adds a gate-pass lookup
index; it does not rewrite vehicle statuses or historical stock movements.
Rollback-only development verification covers unlinked Delivered edits/deletion,
explicit stock restoration, first gate-pass completion, retained delivery
protection, late invoice references and immutable history. Focused tests and the
production frontend build also pass.

## Validation and deployment

249 focused Jest tests passed across 13 suites, and the production frontend
build passed. Rollback-only development checks cover registration, receipt, editing,
returns/restores, variant transfers, deletion/history retention, opening/running
balances, migration idempotence, direct database and administrator API locks,
exact-byte protection, late invoice references, and delivery-voucher finalization
without a second stock issue. Focused Jest checks cover both gate-pass branches,
rollback on delivery failure, stale allocation, report filters/timezone and role
permissions. The inventory summary candidate returned 12 variants in 53 ms on
live data; live testing was read-only. Local migration 161 was applied after the
rollback checks. No live deployment or financial mutation was performed here.

Stop the old backend before applying the migration: vehicle INSERT/UPDATE uses
OUTPUT INTO in the new code for compatibility with the new trigger.
Build the frontend first so a build failure does not stop the running server.

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 stop autodms && node scripts\run-pending-migrations.js --only 161_vehicle_inventory_ledger_delivery_lock.sql && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Then press Ctrl+F5. For rollback-only development verification, run
`node scripts/verify-vehicle-inventory.js` from Software.
