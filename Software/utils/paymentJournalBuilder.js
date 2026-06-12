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

function buildPaymentJournalLines({ direction, party = null, walkInJobCardID = null, paymentLines = [], allocations = [], accounts, refNo = null }) {
    if (!accounts) throw new Error('accounts map required');
    if (direction !== 'receive' && direction !== 'make') {
        throw new Error("direction must be 'receive' or 'make'");
    }
    if (direction === 'make' && !party?.PartyID) {
        throw new Error('Make Payment requires a supplier PartyID.');
    }
    // For receive: must have party OR walkInJobCardID
    if (direction === 'receive' && !party?.PartyID && !walkInJobCardID) {
        throw new Error('Receive Payment requires PartyID or walkInJobCardID (walk-in advance).');
    }

    // Total in / out
    const totalAmount = round2(paymentLines.reduce((a, p) => a + (Number(p.Amount) || 0), 0));
    if (totalAmount <= 0) {
        throw new Error('Payment total must be positive.');
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

        // (2) Cr Trade Debtors (party) for each allocated invoice
        for (const a of allocations) {
            const amt = round2(Number(a.Amount) || 0);
            if (amt <= 0) continue;
            if (!a.TargetVoucherID) throw new Error('Each allocation needs TargetVoucherID.');
            journalLines.push({
                GLCAID: accounts.TRADE_DEBTORS.GLCAID,
                Debit: 0, Credit: amt,
                Narration: `Settle invoice voucher #${a.TargetVoucherID} — ${ref}`,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: a.TargetVoucherID,
            });
            subsidiaryWrites.push({
                GLCAID: accounts.TRADE_DEBTORS.GLCAID,
                Debit: 0, Credit: amt,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: a.TargetVoucherID,
                Narration: `Settle voucher #${a.TargetVoucherID} — ${ref}`,
            });
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
        // (1) Dr Trade Creditors per allocated bill
        for (const a of allocations) {
            const amt = round2(Number(a.Amount) || 0);
            if (amt <= 0) continue;
            if (!a.TargetVoucherID) throw new Error('Each allocation needs TargetVoucherID.');
            journalLines.push({
                GLCAID: accounts.TRADE_CREDITORS.GLCAID,
                Debit: amt, Credit: 0,
                Narration: `Settle bill voucher #${a.TargetVoucherID} — ${ref}`,
                PartyID: partyId, JobCardID: null, AllocatedToVoucherID: a.TargetVoucherID,
            });
            subsidiaryWrites.push({
                GLCAID: accounts.TRADE_CREDITORS.GLCAID,
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
            const glcaid = isAdvance
                ? accounts.SUPPLIER_ADVANCE_PAID?.GLCAID
                : p.Mode === 'Bank Transfer' ? p.BankGLCAID : accounts[MODE_TO_ROLE[p.Mode]]?.GLCAID;
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
