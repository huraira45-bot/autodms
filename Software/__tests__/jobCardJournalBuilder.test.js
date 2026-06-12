const { buildJournalLines, round2 } = require('../utils/jobCardJournalBuilder');

// Fixture: stand-in account map. The numeric GLCAID values are arbitrary
// for unit-test purposes; the real values come from dms_SystemAccounts at runtime.
const ACC = {
    CASH_BOOK:                { GLCAID: 1001, GLCode: '101001', GLTitle: 'Cash Book' },
    GENERAL_CUSTOMER:         { GLCAID: 1006, GLCode: '101006', GLTitle: 'General Customer' },
    GST_PAYABLE:              { GLCAID: 2002, GLCode: '201002', GLTitle: 'GST Payable' },
    INPUT_GST:                { GLCAID: 1007, GLCode: '101007', GLTitle: 'Input GST' },
    PST_PAYABLE:              { GLCAID: 2003, GLCode: '201003', GLTitle: 'PST Payable' },
    POS_CLEARING:             { GLCAID: 1002, GLCode: '101002', GLTitle: 'POS Clearing' },
    DEFAULT_DISCOUNT_GIVEN:   { GLCAID: 5031, GLCode: '503001', GLTitle: 'Default Discount Given' },
    PURCHASE_RETURN_VARIANCE: { GLCAID: 4014, GLCode: '401004', GLTitle: 'Purchase Return Variance' },
    CUSTOMER_ADVANCE_RECEIVED:{ GLCAID: 2004, GLCode: '201004', GLTitle: 'Customer Advance Received' },
    SUPPLIER_ADVANCE_PAID:    { GLCAID: 1008, GLCode: '101008', GLTitle: 'Supplier Advance Paid' },
    CHEQUES_ON_HAND:          { GLCAID: 1003, GLCode: '101003', GLTitle: 'Cheques on Hand' },
    ROUNDING_ADJUSTMENT:      { GLCAID: 5032, GLCode: '503002', GLTitle: 'Rounding Adjustment' },
    PARTS_REVENUE:            { GLCAID: 4012, GLCode: '401002', GLTitle: 'Parts Sales Revenue' },
    SERVICE_REVENUE:          { GLCAID: 4011, GLCode: '401001', GLTitle: 'Service Revenue' },
    SUBLET_REVENUE:           { GLCAID: 4013, GLCode: '401003', GLTitle: 'Sublet Revenue' },
    COGS_PARTS:               { GLCAID: 5011, GLCode: '501001', GLTitle: 'COGS - Parts' },
    INVENTORY_PARTS:          { GLCAID: 1004, GLCode: '101004', GLTitle: 'Inventory - Parts' },
    SUBLET_COST:              { GLCAID: 5021, GLCode: '502001', GLTitle: 'Sublet Cost' },
    TRADE_DEBTORS:            { GLCAID: 1005, GLCode: '101005', GLTitle: 'Trade Debtors' },
    TRADE_CREDITORS:          { GLCAID: 2001, GLCode: '201001', GLTitle: 'Trade Creditors' },
};

describe('jobCardJournalBuilder — §14.6 worked example (cash, walk-in, with discount)', () => {
    // Inputs from §14.6 exactly
    const jobCard = {
        JobCardId: 42, JobCardNo: 'CT-0042', PaymentType: 'Cash', PartyID: null, PaymentBankID: null,
    };
    const partsLines = [{
        ItemId: 1, Quantity: 1, Rate: 500, UnitLandedCost: 195,
        Discount: 0, DiscAmt: 0,
        TaxRate: 17, TaxAmount: 85,    // 17% of 500
    }];
    const labourLines = [
        { Price: 1500, Discount: 10, DiscType: '%', DiscAmt: 150, TaxRate: 16, TaxAmount: 216 }, // 16% of 1350
        { Price: 500,  Discount: 10, DiscType: '%', DiscAmt: 50,  TaxRate: 16, TaxAmount: 72  }, // 16% of 450
    ];
    const subletLines = [{
        VendorID: 9, Remarks: 'Wheel alignment',
        InvoiceAmount: 800,    // our cost (vendor will be paid this)
        PayableAmount: 1000,   // we charge customer this
        TaxRate: 16, TaxAmount: 160, // 16% of 1000
    }];

    const result = buildJournalLines({ jobCard, labourLines, subletLines, partsLines, accounts: ACC });

    test('totals match §14.6', () => {
        expect(result.totals.partsGross).toBe(500);
        expect(result.totals.labourGross).toBe(2000);     // 1500 + 500
        expect(result.totals.subletRevenueGross).toBe(1000);
        expect(result.totals.totalDiscount).toBe(200);    // 150 + 50
        expect(result.totals.partsTax).toBe(85);
        expect(result.totals.labourPST).toBe(288);        // 216 + 72
        expect(result.totals.subletPST).toBe(160);
        expect(result.totals.totalTax).toBe(533);         // 85 + 288 + 160
        expect(result.totals.partsCOGS).toBe(195);
        expect(result.totals.subletCostTotal).toBe(800);
        expect(result.totals.customerPays).toBe(3833);    // 3500 - 200 + 533
    });

    test('voucher balances exactly', () => {
        expect(result.totals.totalDr).toBe(result.totals.totalCr);
        expect(result.totals.totalDr).toBe(8861);          // matches §14.6 footer
    });

    test('has exactly 13 lines (matches §14.6 row count)', () => {
        expect(result.lines).toHaveLength(13);
    });

    test('General Customer transits to zero', () => {
        const gcLines = result.lines.filter(l => l.GLCAID === ACC.GENERAL_CUSTOMER.GLCAID);
        const dr = gcLines.reduce((a, l) => a + l.Debit, 0);
        const cr = gcLines.reduce((a, l) => a + l.Credit, 0);
        expect(dr).toBe(3833);
        expect(cr).toBe(3833);
        expect(dr - cr).toBe(0);
    });

    test('each major account has the right amount', () => {
        const total = (glcaid, side) => result.lines
            .filter(l => l.GLCAID === glcaid)
            .reduce((a, l) => a + (l[side] || 0), 0);

        expect(total(ACC.PARTS_REVENUE.GLCAID,         'Credit')).toBe(500);
        expect(total(ACC.SERVICE_REVENUE.GLCAID,       'Credit')).toBe(2000);
        expect(total(ACC.SUBLET_REVENUE.GLCAID,        'Credit')).toBe(1000);
        expect(total(ACC.DEFAULT_DISCOUNT_GIVEN.GLCAID,'Debit' )).toBe(200);
        expect(total(ACC.GST_PAYABLE.GLCAID,           'Credit')).toBe(85);
        expect(total(ACC.PST_PAYABLE.GLCAID,           'Credit')).toBe(448);   // labour 288 + sublet 160
        expect(total(ACC.COGS_PARTS.GLCAID,            'Debit' )).toBe(195);
        expect(total(ACC.INVENTORY_PARTS.GLCAID,       'Credit')).toBe(195);
        expect(total(ACC.SUBLET_COST.GLCAID,           'Debit' )).toBe(800);
        expect(total(ACC.TRADE_CREDITORS.GLCAID,       'Credit')).toBe(800);
        expect(total(ACC.CASH_BOOK.GLCAID,             'Debit' )).toBe(3833);
    });

    test('SourceDocType = JOBCARD, SourceDocID = JobCardId', () => {
        expect(result.header.SourceDocType).toBe('JOBCARD');
        expect(result.header.SourceDocID).toBe(42);
    });

    test('subsidiary write for sublet vendor', () => {
        const subWrites = result.subsidiaryWrites.filter(s => s.GLCAID === ACC.TRADE_CREDITORS.GLCAID);
        expect(subWrites).toHaveLength(1);
        expect(subWrites[0].PartyID).toBe(9);
        expect(subWrites[0].Credit).toBe(800);
    });
});

describe('jobCardJournalBuilder — payment mode variations', () => {
    const baseJobCard = { JobCardId: 50, JobCardNo: 'CT-0050', PartyID: null };
    const labourLines = [{ Price: 1000, DiscAmt: 0, TaxRate: 16, TaxAmount: 160 }];

    test('POS payment uses POS Clearing', () => {
        const r = buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'POS' },
            labourLines, accounts: ACC,
        });
        const posLine = r.lines.find(l => l.GLCAID === ACC.POS_CLEARING.GLCAID && l.Debit > 0);
        expect(posLine).toBeTruthy();
        expect(posLine.Debit).toBe(1160);
    });

    test('Bank Transfer uses specified bank account', () => {
        const bank = { GLCAID: 9999, GLCode: '101050', GLTitle: 'HBL Workshop' };
        const r = buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'Bank Transfer' },
            labourLines, accounts: ACC, paymentBank: bank,
        });
        const bankLine = r.lines.find(l => l.GLCAID === bank.GLCAID && l.Debit > 0);
        expect(bankLine).toBeTruthy();
        expect(bankLine.Debit).toBe(1160);
    });

    test('Cheque uses Cheques on Hand', () => {
        const r = buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'Cheque' },
            labourLines, accounts: ACC,
        });
        const cheqLine = r.lines.find(l => l.GLCAID === ACC.CHEQUES_ON_HAND.GLCAID && l.Debit > 0);
        expect(cheqLine).toBeTruthy();
        expect(cheqLine.Debit).toBe(1160);
    });

    test('Credit sale: no cash leg, debits named party Trade Debtors', () => {
        const r = buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'Credit', PartyID: 77 },
            labourLines, accounts: ACC,
        });
        // No payment-side debit line should exist
        const cashLines = r.lines.filter(l =>
            [ACC.CASH_BOOK, ACC.POS_CLEARING, ACC.CHEQUES_ON_HAND].some(a => a.GLCAID === l.GLCAID) && l.Debit > 0
        );
        expect(cashLines).toHaveLength(0);

        // The customer-side debit should hit Trade Debtors with PartyID tagged
        const debtorLine = r.lines.find(l => l.GLCAID === ACC.TRADE_DEBTORS.GLCAID && l.Debit > 0);
        expect(debtorLine).toBeTruthy();
        expect(debtorLine.PartyID).toBe(77);
        expect(debtorLine.Debit).toBe(1160);

        // Subsidiary write to TRADE_DEBTORS for the named party
        const subWrite = r.subsidiaryWrites.find(s => s.GLCAID === ACC.TRADE_DEBTORS.GLCAID);
        expect(subWrite).toBeTruthy();
        expect(subWrite.PartyID).toBe(77);
        expect(subWrite.Debit).toBe(1160);

        // Only 4 lines: Trade Debtors Dr, Service Revenue Cr, PST Cr — and balance check
        expect(r.lines).toHaveLength(3);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('Credit sale without PartyID throws', () => {
        expect(() => buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'Credit', PartyID: null },
            labourLines, accounts: ACC,
        })).toThrow(/Credit Job Card requires PartyID/);
    });

    test('Bank Transfer without paymentBank throws', () => {
        expect(() => buildJournalLines({
            jobCard: { ...baseJobCard, PaymentType: 'Bank Transfer' },
            labourLines, accounts: ACC, paymentBank: null,
        })).toThrow(/paymentBank/);
    });
});

describe('jobCardJournalBuilder — degenerate cases', () => {
    const jc = { JobCardId: 1, JobCardNo: 'CT-0001', PaymentType: 'Cash', PartyID: null };

    test('empty job card with no lines produces zero-totals balanced result', () => {
        const r = buildJournalLines({ jobCard: jc, accounts: ACC });
        expect(r.lines).toHaveLength(0);
        expect(r.totals.customerPays).toBe(0);
        expect(r.totals.totalDr).toBe(0);
        expect(r.totals.totalCr).toBe(0);
    });

    test('parts-only sale (no labour, no sublet)', () => {
        const r = buildJournalLines({
            jobCard: jc,
            partsLines: [{ Quantity: 2, Rate: 500, UnitLandedCost: 195, DiscAmt: 0, TaxRate: 17, TaxAmount: 170 }],
            accounts: ACC,
        });
        expect(r.totals.customerPays).toBe(1170);
        expect(r.totals.partsCOGS).toBe(390);
        expect(r.totals.totalDr).toBe(r.totals.totalCr);
    });

    test('round2 handles floating-point edge cases', () => {
        expect(round2(123.456)).toBe(123.46);
        expect(round2(123.454)).toBe(123.45);
        expect(round2(0.1 + 0.2)).toBe(0.3);
    });
});
