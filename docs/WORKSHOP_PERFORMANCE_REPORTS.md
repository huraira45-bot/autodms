# Job Controller technician names and workshop performance

Job cards now show the assigned technicians in the job-card list, on each labour
line of the form, and on the printed Work Order. Multiple technicians on one card
are listed together; no assignment shows as Unassigned. Assignments still come
from Job Controller (`Addata_JobCardInfoDetail.TechnicianId / PerformedByName`).
Saved assignment names are preferred, with employee-name fallback for older lines.
Display does not provide another assignment editor or change financial figures.

**Workshop > Technician Performance**, also under **Reports > Workshop**:

- Summary by technician: unique job cards, work lines, completed lines, gross
  labour, discounts, net labour, recorded hours and average value per job.
- Job/work detail: RO and DMS numbers, customer, registration, Business Unit,
  technician, description, bay, start/finish, status and net labour.
- Date, technician, Business Unit, finalized/draft and job-search filters.
- Print and Excel-compatible CSV export; all filtered rows export/print,
  independently of on-screen pagination.

Business uses the actual billing convention: each labour line's Price is already
its total gross amount. Subtract DiscAmt, excluding sales tax. Legacy Quantity
does not multiply labour revenue. The prior mechanic report multiplied Quantity
and summed per-technician job counts, inflating shared-job totals; the replacement
uses one count per distinct card for the overall total. Each technician receives
only their assigned labour lines, never the entire job's parts/sublet revenue.
Unassigned and name-only legacy lines remain visible for reconciliation; the
unassigned bucket is excluded from highest/lowest technician comparisons.
Inactive employees with historical assignments remain selectable.

**Workshop > Department Performance**, also under **Reports > Workshop**:

- Departments mean the job card's **Business Unit / Job Type**, such as General
  Repair or Body & Paint. Technician HR departments are not used.
- Compare recorded net business, job counts, finalized/draft counts and average
  job value. Detail shows the contributing job cards and revenue components.
- Net business = labour after discount + parts after line discounts + customer
  sublet charges. Taxes, purchase cost, salaries and expenses are excluded; this
  is revenue performance, not a profit report or a measure of staff efficiency.
- Highest/lowest compare units with work in the selected scope, with equal totals
  sharing a rank. Separate source aggregation prevents double-counting when one
  job has multiple labour, parts-issue and sublet rows. Parts-only jobs are retained.

Both reports default to finalized jobs, by FinalizedAt with JobCardDate fallback.
Draft-only/all filters explicitly include estimated values. Date boundaries use
the complete selected days; values exactly at following midnight are excluded.
Valid recorded start/end times provide hours; missing/reversed times do not invent
worked hours. Zero-value work remains included.

Technician permission reuses `report:mechanic_productivity` (now labelled Technician
Performance in Admin Rights). Department report uses new
`report:workshop_department_performance`; Admin can grant it under Reports —
Workshop / Service. Main Admin has access automatically. Names on job cards use
the existing job-card view permission and do not require HR access. Old mechanic
URLs remain compatible and use the corrected report.

Migration **170_workshop_technician_display.sql** adds TechnicianNames to the
existing job-card view without replacing its other columns, and adds a covering
labour index for job-scoped assignment/revenue lookups. It preserves DOB, DMS
number and custom view columns, and can be run again. No assignment, finance,
stock or job-card data is rewritten.

Verification: focused workshop-performance/DMS-report Jest suites and local-only
`node scripts/verify-workshop-performance.js`. SQL verification applies migration
twice, tests names/card detail, shared jobs, unassigned/name-only technicians,
invoice-price convention, literal search, date boundaries, finalized/draft scope,
parts-only jobs, independent source aggregation and desk-save floor-field carry;
all synthetic records/schema changes roll back. Frontend production build.
An additionally attempted existing jobCardJournalBuilder suite fails at collection
because its sublet-vendor fixture omits a GL mapping for vendor #9; neither that
suite nor the unchanged financial builder was modified for this feature.

Manual live-server update, Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 170_workshop_technician_display.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh with Ctrl+F5. Grant the department report permission to non-Admin roles
as needed. Existing Job Controller assignments appear after reloading each card.
