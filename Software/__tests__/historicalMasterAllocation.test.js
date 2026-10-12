jest.mock('../config/db', () => ({
    sql: {
        Int: 'Int', Decimal: () => 'Decimal', NVarChar: size => `NVarChar(${size})`,
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; tx.requests.push(this); }
            input(key, _type, value) { this.values[key] = value; return this; }
            query(query) { return this.tx.query(query, this.values); }
        },
    },
}));
const {
    linkMasterVoucher, MASTER_AMOUNT_SQL, MASTER_LINKED_SQL, MASTER_HEADER_LOCK_SQL, MASTER_CAPACITY_SQL, GENERATED_SALES_SOURCES, historicalMasterPaidSql,
} = require('../services/historicalMasterAllocationService');
const booking = { BookingID: 7, IsHistorical: true, NegotiatedPrice: 1000 };
const user = { employeeId: 9, userName: 'Accounts Officer' };
const voucher = {
    VoucherID: 20, VoucherNo: 'JV-OPENING-20', Status: 'Posted', ReversesVoucherID: null,
    SourceDocType: null, MasterAmount: 1000, LinkedAmount: 0,
};
function transaction(rows = [[voucher], [], [{ Paid: 0 }], []]) {
    const tx = {
        calls: [], requests: [],
        query: jest.fn(async (query, values) => {
            tx.calls.push({ query, values });
            if (query === MASTER_HEADER_LOCK_SQL) {
                return { recordset: (rows[0] || []).map(row => ({ VoucherID: row.VoucherID, VoucherNo: row.VoucherNo,
                    VoucherDate: row.VoucherDate, Status: row.Status, SourceDocType: row.SourceDocType,
                    ReversesVoucherID: row.ReversesVoucherID })) };
            }
            const row = rows.shift();
            if (row instanceof Error) throw row;
            return { recordset: row || [], rowsAffected: [1] };
        }),
    };
    return tx;
}
const writes = tx => tx.calls.filter(call => /^\s*(INSERT|UPDATE|DELETE)/i.test(call.query));

it('allows two historical bookings to share the opening voucher through partial allocations', async () => {
    const tx = transaction([
        [voucher], [], [{ Paid: 0 }], [],
        [{ ...voucher, LinkedAmount: 400 }], [], [{ Paid: 0 }], [],
    ]);
    await expect(linkMasterVoucher(tx, booking, 20, 400, 101, user))
        .resolves.toMatchObject({ Amount: 400, UnclaimedToMaster: 600 });
    await expect(linkMasterVoucher(tx, { ...booking, BookingID: 8 }, 20, 600, 101, user))
        .resolves.toMatchObject({ Amount: 600, UnclaimedToMaster: 0 });
    expect(writes(tx).map(call => call.values)).toEqual([
        { b: 7, v: 20, gl: 101, a: 400, emp: 9, name: 'Accounts Officer' },
        { b: 8, v: 20, gl: 101, a: 600, emp: 9, name: 'Accounts Officer' },
    ]);
});

it('stores only the selected allocation amount and actor, without changing ledger or booking amounts', async () => {
    const tx = transaction();
    await linkMasterVoucher(tx, booking, 20, 150.25, 101, user);
    expect(writes(tx)).toHaveLength(1);
    expect(writes(tx)[0].query).toContain('INSERT INTO dms_HistoricalMasterAllocations');
    expect(writes(tx)[0].values).toMatchObject({ a: 150.25, b: 7, v: 20, gl: 101, emp: 9, name: user.userName });
    expect(tx.calls[0].query).toContain('WITH (UPDLOCK,HOLDLOCK)');
    expect(tx.requests).toHaveLength(tx.calls.length);
});

it('allows exactly the remaining cents and handles floating point sums', async () => {
    const tx = transaction([[{ ...voucher, MasterAmount: 1.03, LinkedAmount: 0.73 }], [], [{ Paid: 0 }], []]);
    await expect(linkMasterVoucher(tx, booking, 20, 0.1 + 0.2, 101, user))
        .resolves.toMatchObject({ Amount: 0.3, UnclaimedToMaster: 0 });
    expect(writes(tx)[0].values.a).toBe(0.3);
});

it('refuses a single cent above remaining Master capacity', async () => {
    const tx = transaction([[{ ...voucher, MasterAmount: 1.03, LinkedAmount: 0.73 }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 0.31, 101, user)).rejects.toMatchObject({ statusCode: 409 });
    expect(writes(tx)).toHaveLength(0);
    expect(tx.query).toHaveBeenCalledTimes(2);
});

it.each([{ MasterAmount: 1000, LinkedAmount: 1000 }, { MasterAmount: 1000, LinkedAmount: 1001 }, { MasterAmount: 0 }, { MasterAmount: -100 }])(
    'refuses exhausted or nondebit Master capacity %p', async patch => {
        const tx = transaction([[{ ...voucher, ...patch }]]);
        await expect(linkMasterVoucher(tx, booking, 20, 0.01, 101, user)).rejects.toMatchObject({ statusCode: 409 });
        expect(writes(tx)).toHaveLength(0);
    },
);

it('refuses duplicate allocation of the same voucher to this booking and account', async () => {
    const tx = transaction([[voucher], [{ AllocationID: 1 }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).rejects.toThrow('already has an allocation');
    expect(tx.calls[2].values).toEqual({ b: 7, v: 20, gl: 101 });
    expect(writes(tx)).toHaveLength(0);
});

it('allows allocation up to the agreed vehicle price after earlier Master payments', async () => {
    const tx = transaction([[voucher], [], [{ Paid: 900 }], []]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).resolves.toMatchObject({ Amount: 100 });
});

it('refuses a single cent above the agreed vehicle price after earlier Master payments', async () => {
    const tx = transaction([[voucher], [], [{ Paid: 900 }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 100.01, 101, user)).rejects.toThrow('agreed vehicle price');
    expect(writes(tx)).toHaveLength(0);
});

it('paid SQL counts active original historical allocations alongside booking-tagged payments', async () => {
    const tx = transaction();
    await linkMasterVoucher(tx, booking, 20, 100, 101, user);
    const paid = tx.calls[3];
    expect(paid.values).toEqual({ bid: 7, gl: 101 });
    expect(paid.query).toContain("v.Status IN ('Posted','Reversed')");
    expect(paid.query).toContain('d.GLCAID=@gl AND d.BookingID=@bid');
    expect(paid.query).toContain(historicalMasterPaidSql('@bid', '@gl'));
    const expression = historicalMasterPaidSql('b.BookingID', 'cfg.GLCAID');
    expect(expression).toContain('hm.BookingID=b.BookingID AND hm.GLCAID=cfg.GLCAID');
    expect(expression).toContain("hv.Status='Posted' AND hv.ReversesVoucherID IS NULL");
});

it.each([NaN, Infinity, -Infinity, 0, -1, 0.001, Number.MAX_VALUE])(
    'rejects invalid requested amount %p before SQL', async amount => {
        const tx = transaction();
        await expect(linkMasterVoucher(tx, booking, 20, amount, 101, user)).rejects.toMatchObject({ statusCode: 400 });
        expect(tx.query).not.toHaveBeenCalled();
    },
);

it('refuses a normal booking before querying SQL', async () => {
    const tx = transaction();
    await expect(linkMasterVoucher(tx, { ...booking, IsHistorical: false }, 20, 100, 101, user))
        .rejects.toMatchObject({ statusCode: 409 });
    expect(tx.query).not.toHaveBeenCalled();
});

it.each([0, -1, 1.5, NaN])('refuses invalid voucher ID %p before SQL', async voucherId => {
    const tx = transaction();
    await expect(linkMasterVoucher(tx, booking, voucherId, 100, 101, user)).rejects.toMatchObject({ statusCode: 400 });
    expect(tx.query).not.toHaveBeenCalled();
});

it('refuses a missing voucher', async () => {
    await expect(linkMasterVoucher(transaction([[]]), booking, 20, 100, 101, user)).rejects.toMatchObject({ statusCode: 404 });
});

it.each(['Draft', 'Reversed', 'Void'])('refuses a %s voucher without writes', async Status => {
    const tx = transaction([[{ ...voucher, Status }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).rejects.toMatchObject({ statusCode: 409 });
    expect(writes(tx)).toHaveLength(0);
});

it('refuses a posted reversal voucher', async () => {
    const tx = transaction([[{ ...voucher, ReversesVoucherID: 19 }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).rejects.toThrow('original posted Master voucher');
    expect(writes(tx)).toHaveLength(0);
});

it.each(GENERATED_SALES_SOURCES)('refuses an automatically generated %s payment', async SourceDocType => {
    const tx = transaction([[{ ...voucher, SourceDocType }]]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).rejects.toThrow('already belong to their booking');
    expect(writes(tx)).toHaveLength(0);
});

it('propagates allocation insert failure so its transaction can roll back', async () => {
    const tx = transaction([[voucher], [], [{ Paid: 0 }], new Error('Allocation insert failed')]);
    await expect(linkMasterVoucher(tx, booking, 20, 100, 101, user)).rejects.toThrow('Allocation insert failed');
});

it('Master balance SQL separates untagged opening amounts from explicit historical allocations', () => {
    expect(MASTER_AMOUNT_SQL).toContain('SUM(ISNULL(d.Debit,0)-ISNULL(d.Credit,0))');
    expect(MASTER_AMOUNT_SQL).toContain('d.GLCAID=@gl AND d.BookingID IS NULL');
    expect(MASTER_LINKED_SQL).toContain('SUM(a.Amount)');
    expect(MASTER_LINKED_SQL).toContain('a.VoucherID=v.VoucherID AND a.GLCAID=@gl');
});

it('waits for the Master header lock before reading capacity or writing an allocation', async () => {
    let releaseHeaderLock;
    const lock = new Promise(resolve => { releaseHeaderLock = resolve; });
    const tx = transaction();
    const queryAfterLock = tx.query.getMockImplementation();
    tx.query.mockImplementation((query, values) => query === MASTER_HEADER_LOCK_SQL
        ? lock : queryAfterLock(query, values));
    const pending = linkMasterVoucher(tx, booking, 20, 100, 101, user);
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(tx.query.mock.calls[0][0]).toBe(MASTER_HEADER_LOCK_SQL);
    expect(MASTER_HEADER_LOCK_SQL).not.toContain('dms_HistoricalMasterAllocations');
    expect(writes(tx)).toHaveLength(0);
    releaseHeaderLock({ recordset: [{ VoucherID: 20, VoucherNo: voucher.VoucherNo, Status: 'Posted' }] });
    await expect(pending).resolves.toMatchObject({ Amount: 100, UnclaimedToMaster: 900 });
    expect(tx.query.mock.calls[1][0]).toBe(MASTER_CAPACITY_SQL);
    expect(writes(tx)).toHaveLength(1);
});
