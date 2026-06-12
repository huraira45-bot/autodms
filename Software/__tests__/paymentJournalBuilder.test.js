const { buildPaymentJournalLines } = require('../utils/paymentJournalBuilder');

const ACC = {
    CASH_BOOK:                 { GLCAID: 1001 },
    POS_CLEARING:              { GLCAID: 1002 },
    CHEQUES_ON_HAND:           { GLCAID: 1003 },
    TRADE_DEBTORS:             { GLCAID: 1005 },
    TRADE_CREDITORS:           { GLCAID: 2001 },
    CUSTOMER_ADVANCE_RECEIVED: { GLCAID: 2004 },
    SUPPLIER_ADVANCE_PAID:     { GLCAID: 1008 },
};

describe('paymentJournalBuilder — RECEIVE PAYMENT', () => {
    test('§14.11 mixed-mode receipt — full settlement of one invoice', () => {
        // Karachi Motors owes 11,600. Pays 5,000 cash + 6,600 cheque. Allocates all to invoice voucher #99.
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77, PartyName: 'Karachi Motors' },
            paymentLines: [
                { Mode: 'Cash', Amount: 5000 },
                { Mode: 'Cheque', Amount: 6600, Reference: 'CHQ-1234' },
            ],
            allocations: [{ TargetVoucherID: 99, Amount: 11600 }],
            accounts: ACC,
            refNo: 'CRV-0001',
        });

        expect(r.totals.totalAmount).toBe(11600);
        expect(r.totals.allocatedSum).toBe(11600);
        expect(r.totals.advanceAmount).toBe(0);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
        expect(r.totals.totalDr).toBe(11600);

        // Dr Cash 5,000, Dr Cheques on Hand 6,600
        const cash = r.lines.find(l => l.GLCAID === ACC.CASH_BOOK.GLCAID);
        expect(cash.Debit).toBe(5000);
        const cheque = r.lines.find(l => l.GLCAID === ACC.CHEQUES_ON_HAND.GLCAID);
        expect(cheque.Debit).toBe(6600);

        // Cr Trade Debtors 11,600 tagged with PartyID + AllocatedToVoucherID
        const debtorLine = r.lines.find(l => l.GLCAID === ACC.TRADE_DEBTORS.GLCAID);
        expect(debtorLine.Credit).toBe(11600);
        expect(debtorLine.PartyID).toBe(77);
        expect(debtorLine.AllocatedToVoucherID).toBe(99);

        // Subsidiary write tracks the allocation
        const sub = r.subsidiaryWrites.find(s => s.GLCAID === ACC.TRADE_DEBTORS.GLCAID);
        expect(sub.PartyID).toBe(77);
        expect(sub.AllocatedToVoucherID).toBe(99);
        expect(sub.Credit).toBe(11600);
    });

    test('partial payment — only allocates to existing invoice', () => {
        // Customer pays 5,000 cash, allocates all to invoice voucher #99 (which is 11,600 total).
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Cash', Amount: 5000 }],
            allocations: [{ TargetVoucherID: 99, Amount: 5000 }],
            accounts: ACC,
        });
        expect(r.totals.totalAmount).toBe(5000);
        expect(r.totals.advanceAmount).toBe(0);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('overpayment — excess routes to Customer Advance Received tagged with PartyID', () => {
        // Customer owes 10,000. Pays 12,000 cash. 2,000 should go to advance.
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Cash', Amount: 12000 }],
            allocations: [{ TargetVoucherID: 99, Amount: 10000 }],
            accounts: ACC,
        });
        expect(r.totals.advanceAmount).toBe(2000);
        const advLine = r.lines.find(l => l.GLCAID === ACC.CUSTOMER_ADVANCE_RECEIVED.GLCAID);
        expect(advLine.Credit).toBe(2000);
        expect(advLine.PartyID).toBe(77);
        expect(advLine.JobCardID).toBe(null);  // named customer, no JC tag
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('pre-payment from named customer — no invoices, all to advance', () => {
        // Customer drops 5,000 deposit before any invoice exists.
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Cash', Amount: 5000 }],
            allocations: [],
            accounts: ACC,
        });
        expect(r.totals.advanceAmount).toBe(5000);
        const advLine = r.lines.find(l => l.GLCAID === ACC.CUSTOMER_ADVANCE_RECEIVED.GLCAID);
        expect(advLine.Credit).toBe(5000);
        expect(advLine.PartyID).toBe(77);
        expect(advLine.JobCardID).toBe(null);
    });

    test('walk-in deposit against specific Job Card — advance tagged with JobCardID', () => {
        // Walk-in leaves 5,000 deposit for JC-CT-0046 (no party record).
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: null,
            walkInJobCardID: 46,
            paymentLines: [{ Mode: 'Cash', Amount: 5000 }],
            allocations: [],
            accounts: ACC,
        });
        expect(r.totals.advanceAmount).toBe(5000);
        const advLine = r.lines.find(l => l.GLCAID === ACC.CUSTOMER_ADVANCE_RECEIVED.GLCAID);
        expect(advLine.JobCardID).toBe(46);
        expect(advLine.PartyID).toBe(null);
        expect(advLine.Credit).toBe(5000);
    });

    test('allocates across multiple invoices', () => {
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Cash', Amount: 15000 }],
            allocations: [
                { TargetVoucherID: 99, Amount: 8000 },
                { TargetVoucherID: 101, Amount: 7000 },
            ],
            accounts: ACC,
        });
        const debtorLines = r.lines.filter(l => l.GLCAID === ACC.TRADE_DEBTORS.GLCAID);
        expect(debtorLines).toHaveLength(2);
        expect(debtorLines.find(l => l.AllocatedToVoucherID === 99).Credit).toBe(8000);
        expect(debtorLines.find(l => l.AllocatedToVoucherID === 101).Credit).toBe(7000);
        expect(r.totals.advanceAmount).toBe(0);
    });

    test('Bank Transfer mode requires BankGLCAID on the line', () => {
        const r = buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Bank Transfer', Amount: 10000, BankGLCAID: 9999 }],
            allocations: [{ TargetVoucherID: 99, Amount: 10000 }],
            accounts: ACC,
        });
        const bankLine = r.lines.find(l => l.GLCAID === 9999);
        expect(bankLine.Debit).toBe(10000);
    });

    test('throws if allocations exceed received total', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 77 },
            paymentLines: [{ Mode: 'Cash', Amount: 5000 }],
            allocations: [{ TargetVoucherID: 99, Amount: 8000 }],
            accounts: ACC,
        })).toThrow(/Allocated amount.*exceeds payment total/);
    });

    test('throws if no party and no walk-in JobCardID', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'receive',
            party: null,
            walkInJobCardID: null,
            paymentLines: [{ Mode: 'Cash', Amount: 5000 }],
            allocations: [],
            accounts: ACC,
        })).toThrow(/PartyID or walkInJobCardID/);
    });
});

describe('paymentJournalBuilder — MAKE PAYMENT', () => {
    test('supplier payment — full settlement', () => {
        // We owe ABC Auto Parts 50,000. Pay 20,000 cash + 30,000 cheque, allocate all to bill voucher #150.
        const r = buildPaymentJournalLines({
            direction: 'make',
            party: { PartyID: 7, PartyName: 'ABC Auto Parts' },
            paymentLines: [
                { Mode: 'Cash', Amount: 20000 },
                { Mode: 'Cheque', Amount: 30000, Reference: 'CHQ-9001' },
            ],
            allocations: [{ TargetVoucherID: 150, Amount: 50000 }],
            accounts: ACC,
            refNo: 'CPV-0001',
        });

        expect(r.totals.totalAmount).toBe(50000);
        expect(r.totals.allocatedSum).toBe(50000);
        expect(r.totals.advanceAmount).toBe(0);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);

        // Dr Trade Creditors 50,000 tagged with PartyID + AllocatedToVoucherID
        const credLine = r.lines.find(l => l.GLCAID === ACC.TRADE_CREDITORS.GLCAID);
        expect(credLine.Debit).toBe(50000);
        expect(credLine.PartyID).toBe(7);
        expect(credLine.AllocatedToVoucherID).toBe(150);

        // Cr Cash 20,000, Cr Cheques on Hand 30,000
        const cash = r.lines.find(l => l.GLCAID === ACC.CASH_BOOK.GLCAID);
        expect(cash.Credit).toBe(20000);
        const cheque = r.lines.find(l => l.GLCAID === ACC.CHEQUES_ON_HAND.GLCAID);
        expect(cheque.Credit).toBe(30000);
    });

    test('supplier prepayment — full amount to Supplier Advance Paid', () => {
        const r = buildPaymentJournalLines({
            direction: 'make',
            party: { PartyID: 7 },
            paymentLines: [{ Mode: 'Cash', Amount: 10000 }],
            allocations: [],
            accounts: ACC,
        });
        expect(r.totals.advanceAmount).toBe(10000);
        const advLine = r.lines.find(l => l.GLCAID === ACC.SUPPLIER_ADVANCE_PAID.GLCAID);
        expect(advLine.Debit).toBe(10000);
        expect(advLine.PartyID).toBe(7);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('throws if Make Payment has no party', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'make',
            party: null,
            paymentLines: [{ Mode: 'Cash', Amount: 1000 }],
            allocations: [],
            accounts: ACC,
        })).toThrow(/supplier PartyID/);
    });
});

describe('paymentJournalBuilder — validations', () => {
    test('throws on invalid direction', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'transfer',
            party: { PartyID: 1 },
            paymentLines: [{ Mode: 'Cash', Amount: 100 }],
            allocations: [],
            accounts: ACC,
        })).toThrow(/direction must be/);
    });

    test('throws on zero total', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 1 },
            paymentLines: [{ Mode: 'Cash', Amount: 0 }],
            allocations: [],
            accounts: ACC,
        })).toThrow(/Payment total must be positive/);
    });

    test('allocation without TargetVoucherID throws', () => {
        expect(() => buildPaymentJournalLines({
            direction: 'receive',
            party: { PartyID: 1 },
            paymentLines: [{ Mode: 'Cash', Amount: 100 }],
            allocations: [{ Amount: 100 }],
            accounts: ACC,
        })).toThrow(/TargetVoucherID/);
    });
});
