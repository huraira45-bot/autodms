/**
 * Pure journal-line builder for GTRN (Goods Return Note) finalize.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.8.
 *
 * No DB access. Produces a balanced 3-4 line voucher:
 *   Dr Trade Creditors (supplier)
 *   Cr Inventory - Parts (at LANDED cost, not supplier list price)
 *   Cr Input GST                          [if supplier credited GST]
 *   Cr Purchase Return Variance (income)  [if variance ≠ 0]
 *
 * The variance line captures the small benefit retained when the supplier
 * credits at list price but we removed inventory at our landed cost
 * (which already absorbed proportional trade discount + freight from
 * the original GRN — Decision #16).
 *
 * Inputs:
 *   grtn      — { PurchaseReturnID, PurchaseReturnNo, PartyID (supplier), PurchaseID (parent GRN) }
 *   lines     — [{ Quantity, ItemRate, TaxRate, TaxAmount, UnitLandedCost }]
 *   accounts  — { INVENTORY_PARTS, INPUT_GST, TRADE_CREDITORS, PURCHASE_RETURN_VARIANCE } each { GLCAID }
 *
 * Output:
 *   { header, lines, subsidiaryWrites, totals }
 */

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildGRTNJournalLines({ grtn, lines = [], accounts }) {
    if (!accounts) throw new Error('accounts map required');
    if (!grtn) throw new Error('grtn header required');
    if (!grtn.PartyID) throw new Error('Supplier PartyID is required for GRTN voucher posting.');

    // Aggregate from snapshot columns
    let inventoryCredit = 0;          // sum of (qty × UnitLandedCost) — our carrying cost
    let inputGSTReverse = 0;          // sum of line TaxAmount — what supplier credits back
    let supplierGrossCredit = 0;      // sum of (qty × ItemRate) — supplier's list-price credit
    let supplierTaxCredit = 0;        // same as inputGSTReverse — what supplier shows on credit note

    for (const l of lines) {
        const qty = Number(l.Quantity) || 0;
        const unitLanded = Number(l.UnitLandedCost) || 0;
        const itemRate = Number(l.ItemRate) || 0;
        const lineTax = Number(l.TaxAmount) || 0;

        inventoryCredit = round2(inventoryCredit + qty * unitLanded);
        inputGSTReverse = round2(inputGSTReverse + lineTax);
        supplierGrossCredit = round2(supplierGrossCredit + qty * itemRate);
    }
    supplierTaxCredit = inputGSTReverse;
    // Supplier's credit note total = list-price subtotal + GST
    const supplierDebit = round2(supplierGrossCredit + supplierTaxCredit);

    // Variance = supplier credit - (our inventory carrying cost + GST we reverse)
    // > 0 means income (we kept some apportioned discount/freight benefit)
    // < 0 means loss (rare — would only happen if landed cost > list price)
    const variance = round2(supplierDebit - inventoryCredit - inputGSTReverse);

    if (supplierDebit === 0 && inventoryCredit === 0) {
        return {
            header: {
                SourceDocType: 'GRTN', SourceDocID: grtn.PurchaseReturnID,
                Narration: `GRTN ${grtn.PurchaseReturnNo || grtn.PurchaseReturnID} — empty`,
                TotalAmount: 0,
            },
            lines: [], subsidiaryWrites: [],
            totals: { inventoryCredit: 0, inputGSTReverse: 0, supplierDebit: 0, variance: 0 },
        };
    }

    const journalLines = [];
    const subsidiaryWrites = [];
    const narrationRef = grtn.PurchaseReturnNo || `GRTN-${grtn.PurchaseReturnID}`;

    // (1) Dr Trade Creditors (reduce what we owe the supplier)
    journalLines.push({
        GLCAID: accounts.TRADE_CREDITORS.GLCAID,
        Debit: supplierDebit, Credit: 0,
        Narration: `Supplier credit note — ${narrationRef}`,
        PartyID: grtn.PartyID, JobCardID: null,
    });
    subsidiaryWrites.push({
        GLCAID: accounts.TRADE_CREDITORS.GLCAID,
        Debit: supplierDebit, Credit: 0,
        PartyID: grtn.PartyID, JobCardID: null,
        Narration: `Supplier credit note — ${narrationRef}`,
    });

    // (2) Cr Inventory — Parts (at carrying cost — Decision #16)
    if (inventoryCredit > 0) {
        journalLines.push({
            GLCAID: accounts.INVENTORY_PARTS.GLCAID,
            Debit: 0, Credit: inventoryCredit,
            Narration: `Parts returned (landed cost) — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (3) Cr Input GST (reverse our claim — supplier's credit note reverses their output GST)
    if (inputGSTReverse > 0) {
        journalLines.push({
            GLCAID: accounts.INPUT_GST.GLCAID,
            Debit: 0, Credit: inputGSTReverse,
            Narration: `Reverse Input GST — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (4) Variance — only if non-zero
    if (Math.abs(variance) > 0.005) {
        if (variance > 0) {
            // Income — supplier credited more than our carrying cost (we kept the benefit)
            journalLines.push({
                GLCAID: accounts.PURCHASE_RETURN_VARIANCE.GLCAID,
                Debit: 0, Credit: variance,
                Narration: `Variance benefit — ${narrationRef}`,
                PartyID: null, JobCardID: null,
            });
        } else {
            // Loss — rare case where landed cost > list price (e.g. price rose after purchase)
            journalLines.push({
                GLCAID: accounts.PURCHASE_RETURN_VARIANCE.GLCAID,
                Debit: -variance, Credit: 0,
                Narration: `Variance loss — ${narrationRef}`,
                PartyID: null, JobCardID: null,
            });
        }
    }

    // Balance check
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`GRTN journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'GRTN',
            SourceDocID: grtn.PurchaseReturnID,
            Narration: `GRTN finalize — ${narrationRef}`,
            TotalAmount: supplierDebit,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: {
            supplierDebit, inventoryCredit, inputGSTReverse, variance,
            totalDr, totalCr,
        },
    };
}

/**
 * Builds the per-line snapshot for a GRTN at save time.
 * Reads the original GRN line's TaxRate + UnitLandedCost (passed in as part of `lines`),
 * computes line GST = (qty × ItemRate) × TaxRate / 100.
 *
 * Inputs:
 *   lines — [{ PurchaseReturnDetailID, Quantity, ItemRate, OriginalTaxRate, OriginalLandedCost }]
 * Output:
 *   [{ PurchaseReturnDetailID, TaxRate, TaxAmount, UnitLandedCost }]
 */
function snapshotGRTNLines({ lines }) {
    return lines.map(l => {
        const qty = Number(l.Quantity) || 0;
        const rate = Number(l.ItemRate) || 0;
        const taxRate = Number(l.OriginalTaxRate) || 0;
        const lineTax = round2(qty * rate * taxRate / 100);
        return {
            PurchaseReturnDetailID: l.PurchaseReturnDetailID,
            TaxRate: taxRate,
            TaxAmount: lineTax,
            UnitLandedCost: round2(Number(l.OriginalLandedCost) || 0),
        };
    });
}

module.exports = { buildGRTNJournalLines, snapshotGRTNLines, round2 };
