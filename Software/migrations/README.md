# Migrations

Sequentially numbered SQL files. Each migration is **additive only** — no drops, no renames.

## Apply a migration

```powershell
sqlcmd -S localhost -d temp_db1 -E -i Software\migrations\001_accounting_foundation.sql
```

## File naming

`NNN_short_description.sql` — e.g., `001_accounting_foundation.sql`. Numbers must be unique and increase monotonically.

## Idempotency

Every migration guards each change with `IF NOT EXISTS` / `IF NOT EXISTS (...)` so re-running is safe.

## History

| # | File | Applied | Purpose |
|---|------|---------|---------|
| 001 | `001_accounting_foundation.sql` | 2026-05-12 | Accounting module foundation: system accounts, tax rates, audit tables, voucher status, subsidiary ledger, party type, balanced-entry trigger |
| 002 | `002_seed_coa_and_system_accounts.sql` | 2026-05-12 | Soft-delete 3 test COA entries. Seed full §14.2 hierarchy (5 root classes + 6 mid-level parents + 22 leaf accounts). Auto-assign 12 system roles + audit rows. |
| 003 | `003_seed_default_tax_rates.sql` | 2026-05-12 | Seed GST 17% and PST 16% effective today. |
| 004 | `004_jobcard_tax_snapshot.sql` | 2026-05-12 | Add TaxRate/TaxAmount columns to Job Card labour/sublet detail tables + UnitLandedCost. |
| 005 | `005_partsissue_detail_tax_snapshot.sql` | 2026-05-12 | Corrects 004's mis-placement of parts-issue columns: adds TaxRate/TaxAmount/UnitLandedCost/Discount/DiscAmt to `data_StockIssuetoJobCardDetail` (the LINE table). Header columns from 004 left in place (unused). |
| 006 | `006_grn_tax_snapshot.sql` | 2026-05-12 | GRN: add `FreightTaxable BIT DEFAULT 1` to `data_PurchaseInfo`; add `TaxRate`, `TaxAmount`, `UnitLandedCost` to `data_PurchaseDetail`. |
| 007 | `007_grtn_tax_snapshot.sql` | 2026-05-12 | GRTN: add `TaxRate`, `TaxAmount`, `UnitLandedCost` to `data_PurchaseReturnDetail`. Carrying cost is looked up from original GRN line via existing `PurchaseDetailId` back-reference. |
| 008 | `008_storesale_finalize_and_snapshot.sql` | 2026-05-12 | Store Sale: add finalize lifecycle columns (`IsFinalized`, `FinalizedBy`, etc.) + `CreatedBy`/`CreatedByName` + `PaymentBankID` to `data_StoreSaleInfo`. Add `UnitLandedCost` to `data_StoreSaleDetail`. |
| 009 | `009_ssr_finalize_and_snapshot.sql` | 2026-05-12 | SSR: add finalize lifecycle + creator + `RefundMode`/`RefundBankID` to `data_StoreSaleReturnInfo`. Add `UnitLandedCost` to `data_StoreSaleReturnDetail`. |
| 010 | `010_voucher_allocation.sql` | 2026-05-12 | Add `AllocatedToVoucherID INT NULL` to `data_FinanceVoucherDetail` and `dms_PartyLedger` (self-FK to voucher). Enables per-invoice allocation tracking for Receive/Make Payment. |
