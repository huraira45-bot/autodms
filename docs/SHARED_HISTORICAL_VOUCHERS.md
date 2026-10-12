
# Shared opening vouchers for historical bookings

Historical customer payments and historical Master Motors remittances can share one original posted opening/manual voucher. Links allocate portions; they do not create another voucher or change ledger amounts.

## Customer payments

Record the historical payment, then choose Link Voucher (or supply the voucher when recording it). The picker shows the customer's account amount, the amount already linked on that account, and its available amount. A voucher is selectable when that account has enough remaining amount for this payment plus its premium portion.

Capacity is separate for each customer GL account. For example, an opening voucher containing PKR 300,000 for customer A and PKR 500,000 for customer B can support both customers. Several bookings using the same customer account may share its portion, up to that account's net amount. The voucher header total is shown for reference.

The linked account is saved in `dms_SalesPayments.LinkedVoucherGLCAID`. Unlinking or completing a historical payment void releases only that payment's allocation. Pending void requests continue reserving it. Unlink active historical vouchers before changing the booking customer.

## Master Motors payments

Open Link Master Voucher on a historical booking. Enter **Amount to allocate to this booking**, select a voucher with enough remaining Master amount, then link it. Repeat for the other bookings using the same opening voucher.

For example, a PKR 1,000,000 opening debit to BOOKING_VARIANT_RECEIVABLE can allocate PKR 400,000 to one booking and PKR 600,000 to another. The amount entered is stored in `dms_HistoricalMasterAllocations`; the ledger debit is preserved. The booking's existing Master balance plus the new allocation cannot exceed its agreed vehicle price.

The picker displays the untagged Master account net debit, existing allocations, and available amount. Existing booking-tagged ledger rows are excluded from the new allocation budget. Legacy Master links remain supported. To split a voucher previously linked in full through the old workflow, unlink that old historical Master link and allocate the desired portions.

Booking detail, cancellation checks, delivery posting and booking account reconciliation include active allocations. An allocation stops contributing if its source voucher is reversed. Unlinking removes only the selected booking/voucher/account allocation. Generated sales vouchers and delivery settlement credits cannot be claimed or unlinked through this historical workflow.

## API and transaction rules

- Customer record/link payloads keep their existing contract. Linking reserves `Amount + PremiumPortion` on the saved customer GL account.
- Master link: `POST /api/sales/historical/bookings/:id/link-master`, body `{ VoucherID, Amount }`.
- Master unlink: existing `POST .../:id/unlink-master`, body `{ VoucherID }`.
- Original posted manual/opening vouchers are eligible; reversal vouchers and generated sales postings are excluded.
- Mutations lock the booking and then the shared voucher before capacity is read. Existing-payment linking locks the payment after the voucher. Balances are rechecked on every submission.
- Amounts use cents. Customer payment and premium inputs accept at most two decimal places.

## Database and deployment

Migration `152_shared_historical_voucher_allocations.sql` snapshots existing linked customer accounts, replaces the voucher-wide unique customer index with a shared allocation index, and creates the Master allocation table. It preserves existing payment and ledger amounts and supports safe reruns.

The migration runner accepts `--only <exact filename>` so this deployment applies only this feature's migration. It reads the database connection from `Software/.env`.

Run this **single line in Command Prompt on the live server**:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 152_shared_historical_voucher_allocations.sql && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh the browser with Ctrl+F5 after deployment.

## Verification

111 focused Jest tests passed across the shared customer/Master allocation, historical controller, and existing Master payment void suites. The production frontend build passed with its existing bundle-size warning.

The targeted migration was applied to the local development database and rerun successfully. Read-only synthetic SQL verified separate customer budgets, premium and void capacity, exhausted Master capacity, inactive sources, and the actual booking/lifecycle/delivery balance queries. No real historical voucher was linked or voided during verification. Live deployment remains a manual user step.
