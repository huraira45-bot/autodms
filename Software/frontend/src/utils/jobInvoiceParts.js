export function invoicePart(row) {
    const qty = Number(row.Qty ?? row.IssueQuantity ?? 0) || 0;
    const rate = Number(row.Rate ?? row.ItemRate ?? 0) || 0;
    const gross = Number(row.TotalAmount ?? (qty * rate)) || 0;
    const discount = Number(row.DiscAmt ?? row.DiscountAmt ?? 0) || 0;
    return { ...row, ItemNumber: row.ItemNumber ?? row.ManualNumber, Qty: qty, Rate: rate,
        GrossAmount: gross, DiscountAmount: discount, TotalAmount: gross - discount,
        TaxAmount: Number(row.TaxAmount) || 0, DepreciationPct: Number(row.DepreciationPct) || 0,
        DepAmount: Number(row.DepAmount) || 0 };
}
