const { buildGRTNJournalLines, snapshotGRTNLines, round2 } = require('../utils/grtnJournalBuilder');

const ACC = {
    INVENTORY_PARTS:           { GLCAID: 1004 },
    INPUT_GST:                 { GLCAID: 1007 },
    TRADE_CREDITORS:           { GLCAID: 2001 },
    PURCHASE_RETURN_VARIANCE:  { GLCAID: 4014 },
};

describe('snapshotGRTNLines — read from original GRN line', () => {
    test('captures original landed cost + tax rate; computes line tax', () => {
        // §14.8 inputs: returning 20 oil filters from a GRN where unit landed cost was 197.50, GST 17%
        const snaps = snapshotGRTNLines({
            lines: [{
                PurchaseReturnDetailID: 1,
                Quantity: 20, ItemRate: 200,            // supplier credits at list price
                OriginalTaxRate: 17, OriginalLandedCost: 197.50,
            }],
        });
        expect(snaps).toHaveLength(1);
        // Line tax = qty × itemRate × rate = 20 × 200 × 17% = 680
        expect(snaps[0].TaxAmount).toBe(680);
        expect(snaps[0].TaxRate).toBe(17);
        expect(snaps[0].UnitLandedCost).toBe(197.50);
    });

    test('handles multiple line items', () => {
        const snaps = snapshotGRTNLines({
            lines: [
                { PurchaseReturnDetailID: 1, Quantity: 20, ItemRate: 200, OriginalTaxRate: 17, OriginalLandedCost: 197.50 },
                { PurchaseReturnDetailID: 2, Quantity: 10, ItemRate: 400, OriginalTaxRate: 17, OriginalLandedCost: 395 },
            ],
        });
        expect(snaps).toHaveLength(2);
        expect(snaps[0].TaxAmount).toBe(680);  // 20 × 200 × 17%
        expect(snaps[1].TaxAmount).toBe(680);  // 10 × 400 × 17%
    });
});

describe('buildGRTNJournalLines — §14.8 worked example', () => {
    // §14.8: return 20 oil filters from GRN-0042 (where landed = 197.50/unit, list price = 200, GST 17%)
    const grtn = {
        PurchaseReturnID: 7,
        PurchaseReturnNo: 'GRTN-0007',
        PartyID: 7,                  // ABC Auto Parts
        PurchaseID: 42,              // parent GRN
    };
    const lines = [{
        Quantity: 20, ItemRate: 200,
        TaxRate: 17, TaxAmount: 680,
        UnitLandedCost: 197.50,
    }];

    const result = buildGRTNJournalLines({ grtn, lines, accounts: ACC });

    test('totals match §14.8 exactly', () => {
        expect(result.totals.supplierDebit).toBe(4680);     // §14.8 line 1
        expect(result.totals.inventoryCredit).toBe(3950);   // §14.8 line 2 (20 × 197.50)
        expect(result.totals.inputGSTReverse).toBe(680);    // §14.8 line 3
        expect(result.totals.variance).toBe(50);            // §14.8 line 4: 4,680 − 3,950 − 680
    });

    test('voucher has 4 lines and balances', () => {
        expect(result.lines).toHaveLength(4);
        expect(result.totals.totalDr).toBe(result.totals.totalCr);
        expect(result.totals.totalDr).toBe(4680);
    });

    test('each line targets correct account with correct amount', () => {
        const total = (glcaid, side) => result.lines
            .filter(l => l.GLCAID === glcaid)
            .reduce((a, l) => a + (l[side] || 0), 0);

        expect(total(ACC.TRADE_CREDITORS.GLCAID,          'Debit' )).toBe(4680);
        expect(total(ACC.INVENTORY_PARTS.GLCAID,          'Credit')).toBe(3950);
        expect(total(ACC.INPUT_GST.GLCAID,                'Credit')).toBe(680);
        expect(total(ACC.PURCHASE_RETURN_VARIANCE.GLCAID, 'Credit')).toBe(50);
    });

    test('Trade Creditors debit tagged with supplier PartyID', () => {
        const supplierLine = result.lines.find(l => l.GLCAID === ACC.TRADE_CREDITORS.GLCAID);
        expect(supplierLine.PartyID).toBe(7);
        expect(supplierLine.Debit).toBe(4680);
    });

    test('subsidiary write reduces supplier balance', () => {
        expect(result.subsidiaryWrites).toHaveLength(1);
        expect(result.subsidiaryWrites[0].PartyID).toBe(7);
        expect(result.subsidiaryWrites[0].Debit).toBe(4680);
    });

    test('SourceDocType=GRTN, SourceDocID=PurchaseReturnID', () => {
        expect(result.header.SourceDocType).toBe('GRTN');
        expect(result.header.SourceDocID).toBe(7);
    });
});

describe('buildGRTNJournalLines — variations', () => {
    test('zero-variance: landed cost = list price (no original discount/freight)', () => {
        const r = buildGRTNJournalLines({
            grtn: { PurchaseReturnID: 1, PartyID: 5 },
            lines: [{ Quantity: 10, ItemRate: 100, TaxRate: 17, TaxAmount: 170, UnitLandedCost: 100 }],
            accounts: ACC,
        });
        expect(r.totals.variance).toBe(0);
        expect(r.lines).toHaveLength(3); // no variance line
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('negative variance (loss): landed cost > list price', () => {
        const r = buildGRTNJournalLines({
            grtn: { PurchaseReturnID: 1, PartyID: 5 },
            // 10 units, supplier credits 100 each, but we paid 110 each (landed)
            lines: [{ Quantity: 10, ItemRate: 100, TaxRate: 17, TaxAmount: 170, UnitLandedCost: 110 }],
            accounts: ACC,
        });
        // supplierDebit 1170, inventoryCredit 1100, inputGSTReverse 170, variance = 1170 - 1100 - 170 = -100
        expect(r.totals.variance).toBe(-100);
        const varLine = r.lines.find(l => l.GLCAID === ACC.PURCHASE_RETURN_VARIANCE.GLCAID);
        expect(varLine.Debit).toBe(100);    // loss recorded as debit
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('unregistered supplier (no GST on credit note): only 3 lines, no Input GST reverse', () => {
        const r = buildGRTNJournalLines({
            grtn: { PurchaseReturnID: 1, PartyID: 5 },
            lines: [{ Quantity: 10, ItemRate: 100, TaxRate: 0, TaxAmount: 0, UnitLandedCost: 100 }],
            accounts: ACC,
        });
        expect(r.totals.inputGSTReverse).toBe(0);
        const gstLines = r.lines.filter(l => l.GLCAID === ACC.INPUT_GST.GLCAID);
        expect(gstLines).toHaveLength(0);
        expect(r.lines).toHaveLength(2);    // Trade Creditors + Inventory only
    });

    test('throws when PartyID missing', () => {
        expect(() => buildGRTNJournalLines({
            grtn: { PurchaseReturnID: 1, PartyID: null },
            lines: [{ Quantity: 1, ItemRate: 100, TaxRate: 17, TaxAmount: 17, UnitLandedCost: 100 }],
            accounts: ACC,
        })).toThrow(/PartyID is required/);
    });

    test('empty GRTN yields zero-line balanced result', () => {
        const r = buildGRTNJournalLines({
            grtn: { PurchaseReturnID: 1, PartyID: 5 },
            lines: [],
            accounts: ACC,
        });
        expect(r.lines).toHaveLength(0);
    });
});
