/**
 * Pure journal-line builder for Store Sale (counter sale of parts) finalize.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.9.
 *
 * Same shape as Job Card builder but parts-only (no labour, no sublet, no PST).
 * GST applies on parts. Care-Off discount optional.
 *
 * Inputs:
 *   storeSale  — { SaleID, InvoiceNo, PaymentMode, PartyID, PaymentBankID }
 *   lines      — [{ Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, UnitLandedCost }]
 *   accounts   — { CASH_BOOK, GENERAL_CUSTOMER, GST_PAYABLE, DEFAULT_DISCOUNT_GIVEN,
 *                  POS_CLEARING, CHEQUES_ON_HAND, PARTS_REVENUE,
 *                  COGS_PARTS, INVENTORY_PARTS, TRADE_DEBTORS } — each { GLCAID }
 *   paymentBank — { GLCAID } for Bank Transfer mode
 *
 * Output: same shape as jobCardJournalBuilder.
 */

const PAYMENT_MODES = {
    Cash: 'CASH_BOOK',
    POS: 'POS_CLEARING',
    Cheque: 'CHEQUES_ON_HAND',
    'Bank Transfer': '__BANK__',
    Credit: null,
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildStoreSaleJournalLines({ storeSale, lines = [], accounts, paymentBank = null }) {
    if (!accounts) throw new Error('accounts map required');
    if (!storeSale) throw new Error('storeSale header required');

    // Aggregate
    let partsGross = 0, partsDiscount = 0, partsTax = 0, partsCOGS = 0;
    for (const l of lines) {
        const qty = Number(l.Quantity) || 0;
        const rate = Number(l.SaleRate) || 0;
        const lineGross = round2(qty * rate);
        const lineDisc = round2(Number(l.DiscountAmount) || 0);
        const lineTax = round2(Number(l.TaxAmount) || 0);
        const lineCost = round2(qty * (Number(l.UnitLandedCost) || 0));
        partsGross += lineGross;
        partsDiscount += lineDisc;
        partsTax += lineTax;
        partsCOGS += lineCost;
    }
    partsGross = round2(partsGross);
    partsDiscount = round2(partsDiscount);
    partsTax = round2(partsTax);
    partsCOGS = round2(partsCOGS);

    const customerPays = round2(partsGross - partsDiscount + partsTax);

    // Resolve payment-side
    const paymentMode = storeSale.PaymentMode || 'Cash';
    let paymentSideAccount = null;
    let customerSubsidiaryAccount = null;
    let partyTagForInvoiceLeg = null;

    if (paymentMode === 'Credit') {
        if (!storeSale.PartyID) throw new Error('Credit Store Sale requires PartyID (named credit party).');
        customerSubsidiaryAccount = accounts.TRADE_DEBTORS;
        partyTagForInvoiceLeg = storeSale.PartyID;
    } else {
        customerSubsidiaryAccount = accounts.GENERAL_CUSTOMER;
        if (paymentMode === 'Bank Transfer') {
            if (!paymentBank || !paymentBank.GLCAID) throw new Error('Bank Transfer requires a paymentBank account.');
            paymentSideAccount = paymentBank;
        } else {
            const roleKey = PAYMENT_MODES[paymentMode];
            if (!roleKey) throw new Error(`Unsupported payment mode: ${paymentMode}`);
            paymentSideAccount = accounts[roleKey];
            if (!paymentSideAccount) throw new Error(`Account for role ${roleKey} not resolved`);
        }
    }

    const journalLines = [];
    const subsidiaryWrites = [];
    const narrationRef = storeSale.InvoiceNo || `SS-${storeSale.SaleID}`;

    if (customerPays <= 0 && partsCOGS <= 0) {
        return {
            header: {
                SourceDocType: 'STORE_SALE', SourceDocID: storeSale.SaleID,
                Narration: `Store Sale ${narrationRef} — no posting (empty)`,
                TotalAmount: 0,
            },
            lines: [], subsidiaryWrites: [],
            totals: { partsGross: 0, partsDiscount: 0, partsTax: 0, partsCOGS: 0, customerPays: 0, totalDr: 0, totalCr: 0 },
        };
    }

    // (1) Invoice leg — Dr customer subsidiary for total customer-pays
    if (customerPays > 0) {
        journalLines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            Narration: `Counter sale invoice — ${narrationRef}`,
            PartyID: partyTagForInvoiceLeg, JobCardID: null,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            PartyID: partyTagForInvoiceLeg,
            JobCardID: null,
            Narration: `Counter sale — ${narrationRef}`,
        });
    }

    // (2) Cr Parts Sales Revenue (gross)
    if (partsGross > 0) {
        journalLines.push({
            GLCAID: accounts.PARTS_REVENUE.GLCAID,
            Debit: 0, Credit: partsGross,
            Narration: `Parts sale (gross) — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (3) Dr Default Discount Given (if any)
    if (partsDiscount > 0) {
        journalLines.push({
            GLCAID: accounts.DEFAULT_DISCOUNT_GIVEN.GLCAID,
            Debit: partsDiscount, Credit: 0,
            Narration: `Discount given — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (4) Cr GST Payable
    if (partsTax > 0) {
        journalLines.push({
            GLCAID: accounts.GST_PAYABLE.GLCAID,
            Debit: 0, Credit: partsTax,
            Narration: `Output GST — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (5) Dr COGS — Parts
    if (partsCOGS > 0) {
        journalLines.push({
            GLCAID: accounts.COGS_PARTS.GLCAID,
            Debit: partsCOGS, Credit: 0,
            Narration: `COGS — parts consumed — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (6) Cr Inventory — Parts
    if (partsCOGS > 0) {
        journalLines.push({
            GLCAID: accounts.INVENTORY_PARTS.GLCAID,
            Debit: 0, Credit: partsCOGS,
            Narration: `Inventory removed — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (7) & (8) Payment receipt leg — only for non-Credit modes
    if (paymentMode !== 'Credit' && customerPays > 0) {
        journalLines.push({
            GLCAID: paymentSideAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            Narration: `${paymentMode} receipt — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
        journalLines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: customerPays,
            Narration: `Settle via ${paymentMode} — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: customerPays,
            PartyID: null, JobCardID: null,
            Narration: `Settle via ${paymentMode} — ${narrationRef}`,
        });
    }

    // Balance check
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`Store Sale journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'STORE_SALE',
            SourceDocID: storeSale.SaleID,
            Narration: `Store Sale finalize — ${narrationRef}`,
            TotalAmount: customerPays,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: {
            partsGross, partsDiscount, partsTax, partsCOGS,
            customerPays, totalDr, totalCr,
        },
    };
}

module.exports = { buildStoreSaleJournalLines, round2 };
