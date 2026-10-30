# Saved monthly salary sheets

Posting salary accrual or salary disbursement saves a permanent copy of the complete month's salary sheet in the same database transaction as the vouchers. If either the voucher or saved-copy operation fails, both roll back.

The saved sheet includes the employee roster, names and departments, salary/account/bank details, attendance and salary inputs, fine settings, calculated additions/deductions/net pay and cash/bank splits. Later employee additions, deactivations, master-data edits and changes to attendance or fine settings do not recalculate it. A future unposted month continues to use current employee data.

Open **HR > Salary Sheet** and select the posted month. The **Saved salary sheet - read-only** banner identifies the fixed copy and its capture time. The screen, salary slips, all sheet print layouts, cash/bank letters, Excel export and subsequent salary disbursement use this same saved data. Salary and mess entry changes for a posted month return HTTP 423; both forms disable those inputs. Employee master settings remain editable for future payroll.

The first successful salary posting captures the sheet. Later payments and repostings reuse it; they never overwrite it. A second active accrual for the same month is rejected. Reversing salary vouchers preserves the original saved sheet. Reposting after reversal uses the same saved figures; this change does not introduce an unlock/revision workflow. Existing bank/cash disbursement duplicate checks and voucher entry calculations remain in place.

## Months posted before this update

The old system did not store the complete sheet at posting time. The deployment archive script therefore captures the **current** sheet for each previously posted month as an explicitly labelled **captured after posting** baseline. It cannot recover an original roster or salary figure already changed before capture. The warning is visible on screen, print, slips, letters and Excel. No original voucher or ledger entry is rewritten to make it agree with this baseline.

`node scripts/archive-existing-salary-sheets.js` performs a read-only preview. Add `--commit` to capture missing old months. The script is idempotent and never replaces an existing saved copy. A failed month rolls back its capture and stops the script; already captured months remain saved, so it can safely be rerun. Older posted months not yet captured show a warning and remain read-only for salary-entry changes.

## Deployment

Run in Command Prompt on the live server:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 166_salary_sheet_snapshots.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && node scripts\archive-existing-salary-sheets.js --commit && pm2 save
```

Migration 166 must run before restarting the updated backend. The old-month capture runs after restart so posting and entry writers use the same month locks. Refresh the browser with Ctrl+F5. There are no new permission grants or account selections.

## Verification

- `npm test -- --runInBand __tests__/salarySheetSnapshot.test.js`
- `node scripts/verify-salary-sheet-snapshot.js` against local `temp_db1` only. Runs migration twice and actual accrual/disbursement controllers; verifies fixed copies after employee/settings changes, old employee slips and Excel, dynamic future months, edit rejection, duplicate accrual protection, atomic rollback after snapshot-write failure, labelled/idempotent legacy capture and the SQL immutable guard. All employee/account/voucher/schema fixtures roll back.

Snapshots live in `hr_SalarySheetSnapshots` and should be included in normal full database backups. SQL rejects updates/deletes to saved snapshots.
