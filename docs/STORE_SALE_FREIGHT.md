# Store Sale freight recovery

Store Sale headers and prints included Delivery Expense, but finalization omitted that field from the posted invoice journal. Receive Payment correctly used the smaller posted voucher total. This fix includes freight in the invoice receivable and credits the configurable `STORE_SALE_FREIGHT_RECOVERY` account. Goods revenue, discounts, GST, COGS and stock quantities retain their existing calculation. Finalization creates no receipt. Campaign benefits cover goods only, leaving freight payable by the customer.

Apply migration `171_store_sale_freight_recovery.sql`. It extends the installed role constraint without replacing existing role values or choosing an account. In Accounting Setup, map **Store Sale Freight / Delivery Recovery** to the intended expense recovery or income account. Sales without freight need no new mapping. Sales with freight fail clearly if the mapping is missing.

For this dealership, the owner approved crediting **502003029 FREIGHT EXPENSE (PARTS)**. SAL-01173 / SS-1336 was corrected on the live database on 4 November 2026: General Customer debit increased by PKR 600 to PKR 138,600 and one PKR 600 freight recovery credit was added. BRV-2681 remained Posted for PKR 138,000 with its allocation intact. A before/after VOUCHER_EDIT record was saved. Other original lines, stock, tax and sale header were unchanged. Private evidence remains outside Git.

The maintenance command previews by default and supports only finalized walk-in sales with an exact, verified freight omission. It requires the expected voucher ID, explicit credit account and reason, records a main Administrator maintenance actor, runs serializably, and refuses campaigns, subsidiary entries, conflicting mappings or unexpected values. It retains original line IDs and verifies related receipts have not changed. Repeating a completed correction adds no second credit or edit record. `--configure-role` additionally installs the approved account mapping with its own configuration audit, after migration 171; it also works when the invoice is already corrected.

```cmd
node scripts\correct-store-sale-freight.js --sale-id 1173 --voucher-id 12069 --credit-code 502003029 --reason "Owner approved parts freight recovery account" --configure-role --commit
```

Source/schema/application deployment remains manual on the server. The live invoice correction is already committed; do not unfinalize the Store Sale to repair its freight. The receipt can be amended separately to the amount actually received. Keep its invoice allocation and do not create a duplicate receipt.

Validation: 39 focused Jest tests (`storeSaleFreight.test.js`, `voucherEditHistory.test.js`); rollback-only local SQL verifier `scripts/verify-store-sale-freight.js` exercises real posting, the correction, unchanged receipt allocation, balance 138600/138000/600, strict edit history, account setup and repeat no-op. Existing historical builder tests expect obsolete automatic receipt behavior and were not changed. No frontend changes are needed for freight; the existing Accounting Setup page reads the server role list.

## Missing setup and edited-sale save safety

If saving with Delivery Expense reports that STORE_SALE_FREIGHT_RECOVERY is not configured, apply migration171 before mapping that new role. Pulling application source alone does not apply this database constraint update. A setup-only CLI is available:

```cmd
node scripts\run-pending-migrations.js --only 171_store_sale_freight_recovery.sql
node scripts\configure-store-sale-freight.js --credit-code 502003029 --reason "Owner approved parts freight recovery account" --commit
```

The CLI previews/rolls back by default. With --commit it creates only the account mapping and configuration audit; it does not change invoices, receipts, stock or journals. It requires a unique leaf account and an active main Administrator for attribution, refuses to replace a different existing mapping, and adds no duplicate audit when already configured correctly. The owner previously approved 502003029 FREIGHT EXPENSE (PARTS).

New and edited Store Sales now check freight setup before changing records. Editing and re-finalizing a Store Sale share one transaction, so a posting failure restores the original draft header and details rather than committing the edit without its invoice voucher. Existing finalized-sale edit protection remains. A draft left by an earlier partial save should be reopened and saved after setup is completed; the mapping command does not repost it automatically.

Validation:30 tests across storeSaleAtomicUpdate,storeSaleFreight and storeSaleFreightSetup pass, covering balanced freight amounts, atomic posting rollback, missing/invalid setup rejection, zero freight, finalized guards, setup preview/commit/idempotence/conflicts and configuration rollback. No live schema, mapping or financial changes were applied by the assistant for this fix; server migration/setup/deployment and resaving the affected draft are manual.
