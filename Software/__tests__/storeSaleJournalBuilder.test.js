const { buildStoreSaleJournalLines } = require('../utils/storeSaleJournalBuilder');

const ACC = {
    CASH_BOOK:                { GLCAID: 1001 },
    GENERAL_CUSTOMER:         { GLCAID: 1006 },
    GST_PAYABLE:              { GLCAID: 2002 },
    POS_CLEARING:             { GLCAID: 1002 },
    CHEQUES_ON_HAND:          { GLCAID: 1003 },
    DEFAULT_DISCOUNT_GIVEN:   { GLCAID: 5031 },
    PARTS_REVENUE:            { GLCAID: 4012 },
    COGS_PARTS:               { GLCAID: 5011 },
    INVENTORY_PARTS:          { GLCAID: 1004 },
    TRADE_DEBTORS:            { GLCAID: 1005 },
};

describe('storeSaleJournalBuilder — §14.9 worked example (cash counter sale)', () => {
    // 2 oil filters @ 500 each, landed cost 197.50 each, GST 17%, no discount, cash
    const storeSale = { SaleID: 42, InvoiceNo: 'SS-0042', PaymentMode: 'Cash', PartyID: null };
    const lines = [{
        Quantity: 2, SaleRate: 500,
        TaxPercent: 17, TaxAmount: 170,
        DiscountAmount: 0,
        UnitLandedCost: 197.50,
    }];

    const r = buildStoreSaleJournalLines({ storeSale, lines, accounts: ACC });

    test('totals match §14.9 exactly', () => {
        expect(r.totals.partsGross).toBe(1000);
        expect(r.totals.partsTax).toBe(170);
        expect(r.totals.partsCOGS).toBe(395);    // 2 × 197.50
        expect(r.totals.customerPays).toBe(1170);
    });

    test('has 7 lines, balances at 2,735 (§14.9 doc says "2,565" — typo; correct sum is 2,735)', () => {
        // 1170 (Trade Debtors/General Customer) + 395 (COGS) + 1170 (Cash Book) = 2,735 Dr
        // 1000 (Revenue) + 170 (GST) + 395 (Inventory) + 1170 (General Customer settle) = 2,735 Cr
        expect(r.lines).toHaveLength(7);
        expect(r.totals.totalDr).toBe(2735);
        expect(r.totals.totalCr).toBe(2735);
    });

    test('General Customer transits to zero', () => {
        const gcLines = r.lines.filter(l => l.GLCAID === ACC.GENERAL_CUSTOMER.GLCAID);
        const dr = gcLines.reduce((a, l) => a + l.Debit, 0);
        const cr = gcLines.reduce((a, l) => a + l.Credit, 0);
        expect(dr).toBe(1170);
        expect(cr).toBe(1170);
    });

    test('each account has correct amount', () => {
        const total = (glcaid, side) => r.lines
            .filter(l => l.GLCAID === glcaid)
            .reduce((a, l) => a + (l[side] || 0), 0);

        expect(total(ACC.PARTS_REVENUE.GLCAID,     'Credit')).toBe(1000);
        expect(total(ACC.GST_PAYABLE.GLCAID,       'Credit')).toBe(170);
        expect(total(ACC.COGS_PARTS.GLCAID,        'Debit' )).toBe(395);
        expect(total(ACC.INVENTORY_PARTS.GLCAID,   'Credit')).toBe(395);
        expect(total(ACC.CASH_BOOK.GLCAID,         'Debit' )).toBe(1170);
    });

    test('SourceDocType=STORE_SALE, SourceDocID=SaleID', () => {
        expect(r.header.SourceDocType).toBe('STORE_SALE');
        expect(r.header.SourceDocID).toBe(42);
    });
});

describe('storeSaleJournalBuilder — payment mode variations', () => {
    const ss = { SaleID: 50, InvoiceNo: 'SS-0050', PartyID: null };
    const lines = [{ Quantity: 1, SaleRate: 1000, TaxPercent: 17, TaxAmount: 170, DiscountAmount: 0, UnitLandedCost: 700 }];

    test('POS sale: POS Clearing receives customer payment', () => {
        const r = buildStoreSaleJournalLines({ storeSale: { ...ss, PaymentMode: 'POS' }, lines, accounts: ACC });
        const pos = r.lines.find(l => l.GLCAID === ACC.POS_CLEARING.GLCAID && l.Debit > 0);
        expect(pos.Debit).toBe(1170);
    });

    test('Bank Transfer routes to specified bank', () => {
        const bank = { GLCAID: 9999 };
        const r = buildStoreSaleJournalLines({ storeSale: { ...ss, PaymentMode: 'Bank Transfer' }, lines, accounts: ACC, paymentBank: bank });
        const b = r.lines.find(l => l.GLCAID === bank.GLCAID && l.Debit > 0);
        expect(b.Debit).toBe(1170);
    });

    test('Cheque uses Cheques on Hand', () => {
        const r = buildStoreSaleJournalLines({ storeSale: { ...ss, PaymentMode: 'Cheque' }, lines, accounts: ACC });
        const c = r.lines.find(l => l.GLCAID === ACC.CHEQUES_ON_HAND.GLCAID && l.Debit > 0);
        expect(c.Debit).toBe(1170);
    });

    test('Credit sale: no cash leg, Trade Debtors tagged with PartyID', () => {
        const r = buildStoreSaleJournalLines({
            storeSale: { ...ss, PaymentMode: 'Credit', PartyID: 88 },
            lines, accounts: ACC,
        });
        // No payment-side debit line — check none of cash/pos/cheque accounts is debited
        const cashAccountIds = [ACC.CASH_BOOK.GLCAID, ACC.POS_CLEARING.GLCAID, ACC.CHEQUES_ON_HAND.GLCAID];
        const cashLines = r.lines.filter(l => cashAccountIds.includes(l.GLCAID) && l.Debit > 0);
        expect(cashLines).toHaveLength(0);

        const debtor = r.lines.find(l => l.GLCAID === ACC.TRADE_DEBTORS.GLCAID && l.Debit > 0);
        expect(debtor.Debit).toBe(1170);
        expect(debtor.PartyID).toBe(88);
    });

    test('Credit without PartyID throws', () => {
        expect(() => buildStoreSaleJournalLines({
            storeSale: { ...ss, PaymentMode: 'Credit', PartyID: null },
            lines, accounts: ACC,
        })).toThrow(/Credit Store Sale requires PartyID/);
    });
});

describe('storeSaleJournalBuilder — discount handling', () => {
    test('with discount: revenue at gross + separate Discount Given line', () => {
        // 1 part @ 1,000 with 100 discount. Net 900. GST 17% of 900 = 153. Customer pays 1,053.
        const r = buildStoreSaleJournalLines({
            storeSale: { SaleID: 1, InvoiceNo: 'SS-0001', PaymentMode: 'Cash', PartyID: null },
            lines: [{ Quantity: 1, SaleRate: 1000, TaxPercent: 17, TaxAmount: 153, DiscountAmount: 100, UnitLandedCost: 700 }],
            accounts: ACC,
        });
        expect(r.totals.partsGross).toBe(1000);
        expect(r.totals.partsDiscount).toBe(100);
        expect(r.totals.customerPays).toBe(1053);

        const discLine = r.lines.find(l => l.GLCAID === ACC.DEFAULT_DISCOUNT_GIVEN.GLCAID);
        expect(discLine.Debit).toBe(100);
        // Revenue is still gross
        const revLine = r.lines.find(l => l.GLCAID === ACC.PARTS_REVENUE.GLCAID);
        expect(revLine.Credit).toBe(1000);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });
});

describe('storeSaleJournalBuilder — degenerate cases', () => {
    test('empty store sale yields no posting', () => {
        const r = buildStoreSaleJournalLines({
            storeSale: { SaleID: 1, PaymentMode: 'Cash', PartyID: null },
            lines: [],
            accounts: ACC,
        });
        expect(r.lines).toHaveLength(0);
        expect(r.totals.customerPays).toBe(0);
    });
});
