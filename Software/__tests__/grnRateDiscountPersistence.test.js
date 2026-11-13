jest.mock('../config/db', () => ({ getPool: jest.fn(), sql: {
    Int: 'int', DateTime: 'datetime', MAX: 'max', Decimal: () => 'decimal', NVarChar: () => 'nvarchar',
    Transaction: class { constructor(pool) { return pool.tx; } },
    Request: class {
        constructor(tx) { this.tx = tx; this.values = {}; }
        input(key, type, value) { this.values[key] = value; return this; }
        query(text) { return this.tx.query(text, this.values); }
        execute(name) { return this.tx.execute(name, this.values); }
    },
} }));
const { getPool, sql } = require('../config/db');
const grn = require('../controllers/grnController');
const response = () => ({ code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } });
const item = { ItemId: 6, Quantity: 2, ItemRate: 1000, SalesRate: 1400, DiscountPercentage: 12.5, DiscountAmount: 250,
    AdditionalDiscountPct: 2, AdditionalDiscountAmount: 35, TaxRate: 18, TaxAmount: 360, AITAmount: 5, NetAmount: 2080, StockRate: 1000 };
const request = items => ({ params: { id: '17' }, user: { userId: 1, userName: 'Admin' }, body: {
    PurchaseDate: '2026-11-13', SupplierBillNo: 'TEST', PartyID: 3, WHID: 1, Items: JSON.stringify(items),
} });
function database(options = {}) {
    const state = { rows: [], calls: [], finalized: !!options.finalized };
    const tx = {
        begin: jest.fn(async () => {}), commit: jest.fn(async () => {}), rollback: jest.fn(async () => { state.rows = []; }),
        execute: jest.fn(async (name, values) => {
            expect(name).toBe('sp_SavePurchaseGRN');
            state.rows = JSON.parse(values.ItemsJSON).map((line, i) => ({ PurchaseDetailID: 20 + i, ItemId: line.ItemID,
                ItemSalesPrice: line.SalesRate, DiscountAmount: line.Discount, DiscountPercentage: 0 }));
            return { recordset: [{ NewPurchaseID: 17 }] };
        }),
        query: jest.fn(async (text, values) => {
            state.calls.push({ text, values });
            if (options.fail && text.includes(options.fail)) throw Error('Synthetic save failure');
            if (text.includes('OUTPUT INSERTED.CurrentCounter')) return { recordset: [{ CurrentCounter: 8 }] };
            if (text.includes('SELECT PurchaseDetailID')) return { recordset: state.rows.map(row => ({ PurchaseDetailID: row.PurchaseDetailID })) };
            if (text.includes('UPDATE data_PurchaseDetail')) {
                Object.assign(state.rows.find(row => row.PurchaseDetailID === values.id), { ItemSalesPrice: values.sale,
                    DiscountPercentage: values.dp, DiscountAmount: values.da, AdditionalDiscountPct: values.addp,
                    AdditionalDiscountAmount: values.adda, TaxRate: values.tr, TaxAmount: values.ta, AITAmount: values.ait });
            }
            if (text.includes('SELECT IsFinalized')) return { recordset: [{ IsFinalized: state.finalized }] };
            if (text.includes('DELETE FROM data_PurchaseDetail')) state.rows = [];
            if (text.includes('INSERT INTO data_PurchaseDetail')) state.rows.push({ PurchaseDetailID: 20, ItemSalesPrice: values.sale,
                DiscountPercentage: values.dp, DiscountAmount: values.da });
            if (text.includes('SELECT TOP 1 StockIOID')) return { recordset: [{ StockIOID: 9, WHID: 1 }] };
            if (text.includes('FROM vw_PurchaseGRNHeader')) return { recordset: [{ PurchaseID: 17 }] };
            if (text.includes('SELECT d.*')) return { recordset: state.rows.map(row => ({ ...row })) };
            return { recordset: [], rowsAffected: [1] };
        }),
    };
    getPool.mockResolvedValue({ tx, request: () => new sql.Request(tx) });
    return { tx, state };
}
beforeEach(() => { jest.clearAllMocks(); jest.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => jest.restoreAllMocks());

test('first create and reopen preserve sale rate, discount percentage/amount, additional discount and taxes', async () => {
    const { tx } = database(); const res = response(); await grn.saveGRN(request([item]), res);
    expect(res.code).toBe(201); expect(tx.begin).toHaveBeenCalledTimes(1); expect(tx.commit).toHaveBeenCalledTimes(1);
    const opened = response(); await grn.getGRNById({ params: { id: '17' } }, opened);
    expect(opened.body.Items[0]).toMatchObject({ ItemSalesPrice: 1400, DiscountPercentage: 12.5, DiscountAmount: 250,
        AdditionalDiscountPct: 2, AdditionalDiscountAmount: 35, TaxAmount: 360, AITAmount: 5 });
    expect(tx.rollback).not.toHaveBeenCalled();
});

test('two different lines retain their own sale rates and discount percentages after the first save', async () => {
    const { state } = database(); const res = response();
    await grn.saveGRN(request([item, { ...item, ItemId: 7, SalesRate: 1550, DiscountPercentage: 5, DiscountAmount: 100 }]), res);
    expect(res.code).toBe(201);
    expect(state.rows.map(row => [row.ItemSalesPrice, row.DiscountPercentage, row.DiscountAmount])).toEqual([[1400, 12.5, 250], [1550, 5, 100]]);
});

test.each(['UPDATE data_PurchaseDetail', 'UPDATE data_PurchaseInfo'])('a failed %s rolls back the initial SP save instead of leaving a partially saved GRN', async fail => {
    const { tx, state } = database({ fail }); const res = response(); await grn.saveGRN(request([item]), res);
    expect(res.code).toBe(400); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1); expect(state.rows).toEqual([]);
});

test('edit and reopen keep the newly entered sale rate and discount values', async () => {
    const { tx } = database(); const res = response(); await grn.updateGRN(request([{ ...item, SalesRate: 1700, DiscountPercentage: 15, DiscountAmount: 300 }]), res);
    expect(res.code).toBe(200); expect(tx.commit).toHaveBeenCalledTimes(1);
    const opened = response(); await grn.getGRNById({ params: { id: '17' } }, opened);
    expect(opened.body.Items[0]).toMatchObject({ ItemSalesPrice: 1700, DiscountPercentage: 15, DiscountAmount: 300 });
});

test('explicit zero sale rate and discount survive create and edit', async () => {
    for (const save of [grn.saveGRN, grn.updateGRN]) {
        const { state } = database(); const res = response(); await save(request([{ ...item, SalesRate: 0, DiscountPercentage: 0, DiscountAmount: 0 }]), res);
        expect(res.code).toBeLessThan(300); expect(state.rows[0]).toMatchObject({ ItemSalesPrice: 0, DiscountPercentage: 0, DiscountAmount: 0 });
    }
});

test('finalized GRNs remain locked against edits', async () => {
    const { tx } = database({ finalized: true }); const res = response(); await grn.updateGRN(request([item]), res);
    expect(res.code).toBe(423); expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
});

test('empty new GRNs fail before database access', async () => {
    const res = response(); await grn.saveGRN(request([]), res); expect(res.code).toBe(400); expect(getPool).not.toHaveBeenCalled();
});