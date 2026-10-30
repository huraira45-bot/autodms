# DMS Job Card Lookup

Open **Workshop > DMS Job Card Lookup**, or **Reports > Workshop > DMS Job Card Lookup**.
Leave the DMS number blank and select both **From** and **To** dates to show all job cards in that period, including cards with no DMS number recorded.
To narrow the results, enter a full or partial external DMS job card number and click **Search** (or press Enter).
The report searches the existing `Addata_JobCardInfo.DMSJobCardNo` field, which is separate from the internal RO/job number.

- **Contains** is the default; **Exact number** restricts results to that number. Leading zeros and punctuation are preserved. SQL wildcard characters are treated literally.
- A DMS-number search includes all dates unless filtered. A blank-number search requires both dates. Date filters use **Job Card Date**, with the To date inclusive. Draft, finalized and closed cards are included unless filtered.
- **Clear** removes the DMS-number filter while retaining the selected dates, showing every job card in that period.
- If several job cards share a DMS number, every matching card appears. Exact matches appear first, then newest job card dates.
- Results include DMS/RO/internal job numbers, customer/CNIC/phone/credit party, vehicle/chassis/model, business unit, advisor, payment type, job status and finalization status.
- Click the RO number to open the matching job card if you have Job Cards view permission.
- Print and Excel-compatible CSV export include all matching rows, across pages.

Access uses existing **Job Cards: View** or **Job Card Register** report permission. No additional grants or migration are needed; the DMS-number column was introduced by migration 086. The report only reads data and does not affect billing, stock or the ledger.

Deploy from Command Prompt on the live server after the commit is pushed:

```cmd
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software\frontend && npm run build && cd .. && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save
```

Refresh the browser with Ctrl+F5 after deployment.

Verification: `npm test -- --runInBand __tests__/dmsJobCardReport.test.js` and, against the local `temp_db1` development database only, `node scripts/verify-dms-job-card-report.js`. The latter rolls back every fixture.
