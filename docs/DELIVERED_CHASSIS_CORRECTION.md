# Correct a chassis selected accidentally on an issued booking

This is a main-Administrator maintenance action for a booking whose delivery
voucher is still **Draft**. It replaces an incorrect allocation with an available
vehicle of the **same variant**. The replacement must not already be allocated,
returned or delivered. A chassis with a Master invoice voucher requires separate
invoice review and is refused by this command.

The correction preserves the booking number, status, delivery date, prices,
payments, delivery voucher and all voucher lines. It preserves the issued gate
pass number/date/customer/amounts, changing only its chassis snapshot. Existing
financial narrations and uploaded invoice files are not rewritten. Review any
existing paper/invoice references separately and reprint the corrected gate pass.

The wrong vehicle returns to AtDealer with no current booking or delivery date.
The replacement is Delivered against the booking with the original delivery
date. Open-allocation availability is corrected as appropriate. These are stock
corrections, not general-ledger postings: the inventory trigger appends one
stock restoration and one delivery; original movements remain immutable.

## Setup and explicit command

Deploy source and run migration **167_delivered_chassis_corrections.sql** before
restarting the backend. It requires inventory migrations 161 and 162. No frontend
change is required for this maintenance feature.

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 167_delivered_chassis_corrections.sql && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Preview using the actual booking and chassis identifiers:

```cmd
node scripts\correct-delivered-chassis.js --booking BK-YYYY-NNNN --old EXPECTED_WRONG_CHASSIS --new CORRECT_CHASSIS --reason "Owner confirmed original chassis was selected accidentally"
```

Append `--commit` to apply. Without it the command validates and rolls back
without changing any data. The command is for a trusted server administrator,
not a new permission for ordinary Sales users. A main-Administrator check also
exists in the service. An already-completed identical correction is a no-op.

## Protection and trace

One SERIALIZABLE transaction locks the booking, both vehicles, conflicting
allocations, active gate pass and delivery voucher. Expected-old-chassis,
same-variant, availability and source-voucher checks reject stale/unsafe input.
An accounting/booking snapshot is compared before commit. Any failure rolls
back all changes, including audit and stock movements.

The database permits only the exact release represented by an in-progress
correction after the replacement and gate pass have been assigned. Vehicle
identity, variant and other inventory details cannot change through this
exception. A completed correction is immutable and also appears in the Sales
audit log and booking timeline. Normal delivered vehicles stay locked.

Delivery history is excluded from a wrong vehicle's lock only up to the recorded
original movement boundary for that booking. A subsequent delivery of that
vehicle locks it again, including when header links are missing. No trigger or
ledger protection is disabled during the correction.

## Verification

`node scripts/verify-vehicle-inventory.js --chassis-correction-only` applies the
migration and uses synthetic local fixtures inside rolled-back transactions. It
checks preview, main-Administrator rejection, missing chassis, exact voucher/GL
preservation, stock restoration, gate-pass and booking preservation, immutable
history/correction, repeat safety and future delivery locking. The existing full
vehicle SQL verifier and 57 focused inventory/permissions/delivery-lock Jest
tests also pass. No live data is changed by these checks.
