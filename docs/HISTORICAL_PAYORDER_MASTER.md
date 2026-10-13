# Historical direct-to-Master pay orders

A historical PayOrder already issued in Master Motors' favour is a customer payment and a Master remittance. Linking its original posted voucher must not require another Pay Master voucher.

The shared Master position calculation now recognizes linked historical PayOrder rows against the existing central Master account or verified legacy FIS booking asset accounts: Karwan/UG, Sherpa, Alsvin, Oshan, Deepal L07/S05 and Hunter. Natural GL codes are kept in `masterPaymentPositionService.LEGACY_MASTER_CODES`; bank, cash and customer liability accounts are excluded.

Recognition requires an active historical voucher link, a Posted original manual voucher, no premium on the pay order, a matching net customer credit, and exactly one eligible untagged Master booking account. All eligible payment portions on a shared voucher must fit its remaining Master debit. Existing explicit Master allocations/tags take precedence for their booking and reserve capacity for other bookings. Voiding/unlinking/reversing the source removes automatic recognition.

Booking detail, readiness, delivery and reconciliation share the same per-account balance. Delivery credits the original account(s) rather than crediting the central account for a legacy debit. Mixed settlements remain balanced. Balance query failures propagate instead of waiving the Master gate.

Manual Master linking includes automatically recognized pay orders in its consumed amount and refuses a second link for the same booking's recognized pay order.

## BK-2026-0030 verification

Live booking data has a posted customer PayOrder of PKR 8,617,980 linked to JV-0875, with the debit on OSHAN BOOKING A/C (GL code 102001006). Read-only in-memory verification of the changed controller against the live database returned:
- Master remitted: PKR 8,617,980.
- Shortfall: zero.
- Ready: true; no blocking reasons.
- Reconciliation attributes the same amount to the booking.

No live voucher/payment/gate-pass record was changed or created during verification.

## Tests and deployment

121 focused Jest tests passed across six suites. The read-only SQL verification script passed 23 eligibility/balance scenarios plus source-account and capacity checks:

```powershell
cd Software
node scripts/verify-historical-payorders.js
```

No new migration, dependency or frontend build is required (migration 152 is already deployed). Run this line in Command Prompt on the live server, then refresh the booking:

```bat
cd /d "D:\saher 2.0\autodms" && git pull --ff-only && cd Software && pm2 restart ecosystem.config.js --update-env && git log -1 --oneline
```

The existing posted pay order counts automatically after restart; no replacement payment or manual Master link is needed. Gate-pass issuance remains the user's ordinary action. Its normal delivery voucher review/finalization workflow remains in place.
