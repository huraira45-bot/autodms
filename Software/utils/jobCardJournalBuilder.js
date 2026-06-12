/**
 * Pure journal-line builder for Job Card finalize.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.6
 *
 * No DB access — takes loaded data + resolved accounts and returns
 * the balanced journal-line array. Fully testable.
 *
 * Inputs:
 *   jobCard       — { JobCardId, JobCardNo, JobCardDate, PaymentType, PartyID (nullable, named credit customer), PaymentBankID (nullable) }
 *   labourLines   — [{ Price, Discount, DiscAmt, TaxRate, TaxAmount, WorkDescription }]
 *   subletLines   — [{ VendorID, Remarks, InvoiceAmount (= our cost), PayableAmount (= we charge customer), TaxRate, TaxAmount }]
 *   partsLines    — [{ ItemId, Quantity, Rate (= sell price/unit), UnitLandedCost, TaxRate, TaxAmount, Discount, DiscAmt }]
 *   accounts      — { CASH_BOOK, GENERAL_CUSTOMER, GST_PAYABLE, PST_PAYABLE,
 *                     DEFAULT_DISCOUNT_GIVEN, POS_CLEARING, CHEQUES_ON_HAND,
 *                     PARTS_REVENUE, SERVICE_REVENUE, SUBLET_REVENUE,
 *                     COGS_PARTS, INVENTORY_PARTS, SUBLET_COST,
 *                     TRADE_DEBTORS, TRADE_CREDITORS } — all { GLCAID, GLCode, GLTitle }
 *   paymentBank   — { GLCAID } for Bank Transfer mode (resolved from dms_BankAccounts)
 *
 * Output:
 *   { header, lines, subsidiaryWrites, totals }
 *     - header.SourceDocType = 'JOBCARD'
 *     - lines: [{ GLCAID, Debit, Credit, Narration, PartyID, JobCardID }]
 *     - subsidiaryWrites: [{ PartyID, JobCardID, GLCAID, Debit, Credit, Narration }]
 *     - totals: { gross, discount, tax, customerPays }
 */

const PAYMENT_MODES = {
    Cash: 'CASH_BOOK',
    POS: 'POS_CLEARING',
    Cheque: 'CHEQUES_ON_HAND',
    'Bank Transfer': '__BANK__',  // resolved separately
    Credit: null,                  // no cash leg
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildJournalLines({ jobCard, labourLines = [], subletLines = [], partsLines = [], accounts, paymentBank = null }) {
    if (!accounts) throw new Error('accounts map required');

    // ---- Compute totals from each line group ----

    // Parts (GST 17% on net)
    let partsGross = 0, partsDiscount = 0, partsTax = 0, partsCOGS = 0;
    for (const p of partsLines) {
        const lineGross = round2((Number(p.Rate) || 0) * (Number(p.Quantity) || 0));
        const lineDisc = round2(Number(p.DiscAmt) || 0);
        const lineTax = round2(Number(p.TaxAmount) || 0);
        const lineCost = round2((Number(p.UnitLandedCost) || 0) * (Number(p.Quantity) || 0));
        partsGross += lineGross;
        partsDiscount += lineDisc;
        partsTax += lineTax;
        partsCOGS += lineCost;
    }
    partsGross = round2(partsGross);
    partsDiscount = round2(partsDiscount);
    partsTax = round2(partsTax);
    partsCOGS = round2(partsCOGS);

    // Labour (PST on net)
    let labourGross = 0, labourDiscount = 0, labourPST = 0;
    for (const l of labourLines) {
        labourGross += round2(Number(l.Price) || 0);
        labourDiscount += round2(Number(l.DiscAmt) || 0);
        labourPST += round2(Number(l.TaxAmount) || 0);
    }
    labourGross = round2(labourGross);
    labourDiscount = round2(labourDiscount);
    labourPST = round2(labourPST);

    // Sublet (PST on net) — PayableAmount = what we charge customer (revenue);
    // InvoiceAmount = what we pay the vendor (cost).
    let subletRevenueGross = 0, subletPST = 0, subletVendorTotalsByPartyId = {};
    for (const s of subletLines) {
        const revenue = round2(Number(s.PayableAmount) || 0);
        const cost = round2(Number(s.InvoiceAmount) || 0);
        const tax = round2(Number(s.TaxAmount) || 0);
        subletRevenueGross += revenue;
        subletPST += tax;
        const vid = s.VendorID;
        if (vid != null) {
            subletVendorTotalsByPartyId[vid] = round2((subletVendorTotalsByPartyId[vid] || 0) + cost);
        }
    }
    subletRevenueGross = round2(subletRevenueGross);
    subletPST = round2(subletPST);

    const totalRevenueGross = round2(partsGross + labourGross + subletRevenueGross);
    const totalDiscount = round2(partsDiscount + labourDiscount);
    const totalTax = round2(partsTax + labourPST + subletPST);
    const customerPays = round2(totalRevenueGross - totalDiscount + totalTax);
    const subletCostTotal = round2(Object.values(subletVendorTotalsByPartyId).reduce((a, b) => a + b, 0));

    // ---- Resolve which payment-side account to use ----
    const paymentMode = jobCard.PaymentType || 'Cash';
    let paymentSideAccount = null;
    let paymentSidePartyID = null;
    let customerSubsidiaryAccount = null;     // for the invoice leg (Trade Debtors named) OR General Customer

    if (paymentMode === 'Credit') {
        // Credit: no cash leg. Debit Trade Debtors (named party subsidiary).
        if (!jobCard.PartyID) {
            throw new Error('Credit Job Card requires PartyID (named credit party).');
        }
        customerSubsidiaryAccount = accounts.TRADE_DEBTORS;
        paymentSidePartyID = jobCard.PartyID;
        // No payment-side debit; receipt voucher comes later
    } else {
        // Cash / POS / Cheque / Bank Transfer: General Customer transit
        customerSubsidiaryAccount = accounts.GENERAL_CUSTOMER;
        if (paymentMode === 'Bank Transfer') {
            if (!paymentBank || !paymentBank.GLCAID) {
                throw new Error('Bank Transfer requires a paymentBank account.');
            }
            paymentSideAccount = paymentBank;
        } else {
            const roleKey = PAYMENT_MODES[paymentMode];
            if (!roleKey) throw new Error(`Unsupported payment mode: ${paymentMode}`);
            paymentSideAccount = accounts[roleKey];
            if (!paymentSideAccount) throw new Error(`Account for role ${roleKey} not resolved`);
        }
    }

    // ---- Build the journal lines ----
    const lines = [];
    const subsidiaryWrites = [];
    const partyTagForInvoiceLeg = (paymentMode === 'Credit') ? jobCard.PartyID : null;
    // JobCardID tagging keeps a back-reference on every line for reports/aging
    const jcTag = jobCard.JobCardId;

    // (1) Invoice leg — Dr customer subsidiary for total customer-pays
    if (customerPays > 0) {
        lines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            Narration: `Invoice JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: partyTagForInvoiceLeg, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            PartyID: partyTagForInvoiceLeg,
            JobCardID: (partyTagForInvoiceLeg == null) ? jcTag : null,
            Narration: `Invoice JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    // (2) Parts Sales Revenue — Cr
    if (partsGross > 0) {
        lines.push({
            GLCAID: accounts.PARTS_REVENUE.GLCAID,
            Debit: 0, Credit: partsGross,
            Narration: `Parts sale (gross) — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (3) Service Revenue — Cr
    if (labourGross > 0) {
        lines.push({
            GLCAID: accounts.SERVICE_REVENUE.GLCAID,
            Debit: 0, Credit: labourGross,
            Narration: `Labour (gross) — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (4) Sublet Revenue — Cr
    if (subletRevenueGross > 0) {
        lines.push({
            GLCAID: accounts.SUBLET_REVENUE.GLCAID,
            Debit: 0, Credit: subletRevenueGross,
            Narration: `Sublet (gross) — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (5) Default Discount Given — Dr (contra-revenue)
    if (totalDiscount > 0) {
        lines.push({
            GLCAID: accounts.DEFAULT_DISCOUNT_GIVEN.GLCAID,
            Debit: totalDiscount, Credit: 0,
            Narration: `Care-Off discount — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (6) GST Payable — Cr
    if (partsTax > 0) {
        lines.push({
            GLCAID: accounts.GST_PAYABLE.GLCAID,
            Debit: 0, Credit: partsTax,
            Narration: `Output GST on parts — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (7) PST Payable — Cr (combined labour + sublet)
    const totalPST = round2(labourPST + subletPST);
    if (totalPST > 0) {
        lines.push({
            GLCAID: accounts.PST_PAYABLE.GLCAID,
            Debit: 0, Credit: totalPST,
            Narration: `Output PST on labour+sublet — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (8) COGS — Parts — Dr
    if (partsCOGS > 0) {
        lines.push({
            GLCAID: accounts.COGS_PARTS.GLCAID,
            Debit: partsCOGS, Credit: 0,
            Narration: `COGS — parts consumed — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (9) Inventory — Parts — Cr
    if (partsCOGS > 0) {
        lines.push({
            GLCAID: accounts.INVENTORY_PARTS.GLCAID,
            Debit: 0, Credit: partsCOGS,
            Narration: `Inventory removed — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (10) Sublet Cost — Dr (total)
    if (subletCostTotal > 0) {
        lines.push({
            GLCAID: accounts.SUBLET_COST.GLCAID,
            Debit: subletCostTotal, Credit: 0,
            Narration: `Sublet vendor cost — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (11) Trade Creditors (sublet vendor subsidiary) — Cr — one line per vendor
    for (const [vendorIdStr, amount] of Object.entries(subletVendorTotalsByPartyId)) {
        const vendorId = Number(vendorIdStr);
        if (amount <= 0) continue;
        lines.push({
            GLCAID: accounts.TRADE_CREDITORS.GLCAID,
            Debit: 0, Credit: amount,
            Narration: `Sublet payable — vendor #${vendorId} — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: vendorId, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: accounts.TRADE_CREDITORS.GLCAID,
            Debit: 0, Credit: amount,
            PartyID: vendorId, JobCardID: null,
            Narration: `Sublet payable — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    // (12) & (13) Payment receipt leg — only for non-Credit modes
    if (paymentMode !== 'Credit' && customerPays > 0) {
        // (12) Dr payment-side account (Cash Book / POS Clearing / Cheques on Hand / Bank)
        lines.push({
            GLCAID: paymentSideAccount.GLCAID,
            Debit: customerPays, Credit: 0,
            Narration: `${paymentMode} receipt — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
        // (13) Cr General Customer (settles the invoice leg) — same subsidiary entry to settle
        lines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: customerPays,
            Narration: `Settle invoice via ${paymentMode} — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: 0, Credit: customerPays,
            PartyID: null,
            JobCardID: jcTag,
            Narration: `Settle invoice via ${paymentMode} — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    // ---- Balance check (defensive — the DB trigger also enforces this) ----
    const totalDr = round2(lines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(lines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`Journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'JOBCARD',
            SourceDocID: jobCard.JobCardId,
            Narration: `Job Card finalize — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            TotalAmount: customerPays,
        },
        lines,
        subsidiaryWrites,
        totals: {
            partsGross, labourGross, subletRevenueGross,
            partsDiscount, labourDiscount, totalDiscount,
            partsTax, labourPST, subletPST, totalTax,
            partsCOGS, subletCostTotal,
            customerPays,
            totalDr, totalCr,
        },
    };
}

module.exports = { buildJournalLines, round2 };
