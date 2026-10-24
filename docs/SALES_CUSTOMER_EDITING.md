# Booking customer identities and admin corrections

In **Sales → Bookings → New Booking → Create New Customer**, an existing CNIC or NTN now produces a warning naming the matching customer. The customer can still be created and selected for the booking. Both CNIC and NTN matches are reported; dashes/spaces in older stored values do not hide a match. Invalid identifier lengths retain their validation errors.

Sales customer creation uses `POST /api/sales/customers`, with the same `crm_parties:insert` permission as the previous party creation endpoint. The change is scoped to booking customer creation. The general Credit Parties API keeps its existing duplicate rules. Existing phone duplication and unique customer GL-account ownership checks are retained.

An admin can open a booking and click **Edit customer details** in the Customer card. This permits correcting the customer's name, CNIC, NTN, phone and address, including on closed and historical bookings. Access requires the Admin group (`groupId=1`) or the existing `sales_admin_settings` role, checked on both the API and UI. Ordinary sales users receive HTTP 403 on this edit endpoint.

The form explains how many bookings use this shared customer record. The correction applies wherever that customer is referenced. It edits the same customer, preserving the booking's customer ID, account link, prices, payments and status. Moving a booking to a different customer continues through the separate **Change customer** action and its posting safeguards.

A reason is required. The transaction locks the current customer and booking link, rejects stale forms, saves only the five permitted fields, and records the actual stored before/after values and actor in `dms_SalesAuditLog` as `CustomerDetailsEdited`. An audit failure rolls back the edit. Duplicate identities are warnings on this edit too; the current customer's own ID is excluded. No ledger postings or account renaming are performed.

## Installation

No migration or dependency change is required. Run this single line in the live server's Command Prompt, then press Ctrl+F5 in the browser:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

## Verification

```powershell
cd Software
npm.cmd test -- --runInBand __tests__/salesCustomerEditing.test.js __tests__/bookingDeliveryMonth.test.js
node scripts/verify-sales-customer-editing.js
cd frontend
npm.cmd run build
```

The SQL verifier refuses remote targets, uses synthetic customers/accounts/bookings inside an outer transaction, and rolls back all fixtures. It verifies normalized duplicate identities, self-exclusion, closed historical bookings, shared customer updates, audit evidence, stale-save rejection, rollback on audit failure and unchanged financial/booking/unrelated customer fields. The production build verifies compilation; no browser interaction test is claimed.
