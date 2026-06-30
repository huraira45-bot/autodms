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

function buildJournalLines({ jobCard, labourLines = [], subletLines = [], partsLines = [], accounts, paymentBank = null, campaign = null, partyGL = null, subletVendorGLs = new Map(), depreciationTotal = 0 }) {
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
    const invoiceTotal = round2(totalRevenueGross - totalDiscount + totalTax);

    // Campaign benefit reduces what the customer actually pays — that portion
    // gets debited to the campaign GL account instead (claimable from MCML or
    // booked as our marketing expense, depending on campaign.BorneBy).
    const campaignBenefit = campaign && campaign.BenefitAmount > 0
        ? round2(Math.min(Number(campaign.BenefitAmount), invoiceTotal))
        : 0;
    const customerPays = round2(invoiceTotal - campaignBenefit);

    const subletCostTotal = round2(Object.values(subletVendorTotalsByPartyId).reduce((a, b) => a + b, 0));

    // ---- Resolve which subsidiary account to use ----
    // Finalize only raises the invoice; receipts are posted separately by the
    // cashier via Receive Payment.
    //
    // Customer subsidiary:
    //   - PartyID set → party's own linked PartyGLID (per-party COA leaf)
    //   - Walk-in → JobCardType.ReceivableAccount if set, else General Customer
    //
    // Revenue accounts:
    //   - Labour → JobCardType.JobRevenueAccount if set, else SERVICE_REVENUE
    //   - Parts  → JobCardType.PartsRevenueAccount if set, else PARTS_REVENUE
    //
    // This lets each business unit (GR / B&P / CT) post to its own revenue
    // GL leaf, so the COA + P&L show per-department income separately.
    const paymentMode = jobCard.PaymentType || 'Cash';
    let customerSubsidiaryAccount = null;
    let partyTagForInvoiceLeg = null;
    if (jobCard.PartyID) {
        if (!partyGL || !partyGL.GLCAID) {
            throw new Error('Job Card has a named party but the party has no linked GL account. Edit the party and pick one before finalizing.');
        }
        customerSubsidiaryAccount = partyGL;
        partyTagForInvoiceLeg = jobCard.PartyID;
    } else if (jobCard.TypeReceivableGL) {
        customerSubsidiaryAccount = { GLCAID: jobCard.TypeReceivableGL };
    } else {
        customerSubsidiaryAccount = accounts.GENERAL_CUSTOMER;
    }

    // Per-business-unit revenue accounts (override the system roles when set
    // on gen_JobCardType.JobRevenueAccount / PartsRevenueAccount).
    const labourRevenueAcct = jobCard.TypeServiceRevenueGL
        ? { GLCAID: jobCard.TypeServiceRevenueGL }
        : accounts.SERVICE_REVENUE;
    const partsRevenueAcct = jobCard.TypePartsRevenueGL
        ? { GLCAID: jobCard.TypePartsRevenueGL }
        : accounts.PARTS_REVENUE;

    // ---- Build the journal lines ----
    const lines = [];
    const subsidiaryWrites = [];
    // JobCardID tagging keeps a back-reference on every line for reports/aging
    const jcTag = jobCard.JobCardId;

    // (1) Invoice leg — Dr customer subsidiary for the *net* customer-pays
    // (gross + tax − discount − campaignBenefit). If a campaign covers the
    // full invoice, customerPays = 0 and we skip the line entirely.
    //
    // Insurance-claim split: when the JC has a named insurer party AND the
    // Insurance tab recorded a depreciation total, that portion belongs to the
    // END CUSTOMER not the insurer. Split the Dr leg into:
    //   - Insurer (PartyGLID, party-tagged) for (customerPays - dep)
    //   - General Customer (JC-tagged only)  for (dep)
    // For walk-ins or no-dep cases, the single-leg path is unchanged.
    const depSplit = (partyTagForInvoiceLeg != null) && depreciationTotal > 0
        ? round2(Math.min(depreciationTotal, customerPays))
        : 0;
    const insurerShare = round2(customerPays - depSplit);

    if (insurerShare > 0) {
        lines.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: insurerShare, Credit: 0,
            Narration: `Invoice JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: partyTagForInvoiceLeg, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: customerSubsidiaryAccount.GLCAID,
            Debit: insurerShare, Credit: 0,
            PartyID: partyTagForInvoiceLeg,
            JobCardID: (partyTagForInvoiceLeg == null) ? jcTag : null,
            Narration: `Invoice JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    if (depSplit > 0) {
        lines.push({
            GLCAID: accounts.GENERAL_CUSTOMER.GLCAID,
            Debit: depSplit, Credit: 0,
            Narration: `Customer depreciation share — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: accounts.GENERAL_CUSTOMER.GLCAID,
            Debit: depSplit, Credit: 0,
            PartyID: null, JobCardID: jcTag,
            Narration: `Customer depreciation share — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    // (1b) Campaign leg — Dr the campaign GL account for the benefit portion.
    // For MCML campaigns the GL is a sub-account under 102006 (a receivable);
    // for "borne by us" campaigns it's an operating-expense account (5xxx).
    if (campaign && campaignBenefit > 0) {
        lines.push({
            GLCAID: campaign.GLAccountID,
            Debit: campaignBenefit, Credit: 0,
            Narration: `Campaign claim: ${campaign.CampaignName} — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (2) Parts Sales Revenue — Cr (uses business-unit's PartsRevenueAccount if set)
    if (partsGross > 0) {
        lines.push({
            GLCAID: partsRevenueAcct.GLCAID,
            Debit: 0, Credit: partsGross,
            Narration: `Parts sale (gross) — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: null, JobCardID: jcTag,
        });
    }

    // (3) Service Revenue — Cr (uses business-unit's JobRevenueAccount if set)
    if (labourGross > 0) {
        lines.push({
            GLCAID: labourRevenueAcct.GLCAID,
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

    // (11) Sublet vendor subsidiary — Cr — one line per vendor, posted to each
    // vendor's own PartyGLID leaf (loaded by the posting service).
    for (const [vendorIdStr, amount] of Object.entries(subletVendorTotalsByPartyId)) {
        const vendorId = Number(vendorIdStr);
        if (amount <= 0) continue;
        const vendorAcc = subletVendorGLs.get(vendorId);
        if (!vendorAcc) {
            throw new Error(`Sublet vendor #${vendorId} has no GL account set. Edit the party and assign a GL account.`);
        }
        lines.push({
            GLCAID: vendorAcc.GLCAID,
            Debit: 0, Credit: amount,
            Narration: `Sublet payable — vendor #${vendorId} — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            PartyID: vendorId, JobCardID: jcTag,
        });
        subsidiaryWrites.push({
            GLCAID: vendorAcc.GLCAID,
            Debit: 0, Credit: amount,
            PartyID: vendorId, JobCardID: null,
            Narration: `Sublet payable — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
        });
    }

    // NOTE: receipt + settle legs intentionally removed. The cashier records
    // actual receipts (Cash / POS / Cheque / Bank Transfer) via the Receive
    // Payment screen, which posts its own voucher (Dr payment-side / Cr
    // customer subsidiary). The JC's PaymentMode is now just a hint to the
    // cashier about how the customer plans to pay.

    // ---- Balance check (defensive — the DB trigger also enforces this) ----
    const totalDr = round2(lines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(lines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`Journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    // Single-leg customer AR descriptor — populated only when the AR is NOT
    // split between insurer + Gen-Cust. Used by the posting service for POS
    // auto-settle at finalize (cashier doesn't need to record the POS receipt
    // separately — card swipe at the counter already cleared the AR).
    const customerARDr = (depSplit === 0 && insurerShare > 0)
        ? { GLCAID: customerSubsidiaryAccount.GLCAID, PartyID: partyTagForInvoiceLeg, Amount: insurerShare }
        : null;

    return {
        header: {
            SourceDocType: 'JOBCARD',
            SourceDocID: jobCard.JobCardId,
            Narration: campaign
                ? `Job Card finalize — JC-${jobCard.JobCardNo || jobCard.JobCardId} (campaign: ${campaign.CampaignName})`
                : `Job Card finalize — JC-${jobCard.JobCardNo || jobCard.JobCardId}`,
            TotalAmount: invoiceTotal,
        },
        lines,
        subsidiaryWrites,
        customerARDr,
        totals: {
            partsGross, labourGross, subletRevenueGross,
            partsDiscount, labourDiscount, totalDiscount,
            partsTax, labourPST, subletPST, totalTax,
            partsCOGS, subletCostTotal,
            invoiceTotal, campaignBenefit, customerPays,
            totalDr, totalCr,
        },
        appliedCampaignID: campaign?.ApplicationID || null,
    };
}

module.exports = { buildJournalLines, round2 };
