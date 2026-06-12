const { buildSSRJournalLines } = require('../utils/ssrJournalBuilder');

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

describe('ssrJournalBuilder — §14.9 SSR worked example (cash refund)', () => {
    // SSR returning 1 oil filter (originally 2 sold). Landed cost 197.50, sale rate 500, GST 17%, cash refund.
    const ssr = { ReturnID: 7, ReturnNo: 'SSR-0007', OriginalSaleID: 42, PartyID: null, RefundMode: 'Cash' };
    const lines = [{
        Quantity: 1, SaleRate: 500,
        TaxPercent: 17, TaxAmount: 85,
        DiscountAmount: 0,
        UnitLandedCost: 197.50,
    }];

    const r = buildSSRJournalLines({ ssr, lines, accounts: ACC });

    test('totals match expected reversal amounts', () => {
        expect(r.totals.partsGross).toBe(500);
        expect(r.totals.partsTax).toBe(85);
        expect(r.totals.partsCOGS).toBe(197.50);
        expect(r.totals.refundAmount).toBe(585);
    });

    test('voucher balances at 1,367.50', () => {
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
        // Dr: 500 (rev) + 85 (gst) + 197.50 (inv) + 585 (gc transit) = 1,367.50
        // Cr: 197.50 (cogs) + 585 (gc credit) + 585 (cash) = 1,367.50
        expect(r.totals.totalDr).toBe(1367.50);
    });

    test('General Customer transits to zero', () => {
        const gc = r.lines.filter(l => l.GLCAID === ACC.GENERAL_CUSTOMER.GLCAID);
        const dr = gc.reduce((a, l) => a + l.Debit, 0);
        const cr = gc.reduce((a, l) => a + l.Credit, 0);
        expect(dr).toBe(585);
        expect(cr).toBe(585);
    });

    test('each account has the correct reversal amount', () => {
        const total = (glcaid, side) => r.lines
            .filter(l => l.GLCAID === glcaid)
            .reduce((a, l) => a + (l[side] || 0), 0);

        expect(total(ACC.PARTS_REVENUE.GLCAID,   'Debit' )).toBe(500);   // reverse revenue
        expect(total(ACC.GST_PAYABLE.GLCAID,     'Debit' )).toBe(85);    // reverse GST
        expect(total(ACC.INVENTORY_PARTS.GLCAID, 'Debit' )).toBe(197.50); // restock
        expect(total(ACC.COGS_PARTS.GLCAID,      'Credit')).toBe(197.50); // reverse COGS
        expect(total(ACC.CASH_BOOK.GLCAID,       'Credit')).toBe(585);   // cash refunded
    });

    test('SourceDocType=SSR, SourceDocID=ReturnID', () => {
        expect(r.header.SourceDocType).toBe('SSR');
        expect(r.header.SourceDocID).toBe(7);
    });
});

describe('ssrJournalBuilder — refund mode variations', () => {
    const ssr = { ReturnID: 8, ReturnNo: 'SSR-0008', OriginalSaleID: 50, PartyID: null };
    const lines = [{ Quantity: 1, SaleRate: 1000, TaxPercent: 17, TaxAmount: 170, DiscountAmount: 0, UnitLandedCost: 700 }];

    test('POS refund: POS Clearing credited (money flows out via card refund pending bank settle)', () => {
        const r = buildSSRJournalLines({ ssr: { ...ssr, RefundMode: 'POS' }, lines, accounts: ACC });
        const pos = r.lines.find(l => l.GLCAID === ACC.POS_CLEARING.GLCAID && l.Credit > 0);
        expect(pos.Credit).toBe(1170);
    });

    test('Bank Transfer refund: specified bank credited', () => {
        const bank = { GLCAID: 9999 };
        const r = buildSSRJournalLines({ ssr: { ...ssr, RefundMode: 'Bank Transfer' }, lines, accounts: ACC, paymentBank: bank });
        const b = r.lines.find(l => l.GLCAID === bank.GLCAID && l.Credit > 0);
        expect(b.Credit).toBe(1170);
    });

    test('Cheque refund: Cheques on Hand credited (outgoing cheque)', () => {
        const r = buildSSRJournalLines({ ssr: { ...ssr, RefundMode: 'Cheque' }, lines, accounts: ACC });
        const c = r.lines.find(l => l.GLCAID === ACC.CHEQUES_ON_HAND.GLCAID && l.Credit > 0);
        expect(c.Credit).toBe(1170);
    });

    test('Credit refund: credits named-party Trade Debtors (no cash outflow)', () => {
        const r = buildSSRJournalLines({
            ssr: { ...ssr, RefundMode: 'Credit', PartyID: 88 },
            lines, accounts: ACC,
        });
        // No payment-side leg
        const cashIds = [ACC.CASH_BOOK.GLCAID, ACC.POS_CLEARING.GLCAID, ACC.CHEQUES_ON_HAND.GLCAID];
        const cashLines = r.lines.filter(l => cashIds.includes(l.GLCAID) && l.Credit > 0);
        expect(cashLines).toHaveLength(0);

        // Trade Debtors credited with PartyID tagged
        const debtorLine = r.lines.find(l => l.GLCAID === ACC.TRADE_DEBTORS.GLCAID && l.Credit > 0);
        expect(debtorLine.Credit).toBe(1170);
        expect(debtorLine.PartyID).toBe(88);

        // Subsidiary write
        const subWrite = r.subsidiaryWrites.find(s => s.GLCAID === ACC.TRADE_DEBTORS.GLCAID);
        expect(subWrite.PartyID).toBe(88);
        expect(subWrite.Credit).toBe(1170);

        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('Credit refund without PartyID throws', () => {
        expect(() => buildSSRJournalLines({
            ssr: { ...ssr, RefundMode: 'Credit', PartyID: null },
            lines, accounts: ACC,
        })).toThrow(/Credit SSR.*requires PartyID/);
    });
});

describe('ssrJournalBuilder — discount reversal', () => {
    test('with original discount: Cr Default Discount Given (reverse) + revenue at gross', () => {
        // 1 part with 100 discount: gross 1000, net 900, GST on net = 153, refund = 1053
        const r = buildSSRJournalLines({
            ssr: { ReturnID: 1, ReturnNo: 'SSR-0001', RefundMode: 'Cash', PartyID: null },
            lines: [{ Quantity: 1, SaleRate: 1000, TaxPercent: 17, TaxAmount: 153, DiscountAmount: 100, UnitLandedCost: 700 }],
            accounts: ACC,
        });
        expect(r.totals.partsGross).toBe(1000);
        expect(r.totals.partsDiscount).toBe(100);
        expect(r.totals.refundAmount).toBe(1053);

        const discLine = r.lines.find(l => l.GLCAID === ACC.DEFAULT_DISCOUNT_GIVEN.GLCAID);
        expect(discLine.Credit).toBe(100);   // discount reversed (the expense recovers)
        const revLine = r.lines.find(l => l.GLCAID === ACC.PARTS_REVENUE.GLCAID);
        expect(revLine.Debit).toBe(1000);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });
});

describe('ssrJournalBuilder — degenerate cases', () => {
    test('empty SSR yields no posting', () => {
        const r = buildSSRJournalLines({
            ssr: { ReturnID: 1, RefundMode: 'Cash' },
            lines: [],
            accounts: ACC,
        });
        expect(r.lines).toHaveLength(0);
    });
});
