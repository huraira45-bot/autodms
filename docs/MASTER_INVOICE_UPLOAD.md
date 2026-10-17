# Master invoice upload and incentives

On a booking, **Record Master Invoice** stays available until invoice number, date and an actual PDF/image file have been saved together. It is available after gate pass, delivery and closure, including historical bookings and historical records without an allocated chassis. Cancelled bookings are excluded. Recording requires `sales_master_settlement`, `sales_admin_settings` or `sales_gm`.

After saving, the button is replaced by **Master invoice uploaded**, the invoice number/date and a view/download link. The file also appears in Documents as `MasterInvoice`. PDF/JPG/PNG/WEBP/GIF files up to 10 MB are accepted. Entering a number/date without the file cannot complete the record. Duplicate submissions are rejected. If an authorized user soft-deletes the supporting document, completion clears and the invoice can be uploaded again; old document/audit evidence remains.

Upload records the document, metadata, authenticated actor and booking audit/timeline atomically. It does not change booking status, prices, payments, stock, vouchers or incentive accruals. Failed writes roll back and discard the newly uploaded file.

## Master incentive rules

- **Historical bookings:** upload and retain the invoice only. New Master incentive accrual is blocked in the application and database, even when the invoice exists.
- **Regular bookings:** a saved, active invoice upload is required before **Process Master Incentive** is available. Processing uses the same invoice number/date and existing Master standard/campaign calculations and voucher review workflow. A booking with existing active Master accruals, an active Master invoice voucher, or a completed processing marker cannot be processed twice.
- Regular bookings can be processed after gate pass or closure if an allocated vehicle exists. Their later booking status is preserved. Finalizing the draft voucher only advances bookings still in `MasterInvoicePending` (existing hook behavior).
- Sales staff incentive policy, amount and trigger timing remain unchanged, as the user explicitly requested. Its INSERT now uses `OUTPUT ... INTO` so it remains compatible with the new database trigger.
- Existing historical/regular accruals are not reversed or recalculated by migration. The SQL trigger guards new/reactivated/changed Master accruals and exempts existing ordinary disbursement updates and employee rows.

The previous invoice-accounting action is labelled **Process Master Incentive** to distinguish financial processing from uploading the actual invoice. Uploading alone creates no incentive or voucher.

## Implementation and deployment

Migration `160_booking_master_invoice_documents.sql` adds the document type, `dms_BookingMasterInvoices` metadata/processing marker and the Master accrual guard trigger. `POST /api/sales/bookings/:id/master-invoice-document` accepts multipart `file`, `MasterInvoiceNo`, `MasterInvoiceDate` and optional `Notes`. Booking details return the active document link and invoice metadata. General document deletion checks the booking ID as well as document ID.

After the update is pushed, run this as **one line in Command Prompt on the server**, then refresh the browser. Build first, then stop the app briefly while the migration is applied: the new SQL trigger requires the updated incentive INSERT statements.

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 stop autodms && node scripts\run-pending-migrations.js --only 160_booking_master_invoice_documents.sql && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

## Validation

- 88 tests passed across Master invoice document, Master payment void and delivery-month suites.
- Real local SQL rollback verifier: `node Software/scripts/verify-master-invoice-documents.js`. Checks regular/closed and historical/gate-passed uploads, booking-detail API metadata, unchanged financial/stock/state snapshots during upload, duplicate/missing-invoice/historical guards, real late incentive processing that preserves Closed, database enforcement and continued employee accrual eligibility. All fixtures roll back; it does not upload physical files.
- Frontend production build passed. File-validation/failed-upload cleanup/retention are covered by controller tests; browser interaction was not tested.
- Broader Jest run: 22 suites passed (449 tests); four unchanged journal-builder suites failed (payment/store-sale assertions and job-card/GRTN fixture initialization). Those test files and their utility code have no diff against the pre-feature commit; they import the unchanged utilities directly. No unrelated journal behavior was modified for this feature.
- No live records or server deployment were performed by the agent.
