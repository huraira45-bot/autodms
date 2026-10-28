# Editing both BPV line amounts

Some existing BPVs store the debit line before the bank-credit line. The entry form previously treated line 1 as the bank line regardless of its account and disabled its Debit input, preventing the user from correcting both amounts.

When editing an existing voucher, the form now treats the saved rows as ordinary editable lines. It applies the first-row cash/bank account and direction defaults only when creating a new voucher. This preserves existing line order and lets both balanced amounts be corrected. The same correction applies to existing cash/receipt vouchers with a different saved order.

Open the voucher, choose **Edit values**, correct both amounts, enter an edit reason and save. Total Debit and Total Credit must still balance. Existing voucher-edit permissions, the posted-voucher 30-day correction window, reversal restrictions and permanent edit history continue to apply. This fix does not automatically change any saved voucher.

Verification: `voucherEditHistory.test.js` includes a debit-first posted BPV edit and unbalanced-edit rejection. The local rollback-only `verify-voucher-edit-history.js` updates both values of a real synthetic posted BPV, reloads its lines/total and checks saved before/after history. The frontend production build validates compilation. Browser automation could not initialize in this session; no browser interaction test is claimed.
