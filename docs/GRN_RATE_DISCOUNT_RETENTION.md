# GRN sale rate and discount retention

New GRNs passed the discount to sp_SavePurchaseGRN as an amount. The legacy procedure consequently left DiscountPercentage at zero; reopening recalculated the displayed discount from that zero percentage. The form also omitted the saved detail ItemSalesPrice when reopening, and updating a GRN omitted that column from the replacement details.

The create follow-up patch now saves DiscountPercentage, DiscountAmount and ItemSalesPrice together with the existing GST/additional-discount/AIT fields. Creation, the existing stored procedure, document counter, metadata and line patches run in one outer transaction; missing purchase IDs, mismatched line counts and patch failures abort the save. The stored procedure is unchanged. Edit saves ItemSalesPrice in each replacement detail. Reopening restores SalesRate from the GRN detail, with a catalog fallback only when the saved value is null/missing. Explicit zero remains zero. Existing finalized-record and stock-link guards remain in place. Edits do not introduce a new catalog sale-price update.

No migration is needed and no existing GRN, stock or voucher was rewritten. Values already lost in an earlier save cannot reliably be reconstructed; correct those through the existing edit/unfinalize workflow as needed. New saves retain the entered values immediately.

Validation: eight focused tests cover first create/reopen, distinct multi-line values, subsequent edit/reopen, explicit zero, failed-patch/metadata rollback, empty-create rejection and finalized edits. Frontend production build passed. An additional local actual-SQL verification was attempted but the development database connection was unavailable; no actual-SQL success or browser interaction test is claimed.

Deploy with git pull, rebuild Software/frontend and restart the PM2 application, then Ctrl+F5 the GRN page.
