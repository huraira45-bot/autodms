# Parts GRN supplier changes

Changing the supplier on an editable Parts GRN previously returned a successful save, but reopening the document showed the old supplier. The update wrote only `data_PurchaseInfo.PartyID`; `vw_PurchaseGRNHeader` reads `PurchasedParty AS PartyID` and joins supplier details through that column.

The update now saves both `PurchasedParty` and `PartyID` in the existing transaction. The linked purchase stock header continues to receive the selected supplier, matching the existing new-GRN stored procedure's use of both header fields. The detail, list/search and print endpoints consequently resolve the same supplier. No stored procedure or view is changed.

Existing records are not bulk rewritten: selecting the intended supplier and saving an unfinalized GRN corrects both fields. Finalized GRNs retain their existing lock and require the established approved unfinalize workflow before editing. Existing posted vouchers are not reassigned by this fix.

## Server update

This is a backend-only fix. No migration, dependency install or frontend build is needed. Run this single line in the live server's Command Prompt:

```bat
cd /d "D:\saher 2.0\autodms" && git -c gc.auto=0 -c maintenance.auto=false pull --ff-only && cd Software && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save && git log -1 --oneline
```

Reopen the affected editable GRN, select the correct supplier, save, and reopen it to confirm.

## Verification

```powershell
cd Software
node --check controllers/grnController.js
node scripts/verify-grn-supplier-update.js
```

The SQL verifier refuses remote targets and rolls back all fixtures. It reproduces the old inconsistent-header state, calls the actual update and detail/list/print controllers against SQL Server, and verifies the new supplier's ID/name/NTN. It also checks unchanged stock quantities/rates and financial counts/amounts, rollback when stock resynchronization fails, and HTTP 423 for finalized edits. No browser interaction test is claimed.
