# Sales executive setup

Vehicle Sales > **Sales Executives** lets Administrator or a user with
`sales_admin_settings` enable existing active employees for booking assignment.
It does not grant login permissions or change HR/payroll settings.

The list starts empty. After deployment, enable your salespeople once. Ordinary
sales users can read the enabled list without HR access, but cannot manage it.
Disable removes someone from future assignment choices; previous bookings and
report filters retain their assignments and history. Inactive/resigned employees
are excluded even if still enabled in this setup.

New Booking, Historical Booking and Change Executive share this list. Users with
the existing booking-create permission can select an enabled executive. Their own
linked employee is preselected when eligible. Administrators can select another
executive even when their login is not linked to an employee. Discount proposals
still require a linked employee to identify the actual proposer.

Both creation endpoints and reassignment validate membership and HR availability
inside the booking transaction; sending an arbitrary employee ID directly to the
API cannot bypass the list. Roster/HR read locks are held until the booking saves.
Existing Closed/Cancelled reassignment restrictions remain in effect. Staff
incentives use the selected booking executive through the existing workflow;
audit/timeline and discount proposals identify the actual operator.

Migration **168_sales_executives.sql** creates `dms_SalesExecutives` plus
`dms_SalesExecutiveChanges` (who enabled/disabled whom and when). Saves and audit
entries commit together. No bookings, assignments or vouchers are changed by
setup or migration; no existing employee is automatically enrolled. Reassignment
also records its old/new employee IDs and actor in the sales audit log.

APIs: `GET /api/sales/executives` (booking choices),
`GET /api/sales/executives/setup` (settings),
`PUT /api/sales/executives/:id` with `{ "IsEnabled": true | false }`.
Missing migration returns an actionable 503 instead of showing all employees.

Validation: focused Jest coverage covers permissions, enrollment, validation,
creation/reassignment and rollback on audit failure. Run
`node scripts/verify-sales-executives.js` from Software for a local-only SQL
verification: migration twice, actual enable/disable, inactive/resigned employee
exclusion, and existing booking/finance preservation; all changes roll back.

Manual live-server deployment (Command Prompt, one line):

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && node scripts\run-pending-migrations.js --only 167_delivered_chassis_corrections.sql && node scripts\run-pending-migrations.js --only 168_sales_executives.sql && cd frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

167 is included for the previous release's delivery-lock dependency; it is skipped
when already applied. This command does not execute the separate chassis
correction maintenance command. Refresh with Ctrl+F5, open Sales Executives and
enable the desired employees before creating another booking.
