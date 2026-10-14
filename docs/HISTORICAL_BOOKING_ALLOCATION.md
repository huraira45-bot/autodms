# Allocation for paid historical bookings

BK-2026-0228 was fully paid (PKR 2,993,235), with a PKR 600,000 minimum and both CNIC/PBO available, but its imported status remained PendingBookingPayment. Historical payment entry intentionally preserves the chosen state. The allocation status allowlist excluded that state, and the booking page's missing status style incorrectly displayed Draft.

The allocation readiness and allocation handlers now accept PendingBookingPayment only when IsHistorical is true. Existing payment thresholds, required documents, vehicle status/variant/ownership and permissions remain enforced. Ordinary bookings still require the normal confirmation states. Historical Draft/PendingApproval/terminal states are not enabled.

Booking detail shows Allocate Vehicle for historical PendingBookingPayment bookings with a recorded payment, subject to its existing allocation permissions and no existing allocation. The allocation modal still enforces readiness before selection. A successful allocation follows the existing transition to Allocated and audits the actual prior status. No automatic status/payment changes or replacement vouchers are created. PendingBookingPayment/BookingConfirmed now display their actual status labels; unknown states show their value instead of Draft.

## Server update

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

No migration or new dependency is needed. Refresh with Ctrl+F5. The separate stale-backend issue was already resolved on the live server; do not repeat the old taskkill7164 command.

## Verification

163 tests across eight focused suites pass, including the historical pending allocation path, normal confirmation restrictions, under-minimum/no payment, CNIC/PBO, open-allocation exemption, blocked states and unavailable/mismatched/already-owned vehicles. Production frontend build passes. An in-memory candidate read-only readiness check against live BK-2026-0228 returned ready=true with no blockers, paid PKR 2,993,235 and minimum PKR 600,000. No live booking status or vehicle was changed during verification. Browser interaction was not performed.
