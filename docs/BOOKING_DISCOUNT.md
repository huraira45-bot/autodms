# Discounts after a booking price is locked

For a discount also accepted by Master Motors, use the separate **Master agreed amount** action after applying the customer discount. It records a booking-specific settlement without another customer discount or ledger posting. See [the Master agreement guide](BOOKING_MASTER_AGREEMENT.md).

Open Sales > Bookings > booking > **Give discount**. Enter the **additional discount** in PKR and a reason. The preview shows the new vehicle price, customer total including premium, and total discount from the original standard price.

The action uses the existing **Sales Pricing Admin** (`sales_admin_pricing`) permission. It can be assigned through Admin > Permissions. Pricing-only users can also open the booking list and details. No live account permissions were changed by the agent.

`POST /api/sales/bookings/:id/discount` accepts `DiscountAmount`, `ExpectedNegotiatedPrice`, and `Reason`. It updates the booking's negotiated price, preserving its status, recorded payments, premium, allocations and existing incentive accruals. Computed DiscountAmount/DiscountPct and booking reports use the revised price. Overpayment on the booking is displayed as Vehicle Overpaid. The operation creates no voucher, GL entry, party ledger entry, payment, refund or accounting write-off.

Master's defined variant rate is unchanged. Where there is no variant rate, migration 156 adds a nullable MasterPriceBeforeDiscount snapshot, populated on the first adjustment. Readiness, delivery, historical Master approval/matching and payment screens preserve that original fallback across further discounts. Existing undiscounted bookings retain their prior behavior.

Only active bookings before delivery/gate pass can be adjusted. Existing pending negotiations stay in their approval workflow. Bookings with delivery vouchers, delivery/closure timestamps or terminal statuses are rejected. The discount must be positive, have at most two decimals and leave a positive vehicle price. A locked booking row and expected-price check prevent stale/double application. Audit and timeline entries, including actor, old/new price and reason, are mandatory and share the price transaction. Gate-pass issuance rechecks price and status under the same booking lock so a concurrent discount cannot leave stale pass/recovery amounts.

Deploy manually on the live server:

```cmd
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 156_booking_discount_master_price.sql && cd frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

Refresh with Ctrl+F5. If permission was newly assigned, sign out and back in.

Validation: 265 tests across 13 relevant suites and production build index-D9sV1dXu.js pass. Local migration 156 and real SQL fixture checks pass: two discounts, computed totals, unchanged recorded payments/premium, stale retry rejection, original Master fallback and exact unchanged financial voucher/detail/party/payment rows. All fixture booking/audit changes were rolled back. `node scripts/verify-booking-discount.js` runs this local-only verification. Browser interaction was not tested. No live booking prices, ledgers or permissions were modified. Four known unrelated legacy journal test suites have missing GL fixtures; they were not part of the focused passing run.
