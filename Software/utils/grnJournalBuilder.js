/**
 * Pure journal-line builder for GRN finalize — new Master Motors format.
 * Source contract: owner spec dated 2026-06-30 (sales-tax-invoice layout).
 *
 * Each line carries: gross retail, primary discount, additional discount,
 * sales tax (GST), and AIT (advance income tax 236G). The voucher posts:
 *
 *   Dr Inventory — Parts            (sum of qty × Unit Retail; GROSS)
 *   Dr Input GST                    (sum of TaxAmount per line)
 *   Dr Advance Tax 236G             (sum of AITAmount per line)
 *       Cr Discount Received Parts  (sum of DiscountAmount across lines)   ← entry 1
 *       Cr Discount Received Parts  (sum of AdditionalDiscountAmount)      ← entry 2 (same account)
 *       Cr Supplier A/P leaf        (balancing — = invoice "Value Inc. Sales Tax" total)
 *
 * Inputs:
 *   grn        — { PurchaseID, PurchaseVoucherNo, PartyID }
 *   lines      — [{ ItemId, Quantity, ItemRate, TaxAmount, DiscountAmount,
 *                   AdditionalDiscountAmount, AITAmount, UnitLandedCost }]
 *   accounts   — { INVENTORY_PARTS, INPUT_GST,
 *                  PARTS_DISCOUNT_RECEIVED, ADVANCE_TAX_236G_PARTS } each { GLCAID }
 *   supplierGL — { GLCAID } — supplier's PartyGLID leaf (required).
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildGRNJournalLines({ grn, lines = [], accounts, supplierGL = null }) {
    if (!accounts) throw new Error('accounts map required');
    if (!grn) throw new Error('grn header required');
    if (!grn.PartyID) throw new Error('Supplier PartyID is required for GRN voucher posting.');
    if (!supplierGL?.GLCAID) {
        throw new Error('Supplier has no GL account set (PartyGLID is null). Edit the supplier party and assign one.');
    }
    if (!accounts.PARTS_DISCOUNT_RECEIVED?.GLCAID) {
        throw new Error('PARTS_DISCOUNT_RECEIVED system account not configured. Map GL "DISCOUNT RECEIVED ON PARTS" in Accounting Setup.');
    }
    if (!accounts.ADVANCE_TAX_236G_PARTS?.GLCAID) {
        throw new Error('ADVANCE_TAX_236G_PARTS system account not configured. Map GL "ADVANCE TAX ON PARTS 236G" in Accounting Setup.');
    }

    let inventoryDebit  = 0;   // Dr Inventory — gross retail per line
    let inputGSTTotal   = 0;
    let aitTotal        = 0;
    let discountTotal   = 0;   // primary discount across lines
    let addDiscountTotal = 0;  // additional discount across lines

    for (const l of lines) {
        const qty   = Number(l.Quantity) || 0;
        const rate  = Number(l.ItemRate) || 0;
        const gross = round2(qty * rate);
        inventoryDebit   = round2(inventoryDebit + gross);
        inputGSTTotal    = round2(inputGSTTotal + (Number(l.TaxAmount) || 0));
        aitTotal         = round2(aitTotal + (Number(l.AITAmount) || 0));
        discountTotal    = round2(discountTotal + (Number(l.DiscountAmount) || 0));
        addDiscountTotal = round2(addDiscountTotal + (Number(l.AdditionalDiscountAmount) || 0));
    }

    // Supplier A/P = balancing leg = Value Inc. Sales Tax total from the invoice.
    //               = Inventory(gross) + GST + AIT - Disc1 - Disc2
    const supplierCredit = round2(
        inventoryDebit + inputGSTTotal + aitTotal - discountTotal - addDiscountTotal
    );

    if (inventoryDebit <= 0 && inputGSTTotal <= 0 && aitTotal <= 0) {
        return {
            header: {
                SourceDocType: 'GRN', SourceDocID: grn.PurchaseID,
                Narration: `GRN ${grn.PurchaseVoucherNo || grn.PurchaseID} — no posting (empty)`,
                TotalAmount: 0,
            },
            lines: [], subsidiaryWrites: [],
            totals: { inventoryDebit: 0, inputGSTTotal: 0, aitTotal: 0,
                      discountTotal: 0, addDiscountTotal: 0, supplierCredit: 0 },
        };
    }

    const journalLines = [];
    const subsidiaryWrites = [];
    const narrationRef = grn.PurchaseVoucherNo || `GRN-${grn.PurchaseID}`;

    // (1) Dr Inventory — Parts (GROSS retail, no discount netting)
    journalLines.push({
        GLCAID: accounts.INVENTORY_PARTS.GLCAID,
        Debit: inventoryDebit, Credit: 0,
        Narration: `Parts received (gross) — ${narrationRef}`,
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

    // (3) Dr Advance Tax 236G (claimable against future income tax)
    if (aitTotal > 0) {
        journalLines.push({
            GLCAID: accounts.ADVANCE_TAX_236G_PARTS.GLCAID,
            Debit: aitTotal, Credit: 0,
            Narration: `Advance tax 236G on parts purchase — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (4) Cr Discount Received on Parts — PRIMARY discount (1st entry)
    if (discountTotal > 0) {
        journalLines.push({
            GLCAID: accounts.PARTS_DISCOUNT_RECEIVED.GLCAID,
            Debit: 0, Credit: discountTotal,
            Narration: `Trade discount on parts — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (5) Cr Discount Received on Parts — ADDITIONAL discount (2nd entry, SAME account)
    if (addDiscountTotal > 0) {
        journalLines.push({
            GLCAID: accounts.PARTS_DISCOUNT_RECEIVED.GLCAID,
            Debit: 0, Credit: addDiscountTotal,
            Narration: `Additional discount on parts — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (6) Cr supplier A/P leaf — balancing entry
    journalLines.push({
        GLCAID: supplierGL.GLCAID,
        Debit: 0, Credit: supplierCredit,
        Narration: `Supplier payable — ${narrationRef}`,
        PartyID: grn.PartyID, JobCardID: null,
    });
    subsidiaryWrites.push({
        GLCAID: supplierGL.GLCAID,
        Debit: 0, Credit: supplierCredit,
        PartyID: grn.PartyID, JobCardID: null,
        Narration: `Supplier payable — ${narrationRef}`,
    });

    // Balance check
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit  || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`GRN journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'GRN',
            SourceDocID: grn.PurchaseID,
            Narration: `GRN finalize — ${narrationRef}`,
            // Voucher TotalAmount = total Dr (= total Cr). Reflects the full
            // journal turnover, not just the supplier-payable balancing leg.
            TotalAmount: totalDr,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: {
            inventoryDebit, inputGSTTotal, aitTotal,
            discountTotal, addDiscountTotal, supplierCredit,
            totalDr, totalCr,
        },
    };
}

module.exports = { buildGRNJournalLines, round2 };
