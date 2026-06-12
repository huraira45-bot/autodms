/**
 * Pure journal-line builder for GRN (Goods Receipt Note) finalize.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.7
 *
 * No DB access. Returns a balanced 3-line voucher (or 4-line if there's a freight
 * payment leg — currently freight is part of the supplier invoice per Decision §14.7).
 *
 * Inputs:
 *   grn       — { PurchaseID, PurchaseVoucherNo, PartyID (supplier), FreightAmount,
 *                 NetDiscount (trade discount, post-tax), FreightTaxable }
 *   lines     — [{ ItemId, Quantity, ItemRate, TaxRate, TaxAmount, UnitLandedCost }]
 *   accounts  — { INVENTORY_PARTS, INPUT_GST, TRADE_CREDITORS } each { GLCAID }
 *
 * Output:
 *   { header, lines, subsidiaryWrites, totals }
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildGRNJournalLines({ grn, lines = [], accounts }) {
    if (!accounts) throw new Error('accounts map required');
    if (!grn) throw new Error('grn header required');
    if (!grn.PartyID) throw new Error('Supplier PartyID is required for GRN voucher posting.');

    // Aggregate from snapshot columns. Inventory debit = sum of (line.qty × line.UnitLandedCost).
    // Input GST = sum of line TaxAmount (snapshot already accounts for freight-taxable split).
    let inventoryDebit = 0;
    let inputGSTTotal = 0;
    let grossSubtotal = 0;

    for (const l of lines) {
        const qty = Number(l.Quantity) || 0;
        const unitLanded = Number(l.UnitLandedCost) || 0;
        const lineLanded = round2(qty * unitLanded);
        inventoryDebit = round2(inventoryDebit + lineLanded);
        inputGSTTotal = round2(inputGSTTotal + (Number(l.TaxAmount) || 0));
        grossSubtotal = round2(grossSubtotal + qty * (Number(l.ItemRate) || 0));
    }

    // Supplier credit = inventory debit + input GST debit (balanced by definition)
    const supplierCredit = round2(inventoryDebit + inputGSTTotal);

    if (inventoryDebit <= 0 && inputGSTTotal <= 0) {
        // Empty GRN — nothing to post
        return {
            header: {
                SourceDocType: 'GRN', SourceDocID: grn.PurchaseID,
                Narration: `GRN ${grn.PurchaseVoucherNo || grn.PurchaseID} — no posting (empty)`,
                TotalAmount: 0,
            },
            lines: [], subsidiaryWrites: [],
            totals: { inventoryDebit: 0, inputGSTTotal: 0, supplierCredit: 0, grossSubtotal: 0 },
        };
    }

    const journalLines = [];
    const subsidiaryWrites = [];
    const narrationRef = grn.PurchaseVoucherNo || `GRN-${grn.PurchaseID}`;

    // (1) Dr Inventory — Parts (landed cost)
    journalLines.push({
        GLCAID: accounts.INVENTORY_PARTS.GLCAID,
        Debit: inventoryDebit, Credit: 0,
        Narration: `Parts received (landed cost) — ${narrationRef}`,
        PartyID: null, JobCardID: null,
    });

    // (2) Dr Input GST (claimable from FBR)
    if (inputGSTTotal > 0) {
        journalLines.push({
            GLCAID: accounts.INPUT_GST.GLCAID,
            Debit: inputGSTTotal, Credit: 0,
            Narration: `Input GST on supplier invoice — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (3) Cr Trade Creditors — supplier subsidiary
    journalLines.push({
        GLCAID: accounts.TRADE_CREDITORS.GLCAID,
        Debit: 0, Credit: supplierCredit,
        Narration: `Supplier payable — ${narrationRef}`,
        PartyID: grn.PartyID, JobCardID: null,
    });
    subsidiaryWrites.push({
        GLCAID: accounts.TRADE_CREDITORS.GLCAID,
        Debit: 0, Credit: supplierCredit,
        PartyID: grn.PartyID, JobCardID: null,
        Narration: `Supplier payable — ${narrationRef}`,
    });

    // ---- Balance check ----
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`GRN journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'GRN',
            SourceDocID: grn.PurchaseID,
            Narration: `GRN finalize — ${narrationRef}`,
            TotalAmount: supplierCredit,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: {
            grossSubtotal,
            inventoryDebit, inputGSTTotal, supplierCredit,
            totalDr, totalCr,
        },
    };
}

/**
 * Calculates per-line tax + landed cost for a GRN, given its header + lines.
 * Used by the save controller to snapshot at save time (§14.4).
 *
 * Returns: [{ PurchaseDetailID, TaxRate, TaxAmount, UnitLandedCost }]
 *
 * Inputs:
 *   header    — { NetDiscount (trade discount), FreightAmount, FreightTaxable }
 *   lines     — [{ PurchaseDetailID, Quantity, ItemRate }]
 *   gstRate   — current GST rate (decimal)
 */
function snapshotGRNLines({ header, lines, gstRate }) {
    const grossSum = lines.reduce((s, l) => s + (Number(l.Quantity) || 0) * (Number(l.ItemRate) || 0), 0);
    if (grossSum === 0) return lines.map(l => ({ PurchaseDetailID: l.PurchaseDetailID, TaxRate: gstRate, TaxAmount: 0, UnitLandedCost: 0 }));

    const tradeDiscount = Number(header.NetDiscount) || 0;
    const freightAmount = Number(header.FreightAmount) || 0;
    const freightTaxable = !!header.FreightTaxable;

    return lines.map(l => {
        const qty = Number(l.Quantity) || 0;
        const rate = Number(l.ItemRate) || 0;
        const lineGross = qty * rate;
        const ratio = lineGross / grossSum;
        const discShare = round2(ratio * tradeDiscount);
        const freightShare = round2(ratio * freightAmount);
        // Inventory unit cost includes freight + minus discount share
        const landedLineTotal = round2(lineGross - discShare + freightShare);
        const unitLandedCost = qty > 0 ? round2(landedLineTotal / qty) : 0;
        // GST: on (lineGross + freightShare if taxable). Discount is post-tax so doesn't reduce GST base.
        const lineTaxableBase = round2(lineGross + (freightTaxable ? freightShare : 0));
        const lineTax = round2(lineTaxableBase * gstRate / 100);
        return {
            PurchaseDetailID: l.PurchaseDetailID,
            TaxRate: gstRate,
            TaxAmount: lineTax,
            UnitLandedCost: unitLandedCost,
        };
    });
}

module.exports = { buildGRNJournalLines, snapshotGRNLines, round2 };
