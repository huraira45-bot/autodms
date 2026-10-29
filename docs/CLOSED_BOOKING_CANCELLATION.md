Closed bookings show **Cancel closed booking** only to the main Administrator (GroupID 1). Open the booking, select the action, enter a reason of 5–500 characters and confirm. Both regular and historical closed bookings support this action.

This is an administrative status correction: `Closed → Cancelled`. It records the cancellation time and reason, updates the normal modification metadata and writes a strict `ClosedBookingCancelled` audit entry plus a booking timeline entry with the acting user. Audit failures roll back the cancellation. Row locking and a guarded update prevent duplicate or stale cancellations.

Payments, customer and Master balances, vouchers, ledger entries, incentive records, booking dates, vehicle links, gate passes, invoice documents and delivery history remain unchanged. A delivered vehicle remains delivered and locked; no stock is restored and no refund is created. The booking moves to the existing cancelled booking list/register. This action does not reverse a sale.

`POST /api/sales/bookings/:id/cancel-closed` accepts `{ "Reason": "..." }`. The main Administrator role is enforced by the route, controller and service; other sales or delegated admin permissions do not grant access. Already cancelled and all other non-Closed states return 409. The normal cancellation and approval workflow remains unchanged.

No database migration or additional permission grant is needed. After pulling the source on the server, build the frontend and restart PM2:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh with Ctrl+F5. Validation: focused Jest coverage plus `node scripts/verify-closed-booking-cancellation.js` against the local development database (all synthetic records roll back).
