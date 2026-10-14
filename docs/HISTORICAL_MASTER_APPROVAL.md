# Historical Master payment approval and optional voucher matching

Historical bookings offer **Approve Master payment** on booking detail and **Approve without voucher** inside **Match Master Payment**. A Sales GM or sales admin can confirm the total already paid to Master without selecting any voucher. Notes are optional. The total, user, time and notes are stored on the booking, and approval/removal is logged in its state-transition history.

This follows the owner's explicit request: confirmation counts as paid and satisfies the Master gate-pass payment check; voucher matching is optional. The existing customer-payment, allocation, state and partial-delivery checks remain. Normal bookings cannot use this approval.

The effective Master-paid amount is the greater of the confirmed total and the existing matched ledger balance. Approval and matching are not added together. Match Master Payment remains available on active historical bookings after confirmation, so a later match does not count the same money twice. Removal clears only the approval and leaves all matching/ledger entries intact; approval cannot be changed once a gate pass has been created, delivery completed or booking cancelled.

Approval creates no payment voucher or GL entry. When an approved historical payment covers a missing matched Master balance, gate-pass issuance uses the recorded confirmation and closes the historical booking without creating an unmatched delivery journal. If the Master balance is fully matched, the existing balanced delivery-voucher/finalize workflow applies. The account reconciliation report continues to show actual ledger movements; the booking page identifies the separate approval.

## Shared/separate opening vouchers

Historical direct PayOrder recognition also supports separate opening journals: the customer credit can reside on one JV-OB voucher while the vehicle's Master debit resides on another. Migration154 preserves the original vehicle Master account on historical pay orders. Recognition requires posted originals, a sufficient customer credit and one unambiguous matching Master opening source dated no later than the customer opening. Shared capacity and manual allocation precedence prevent double use. No replacement payment is posted; matched delivery settles the original Master account.

Live BK-2026-0232's linked PayOrder is JV-OB-2026-07-0068. Its customer balance is against opening capital; the Deepal S05 Master opening debit is on JV-OB-0001. Read-only in-memory evaluation returned PKR10,298,970 remitted, zero shortfall and ready=true, without changing any live record.

## Server command

Both new migrations are required. Run the entire command in server Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 154_historical_payorder_master_accounts.sql && node scripts\run-pending-migrations.js --only 155_historical_master_payment_approval.sql && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Then Ctrl+F5. Open a historical booking -> Match Master Payment -> Approve without voucher -> confirm the total -> Approve Master payment. The separate Approve Master payment button opens the same form.

## Verification

196 tests across ten focused suites pass, including approval/no matching, duplicate counting, normal-booking restrictions, revocation/locking/audit rollback, actual gate-pass flow, customer/vehicle checks, and no invented unmatched delivery journal. Production frontend build passes. SQL Server synthetic tests cover44 pay-order scenarios,11 vehicle-account mappings and6 approved/matched total scenarios. Both migrations applied locally and reran safely. No real booking was approved or gate pass issued in verification; browser interaction was not performed. Live deployment remains manual.
