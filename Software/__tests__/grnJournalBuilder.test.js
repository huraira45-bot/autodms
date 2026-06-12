const { buildGRNJournalLines, snapshotGRNLines, round2 } = require('../utils/grnJournalBuilder');

const ACC = {
    INVENTORY_PARTS:  { GLCAID: 1004 },
    INPUT_GST:        { GLCAID: 1007 },
    TRADE_CREDITORS:  { GLCAID: 2001 },
};

describe('snapshotGRNLines — per-line tax + landed cost calculator (§14.7 inputs)', () => {
    // §14.7: 100 oil filters @ 200 + 50 brake pads @ 400. Trade discount 1,000. Freight 500. Freight taxable. GST 17%.
    const header = { NetDiscount: 1000, FreightAmount: 500, FreightTaxable: true };
    const lines = [
        { PurchaseDetailID: 1, Quantity: 100, ItemRate: 200 },  // oil filters: gross 20,000
        { PurchaseDetailID: 2, Quantity: 50,  ItemRate: 400 },  // brake pads: gross 20,000
    ];
    const snaps = snapshotGRNLines({ header, lines, gstRate: 17 });

    test('produces snapshot per line', () => {
        expect(snaps).toHaveLength(2);
    });

    test('oil filter landed unit cost = 197.50', () => {
        const s = snaps.find(s => s.PurchaseDetailID === 1);
        // 20,000 - 500 disc share + 250 freight share = 19,750 / 100 = 197.50
        expect(s.UnitLandedCost).toBe(197.50);
    });

    test('brake pad landed unit cost = 395.00', () => {
        const s = snaps.find(s => s.PurchaseDetailID === 2);
        // 20,000 - 500 disc share + 250 freight share = 19,750 / 50 = 395.00
        expect(s.UnitLandedCost).toBe(395.00);
    });

    test('per-line GST on taxable base (gross + freight share)', () => {
        // Oil filter line: 20,000 + 250 = 20,250 × 17% = 3,442.50
        const sf = snaps.find(s => s.PurchaseDetailID === 1);
        expect(sf.TaxAmount).toBe(3442.50);
        // Brake pad line: 20,000 + 250 = 20,250 × 17% = 3,442.50
        const sb = snaps.find(s => s.PurchaseDetailID === 2);
        expect(sb.TaxAmount).toBe(3442.50);
        // Total = 6,885 — matches §14.7
        expect(sf.TaxAmount + sb.TaxAmount).toBe(6885.00);
    });

    test('freight non-taxable variant: GST only on parts (40,000 × 17% = 6,800)', () => {
        const altHeader = { NetDiscount: 1000, FreightAmount: 500, FreightTaxable: false };
        const altSnaps = snapshotGRNLines({ header: altHeader, lines, gstRate: 17 });
        const totalTax = altSnaps.reduce((a, s) => a + s.TaxAmount, 0);
        expect(totalTax).toBe(6800);
        // Landed cost unchanged (freight still added to inventory)
        expect(altSnaps.find(s => s.PurchaseDetailID === 1).UnitLandedCost).toBe(197.50);
    });

    test('no discount, no freight: landed = list price; GST on full gross', () => {
        const altHeader = { NetDiscount: 0, FreightAmount: 0, FreightTaxable: true };
        const altSnaps = snapshotGRNLines({ header: altHeader, lines, gstRate: 17 });
        expect(altSnaps.find(s => s.PurchaseDetailID === 1).UnitLandedCost).toBe(200);
        expect(altSnaps.find(s => s.PurchaseDetailID === 2).UnitLandedCost).toBe(400);
        const totalTax = altSnaps.reduce((a, s) => a + s.TaxAmount, 0);
        expect(totalTax).toBe(6800); // 40,000 × 17%
    });

    test('unregistered supplier (gstRate=0)', () => {
        const altSnaps = snapshotGRNLines({ header, lines, gstRate: 0 });
        const totalTax = altSnaps.reduce((a, s) => a + s.TaxAmount, 0);
        expect(totalTax).toBe(0);
        expect(altSnaps.find(s => s.PurchaseDetailID === 1).UnitLandedCost).toBe(197.50);
    });
});

describe('buildGRNJournalLines — §14.7 worked example', () => {
    // Inputs to the journal builder are the SNAPSHOT values stored on detail lines.
    const grn = {
        PurchaseID: 42, PurchaseVoucherNo: 'GRN-0042', PartyID: 7,
        FreightAmount: 500, NetDiscount: 1000, FreightTaxable: true,
    };
    const lines = [
        { ItemId: 1, Quantity: 100, ItemRate: 200, TaxRate: 17, TaxAmount: 3442.50, UnitLandedCost: 197.50 },
        { ItemId: 2, Quantity: 50,  ItemRate: 400, TaxRate: 17, TaxAmount: 3442.50, UnitLandedCost: 395.00 },
    ];

    const result = buildGRNJournalLines({ grn, lines, accounts: ACC });

    test('totals match §14.7 exactly', () => {
        expect(result.totals.inventoryDebit).toBe(39500);   // §14.7 line 1
        expect(result.totals.inputGSTTotal).toBe(6885);     // §14.7 line 2
        expect(result.totals.supplierCredit).toBe(46385);   // §14.7 line 3 + matches "Net Payable"
    });

    test('voucher balances and has 3 lines', () => {
        expect(result.lines).toHaveLength(3);
        expect(result.totals.totalDr).toBe(result.totals.totalCr);
        expect(result.totals.totalDr).toBe(46385);
    });

    test('each line targets the correct account', () => {
        const invLine = result.lines.find(l => l.GLCAID === ACC.INVENTORY_PARTS.GLCAID);
        expect(invLine.Debit).toBe(39500);
        const gstLine = result.lines.find(l => l.GLCAID === ACC.INPUT_GST.GLCAID);
        expect(gstLine.Debit).toBe(6885);
        const creditLine = result.lines.find(l => l.GLCAID === ACC.TRADE_CREDITORS.GLCAID);
        expect(creditLine.Credit).toBe(46385);
    });

    test('Trade Creditors line tagged with supplier PartyID', () => {
        const creditLine = result.lines.find(l => l.GLCAID === ACC.TRADE_CREDITORS.GLCAID);
        expect(creditLine.PartyID).toBe(7);
    });

    test('subsidiary write for supplier', () => {
        expect(result.subsidiaryWrites).toHaveLength(1);
        expect(result.subsidiaryWrites[0].PartyID).toBe(7);
        expect(result.subsidiaryWrites[0].Credit).toBe(46385);
        expect(result.subsidiaryWrites[0].GLCAID).toBe(ACC.TRADE_CREDITORS.GLCAID);
    });

    test('SourceDocType=GRN, SourceDocID=PurchaseID', () => {
        expect(result.header.SourceDocType).toBe('GRN');
        expect(result.header.SourceDocID).toBe(42);
    });

    test('throws when PartyID missing', () => {
        expect(() => buildGRNJournalLines({
            grn: { ...grn, PartyID: null },
            lines, accounts: ACC,
        })).toThrow(/PartyID is required/);
    });
});

describe('buildGRNJournalLines — variations', () => {
    test('unregistered supplier (no Input GST): only 2 lines', () => {
        const r = buildGRNJournalLines({
            grn: { PurchaseID: 1, PartyID: 5, FreightAmount: 0, NetDiscount: 0, FreightTaxable: false },
            lines: [
                { Quantity: 10, ItemRate: 100, TaxRate: 0, TaxAmount: 0, UnitLandedCost: 100 },
            ],
            accounts: ACC,
        });
        expect(r.lines).toHaveLength(2);  // Inventory + Trade Creditors, no Input GST line
        expect(r.totals.inventoryDebit).toBe(1000);
        expect(r.totals.inputGSTTotal).toBe(0);
        expect(r.totals.supplierCredit).toBe(1000);
    });

    test('empty GRN yields zero-line balanced result', () => {
        const r = buildGRNJournalLines({
            grn: { PurchaseID: 1, PartyID: 5 },
            lines: [],
            accounts: ACC,
        });
        expect(r.lines).toHaveLength(0);
        expect(r.totals.inventoryDebit).toBe(0);
    });

    test('round2 sanity', () => {
        expect(round2(0.1 + 0.2)).toBe(0.3);
        expect(round2(123.456)).toBe(123.46);
    });
});
