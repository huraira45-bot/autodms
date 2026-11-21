# Parts discount on job invoices

Credit Invoice and GST Invoice previously used gross parts values without deducting saved DiscAmt. Credit Invoice also omitted the discount from Word/Excel exports. Work Order print already includes its Parts Discount summary and was not changed.

The invoice-data read endpoint now exposes GrossAmount and DiscountAmt and returns net Amount as IssueQuantity * ItemRate - saved DiscAmt. Insurance parts expose the same saved DiscAmt while retaining existing TotalAmount and depreciation semantics. Credit Invoice normalizes either insurance or regular print data, displays a per-line Discount column and gross/discount/net summary, and uses net parts plus snapshotted GST in its payable total. Word and Excel exports use those same rows and amounts. GST Invoice shows the saved per-line discount and its subtotal. Existing tax snapshots and insurance customer-share/depreciation totals are preserved. Stored job, accounting and stock data are not changed by this display fix.

Validation: production frontend build passed; 8 tests passed across jobInvoicePartsDiscount and triggerSafeOutput, covering both data sources, saved discount precedence, no discount, full discount, zero quantity and multiple lines with saved tax. Backend JavaScript syntax and diff whitespace checks passed.

Deploy manually: pull main, build Software/frontend and restart PM2. No migration is required. Reopen the invoice print after deployment.
