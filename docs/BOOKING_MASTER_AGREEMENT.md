# Booking-specific Master agreed amount

BK-2026-0006 has a posted direct PayOrder of PKR 3,380,000 (JV-0968), a customer price of PKR 3,380,000 after a PKR 50,700 discount, and a catalog wholesale rate of PKR 3,430,700. The owner explicitly confirmed that Master accepts PKR 3,380,000 as full settlement because of the commercial-vehicle concession. A customer discount alone does not record that Master agreement.

Added **Master agreed amount** beside Give discount, using the existing Sales Pricing Admin permission. Enter the full accepted amount, confirmation reason and confirm that Master accepted it. `POST /api/sales/bookings/:id/master-agreed-amount` accepts Amount, ExpectedMasterAmount and Reason. The amount is recorded on this booking with actor/time/reason and mandatory audit/timeline entries. It takes precedence over the variant wholesale rate and pre-discount fallback for readiness, delivery, Master payment display and historical matching/approval.

This operation leaves the customer price, discount, payment rows, catalog, all financial vouchers, GL detail and party ledger unchanged. It creates no new payment or journal and does not count the concession as money sent. Actual remittance still has to cover the agreed amount. Other gate-pass requirements remain. The original variant rate applies to other bookings.

The booking is locked, expected-current-amount prevents stale overwrites, amounts must be positive/two decimals and no greater than the original Master rate. Closed/delivered/gate-pass bookings or existing delivery vouchers cannot be adjusted. Audit failure rolls back the agreement.

For the owner's confirmed BK-2026-0006 correction, run on the live server:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 157_booking_master_agreed_amount.sql && node scripts\set-booking-master-agreed-amount.js --booking BK-2026-0006 --amount 3380000 --expected 3430700 --reason "Master confirmed commercial vehicle settlement" && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

The explicit administrative command uses the same validation/audit service as the UI and records its actor as “Server administrator (manual command)”. It refuses a changed expected rate and skips a repeated identical agreement. Migration 157 is additive; migration 156 is already deployed on this server. After deployment refresh with Ctrl+F5 and retry issuing the gate pass. This script does not issue a gate pass.

Validation: 289 tests across 14 focused suites, production build index-vzYF2dPb.js, local migration 157 and actual SQL rollback tests pass. The SQL test confirms the agreement preserves the discounted customer price and leaves complete voucher/GL/party/payment rows identical. Read-only in-memory candidate evaluation against live BK-2026-0006 yields ready=true, fullyPaid=true, Master definedRate/remitted 3,380,000 and shortfall=0. It injects only the accepted rate into the candidate SELECT; no live data/files were altered. Local fixture changes were rolled back. Browser interaction was not tested. Live deployment and correction remain the user's manual command.
