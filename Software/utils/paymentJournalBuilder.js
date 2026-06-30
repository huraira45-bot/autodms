/**
 * Pure journal-line builder for Receive Payment / Make Payment.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.11.
 *
 * RECEIVE PAYMENT (customer → us):
 *   Dr Cash Book / POS Clearing / Cheques on Hand / Bank   (one line per payment mode)
 *      Cr Trade Debtors (party subsidiary)  — one line per allocated invoice
 *      Cr Customer Advance Received (party or job-card tag) — excess if any
 *
 * MAKE PAYMENT (us → supplier):
 *   Dr Trade Creditors (party subsidiary) — one line per allocated bill
 *   Dr Supplier Advance Paid (party tag) — excess if any
 *      Cr Cash Book / POS Clearing / Cheques on Hand / Bank
 *
 * Inputs:
 *   direction       — 'receive' | 'make'
 *   party           — { PartyID, PartyName? } — required unless walk-in
 *   walkInJobCardID — number — required when no party (walk-in advance against an RO)
 *   paymentLines    — [{ Mode, Amount, BankGLCAID? (for Bank Transfer), Reference? (cheque #) }]
 *   allocations     — [{ TargetVoucherID, Amount }] — pieces of total received/paid that settle specific invoices
 *   accounts        — { CASH_BOOK, POS_CLEARING, CHEQUES_ON_HAND, TRADE_DEBTORS, TRADE_CREDITORS,
 *                       CUSTOMER_ADVANCE_RECEIVED, SUPPLIER_ADVANCE_PAID } each { GLCAID }
 *
 * Output:
 *   { header, lines, subsidiaryWrites, totals }
 */

const MODE_TO_ROLE = {
    Cash: 'CASH_BOOK',
    POS: 'POS_CLEARING',
    Cheque: 'CHEQUES_ON_HAND',
    'Bank Transfer': '__BANK__',  // resolved per-line via paymentLines[i].BankGLCAID
    // 'Advance' is intentionally not in MODE_TO_ROLE — it's a virtual source.
    // Receive: pulls from CUSTOMER_ADVANCE_RECEIVED (reducing liability).
    // Make:    pulls from SUPPLIER_ADVANCE_PAID    (reducing prepaid asset).
    // Tagged with PartyID so the per-party advance balance in dms_PartyLedger drops correctly.
};

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

function buildPaymentJournalLines({ direction, party = null, walkInJobCardID = null, walkInSaleID = null, paymentLines = [], allocations = [], adjustments = [], accounts, partyGL = null, refNo = null }) {
    if (!accounts) throw new Error('accounts map required');
    if (direction !== 'receive' && direction !== 'make') {
        throw new Error("direction must be 'receive' or 'make'");
    }
    if (direction === 'make' && !party?.PartyID) {
        throw new Error('Make Payment requires a supplier PartyID.');
    }
    // For receive: must have a party OR a walk-in tag (JC or Store Sale).
    if (direction === 'receive' && !party?.PartyID && !walkInJobCardID && !walkInSaleID) {
        throw new Error('Receive Payment requires PartyID, walkInJobCardID or walkInSaleID.');
    }

    // Total received in cash/bank/etc. + Dr-side adjustments (WHT, salvage, shortage, etc.).
    // The full sum is what settles the customer's invoice — the customer's AR is credited
    // for cash + adjustments combined, because the adjustment lines represent value the
    // customer "paid" via tax withholding or other deductions on their behalf.
    const cashAmount   = round2(paymentLines.reduce((a, p) => a + (Number(p.Amount) || 0), 0));
    const adjAmount    = round2(adjustments.reduce((a, x) => a + (Number(x.Amount) || 0), 0));
    const totalAmount  = round2(cashAmount + adjAmount);
    if (totalAmount <= 0) {
        throw new Error('Payment total must be positive.');
    }
    // Adjustments only make sense on the receive side and against a named party
    if (adjAmount > 0 && direction !== 'receive') {
        throw new Error('Tax/expense adjustments are only supported on Receive Payment.');
    }
    if (adjAmount > 0 && !party?.PartyID) {
        throw new Error('Tax/expense adjustments require a named party (the customer whose WHT cert these belong to).');
    }

    const allocatedSum = round2(allocations.reduce((a, x) => a + (Number(x.Amount) || 0), 0));
    if (allocatedSum > totalAmount + 0.01) {
        throw new Error(`Allocated amount (${allocatedSum}) exceeds payment total (${totalAmount}).`);
    }
    const advanceAmount = round2(totalAmount - allocatedSum);

    const journalLines = [];
    const subsidiaryWrites = [];
    const partyId = party?.PartyID || null;
    const ref = refNo || (direction === 'receive' ? 'Customer payment' : 'Supplier payment');

    // ---------- RECEIVE PAYMENT ----------
    if (direction === 'receive') {
        // (1) Dr each payment-mode account for its amount.
        // 'Advance' mode pulls from CUSTOMER_ADVANCE_RECEIVED (Dr reduces the liability),
        // tagged with PartyID so the subsidiary ledger reflects the drawdown.
        for (const p of paymentLines) {
            const amt = round2(Number(p.Amount) || 0);
            if (amt <= 0) continue;
            const isAdvance = p.Mode === 'Advance';
            if (isAdvance && !partyId) {
                throw new Error("Advance mode requires a named party (walk-in receipts can't draw from an advance balance).");
            }
            const glcaid = isAdvance
                ? accounts.CUSTOMER_ADVANCE_RECEIVED?.GLCAID
                : p.Mode === 'Bank Transfer' ? p.BankGLCAID : accounts[MODE_TO_ROLE[p.Mode]]?.GLCAID;
            if (!glcaid) throw new Error(`No account resolved for mode '${p.Mode}'.`);
            const narration = isAdvance
                ? `Applied advance — ${ref}`
                : (p.Reference ? `${p.Mode} receipt (${p.Reference}) — ${ref}` : `${p.Mode} receipt — ${ref}`);
            journalLines.push({
                GLCAID: glcaid, Debit: amt, Credit: 0,
                Narration: narration,
                PartyID: isAdvance ? partyId : null,
                JobCardID: null, AllocatedToVoucherID: null,
            });
            // Mirror the advance drawdown in dms_PartyLedger so the per-party advance balance decreases.
            if (isAdvance) {
                subsidiaryWrites.push({
                    GLCAID: accounts.CUSTOMER_ADVANCE_RECEIVED.GLCAID,
                    Debit: amt, Credit: 0,
                    PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
                    Narration: `Advance drawn down — ${ref}`,
                });
            }
        }

        // (1b) Dr adjustment lines (WHT-receivable, salvage expense, shortage, etc.).
        // Each one is value the customer "paid" by withholding or deducting on their
        // behalf, so it counts toward settling the customer's AR. Tagged with PartyID
        // so the WHT-receivable subsidiary ledger shows who withheld what.
        for (const adj of adjustments) {
            const amt = round2(Number(adj.Amount) || 0);
            if (amt <= 0) continue;
            if (!adj.GLCAID) throw new Error(`Adjustment ${adj.Type || ''} missing GLCAID`);
            journalLines.push({
                GLCAID: adj.GLCAID, Debit: amt, Credit: 0,
                Narration: adj.Narration || `${adj.Type || 'Adjustment'} — ${ref}`,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
            });
            // Subsidiary ledger entry so per-party totals on WHT/etc accounts work.
            subsidiaryWrites.push({
                GLCAID: adj.GLCAID, Debit: amt, Credit: 0,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
                Narration: adj.Narration || `${adj.Type || 'Adjustment'} — ${ref}`,
            });
        }

        // (2) Cr customer-A/R leg for each allocated invoice.
        //   - Named party     → party's own PartyGLID (mirrors the JC/Store Sale invoice leg).
        //   - Walk-in JC      → GENERAL_CUSTOMER tagged by JobCardID.
        //   - Walk-in Store Sale → GENERAL_CUSTOMER, no tag (no SaleID column on
        //     dms_PartyLedger; settlement is found via AllocatedToVoucherID).
        const settleAccount = partyGL || accounts.GENERAL_CUSTOMER;
        if (allocations.length > 0 && !settleAccount?.GLCAID) {
            throw new Error('No subsidiary account available for invoice settlement.');
        }
        const settleJobCardTag = partyId ? null : walkInJobCardID;
        for (const a of allocations) {
            const amt = round2(Number(a.Amount) || 0);
            if (amt <= 0) continue;
            if (!a.TargetVoucherID) throw new Error('Each allocation needs TargetVoucherID.');
            journalLines.push({
                GLCAID: settleAccount.GLCAID,
                Debit: 0, Credit: amt,
                Narration: `Settle invoice voucher #${a.TargetVoucherID} — ${ref}`,
                PartyID: partyId, JobCardID: settleJobCardTag, AllocatedToVoucherID: a.TargetVoucherID,
            });
            // Subsidiary ledger has a CK constraint requiring PartyID or JobCardID.
            // Skip the write for walk-in store sales (neither tag available).
            if (partyId || settleJobCardTag) {
                subsidiaryWrites.push({
                    GLCAID: settleAccount.GLCAID,
                    Debit: 0, Credit: amt,
                    PartyID: partyId, JobCardID: settleJobCardTag, AllocatedToVoucherID: a.TargetVoucherID,
                    Narration: `Settle voucher #${a.TargetVoucherID} — ${ref}`,
                });
            }
        }

        // (3) Cr Customer Advance Received for any excess (overpayment or pre-payment)
        if (advanceAmount > 0) {
            // Tag by PartyID (named customer) or JobCardID (walk-in deposit against specific RO)
            journalLines.push({
                GLCAID: accounts.CUSTOMER_ADVANCE_RECEIVED.GLCAID,
                Debit: 0, Credit: advanceAmount,
                Narration: partyId ? `Customer advance — ${ref}` : `Walk-in advance for JC #${walkInJobCardID} — ${ref}`,
                PartyID: partyId, JobCardID: walkInJobCardID, AllocatedToVoucherID: null,
            });
            subsidiaryWrites.push({
                GLCAID: accounts.CUSTOMER_ADVANCE_RECEIVED.GLCAID,
                Debit: 0, Credit: advanceAmount,
                PartyID: partyId, JobCardID: walkInJobCardID, AllocatedToVoucherID: null,
                Narration: partyId ? `Customer advance — ${ref}` : `Walk-in advance for JC #${walkInJobCardID} — ${ref}`,
            });
        }
    }

    // ---------- MAKE PAYMENT ----------
    if (direction === 'make') {
        // (1) Dr supplier-A/P leaf per allocated bill. Each supplier carries
        // its own PartyGLID; we never fall back to a system-wide bucket.
        if (allocations.length > 0 && !partyGL?.GLCAID) {
            throw new Error('Supplier has no GL account set (PartyGLID is null). Edit the party and pick one before paying.');
        }
        for (const a of allocations) {
            const amt = round2(Number(a.Amount) || 0);
            if (amt <= 0) continue;
            if (!a.TargetVoucherID) throw new Error('Each allocation needs TargetVoucherID.');
            journalLines.push({
                GLCAID: partyGL.GLCAID,
                Debit: amt, Credit: 0,
                Narration: `Settle bill voucher #${a.TargetVoucherID} — ${ref}`,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: a.TargetVoucherID,
            });
            subsidiaryWrites.push({
                GLCAID: partyGL.GLCAID,
                Debit: amt, Credit: 0,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: a.TargetVoucherID,
                Narration: `Settle bill voucher #${a.TargetVoucherID} — ${ref}`,
            });
        }

        // (2) Dr Supplier Advance Paid for excess (prepayment to supplier)
        if (advanceAmount > 0) {
            journalLines.push({
                GLCAID: accounts.SUPPLIER_ADVANCE_PAID.GLCAID,
                Debit: advanceAmount, Credit: 0,
                Narration: `Supplier advance — ${ref}`,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
            });
            subsidiaryWrites.push({
                GLCAID: accounts.SUPPLIER_ADVANCE_PAID.GLCAID,
                Debit: advanceAmount, Credit: 0,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
                Narration: `Supplier advance — ${ref}`,
            });
        }

        // (3) Cr payment-mode account per line.
        // 'Advance' mode credits SUPPLIER_ADVANCE_PAID (reduces the prepaid-asset balance),
        // tagged with PartyID so the supplier's advance balance drops.
        for (const p of paymentLines) {
            const amt = round2(Number(p.Amount) || 0);
            if (amt <= 0) continue;
            const isAdvance = p.Mode === 'Advance';
            // Issued cheques sit in CHEQUES_ISSUED_UNCLEARED (a liability) — not
            // CHEQUES_ON_HAND, which only holds received-incoming assets. The
            // Cheque Clearance screen drains this account into Bank at clearance.
            const glcaid = isAdvance
                ? accounts.SUPPLIER_ADVANCE_PAID?.GLCAID
                : p.Mode === 'Cheque' ? accounts.CHEQUES_ISSUED_UNCLEARED?.GLCAID
                : p.Mode === 'Bank Transfer' ? p.BankGLCAID
                : accounts[MODE_TO_ROLE[p.Mode]]?.GLCAID;
            if (!glcaid) throw new Error(`No account resolved for mode '${p.Mode}'.`);
            const narration = isAdvance
                ? `Applied supplier advance — ${ref}`
                : (p.Reference ? `${p.Mode} payment (${p.Reference}) — ${ref}` : `${p.Mode} payment — ${ref}`);
            journalLines.push({
                GLCAID: glcaid, Debit: 0, Credit: amt,
                Narration: narration,
                PartyID: isAdvance ? partyId : null,
                JobCardID: null, AllocatedToVoucherID: null,
            });
            if (isAdvance) {
                subsidiaryWrites.push({
                    GLCAID: accounts.SUPPLIER_ADVANCE_PAID.GLCAID,
                    Debit: 0, Credit: amt,
                    PartyID: partyId, JobCardID: null, AllocatedToVoucherID: null,
                    Narration: `Supplier advance drawn down — ${ref}`,
                });
            }
        }
    }

    // Balance check
    const totalDr = round2(journalLines.reduce((a, l) => a + (l.Debit || 0), 0));
    const totalCr = round2(journalLines.reduce((a, l) => a + (l.Credit || 0), 0));
    if (Math.abs(totalDr - totalCr) > 0.01) {
        throw new Error(`Payment journal not balanced: Dr ${totalDr} vs Cr ${totalCr}`);
    }

    return {
        header: {
            SourceDocType: 'VOUCHER',
            SourceDocID: null,  // payment voucher — no source doc; allocations reference invoices per-line
            Narration: ref,
            TotalAmount: totalAmount,
        },
        lines: journalLines,
        subsidiaryWrites,
        totals: { totalAmount, allocatedSum, advanceAmount, totalDr, totalCr },
    };
}

module.exports = { buildPaymentJournalLines, round2 };
