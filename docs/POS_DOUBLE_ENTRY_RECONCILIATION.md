# POS Double-Entry Reconciliation (2026-07-05)

## What happened

Under the pre–2026-07-05 finalize behavior, a JC or Store Sale posted with
Payment Mode = **POS** did TWO things in the same finalize transaction:

1. The invoice voucher:
   - Dr Gen-Cust *(or party GLCAID)*
   - Cr Revenue + Tax
2. A companion auto-settle CRV:
   - Dr **POS_CLEARING**
   - Cr Gen-Cust *(→ AR closed immediately)*

If the cashier then went to **Receive Payment → POS** and recorded the
same amount again *(assuming nothing had been posted yet)*, the JC's
outstanding was already zero, so the whole amount spilled into
**CUSTOMER_ADVANCE_RECEIVED** as an overpayment.

**Net effect per affected doc:**
- `POS_CLEARING` was debited twice → cash sitting in the clearing bucket
- `CUSTOMER_ADVANCE_RECEIVED` was credited once → phantom customer credit
- Gen-Cust A/R was correct (netted to zero by the auto-settle)

## Detect

```
cd D:\saher 2.0\autodms\Software
node scripts\find_double_pos_receipts.js
```

Prints one row per affected source doc:
```
JC-B&P-1023   CRV-0184    928.00  │ CRV-0212           928.00  │  #4271
```
The **Duplicate VoucherID** column is what you reverse.

## Reconcile — pick ONE of these two approaches

### A) Voucher-by-voucher reversal *(recommended — full audit trail)*

For each Duplicate CRV surfaced by the script:

1. Open the voucher in **Vouchers ▸ Search** by the printed `VoucherNo`.
2. Click **Unfinalize Request** → give reason
   `"Duplicate POS receipt — corrects POS_CLEARING / Customer Advance
   double entry (see reconciliation memo 2026-07-05)"`.
3. AM approves; admin performs the reversal.

The reversal posts:
- Dr **CUSTOMER_ADVANCE_RECEIVED** *(cancels the phantom credit)*
- Cr **POS_CLEARING** *(cancels the second Dr)*

After all reversals: `CUSTOMER_ADVANCE_RECEIVED` returns to its pre-mistake
balance, and `POS_CLEARING` reflects only the legitimate amounts that will
be settled by the POS Settlement screen.

### B) Single netting JV *(faster, less traceable)*

If the volume is large, post one Journal Voucher covering the whole batch:

```
Dr  CUSTOMER_ADVANCE_RECEIVED     <sum of duplicates>
Cr  POS_CLEARING                  <sum of duplicates>
```

Remarks: `"POS finalize double-entry cleanup — see script output dated <DATE>"`.

**Use B only if:**
- The affected POS_CLEARING amounts have NOT yet been settled to bank via
  POS Settlement (i.e. those Dr's still show in POS_CLEARING).
- If any have already been settled, revert those with the standard
  reversal flow (A) so the settlement voucher gets rolled back too.

## What if POS_CLEARING was already settled to bank?

If POS Settlement has already moved the doubled amount to the acquirer's
bank, the second Dr can't simply be rolled back with a CUSTOMER_ADVANCE
credit — the money is really in the bank. In that case:

1. Reverse the offending POS Settlement voucher first (Vouchers ▸ Search).
2. Then reverse the Duplicate CRV as in **A**.

That leaves `POS_CLEARING` clean and the bank statement matches
the settlement history.

## Going forward

Fixed in commit `c937c77` — POS auto-settle CRV is gone. JC and Store
Sale finalize now post only the invoice voucher (Dr AR / Cr revenue +
tax) regardless of payment mode. The cashier posts the real receipt via
**Receive Payment**, exactly like Cash / Bank Transfer / Cheque.
