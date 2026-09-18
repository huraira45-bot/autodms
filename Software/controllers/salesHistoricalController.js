/**
 * Sales — historical bookings.
 *
 * Owner ask 2026-09-18: deals done before DealerDesk need to be on record, but
 * their money is already in the chart of accounts. So the booking is entered on
 * the same form, and its payments are tied to vouchers that are already posted
 * rather than posting new ones. Nothing in this file touches the GL.
 *
 * Two steps, deliberately separate (owner, 2026-09-18): first RECORD the
 * payment from the old file — it counts towards the booking straight away —
 * then LINK it to the ledger voucher whenever you have found it. Entering a
 * hundred old payments should not stall because one voucher is hard to find.
 *
 * Decisions taken with the owner:
 *   - a payment may only be linked to a posted voucher that touches that
 *     customer's own account, and whose amount equals the payment;
 *   - one voucher backs exactly one payment (enforced by
 *     UX_SalesPayments_LinkedVoucher as well as by the check here);
 *   - the state of the booking is chosen at entry — these are old deals, they
 *     should not walk the approval flow again;
 *   - they appear in reports but raise no staff incentive: nobody is paid
 *     commission twice. accrueForBooking is never called from here, and it
 *     also refuses a historical booking outright.
 *
 * The booking's paid total looks after itself: the payments trigger
 * (tr_SalesPayments_UpdateBookingPaid) sums Posted payment rows whether or not
 * a voucher is attached.
 */
const { sql, getPool } = require('../config/db');
const { logBookingTransition } = require('./salesBookingController');

// The states an old deal can sensibly be recorded in. The in-flight approval
// states (PendingApproval, PendingCancelApproval, CancellationApproved, Draft)
// are deliberately not offered — there is nothing left to approve.
const ALLOWED_STATES = [
    'PendingBookingPayment', 'BookingConfirmed', 'PendingPayment', 'Allocated',
    'MasterInvoicePending', 'MasterInvoicePosted', 'ReadyForDelivery',
    'GatePassIssued', 'Closed', 'Cancelled',
];

const PATH_FOR_MODE = { Cash: 'Direct', BankTransfer: 'Direct', Cheque: 'Direct', POS: 'Direct', PayOrder: 'PayOrder' };

const fail = (msg, statusCode = 409) => { throw Object.assign(new Error(msg), { statusCode }); };
const money = (n) => Number(n || 0).toLocaleString('en-PK');

/** Booking number in the year the deal actually happened, not this year. */
async function bookingNoForYear(tx, year) {
    const r = await new sql.Request(tx)
        .input('p', sql.NVarChar(20), `BK-${year}-%`)
        .query(`SELECT ISNULL(MAX(CAST(SUBSTRING(BookingNo, 9, 10) AS INT)), 0) + 1 AS nextNo
                FROM dms_SalesBookings WHERE BookingNo LIKE @p`);
    return `BK-${year}-${String(r.recordset[0].nextNo).padStart(4, '0')}`;
}

/** The booking plus the customer's ledger account. */
async function loadBooking(pool, bookingId) {
    const r = await pool.request().input('id', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo, b.Status, b.IsHistorical, b.PartyID,
                       pt.PartyName, pt.PartyGLID
                FROM   dms_SalesBookings b
                LEFT   JOIN gen_PartiesInfo pt ON pt.PartyID = b.PartyID
                WHERE  b.BookingID=@id`);
    if (!r.recordset.length) fail('Booking not found.', 404);
    return r.recordset[0];
}

function assertHistorical(booking) {
    if (!booking.IsHistorical) {
        fail('This is a normal booking. Use Record Payment, which posts its own voucher — linking is only for historical records.');
    }
}

function assertHasLedgerAccount(booking) {
    if (!booking.PartyGLID) {
        fail(`${booking.PartyName || 'This customer'} has no account in the chart of accounts, so there is nothing to match against. Map the customer's account under Credit Parties first.`);
    }
}

/** Shared rule: may this voucher back a payment of this total? Returns it. */
async function assertVoucherLinkable(pool, booking, voucherId, total) {
    const vr = await pool.request()
        .input('vid', sql.Int, voucherId)
        .input('gl', sql.Int, booking.PartyGLID)
        .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Status,
                       (SELECT COUNT(*) FROM data_FinanceVoucherDetail d
                         WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @gl) AS TouchesCustomer,
                       (SELECT TOP 1 p.PaymentID FROM dms_SalesPayments p WHERE p.VoucherID = v.VoucherID) AS UsedByPaymentID
                FROM   data_FinanceVoucherInfo v WHERE v.VoucherID=@vid`);
    if (!vr.recordset.length) fail('That voucher does not exist.', 404);
    const v = vr.recordset[0];

    if (v.Status !== 'Posted') {
        fail(`${v.VoucherNo} is ${v.Status}, not Posted. Only a voucher already posted in the ledger can be linked.`);
    }
    if (!v.TouchesCustomer) {
        fail(`${v.VoucherNo} does not touch ${booking.PartyName || 'the customer'}'s account, so it cannot be this customer's payment.`);
    }
    if (v.UsedByPaymentID) {
        fail(`${v.VoucherNo} is already linked to payment #${v.UsedByPaymentID}. One voucher can only back one payment.`);
    }
    if (Math.abs(Number(v.TotalAmount) - total) > 0.01) {
        fail(`${v.VoucherNo} is for PKR ${money(v.TotalAmount)}, but this payment comes to PKR ${money(total)}. They have to match.`);
    }
    return v;
}

/** GET /api/sales/historical/states — what the entry form may offer. */
exports.states = async (_req, res) => res.json(ALLOWED_STATES);

/**
 * POST /api/sales/historical/bookings
 * body: { PartyID, VehicleVariantID, BookingDate, NegotiatedPrice, PriceAtTime?,
 *         Status, CorporatePONumber?, SalesExecutiveID? }
 */
exports.createBooking = async (req, res) => {
    try {
        const b = req.body || {};
        const errors = [];
        if (!b.PartyID) errors.push('Customer is required');
        if (!b.VehicleVariantID) errors.push('Variant is required');
        if (!b.BookingDate) errors.push('Booking date is required — that is the whole point of a historical entry');
        if (!ALLOWED_STATES.includes(b.Status)) errors.push(`Status must be one of: ${ALLOWED_STATES.join(', ')}`);
        const negotiated = Number(b.NegotiatedPrice);
        if (!(negotiated > 0)) errors.push('Agreed price must be greater than 0');
        if (errors.length) return res.status(400).json({ error: errors.join('; ') });

        const bookingDate = new Date(b.BookingDate);
        if (isNaN(bookingDate.getTime())) return res.status(400).json({ error: 'Booking date is not a real date.' });
        if (bookingDate.getTime() > Date.now() + 86400000) {
            return res.status(400).json({ error: 'A historical booking cannot be dated in the future.' });
        }

        // The price of the day, not today's list price: old deals were struck
        // against old prices, and the table requires agreed <= standard.
        const priceAtTime = b.PriceAtTime != null && Number(b.PriceAtTime) > 0 ? Number(b.PriceAtTime) : negotiated;
        if (priceAtTime < negotiated) {
            return res.status(400).json({ error: 'The price of the day cannot be less than the agreed price.' });
        }

        const executiveId = b.SalesExecutiveID ? parseInt(b.SalesExecutiveID) : req.user?.employeeId;
        if (!executiveId) {
            return res.status(400).json({ error: 'Pick the sales executive who handled this booking (or link an employee to your own user).' });
        }

        const pool = await getPool();
        const vr = await pool.request().input('vid', sql.Int, parseInt(b.VehicleVariantID))
            .query(`SELECT VariantID, ModelID FROM dms_VehicleVariant WHERE VariantID=@vid`);
        if (!vr.recordset.length) return res.status(400).json({ error: 'Variant not found.' });
        const variant = vr.recordset[0];

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const bookingNo = await bookingNoForYear(tx, bookingDate.getFullYear());
            const status = b.Status;

            const r = await new sql.Request(tx)
                .input('no', sql.NVarChar(20), bookingNo)
                .input('pid', sql.Int, parseInt(b.PartyID))
                .input('mid', sql.Int, variant.ModelID)
                .input('vid', sql.Int, variant.VariantID)
                .input('sp', sql.Decimal(18, 2), priceAtTime)
                .input('np', sql.Decimal(18, 2), negotiated)
                .input('st', sql.NVarChar(30), status)
                .input('exe', sql.Int, executiveId)
                .input('exeN', sql.NVarChar(100), req.user?.userName || null)
                .input('po', sql.NVarChar(100), b.CorporatePONumber || null)
                .input('bd', sql.DateTime, bookingDate)
                // Closed / gate-passed / cancelled old deals carry their date,
                // so the booking does not look like it closed today.
                .input('closed', sql.DateTime, status === 'Closed' ? bookingDate : null)
                .input('gp', sql.DateTime, ['GatePassIssued', 'Closed'].includes(status) ? bookingDate : null)
                .input('canc', sql.DateTime, status === 'Cancelled' ? bookingDate : null)
                .query(`INSERT INTO dms_SalesBookings
                            (BookingNo, PartyID, VehicleModelID, VehicleVariantID,
                             StandardPrice, NegotiatedPrice, Status,
                             CreatedBy_SalesExecutiveID, CreatedByName, CorporatePONumber,
                             IsHistorical, BookingDate, HistoricalEnteredAt,
                             CreatedAt, ClosedAt, GatePassIssuedAt, DeliveredAt, CancelledAt)
                        OUTPUT INSERTED.BookingID
                        VALUES (@no, @pid, @mid, @vid, @sp, @np, @st, @exe, @exeN, @po,
                                1, @bd, GETDATE(),
                                @bd, @closed, @gp, @gp, @canc)`);
            const bookingId = r.recordset[0].BookingID;

            await logBookingTransition(tx, bookingId, 'Historical', status, req.user,
                `Historical booking entered by ${req.user?.userName || 'a user'} for a deal dated `
                + `${bookingDate.toISOString().slice(0, 10)}. Payments on it are linked to vouchers already in the ledger; `
                + `nothing is posted to the GL and no staff incentive is raised.`);

            await tx.commit();
            res.status(201).json({ message: 'Historical booking recorded.', BookingID: bookingId, BookingNo: bookingNo, Status: status });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('historical createBooking:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

/**
 * POST /api/sales/historical/bookings/:id/payment
 * body: { Amount, PremiumPortion?, PaymentMode, ReceivedAt?, Notes?, VoucherID? }
 *
 * Step one: the payment goes on record and counts towards the booking straight
 * away. VoucherID is optional — pass it to link in the same breath, or leave it
 * out and link later from the payments list.
 */
exports.recordPayment = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const b = req.body || {};
        const amount = Number(b.Amount);
        const premium = Math.max(0, Number(b.PremiumPortion) || 0);
        const mode = b.PaymentMode;

        if (!Number.isInteger(bookingId)) return res.status(400).json({ error: 'Invalid booking id.' });
        if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than 0.' });
        if (premium > amount) return res.status(400).json({ error: 'Premium cannot be more than the amount.' });
        if (!PATH_FOR_MODE[mode]) {
            return res.status(400).json({ error: `Payment mode must be one of: ${Object.keys(PATH_FOR_MODE).join(', ')}` });
        }

        const pool = await getPool();
        const booking = await loadBooking(pool, bookingId);
        assertHistorical(booking);

        const total = Math.round((amount + premium) * 100) / 100;
        let voucher = null;
        if (b.VoucherID) {
            assertHasLedgerAccount(booking);
            voucher = await assertVoucherLinkable(pool, booking, parseInt(b.VoucherID), total);
        }

        const receivedAt = b.ReceivedAt ? new Date(b.ReceivedAt) : (voucher ? new Date(voucher.VoucherDate) : new Date());

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ins = await new sql.Request(tx)
                .input('bid', sql.Int, bookingId)
                .input('path', sql.NVarChar(20), PATH_FOR_MODE[mode])
                .input('mode', sql.NVarChar(30), mode)
                .input('amt', sql.Decimal(18, 2), amount)
                .input('prem', sql.Decimal(18, 2), premium)
                .input('at', sql.DateTime, receivedAt)
                .input('vid', sql.Int, voucher ? voucher.VoucherID : null)
                .input('vno', sql.NVarChar(50), voucher ? voucher.VoucherNo : null)
                .input('linked', sql.Bit, voucher ? 1 : 0)
                .input('notes', sql.NVarChar(sql.MAX), b.Notes
                    || (voucher ? `Linked to ${voucher.VoucherNo}, already posted in the ledger.`
                               : 'Historical payment — ledger voucher not linked yet.'))
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                // OUTPUT needs an INTO table here: dms_SalesPayments carries the
                // paid-total trigger, and SQL Server refuses a bare OUTPUT on a
                // table with triggers (same shape as recordPayment).
                .query(`DECLARE @ins TABLE (PaymentID INT);
                        INSERT INTO dms_SalesPayments
                            (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion,
                             ReceivedAt, VoucherID, VoucherNo, IsLinkedVoucher, Notes,
                             ReceivedByEmployeeID, ReceivedByName, CreatedByEmployeeID)
                        OUTPUT INSERTED.PaymentID INTO @ins
                        VALUES (@bid, @path, @mode, @amt, @prem,
                                @at, @vid, @vno, @linked, @notes,
                                @emp, @empN, @emp);
                        SELECT PaymentID FROM @ins;`);
            const paymentId = ins.recordset[0].PaymentID;

            await logBookingTransition(tx, bookingId, booking.Status, booking.Status, req.user,
                `Historical payment #${paymentId} of PKR ${money(total)} recorded`
                + (voucher ? ` and linked to ${voucher.VoucherNo}, already posted in the ledger.`
                           : '. No ledger voucher linked yet.'));

            await tx.commit();
            res.status(201).json({
                message: voucher ? `Payment recorded and linked to ${voucher.VoucherNo}.` : 'Payment recorded. Link its ledger voucher whenever you have it.',
                PaymentID: paymentId,
                VoucherNo: voucher ? voucher.VoucherNo : null,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('historical recordPayment:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

/**
 * POST /api/sales/historical/payments/:paymentId/link   { VoucherID }
 * Step two: tie a payment already on record to its voucher in the ledger.
 */
exports.linkPayment = async (req, res) => {
    try {
        const paymentId = parseInt(req.params.paymentId);
        const voucherId = parseInt(req.body?.VoucherID);
        if (!Number.isInteger(paymentId) || !Number.isInteger(voucherId)) {
            return res.status(400).json({ error: 'Pick a payment and a voucher.' });
        }

        const pool = await getPool();
        const pr = await pool.request().input('pid', sql.Int, paymentId)
            .query(`SELECT PaymentID, BookingID, Amount, PremiumPortion, Status, VoucherID, VoucherNo, IsLinkedVoucher
                    FROM dms_SalesPayments WHERE PaymentID=@pid`);
        if (!pr.recordset.length) return res.status(404).json({ error: 'That payment does not exist.' });
        const p = pr.recordset[0];

        // Whether this is a historical booking at all comes first: it is the
        // most useful thing to say when someone tries this on a normal one.
        const booking = await loadBooking(pool, p.BookingID);
        assertHistorical(booking);
        assertHasLedgerAccount(booking);

        if (p.Status === 'Reversed') return res.status(409).json({ error: 'That payment has been voided.' });
        if (p.VoucherID) {
            return res.status(409).json({ error: `That payment is already linked to ${p.VoucherNo || 'a voucher'}. Unlink it first if it is wrong.` });
        }

        const total = Math.round((Number(p.Amount) + Number(p.PremiumPortion || 0)) * 100) / 100;
        const voucher = await assertVoucherLinkable(pool, booking, voucherId, total);

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx)
                .input('pid', sql.Int, paymentId)
                .input('vid', sql.Int, voucher.VoucherID)
                .input('vno', sql.NVarChar(50), voucher.VoucherNo)
                .query(`UPDATE dms_SalesPayments
                        SET VoucherID=@vid, VoucherNo=@vno, IsLinkedVoucher=1
                        WHERE PaymentID=@pid`);
            await logBookingTransition(tx, booking.BookingID, booking.Status, booking.Status, req.user,
                `Payment #${paymentId} of PKR ${money(total)} linked to ${voucher.VoucherNo}, already posted in the ledger. Nothing was posted to the GL.`);
            await tx.commit();
            res.json({ message: `Payment linked to ${voucher.VoucherNo}.`, PaymentID: paymentId, VoucherNo: voucher.VoucherNo });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('historical linkPayment:', err);
        if (/UX_SalesPayments_LinkedVoucher/i.test(err.message || '')) {
            return res.status(409).json({ error: 'That voucher was linked to another payment a moment ago. Pick a different one.' });
        }
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

/**
 * POST /api/sales/historical/payments/:paymentId/unlink
 * Detaches a wrongly linked voucher. The voucher itself is left alone — it was
 * in the ledger before any of this, and we never posted it.
 */
exports.unlinkPayment = async (req, res) => {
    try {
        const paymentId = parseInt(req.params.paymentId);
        if (!Number.isInteger(paymentId)) return res.status(400).json({ error: 'Invalid payment id.' });

        const pool = await getPool();
        const pr = await pool.request().input('pid', sql.Int, paymentId)
            .query(`SELECT PaymentID, BookingID, VoucherID, VoucherNo, IsLinkedVoucher, Status
                    FROM dms_SalesPayments WHERE PaymentID=@pid`);
        if (!pr.recordset.length) return res.status(404).json({ error: 'That payment does not exist.' });
        const p = pr.recordset[0];
        if (!p.IsLinkedVoucher || !p.VoucherID) {
            return res.status(409).json({ error: 'That payment has no linked voucher to remove.' });
        }

        const booking = await loadBooking(pool, p.BookingID);
        assertHistorical(booking);

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).input('pid', sql.Int, paymentId)
                .query(`UPDATE dms_SalesPayments
                        SET VoucherID=NULL, VoucherNo=NULL, IsLinkedVoucher=0
                        WHERE PaymentID=@pid`);
            await logBookingTransition(tx, booking.BookingID, booking.Status, booking.Status, req.user,
                `Payment #${paymentId} unlinked from ${p.VoucherNo || 'its voucher'}. The voucher stays exactly as it is in the ledger.`);
            await tx.commit();
            res.json({ message: `Unlinked from ${p.VoucherNo || 'the voucher'}. It is untouched in the ledger.`, PaymentID: paymentId });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('historical unlinkPayment:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

/**
 * GET /api/sales/historical/pending-links?state=unlinked|linked|all&bookingId=
 *
 * Every payment on a historical booking, for the screen that does the linking —
 * the same idea as the Draft Vouchers queue: the work sits in one list instead
 * of being hunted booking by booking (owner ask 2026-09-18).
 */
exports.pendingLinks = async (req, res) => {
    try {
        const state = (req.query.state || 'unlinked').toLowerCase();
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['b.IsHistorical = 1', `p.Status = 'Posted'`];
        if (state === 'unlinked') conds.push('p.VoucherID IS NULL');
        else if (state === 'linked') conds.push('p.VoucherID IS NOT NULL');
        if (req.query.bookingId) {
            rq.input('bid', sql.Int, parseInt(req.query.bookingId));
            conds.push('p.BookingID = @bid');
        }
        const r = await rq.query(`
            SELECT p.PaymentID, p.BookingID, p.Amount, p.PremiumPortion, p.ReceivedAt,
                   p.PaymentMode, p.Notes, p.VoucherID, p.VoucherNo, p.IsLinkedVoucher,
                   b.BookingNo, b.Status AS BookingStatus, b.BookingDate,
                   pt.PartyName, pt.PartyGLID,
                   m.ModelName, v.VariantName, veh.ChasisNo,
                   fv.VoucherDate AS LinkedVoucherDate
            FROM   dms_SalesPayments p
            JOIN   dms_SalesBookings b    ON b.BookingID  = p.BookingID
            LEFT   JOIN gen_PartiesInfo pt ON pt.PartyID  = b.PartyID
            LEFT   JOIN dms_VehicleModel m ON m.ModelID   = b.VehicleModelID
            LEFT   JOIN dms_VehicleVariant v ON v.VariantID = b.VehicleVariantID
            LEFT   JOIN dms_Vehicle veh   ON veh.VehicleID = b.AllocatedVehicleID
            LEFT   JOIN data_FinanceVoucherInfo fv ON fv.VoucherID = p.VoucherID
            WHERE  ${conds.join(' AND ')}
            ORDER  BY b.BookingDate DESC, p.ReceivedAt DESC, p.PaymentID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('pendingLinks:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * GET /api/sales/historical/bookings/:id/linkable-vouchers?amount=&search=&all=
 *
 * Posted vouchers on this customer's own account that no payment has taken yet.
 * With an amount, only exact matches — that is the rule for linking. With
 * all=1, everything available on the account, so you can see what is there when
 * nothing matches the amount you expected.
 */
exports.linkableVouchers = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        if (!Number.isInteger(bookingId)) return res.status(400).json({ error: 'Invalid booking id.' });
        const wantsAll = req.query.all === '1' || req.query.all === 'true';
        const amount = Number(req.query.amount);
        if (!wantsAll && !(amount > 0)) return res.status(400).json({ error: 'Enter the amount first — vouchers are matched to it.' });

        const pool = await getPool();
        const booking = await loadBooking(pool, bookingId);
        assertHasLedgerAccount(booking);

        const rq = pool.request().input('gl', sql.Int, booking.PartyGLID);
        let amountClause = '';
        if (!wantsAll) {
            rq.input('amt', sql.Decimal(18, 2), amount);
            amountClause = ' AND v.TotalAmount = @amt';
        }
        let searchClause = '';
        if (req.query.search) {
            rq.input('s', sql.NVarChar(80), `%${String(req.query.search).trim()}%`);
            searchClause = ' AND (v.VoucherNo LIKE @s OR v.Remarks LIKE @s)';
        }
        const r = await rq.query(`
            SELECT TOP 50 v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Remarks,
                   vt.Title AS VoucherType,
                   (SELECT SUM(d2.Debit - d2.Credit) FROM data_FinanceVoucherDetail d2
                     WHERE d2.VoucherID = v.VoucherID AND d2.GLCAID = @gl) AS CustomerNet
            FROM   data_FinanceVoucherInfo v
            LEFT   JOIN GLVoucherType vt ON vt.Voucherid = v.VoucherTypeID
            WHERE  v.Status = 'Posted'
              AND  EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                            WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @gl)
              AND  NOT EXISTS (SELECT 1 FROM dms_SalesPayments p WHERE p.VoucherID = v.VoucherID)
              ${amountClause} ${searchClause}
            ORDER  BY v.VoucherDate DESC, v.VoucherID DESC`);

        res.json({ CustomerName: booking.PartyName, CustomerGLCAID: booking.PartyGLID, vouchers: r.recordset });
    } catch (err) {
        console.error('linkableVouchers:', err);
        res.status(err.statusCode || 500).json({ error: err.message });
    }
};
