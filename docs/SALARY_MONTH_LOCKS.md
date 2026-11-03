# Salary month Lock / Unlock

Main Administrator only: **HR > Salary Sheet**, October 2026 or a later month.
Use **Lock month** or **Unlock month** at the top and enter a reason. Save salary
edits before locking. Earlier months remain protected by the existing rules.
The controls do not grant payroll access to other users.

Unlock is permitted only when every salary posting voucher for the month is
Reversed. Active, Draft or missing voucher records block it. October 2026 had
seven reversed postings when inspected on 3 November; the action checks again
inside its transaction, so subsequent active postings will prevent unlocking.

Unlock makes the sheet use current employee data, attendance and salary entries.
It does not restore historical employee details into HR. Previous saved copies
remain unchanged. Lock captures a complete new fixed copy. Posting a salary
voucher also locks the payroll, preserving the existing posting workflow.
Manual locking creates no voucher. Neither button changes voucher amounts,
reverses accounting, pays staff, or deletes posting history.

Migration 169 adds append-only `hr_SalarySheetLockHistory`. Each event records
month, action, actor, timestamp and reason; LOCK events include complete payroll
JSON. The most recent event selects the active revision or unlocks the month.
Original `hr_SalarySheetSnapshots` rows and all earlier revisions remain immutable.
SQL triggers prevent modifying/deleting either archive. All controls serialize
with salary edits and posting using the existing per-month application lock.
Stale browser requests are rejected rather than changing a newer lock state.

API: `POST /api/hr/salary-sheet/YYYY-MM/lock`, main Admin only, body:
`{ "Locked": false, "Reason": "Correction requested by owner", "ExpectedControlID": null }`.
Use the currently displayed `lockControl.id`, or null for a month without a
control event. Print, Excel, slips and Mess Sheet use the same active salary sheet.
Legacy archive utility skips explicitly unlocked months.

Server maintenance supports the same validations and audit. Preview rolls back:

```bat
node scripts\set-salary-month-lock.js --month 2026-10 --unlock --reason "Owner requested October salary correction"
```

Add `--commit` to apply. Repeat unlock is a no-op when already unlocked. A stale
or active posting fails without changing payroll or financial records.

Manual live deployment and requested October unlock (one Command Prompt line):

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 168_sales_executives.sql && node scripts\run-pending-migrations.js --only 169_salary_month_lock_controls.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && node scripts\set-salary-month-lock.js --month 2026-10 --unlock --reason "Owner requested October salary correction" --commit && pm2 save
```

168 completes the prior sales setup installation if still pending; it skips when
already applied. 166 is required and was confirmed present on the live server.
After success, refresh with Ctrl+F5 and select October 2026. The agent does not
perform remote application/schema deployment automatically.

Verification: focused `salaryMonthLock` and `salarySheetSnapshot` Jest suites,
frontend production build, and local-only `verify-salary-sheet-snapshot.js` with
all fixtures rolled back. SQL verification covers preserved original snapshots,
active-voucher refusal, reversed-voucher unlock/edit/re-lock, no financial writes
from controls, automatic posting lock and immutable revision history.
