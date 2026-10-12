jest.mock('../config/db', () => ({
    sql: {
        Int: 'Int',
        Request: class {
            constructor(tx) { this.tx = tx; this.values = {}; }
            input(key, _type, value) { this.values[key] = value; return this; }
            query(query) { return this.tx.query(query, this.values); }
        },
    },
}));
const {
    assertVoucherLinkable, LOCK_VOUCHER_SQL, LINKABLE_VOUCHER_SQL, CUSTOMER_AMOUNT_SQL, LINKED_AMOUNT_SQL,
} = require('../services/historicalVoucherAllocationService');
const { GENERATED_SALES_SOURCES } = require('../services/historicalMasterAllocationService');
const customer = { PartyGLID: 101, PartyName: 'Customer A' };
const opening = {
    VoucherID: 20, VoucherNo: 'JV-OPENING-20', Status: 'Posted', TotalAmount: 10000,
    ReversesVoucherID: null, SourceDocType: null, CustomerAmount: 500, LinkedAmount: 0,
};
function transaction(row = opening) {
    return {
        query: jest.fn(async query => ({ recordset: row ? [query === LOCK_VOUCHER_SQL
            ? { VoucherID: row.VoucherID, VoucherNo: row.VoucherNo, Status: row.Status,
                SourceDocType: row.SourceDocType, ReversesVoucherID: row.ReversesVoucherID } : row] : [] })),
    };
}

it('one opening voucher can back different customers using each account balance', async () => {
    const tx = transaction();
    tx.query.mockImplementation(async (query, values) => query === LOCK_VOUCHER_SQL ? { recordset: [opening] } : ({
        recordset: [{ ...opening, CustomerAmount: values.gl === 101 ? 500 : 1200,
            LinkedAmount: values.gl === 101 ? 300 : 100 }],
    }));
    await expect(assertVoucherLinkable(tx, customer, 20, 200)).resolves.toMatchObject({
        CustomerAmount: 500, LinkedAmount: 300, AvailableAmount: 200,
    });
    await expect(assertVoucherLinkable(tx, { PartyGLID: 102, PartyName: 'Customer B' }, 20, 1100))
        .resolves.toMatchObject({ CustomerAmount: 1200, LinkedAmount: 100, AvailableAmount: 1100 });
    expect(tx.query.mock.calls.map(call => call[1])).toEqual([{ vid: 20 }, { vid: 20, gl: 101 }, { vid: 20 }, { vid: 20, gl: 102 }]);
});

it('allows a partial allocation for another booking on the same account', async () => {
    const tx = transaction({ ...opening, LinkedAmount: 200 });
    await expect(assertVoucherLinkable(tx, customer, 20, 150)).resolves.toMatchObject({ AvailableAmount: 300 });
});

it('uses account balance rather than the combined voucher header total', async () => {
    const tx = transaction(opening);
    await expect(assertVoucherLinkable(tx, customer, 20, 501)).rejects.toMatchObject({ statusCode: 409 });
});

it('refuses allocation a single cent above the remaining account amount', async () => {
    const tx = transaction({ ...opening, CustomerAmount: 1.03, LinkedAmount: 0.73 });
    await expect(assertVoucherLinkable(tx, customer, 20, 0.31)).rejects.toThrow('0.30 remaining');
    await expect(assertVoucherLinkable(tx, customer, 20, 0.1 + 0.2)).resolves.toMatchObject({ AvailableAmount: 0.3 });
});

it('refuses a fully allocated account even when other voucher accounts have balances', async () => {
    const tx = transaction({ ...opening, LinkedAmount: 500 });
    await expect(assertVoucherLinkable(tx, customer, 20, 0.01)).rejects.toThrow('0.00 remaining');
});

it('does not expose a negative available amount when legacy links exceed the cap', async () => {
    const tx = transaction({ ...opening, LinkedAmount: 501 });
    await expect(assertVoucherLinkable(tx, customer, 20, 1)).rejects.toThrow('0.00 remaining');
});

it.each([NaN, Infinity, -Infinity, 0, -1, 0.001, Number.MAX_VALUE])(
    'rejects an invalid requested amount %p before querying SQL', async total => {
        const tx = transaction();
        await expect(assertVoucherLinkable(tx, customer, 20, total)).rejects.toMatchObject({ statusCode: 400 });
        expect(tx.query).not.toHaveBeenCalled();
    },
);

it.each([null, 0, -1, 1.5])('refuses missing or invalid customer account %p', async PartyGLID => {
    const tx = transaction();
    await expect(assertVoucherLinkable(tx, { ...customer, PartyGLID }, 20, 100)).rejects.toMatchObject({ statusCode: 409 });
    expect(tx.query).not.toHaveBeenCalled();
});

it('refuses a missing voucher', async () => {
    await expect(assertVoucherLinkable(transaction(null), customer, 20, 100)).rejects.toMatchObject({ statusCode: 404 });
});

it.each(['Draft', 'Reversed', 'Void'])('refuses a %s voucher', async Status => {
    await expect(assertVoucherLinkable(transaction({ ...opening, Status }), customer, 20, 100))
        .rejects.toMatchObject({ statusCode: 409 });
});

it('refuses a posted reversal voucher', async () => {
    await expect(assertVoucherLinkable(transaction({ ...opening, ReversesVoucherID: 19 }), customer, 20, 100))
        .rejects.toThrow('reversal voucher');
});

it.each([...GENERATED_SALES_SOURCES.map(SourceDocType => ({ SourceDocType })), { UsedByPaymentID: 88 }])(
    'refuses a normal sales receipt reused as an opening voucher %p', async patch => {
        await expect(assertVoucherLinkable(transaction({ ...opening, ...patch }), customer, 20, 100))
            .rejects.toThrow('normal sales payment');
    },
);

it('refuses an account whose voucher lines have no net balance', async () => {
    await expect(assertVoucherLinkable(transaction({ ...opening, CustomerAmount: 0 }), customer, 20, 100))
        .rejects.toThrow('no nonzero net amount');
});

it('locks the common voucher before checking allocations and performs no writes', async () => {
    const tx = transaction();
    await assertVoucherLinkable(tx, customer, 20, 100);
    expect(tx.query).toHaveBeenCalledTimes(2);
    expect(tx.query.mock.calls[0][0]).toBe(LOCK_VOUCHER_SQL);
    expect(tx.query.mock.calls[1][0]).toBe(LINKABLE_VOUCHER_SQL);
    expect(LOCK_VOUCHER_SQL).toContain('WITH (UPDLOCK, HOLDLOCK)');
    expect(LOCK_VOUCHER_SQL).not.toContain('dms_SalesPayments');
    expect(LINKABLE_VOUCHER_SQL).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
});

it('capacity SQL uses net account movement, Posted links and snapshotted account without reading other bookings', () => {
    expect(CUSTOMER_AMOUNT_SQL).toContain('ABS(SUM(ISNULL(d.Debit, 0) - ISNULL(d.Credit, 0)))');
    expect(CUSTOMER_AMOUNT_SQL).toContain('d.GLCAID = @gl');
    expect(LINKED_AMOUNT_SQL).toContain("p.Status = 'Posted'");
    expect(LINKED_AMOUNT_SQL).toContain('p.IsLinkedVoucher = 1');
    expect(LINKED_AMOUNT_SQL).toContain('ISNULL(p.Amount, 0) + ISNULL(p.PremiumPortion, 0)');
    expect(LINKED_AMOUNT_SQL).toContain('p.LinkedVoucherGLCAID = @gl');
    expect(LINKED_AMOUNT_SQL).not.toMatch(/dms_SalesBookings|gen_PartiesInfo|COALESCE/i);
});


it('waits for the standalone header lock before reading any account capacity', async () => {
    let releaseHeaderLock;
    const lock = new Promise(resolve => { releaseHeaderLock = resolve; });
    const tx = transaction();
    tx.query.mockImplementation(query => query === LOCK_VOUCHER_SQL
        ? lock : Promise.resolve({ recordset: [opening] }));
    const pending = assertVoucherLinkable(tx, customer, 20, 100);
    expect(tx.query).toHaveBeenCalledTimes(1);
    expect(tx.query.mock.calls[0][0]).toBe(LOCK_VOUCHER_SQL);
    releaseHeaderLock({ recordset: [{ VoucherID: 20, VoucherNo: opening.VoucherNo, Status: 'Posted' }] });
    await expect(pending).resolves.toMatchObject({ AvailableAmount: 500 });
    expect(tx.query.mock.calls[1][0]).toBe(LINKABLE_VOUCHER_SQL);
});
