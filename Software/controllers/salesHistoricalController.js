/**
 * Sales — historical bookings.
 *
 * Owner ask 2026-09-18: deals done before DealerDesk need to be on record, but
 * their money is already in the chart of accounts. So the booking is entered on
 * the same form, and each payment is LINKED to a voucher that is already posted
 * rather than posting a new one. Nothing this file does touches the GL.
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
 * The booking's paid total still looks after itself: the payments trigger
 * (tr_SalesPayments_UpdateBookingPaid) sums Posted payment rows regardless of
 * where their voucher came from.
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

/** Booking number in the year the deal actually happened, not this year. */
async function bookingNoForYear(tx, year) {
    const r = await new sql.Request(tx)
        .input('p', sql.NVarChar(20), `BK-${year}-%`)
        .query(`SELECT ISNULL(MAX(CAST(SUBSTRING(BookingNo, 9, 10) AS INT)), 0) + 1 AS nextNo
                FROM dms_SalesBookings WHERE BookingNo LIKE @p`);
    return `BK-${year}-${String(r.recordset[0].nextNo).padStart(4, '0')}`;
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
        res.status(400).json({ error: err.message });
    }
};

/**
 * GET /api/sales/historical/bookings/:id/linkable-vouchers?amount=&search=
 *
 * Posted vouchers that touch this customer's own account, for the exact amount,
 * and not already linked to a payment.
 */
exports.linkableVouchers = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const amount = Number(req.query.amount);
        if (!Number.isInteger(bookingId)) return res.status(400).json({ error: 'Invalid booking id.' });
        if (!(amount > 0)) return res.status(400).json({ error: 'Enter the amount first — vouchers are matched to it.' });

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, bookingId)
            .query(`SELECT b.BookingID, b.IsHistorical, b.PartyID, pt.PartyName, pt.PartyGLID
                    FROM dms_SalesBookings b
                    LEFT JOIN gen_PartiesInfo pt ON pt.PartyID = b.PartyID
                    WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found.' });
        const booking = bk.recordset[0];
        if (!booking.PartyGLID) {
            return res.status(409).json({
                error: `${booking.PartyName || 'This customer'} has no account in the chart of accounts, so there is nothing to match against. Map the customer's account under Credit Parties first.`,
            });
        }

        const rq = pool.request()
            .input('gl', sql.Int, booking.PartyGLID)
            .input('amt', sql.Decimal(18, 2), amount);
        let searchClause = '';
        if (req.query.search) {
            rq.input('s', sql.NVarChar(80), `%${String(req.query.search).trim()}%`);
            searchClause = ' AND (v.VoucherNo LIKE @s OR v.Remarks LIKE @s)';
        }
        const r = await rq.query(`
            SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Remarks,
                   vt.Title AS VoucherType,
                   (SELECT SUM(d2.Debit - d2.Credit) FROM data_FinanceVoucherDetail d2
                     WHERE d2.VoucherID = v.VoucherID AND d2.GLCAID = @gl) AS CustomerNet
            FROM   data_FinanceVoucherInfo v
            LEFT   JOIN GLVoucherType vt ON vt.Voucherid = v.VoucherTypeID
            WHERE  v.Status = 'Posted'
              AND  v.TotalAmount = @amt
              AND  EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                            WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @gl)
              AND  NOT EXISTS (SELECT 1 FROM dms_SalesPayments p WHERE p.VoucherID = v.VoucherID)
              ${searchClause}
            ORDER  BY v.VoucherDate DESC, v.VoucherID DESC`);

        res.json({ CustomerName: booking.PartyName, CustomerGLCAID: booking.PartyGLID, vouchers: r.recordset });
    } catch (err) {
        console.error('linkableVouchers:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/sales/historical/bookings/:id/link-payment
 * body: { VoucherID, PaymentMode, Amount, PremiumPortion?, ReceivedAt?, Notes? }
 *
 * Records the payment against a voucher that is already in the ledger. No GL
 * posting happens — the voucher is the accounting record, this only ties it to
 * the booking so the customer's history and paid total are right.
 */
exports.linkPayment = async (req, res) => {
    try {
        const bookingId = parseInt(req.params.id);
        const b = req.body || {};
        const voucherId = parseInt(b.VoucherID);
        const amount = Number(b.Amount);
        const premium = Math.max(0, Number(b.PremiumPortion) || 0);
        const mode = b.PaymentMode;

        if (!Number.isInteger(bookingId) || !Number.isInteger(voucherId)) {
            return res.status(400).json({ error: 'Pick a booking and a voucher.' });
        }
        if (!(amount > 0)) return res.status(400).json({ error: 'Amount must be greater than 0.' });
        if (premium > amount) return res.status(400).json({ error: 'Premium cannot be more than the amount.' });
        if (!PATH_FOR_MODE[mode]) {
            return res.status(400).json({ error: `Payment mode must be one of: ${Object.keys(PATH_FOR_MODE).join(', ')}` });
        }

        const pool = await getPool();
        const bk = await pool.request().input('id', sql.Int, bookingId)
            .query(`SELECT b.BookingID, b.BookingNo, b.Status, b.IsHistorical, b.PartyID, pt.PartyName, pt.PartyGLID
                    FROM dms_SalesBookings b
                    LEFT JOIN gen_PartiesInfo pt ON pt.PartyID = b.PartyID
                    WHERE b.BookingID=@id`);
        if (!bk.recordset.length) return res.status(404).json({ error: 'Booking not found.' });
        const booking = bk.recordset[0];
        if (!booking.IsHistorical) {
            return res.status(409).json({
                error: 'Only a historical booking links to an existing voucher. On a normal booking use Record Payment, which posts its own voucher.',
            });
        }
        if (!booking.PartyGLID) {
            return res.status(409).json({ error: `${booking.PartyName || 'This customer'} has no account in the chart of accounts to match against.` });
        }

        const vr = await pool.request()
            .input('vid', sql.Int, voucherId)
            .input('gl', sql.Int, booking.PartyGLID)
            .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.TotalAmount, v.Status,
                           (SELECT COUNT(*) FROM data_FinanceVoucherDetail d
                             WHERE d.VoucherID = v.VoucherID AND d.GLCAID = @gl) AS TouchesCustomer,
                           (SELECT TOP 1 p.PaymentID FROM dms_SalesPayments p WHERE p.VoucherID = v.VoucherID) AS UsedByPaymentID
                    FROM data_FinanceVoucherInfo v WHERE v.VoucherID=@vid`);
        if (!vr.recordset.length) return res.status(404).json({ error: 'That voucher does not exist.' });
        const v = vr.recordset[0];

        if (v.Status !== 'Posted') {
            return res.status(409).json({ error: `${v.VoucherNo} is ${v.Status}, not Posted. Only a voucher already posted in the ledger can be linked.` });
        }
        if (!v.TouchesCustomer) {
            return res.status(409).json({ error: `${v.VoucherNo} does not touch ${booking.PartyName || "the customer"}'s account, so it cannot be this customer's payment.` });
        }
        if (v.UsedByPaymentID) {
            return res.status(409).json({ error: `${v.VoucherNo} is already linked to payment #${v.UsedByPaymentID}. One voucher can only back one payment.` });
        }
        const total = Math.round((amount + premium) * 100) / 100;
        if (Math.abs(Number(v.TotalAmount) - total) > 0.01) {
            return res.status(409).json({
                error: `${v.VoucherNo} is for PKR ${Number(v.TotalAmount).toLocaleString('en-PK')}, but this payment comes to PKR ${total.toLocaleString('en-PK')}. They have to match.`,
            });
        }

        const receivedAt = b.ReceivedAt ? new Date(b.ReceivedAt) : new Date(v.VoucherDate);

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
                .input('vid', sql.Int, voucherId)
                .input('vno', sql.NVarChar(50), v.VoucherNo)
                .input('notes', sql.NVarChar(sql.MAX), b.Notes || `Linked to ${v.VoucherNo}, already posted in the ledger.`)
                .input('emp', sql.Int, req.user?.employeeId || null)
                .input('empN', sql.NVarChar(100), req.user?.userName || null)
                // OUTPUT needs an INTO table here: dms_SalesPayments carries
                // the paid-total trigger, and SQL Server refuses a bare OUTPUT
                // on a table with triggers (same shape as recordPayment).
                .query(`DECLARE @ins TABLE (PaymentID INT);
                        INSERT INTO dms_SalesPayments
                            (BookingID, PaymentPath, PaymentMode, Amount, PremiumPortion,
                             ReceivedAt, VoucherID, VoucherNo, IsLinkedVoucher, Notes,
                             ReceivedByEmployeeID, ReceivedByName, CreatedByEmployeeID)
                        OUTPUT INSERTED.PaymentID INTO @ins
                        VALUES (@bid, @path, @mode, @amt, @prem,
                                @at, @vid, @vno, 1, @notes,
                                @emp, @empN, @emp);
                        SELECT PaymentID FROM @ins;`);
            const paymentId = ins.recordset[0].PaymentID;

            await logBookingTransition(tx, bookingId, booking.Status, booking.Status, req.user,
                `Payment #${paymentId} of PKR ${total.toLocaleString('en-PK')} linked to ${v.VoucherNo}, `
                + `already posted in the ledger. Nothing was posted to the GL.`);

            await tx.commit();
            res.status(201).json({
                message: `Payment linked to ${v.VoucherNo}.`,
                PaymentID: paymentId,
                VoucherNo: v.VoucherNo,
            });
        } catch (err) { try { await tx.rollback(); } catch {} throw err; }
    } catch (err) {
        console.error('linkPayment:', err);
        // The filtered unique index is the last line of defence if two people
        // link the same voucher at the same moment.
        if (/UX_SalesPayments_LinkedVoucher/i.test(err.message || '')) {
            return res.status(409).json({ error: 'That voucher was linked to another payment a moment ago. Pick a different one.' });
        }
        res.status(400).json({ error: err.message });
    }
};
