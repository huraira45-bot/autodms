Closed bookings show **Cancel closed booking** only to the main Administrator (GroupID 1). Open the booking, select the action, enter a reason of 5–500 characters and confirm. Both regular and historical closed bookings support this action.

This is an administrative status correction: `Closed → Cancelled`. It records the cancellation time and reason, updates the normal modification metadata and writes a strict `ClosedBookingCancelled` audit entry plus a booking timeline entry with the acting user. Audit failures roll back the cancellation. Row locking and a guarded update prevent duplicate or stale cancellations.

Customer payments, vehicle remittances to Master, staff incentives, booking dates, vehicle links, gate passes, invoice documents and delivery history remain unchanged. A delivered vehicle remains delivered and locked; no stock is restored and no refund is created. The booking moves to the existing cancelled booking list/register. Under the subsequent dated Master incentive rule (migration 165), its Master incentive is reversed if posted, or its unposted draft is voided with a complete audit snapshot. See [Master incentive booking rates](MASTER_INCENTIVE_BOOKING_RATES.md). Other sale vouchers are retained.

`POST /api/sales/bookings/:id/cancel-closed` accepts `{ "Reason": "..." }`. The main Administrator role is enforced by the route, controller and service; other sales or delegated admin permissions do not grant access. Already cancelled and all other non-Closed states return 409. The normal cancellation and approval workflow remains unchanged.

The original cancellation action needs no permission grant. For current installations including dated Master incentives, use the migration-aware command in the linked Master incentive guide before rebuilding and restarting. The following original command assumes all current migrations are already applied:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh with Ctrl+F5. Validation: focused Jest coverage plus `node scripts/verify-closed-booking-cancellation.js` against the local development database (all synthetic records roll back).
