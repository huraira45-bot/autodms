/**
 * Pure journal-line builder for SSR (Store Sale Return) finalize.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.9.
 *
 * Mirror of the Store Sale: reverse revenue + GST, restore inventory at landed cost,
 * refund customer via Cash / POS / Cheque / Bank Transfer, or credit named-party subsidiary.
 *
 * Inputs:
 *   ssr        — { ReturnID, ReturnNo, OriginalSaleID, PartyID, RefundMode, RefundBankID }
 *   lines      — [{ Quantity, SaleRate, TaxPercent, TaxAmount, DiscountAmount, UnitLandedCost }]
 *   accounts   — same set as storeSaleJournalBuilder
 *   paymentBank — { GLCAID } when RefundMode = 'Bank Transfer'
 */

const REFUND_MODES = {
    Cash: 'CASH_BOOK',
    POS: 'POS_CLEARING',
    Cheque: 'CHEQUES_ON_HAND',
    'Bank Transfer': '__BANK__',
    Credit: null,
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildSSRJournalLines({ ssr, lines = [], accounts, paymentBank = null }) {
    if (!accounts) throw new Error('accounts map required');
    if (!ssr) throw new Error('ssr header required');

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

    const refundAmount = round2(partsGross - partsDiscount + partsTax);

    // Resolve refund-side account
    const refundMode = ssr.RefundMode || 'Cash';
    let refundSideAccount = null;
    let customerSubsidiaryAccount = null;
    let partyTagForRefundLeg = null;

    if (refundMode === 'Credit') {
        if (!ssr.PartyID) throw new Error('Credit SSR (credit-to-account refund) requires PartyID.');
        customerSubsidiaryAccount = accounts.TRADE_DEBTORS;
        partyTagForRefundLeg = ssr.PartyID;
    } else {
        customerSubsidiaryAccount = accounts.GENERAL_CUSTOMER;
        if (refundMode === 'Bank Transfer') {
            if (!paymentBank || !paymentBank.GLCAID) throw new Error('Bank Transfer refund requires a paymentBank account.');
            refundSideAccount = paymentBank;
        } else {
            const roleKey = REFUND_MODES[refundMode];
            if (!roleKey) throw new Error(`Unsupported refund mode: ${refundMode}`);
            refundSideAccount = accounts[roleKey];
            if (!refundSideAccount) throw new Error(`Account for role ${roleKey} not resolved`);
        }
    }

    const journalLines = [];
    const subsidiaryWrites = [];
    const narrationRef = ssr.ReturnNo || `SSR-${ssr.ReturnID}`;

    if (refundAmount <= 0 && partsCOGS <= 0) {
        return {
            header: {
                SourceDocType: 'SSR', SourceDocID: ssr.ReturnID,
                Narration: `SSR ${narrationRef} — no posting (empty)`,
                TotalAmount: 0,
            },
            lines: [], subsidiaryWrites: [],
            totals: { partsGross: 0, partsDiscount: 0, partsTax: 0, partsCOGS: 0, refundAmount: 0, totalDr: 0, totalCr: 0 },
        };
    }

    // (1) Dr Parts Sales Revenue (reverse the revenue, gross)
    if (partsGross > 0) {
        journalLines.push({
            GLCAID: accounts.PARTS_REVENUE.GLCAID,
            Debit: partsGross, Credit: 0,
            Narration: `Reverse parts revenue — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (2) Cr Default Discount Given (reverse the discount we recorded on original sale)
    if (partsDiscount > 0) {
        journalLines.push({
            GLCAID: accounts.DEFAULT_DISCOUNT_GIVEN.GLCAID,
            Debit: 0, Credit: partsDiscount,
            Narration: `Reverse discount — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (3) Dr GST Payable (reverse output GST)
    if (partsTax > 0) {
        journalLines.push({
            GLCAID: accounts.GST_PAYABLE.GLCAID,
            Debit: partsTax, Credit: 0,
            Narration: `Reverse output GST — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (4) Dr Inventory — Parts (restore stock at landed cost)
    if (partsCOGS > 0) {
        journalLines.push({
            GLCAID: accounts.INVENTORY_PARTS.GLCAID,
            Debit: partsCOGS, Credit: 0,
            Narration: `Restock returned parts — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (5) Cr COGS — Parts (reverse the cost we recognised)
    if (partsCOGS > 0) {
        journalLines.push({
            GLCAID: accounts.COGS_PARTS.GLCAID,
            Debit: 0, Credit: partsCOGS,
            Narration: `Reverse COGS — ${narrationRef}`,
            PartyID: null, JobCardID: null,
        });
    }

    // (6) & (7) Refund leg — transit through customer subsidiary
    if (refundAmount > 0) {
        // (6) Cr customer subsidiary — we owe the customer (or reduce what they owe us)
        journalLines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: refundAmount,
            Narration: `Refund credit — ${narrationRef}`,
            PartyID: partyTagForRefundLeg, JobCardID: null,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: refundAmount,
            PartyID: partyTagForRefundLeg,
            JobCardID: null,
            Narration: `Refund — ${narrationRef}`,
        });

        if (refundMode !== 'Credit') {
            // (6.5) Dr customer subsidiary again — settles the refund
            journalLines.push({
                GLCAID: customerSubsidiaryAccount.GLCAID,
                Debit: refundAmount, Credit: 0,
                Narration: `Settle refund via ${refundMode} — ${narrationRef}`,
                PartyID: null, JobCardID: null,
            });
            subsidiaryWrites.push({
                GLCAID: customerSubsidiaryAccount.GLCAID,
                Debit: refundAmount, Credit: 0,
                PartyID: null, JobCardID: null,
                Narration: `Settle refund — ${narrationRef}`,
            });
            // (7) Cr payment-side account (cash/POS/cheque/bank goes out)
            journalLines.push({
                GLCAID: refundSideAccount.GLCAID,
                Debit: 0, Credit: refundAmount,
                Narration: `${refundMode} refund — ${narrationRef}`,
                PartyID: null, JobCardID: null,
            });
        }
        // For Credit mode, the customer subsidiary just gets credited (their balance reduces / they get a credit balance);
        // no payment-side leg needed.
    }

    // Balance check
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`SSR journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'SSR',
            SourceDocID: ssr.ReturnID,
            Narration: `SSR finalize — ${narrationRef}`,
            TotalAmount: refundAmount,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: {
            partsGross, partsDiscount, partsTax, partsCOGS,
            refundAmount, totalDr, totalCr,
        },
    };
}

module.exports = { buildSSRJournalLines, round2 };
