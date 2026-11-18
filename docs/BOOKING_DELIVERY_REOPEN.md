# Reopen an issued booking delivery for reallocation

Server-admin maintenance only: `scripts/reopen-booking-delivery.js` defaults to read-only validation. With `--commit`, one SERIALIZABLE transaction reverses the expected posted SALES_DELIVERY voucher using the existing balanced reversal service, revokes the expected active gate pass, removes the booking's allocation and delivery/close markers, releases the vehicle to AtDealer and clears the open-allocation sold link. Booking status becomes PendingPayment, the existing unallocated state that offers Allocate Vehicle. Customer-paid amounts, Master remittances, incentives, documents, price and dates remain unchanged.

Required arguments: --booking, --chassis, --voucher, --gate-pass, --reason. The command resolves an active main Administrator for attribution. It refuses changed chassis/pass/voucher, extra active passes or allocations, existing reversal, vehicle Master invoice voucher, uploaded Master invoice, unexpected cheque dependencies or missing delivery movement. It requires migration 174.

Migration 174 creates immutable completed delivery-reopen evidence, including original booking/vehicle/gate-pass/voucher details. Delivery protection permits only the exact release after the linked pass is revoked, the original voucher is Reversed, and its mirror is Posted. No trigger is disabled. The original gate pass and inventory movements remain. Only that revoked pass and delivery history through the recorded cutoff stop locking the released vehicle. A later delivery or another active pass still locks it. The existing chassis-swap correction remains supported.

The delivery reversal carries BookingID into mirrored subsidiary ledger entries. The transaction verifies exact debit/credit mirrors, unchanged original detail rows, unchanged customer/Master records and a genuinely unlocked chassis before commit. An audit failure rolls back the entire reopen.

Validation: 78 tests passed across five suites. SQL Server PARSEONLY validated migration syntax and the generated trigger against the live trigger's anchors without installing schema. Ten synthetic SQL cases verified active-delivery locks, completed/incomplete reopen behavior, reuse on the same or another vehicle, other active gate passes, new delivery movements and existing chassis-swap protection.

## BK-2026-0215

Owner approved reversing delivery only and freeing the chassis for manual reallocation. Expected chassis NKMCME0Z2T1006430, gate pass GP-04133, posted delivery JV-1732 (PKR 10,298,970). Read-only inspection found the booking Closed, vehicle Delivered and no uploaded Master invoice. No live reopen or reversal has been applied by the coding agent. Source/schema deployment remains manual on the server.

Deploy by pulling, running migration 174_booking_delivery_reopen.sql, then running the maintenance command with those expected identifiers and --commit, and restarting PM2. The command prints the reversal number and verified result on success. If a check fails, it rolls back and prints the reason; no further reversal should be attempted until that output is reviewed.
