jest.mock('../config/db', () => ({
    getPool: jest.fn(),
    sql: {
        Int: 'int', DateTime: 'datetime', MAX: 'max', NVarChar: () => 'nvarchar', Decimal: () => 'decimal',
        Transaction: class { constructor(pool) { return pool.tx; } },
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; }
            input(key, type, value) { this.values[key] = value; return this; }
            query(query) { return this.tx.query(query, this.values); }
        },
    },
}));
jest.mock('../controllers/systemAccountsController', () => ({ resolveRole: jest.fn(async key => ({
    PAINT_INVENTORY: 10, INPUT_GST: 11, ADVANCE_TAX_236G_PARTS: 12, PARTS_DISCOUNT_RECEIVED: 13,
})[key]) }));
jest.mock('../utils/voucherNumbering', () => ({ nextVoucherNo: jest.fn(async () => 'PV-0100') }));
jest.mock('../services/voucherReversalService', () => ({ postReversalVoucher: jest.fn() }));
jest.mock('../controllers/paintLabController', () => ({ _resolveBaseQty: jest.fn() }));

const { getPool } = require('../config/db');
const { postPaintGRNToParty } = require('../services/paintGRNPartyService');
const { postPaintGRNVoucher } = require('../services/paintGRNPostingService');
const controller = require('../controllers/paintGRNController');
const user = { userId: 1, userName: 'Accountant' };
const input = { grnId: 27, partyId: 9, user };

function transaction(changes = {}) {
    const original = { PaintGRNID: 27, GRNNo: 'PGRN-0075', GRNDate: '2026-09-10', Status: 'Posted',
        PaymentMode: 'CASH', PartyID: null, VoucherID: null, SupplierBillNo: '18321',
        SubTotal: 35810, DiscountTotal: 0, GSTTotal: 0, AITTotal: 0, GrandTotal: 35810,
        FinalizedByName: 'Original user', FinalizedAt: '2026-09-10', ...changes };
    const tx = { grn: { ...original }, returns: [], existing: [], legs: [], subsidiary: [], vouchers: [], calls: [],
        supplier: { PartyID: 9, PartyName: 'Paint Supplier', PartyGLID: 99 },
        begin: jest.fn(async () => {}), commit: jest.fn(async () => {}),
        rollback: jest.fn(async () => { tx.grn = { ...original }; tx.legs = []; tx.subsidiary = []; tx.vouchers = []; }),
    };
    tx.query = jest.fn(async (query, values) => {
        tx.calls.push({ query, values });
        if (query.startsWith('SELECT * FROM paint_GRN ')) return { recordset: [{ ...tx.grn }] };
        if (query.includes('FROM paint_GRTN WHERE')) return { recordset: tx.returns };
        if (query.includes('WHERE SourceDocType=\'PAINT_GRN\'')) return { recordset: tx.existing };
        if (query.includes('FROM gen_PartiesInfo p')) return { recordset: tx.supplier ? [tx.supplier] : [] };
        if (query.startsWith('UPDATE paint_GRN SET PartyID=')) {
            tx.grn.PartyID = values.pid; tx.grn.PaymentMode = 'CREDIT'; return { rowsAffected: [1] };
        }
        if (query.includes('ISNULL(PaymentMode')) return { recordset: [{ ...tx.grn }] };
        if (query.includes('SELECT PartyName, PartyGLID')) return { recordset: [tx.supplier] };
        if (query.includes('FROM GLVoucherType')) return { recordset: [{ Voucherid: 2 }] };
        if (query.startsWith('INSERT INTO data_FinanceVoucherInfo')) {
            tx.vouchers.push({ ...values }); return { recordset: [{ VoucherID: 100 }] };
        }
        if (query.startsWith('INSERT INTO data_FinanceVoucherDetail')) {
            tx.legs.push({ ...values }); return { rowsAffected: [1] };
        }
        if (query.startsWith('INSERT INTO dms_PartyLedger')) {
            tx.subsidiary.push({ ...values }); return { rowsAffected: [1] };
        }
        if (query.startsWith('UPDATE data_FinanceVoucherInfo')) {
            if (tx.failPosting) throw new Error('Posting trigger rejected voucher');
            return { rowsAffected: [1] };
        }
        if (query.startsWith('UPDATE paint_GRN SET VoucherID=')) {
            tx.grn.VoucherID = values.vid; return { rowsAffected: [1] };
        }
        throw new Error('Unexpected SQL (stock operations are forbidden): ' + query);
    });
    return tx;
}
const writes = tx => tx.calls.filter(c => /^\s*(INSERT|UPDATE|DELETE)/i.test(c.query));
const response = () => ({ status: jest.fn().mockReturnThis(), json: jest.fn() });

describe('Posted Paint GRN to party, without stock changes', () => {
    test('PGRN-0075 creates one balanced supplier payable and keeps the original receipt posted', async () => {
        const tx = transaction();
        const result = await postPaintGRNToParty(tx, input);
        expect(result).toMatchObject({ VoucherID: 100, VoucherNo: 'PV-0100' });
        expect(tx.grn).toMatchObject({ Status: 'Posted', PaymentMode: 'CREDIT', PartyID: 9, VoucherID: 100,
            FinalizedByName: 'Original user', FinalizedAt: '2026-09-10', GrandTotal: 35810 });
        expect(tx.legs).toEqual([
            expect.objectContaining({ gl: 10, dr: 35810, cr: 0, pid: null }),
            expect.objectContaining({ gl: 99, dr: 0, cr: 35810, pid: 9 }),
        ]);
        expect(tx.subsidiary).toEqual([expect.objectContaining({ pid: 9, gl: 99, cr: 35810, vid: 100 })]);
        expect(tx.vouchers).toEqual([expect.objectContaining({ src: 'PAINT_GRN', srcId: 27, cby: 1, cbyN: 'Accountant' })]);
        expect(tx.vouchers[0].remarks).toContain('Previous PartyID: none');
        expect(tx.calls[0].query).toContain('UPDLOCK, HOLDLOCK');
        expect(writes(tx).every(c => !/paint_(Item|StockLedger|GRNDetail)\b/i.test(c.query))).toBe(true);
    });
    test('tax and discount journal stays balanced and payable equals saved GrandTotal', async () => {
        const tx = transaction({ SubTotal: 1000, DiscountTotal: 100, GSTTotal: 180, AITTotal: 20, GrandTotal: 1100, PartyID: 8 });
        await postPaintGRNToParty(tx, input);
        expect(tx.legs.reduce((sum, leg) => sum + leg.dr - leg.cr, 0)).toBe(0);
        expect(tx.legs.find(leg => leg.pid === 9).cr).toBe(1100);
        expect(tx.legs.map(leg => leg.gl)).toEqual([10, 11, 12, 13, 99]);
        expect(tx.vouchers[0].remarks).toContain('Previous PartyID: 8');
    });
    test.each([{ Status: 'Draft' }, { Status: 'Reversed' }, { PaymentMode: 'CREDIT' }, { VoucherID: 42 }])(
        'refuses incompatible header %p before writes', async changes => {
            const tx = transaction(changes);
            await expect(postPaintGRNToParty(tx, input)).rejects.toHaveProperty('statusCode', 409);
            expect(writes(tx)).toHaveLength(0);
        });
    test('retry cannot create another payable', async () => {
        const tx = transaction();
        await postPaintGRNToParty(tx, input);
        await expect(postPaintGRNToParty(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(tx.vouchers).toHaveLength(1);
    });
    test.each(['returns', 'existing'])('blocks %s before financial changes', async field => {
        const tx = transaction(); tx[field] = [{ id: 1 }];
        await expect(postPaintGRNToParty(tx, input)).rejects.toHaveProperty('statusCode', 409);
        expect(writes(tx)).toHaveLength(0);
    });
    test.each([null, { PartyID: 9, PartyName: 'Unlinked supplier', PartyGLID: null }])(
        'requires an eligible supplier with a GL account: %p', async supplier => {
            const tx = transaction(); tx.supplier = supplier;
            await expect(postPaintGRNToParty(tx, input)).rejects.toHaveProperty('statusCode', 400);
            expect(writes(tx)).toHaveLength(0);
        });
    test.each([{ GrandTotal: 0 }, { GrandTotal: 1 }, { SubTotal: -1 }, { AITTotal: NaN }])(
        'refuses invalid saved totals %p', async changes => {
            const tx = transaction(changes);
            await expect(postPaintGRNToParty(tx, input)).rejects.toHaveProperty('statusCode', 400);
            expect(writes(tx)).toHaveLength(0);
        });
    test.each([{ grnId: 0 }, { partyId: -1 }, { partyId: 1.5 }])('rejects invalid IDs %p', async change => {
        const tx = transaction();
        await expect(postPaintGRNToParty(tx, { ...input, ...change })).rejects.toHaveProperty('statusCode', 400);
        expect(tx.query).not.toHaveBeenCalled();
    });
    test('controller commits the complete financial correction', async () => {
        const tx = transaction(); getPool.mockResolvedValue({ tx }); const res = response();
        await controller.postToParty({ params: { id: '27' }, body: { PartyID: 9 }, user }, res);
        expect(tx.commit).toHaveBeenCalledTimes(1); expect(tx.rollback).not.toHaveBeenCalled();
        expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ VoucherID: 100 }));
    });
    test('controller rolls back supplier, mode and voucher when posting fails', async () => {
        const tx = transaction(); tx.failPosting = true; getPool.mockResolvedValue({ tx }); const res = response();
        await controller.postToParty({ params: { id: '27' }, body: { PartyID: 9 }, user }, res);
        expect(tx.commit).not.toHaveBeenCalled(); expect(tx.rollback).toHaveBeenCalledTimes(1);
        expect(tx.grn).toMatchObject({ PaymentMode: 'CASH', PartyID: null, VoucherID: null, Status: 'Posted' });
        expect(tx.vouchers).toHaveLength(0); expect(tx.legs).toHaveLength(0); expect(tx.subsidiary).toHaveLength(0);
        expect(res.status).toHaveBeenCalledWith(400);
    });
    test('ordinary Cash GRN finalization still skips the GL entirely', async () => {
        const tx = transaction(); expect(await postPaintGRNVoucher(27, user, tx)).toBeNull();
        expect(writes(tx)).toHaveLength(0);
    });
});
