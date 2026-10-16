# Voucher edit history

Open a voucher and click **Edit history**, or go to **Reports → Voucher Audit Trail → Edit history** to search across vouchers. Filter by voucher number, editing user, and edit date. Date filters and displayed event times use Pakistan time; the new table stores UTC.

Each recorded edit contains the authenticated user's ID/name, timestamp, reason, action, and the actual stored before/after header, lines and manual charity amounts. Expand a record to see changed header fields and both versions of the lines, including account, narration, debit/credit, department, expense flag and party/job/booking/allocation links.

Full voucher edits require a reason of 3–500 characters. Date and department/expense shortcuts retain their existing rules; their action is always recorded and any supplied reason is retained. Existing viewing and editing permissions continue to apply. Global history is available to voucher viewers or users with the existing voucher-audit report permission.

The voucher mutation, legacy date log (where applicable), manual charity reconciliation and new trail entry commit together. Failed history writes roll back the edit. All four edit endpoints lock the voucher header before taking the initial snapshot. A state/date/type change since the permission check rejects the save so that the operator must refresh. The history table rejects UPDATE/DELETE, has no editing/deletion API and retains evidence if an edited draft is later deleted.

## Coverage and historical limits

Records full voucher PUT edits, date PATCH edits, individual department/expense PATCH edits and whole-voucher expense-flag PATCH edits. Posting/unfinalize/reversal events retain their existing lifecycle records. Automated changes in source-document workflows and direct SQL changes are outside this application edit trail.

Migration 158 imports existing date-change log entries once, labelled **Earlier date change (date-only record)**. These contain the dates available in that log, not reconstructed amounts or line details. Other edits made before installation cannot be recovered by this feature. No old financial discrepancy is corrected by installing it.

## Deployment

After this commit is available on origin/main, run this **single line** in Command Prompt on the live server:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 158_voucher_edit_history.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Migration must run before enabling the updated backend. Otherwise, edits fail with a migration message rather than saving without history. Refresh the browser after deployment.

## Validation

```powershell
cd Software
npm.cmd test -- --runInBand __tests__/voucherEditHistory.test.js __tests__/masterPaymentVoid.test.js
node scripts/verify-voucher-edit-history.js
cd frontend
npm.cmd run build
```

The integration verifier refuses remote database targets, executes actual controller/service SQL against the development database, and rolls back all fixture voucher and trail rows. It checks snapshots, actor identity, all four edit paths, rollback on audit failure and rejection of history modification. The frontend production build validates compilation; no browser interaction test is claimed.
