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
 *     customer's own account, with enough unallocated account amount;
 *   - a shared voucher can back several accounts/bookings, capped per account;
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
const salesExecutives = require('../services/salesExecutiveService');
const { parseDeliveryMonth } = require('../services/bookingDeliveryMonthService');
const { logBookingTransition } = require('./salesBookingController');
const { assertVoucherLinkable,CUSTOMER_AMOUNT_SQL,LINKED_AMOUNT_SQL,NONLINKED_PAYMENT_SQL,LOCK_VOUCHER_SQL } = require('../services/historicalVoucherAllocationService');
const { MASTER_AMOUNT_SQL,MASTER_LINKED_SQL,linkMasterVoucher,GENERATED_SALES_SOURCES } = require('../services/historicalMasterAllocationService');

const { applyVoucherFilters } = require('../services/historicalVoucherSearchService');
const { historicalMasterAccount } = require('../services/historicalMasterAccountService');

const GENERATED_SALES_SQL = GENERATED_SALES_SOURCES.map(source => "'" + source + "'").join(',');

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
async function loadBooking(pool, bookingId, lock=false) {
    const r = await pool.request().input('id', sql.Int, bookingId)
        .query(`SELECT b.BookingID, b.BookingNo, b.Status, b.IsHistorical, b.PartyID,
                       pt.PartyName, pt.PartyGLID, b.NegotiatedPrice, b.MasterPriceBeforeDiscount, b.MasterAgreedAmount, v.WholesalePrice
                FROM   dms_SalesBookings b ${lock?'WITH (UPDLOCK,HOLDLOCK)':''}
                LEFT   JOIN gen_PartiesInfo pt ON pt.PartyID = b.PartyID
                LEFT   JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
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
        let promisedMonth;
        try { promisedMonth = parseDeliveryMonth(b.PromisedDeliveryMonth); }
        catch (err) { return res.status(400).json({ error: err.message }); }
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

        const executiveId = salesExecutives.employeeId(b.SalesExecutiveID ?? req.user?.employeeId);

        const pool = await getPool();
        const vr = await pool.request().input('vid', sql.Int, parseInt(b.VehicleVariantID))
            .query(`SELECT VariantID, ModelID FROM dms_VehicleVariant WHERE VariantID=@vid`);
        if (!vr.recordset.length) return res.status(400).json({ error: 'Variant not found.' });
        const variant = vr.recordset[0];

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const executive = await salesExecutives.requireExecutive(tx, executiveId);
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
                .input('exeN', sql.NVarChar(100), executive.EmployeeName)
                .input('po', sql.NVarChar(100), b.CorporatePONumber || null)
                .input('bd', sql.DateTime, bookingDate)
                .input('promise', sql.Date, promisedMonth)
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
                             CreatedAt, ClosedAt, GatePassIssuedAt, DeliveredAt, CancelledAt, PromisedDeliveryMonth)
                        OUTPUT INSERTED.BookingID
                        VALUES (@no, @pid, @mid, @vid, @sp, @np, @st, @exe, @exeN, @po,
                                1, @bd, GETDATE(),
                                @bd, @closed, @gp, @gp, @canc, @promise)`);
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
        salesExecutives.sendError(res, err, 400);
    }
};

/**
 * Compatibility route for historical date corrections. Both booking types
 * now use the same audited service, which preserves original entry timestamps.
 */
exports.setBookingDate = require('./bookingDateController').update;

/**
 * POST /api/sales/historical/bookings/:id/payment
 * body: { Amount, PremiumPortion?, PaymentMode, ReceivedAt?, Notes?, VoucherID? }
 *
 * Step one: the payment goes on record and counts towards the booking straight
 * away. VoucherID is optional — pass it to link in the same breath, or leave it
 * out and link later from the payments list.
 */
exports.recordPayment = async (req, res) => {
    let tx;
    try {
        const bookingId=Number(req.params.id), b=req.body||{};
        const rawAmount=Number(b.Amount),rawPremium=Number(b.PremiumPortion||0),mode=b.PaymentMode;
        if (!Number.isSafeInteger(bookingId)||bookingId<=0) fail('Invalid booking id.',400);
        const amountCents=Math.round(rawAmount*100),premiumCents=Math.round(rawPremium*100);
        if (!Number.isFinite(rawAmount)||!Number.isFinite(rawPremium)
            ||!Number.isSafeInteger(amountCents)||!Number.isSafeInteger(premiumCents)
            ||amountCents<=0||premiumCents<0) fail('Enter a positive payment amount and a nonnegative premium.',400);
        if (Math.abs(rawAmount*100-amountCents)>0.000001||Math.abs(rawPremium*100-premiumCents)>0.000001) {
            fail('Payment and premium amounts must have at most two decimal places.',400);
        }
        if (premiumCents>amountCents) fail('Premium cannot be more than the amount.',400);
        if (!Number.isSafeInteger(amountCents+premiumCents)) fail('Payment amount is too large.',400);
        if (!PATH_FOR_MODE[mode]) fail(`Payment mode must be one of: ${Object.keys(PATH_FOR_MODE).join(', ')}`,400);
        const amount=amountCents/100,premium=premiumCents/100,total=(amountCents+premiumCents)/100;
        const pool=await getPool();
        tx=new sql.Transaction(pool); await tx.begin();
        const booking=await loadBooking(tx,bookingId,true); assertHistorical(booking);
        let voucher=null;
        if (b.VoucherID) {
            assertHasLedgerAccount(booking);
            voucher=await assertVoucherLinkable(tx,booking,Number(b.VoucherID),total);
        }
        const masterGL=mode==='PayOrder'&&premium===0 ? await historicalMasterAccount(tx,bookingId) : null;
        const receivedAt=b.ReceivedAt?new Date(b.ReceivedAt):(voucher?new Date(voucher.VoucherDate):new Date());
        if (isNaN(receivedAt.getTime())) fail('Date received is not a real date.',400);
        const ins=await new sql.Request(tx)
            .input('bid',sql.Int,bookingId).input('path',sql.NVarChar(20),PATH_FOR_MODE[mode])
            .input('mode',sql.NVarChar(30),mode).input('amt',sql.Decimal(18,2),amount)
            .input('prem',sql.Decimal(18,2),premium).input('at',sql.DateTime,receivedAt)
            .input('vid',sql.Int,voucher?.VoucherID||null).input('vno',sql.NVarChar(50),voucher?.VoucherNo||null)
            .input('linked',sql.Bit,voucher?1:0).input('gl',sql.Int,voucher?booking.PartyGLID:null)
            .input('masterGL',sql.Int,masterGL)
            .input('notes',sql.NVarChar(sql.MAX),b.Notes||(voucher?`Linked to ${voucher.VoucherNo}, already posted.`:'Historical payment — ledger voucher not linked yet.'))
            .input('emp',sql.Int,req.user?.employeeId||null).input('empN',sql.NVarChar(100),req.user?.userName||null)
            .query(`DECLARE @ins TABLE (PaymentID INT);
                INSERT INTO dms_SalesPayments
                    (BookingID,PaymentPath,PaymentMode,Amount,PremiumPortion,ReceivedAt,VoucherID,VoucherNo,
                     IsLinkedVoucher,LinkedVoucherGLCAID,HistoricalMasterGLCAID,Notes,ReceivedByEmployeeID,ReceivedByName,CreatedByEmployeeID)
                OUTPUT INSERTED.PaymentID INTO @ins
                VALUES (@bid,@path,@mode,@amt,@prem,@at,@vid,@vno,@linked,@gl,@masterGL,@notes,@emp,@empN,@emp);
                SELECT PaymentID FROM @ins;`);
        const paymentId=ins.recordset[0].PaymentID;
        await logBookingTransition(tx,bookingId,booking.Status,booking.Status,req.user,
            `Historical payment #${paymentId} of PKR ${money(total)} recorded${voucher?` and allocated to ${voucher.VoucherNo} on account ${booking.PartyGLID}`:'. No ledger voucher linked yet.'}`);
        await tx.commit();
        res.status(201).json({message:voucher?`Payment recorded and linked to ${voucher.VoucherNo}.`:'Payment recorded. Link its ledger voucher whenever you have it.',PaymentID:paymentId,VoucherNo:voucher?.VoucherNo||null});
    } catch(err) {
        if(tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode||400).json({error:err.message});
    }
};

/**
 * POST /api/sales/historical/payments/:paymentId/link   { VoucherID }
 * Step two: tie a payment already on record to its voucher in the ledger.
 */
exports.linkPayment = async (req,res) => {
    let tx;
    try {
        const paymentId=Number(req.params.paymentId), voucherId=Number(req.body?.VoucherID);
        if(!Number.isSafeInteger(paymentId)||paymentId<=0||!Number.isSafeInteger(voucherId)||voucherId<=0) fail('Pick a payment and a voucher.',400);
        const pool=await getPool();
        const initial=await pool.request().input('pid',sql.Int,paymentId).query('SELECT BookingID FROM dms_SalesPayments WHERE PaymentID=@pid');
        if(!initial.recordset.length) fail('That payment does not exist.',404);
        tx=new sql.Transaction(pool); await tx.begin();
        const booking=await loadBooking(tx,initial.recordset[0].BookingID,true);
        assertHistorical(booking); assertHasLedgerAccount(booking);
        // All links acquire the voucher before a payment row; capacity scans must
        // not wait on a different payment whose transaction waits on this voucher.
        await new sql.Request(tx).input('vid',sql.Int,voucherId).query(LOCK_VOUCHER_SQL);
        const locked=await new sql.Request(tx).input('pid',sql.Int,paymentId).input('bid',sql.Int,booking.BookingID)
            .query(`SELECT PaymentID,Amount,PremiumPortion,PaymentMode,Status,VoucherID,VoucherNo
                FROM dms_SalesPayments WITH (UPDLOCK,HOLDLOCK) WHERE PaymentID=@pid AND BookingID=@bid`);
        const p=locked.recordset[0];
        if(!p) fail('That payment is no longer on this booking.',409);
        if(p.Status!=='Posted') fail('That payment has been voided.');
        if(p.VoucherID) fail(`That payment is already linked to ${p.VoucherNo||'a voucher'}. Unlink it first if it is wrong.`);
        const total=Math.round((Number(p.Amount)+Number(p.PremiumPortion||0))*100)/100;
        const voucher=await assertVoucherLinkable(tx,booking,voucherId,total);
        const masterGL=p.PaymentMode==='PayOrder'&&!Number(p.PremiumPortion||0) ? await historicalMasterAccount(tx,booking.BookingID) : null;
        await new sql.Request(tx).input('pid',sql.Int,paymentId).input('vid',sql.Int,voucherId)
            .input('vno',sql.NVarChar(50),voucher.VoucherNo).input('gl',sql.Int,booking.PartyGLID).input('masterGL',sql.Int,masterGL)
            .query('UPDATE dms_SalesPayments SET VoucherID=@vid,VoucherNo=@vno,IsLinkedVoucher=1,LinkedVoucherGLCAID=@gl,HistoricalMasterGLCAID=@masterGL WHERE PaymentID=@pid');
        await logBookingTransition(tx,booking.BookingID,booking.Status,booking.Status,req.user,
            `Payment #${paymentId}, PKR ${money(total)}, allocated to ${voucher.VoucherNo} on account ${booking.PartyGLID}. Nothing posted to the GL.`);
        await tx.commit();
        res.json({message:`Payment linked to ${voucher.VoucherNo}.`,PaymentID:paymentId,VoucherNo:voucher.VoucherNo});
    } catch(err) {
        if(tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode||400).json({error:err.message});
    }
};

/**
 * POST /api/sales/historical/payments/:paymentId/unlink
 * Detaches a wrongly linked voucher. The voucher itself is left alone — it was
 * in the ledger before any of this, and we never posted it.
 */
exports.unlinkPayment = async (req,res) => {
    let tx;
    try {
        const paymentId=Number(req.params.paymentId);
        if(!Number.isSafeInteger(paymentId)||paymentId<=0) fail('Invalid payment id.',400);
        const pool=await getPool();
        const initial=await pool.request().input('pid',sql.Int,paymentId).query('SELECT BookingID FROM dms_SalesPayments WHERE PaymentID=@pid');
        if(!initial.recordset.length) fail('That payment does not exist.',404);
        tx=new sql.Transaction(pool); await tx.begin();
        const booking=await loadBooking(tx,initial.recordset[0].BookingID,true); assertHistorical(booking);
        const found=await new sql.Request(tx).input('pid',sql.Int,paymentId)
            .query('SELECT VoucherID,VoucherNo,IsLinkedVoucher FROM dms_SalesPayments WITH (UPDLOCK,HOLDLOCK) WHERE PaymentID=@pid');
        const p=found.recordset[0];
        if(!p?.IsLinkedVoucher||!p.VoucherID) fail('That payment has no linked voucher to remove.');
        await new sql.Request(tx).input('pid',sql.Int,paymentId)
            .query('UPDATE dms_SalesPayments SET VoucherID=NULL,VoucherNo=NULL,IsLinkedVoucher=0,LinkedVoucherGLCAID=NULL WHERE PaymentID=@pid');
        await logBookingTransition(tx,booking.BookingID,booking.Status,booking.Status,req.user,
            `Payment #${paymentId} unlinked from ${p.VoucherNo||'its voucher'}. Only this payment’s allocation was released; the ledger stays unchanged.`);
        await tx.commit();
        res.json({message:`Unlinked from ${p.VoucherNo||'the voucher'}.`,PaymentID:paymentId});
    } catch(err) {
        if(tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode||400).json({error:err.message});
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
 * Original posted manual/opening vouchers with a net amount on this customer's
 * account. A payment reserves only its own amount plus premium on that account.
 * Find filters by sufficient remaining capacity; all=1 includes exhausted rows
 * for reference. Linking rechecks the capacity under the voucher header lock.
 */
exports.linkableVouchers = async (req,res) => {
    try {
        const bookingId=Number(req.params.id), wantsAll=['1','true'].includes(req.query.all), amount=Number(req.query.amount);
        if(!Number.isSafeInteger(bookingId)||bookingId<=0) fail('Invalid booking id.',400);
        if(!wantsAll&&(!Number.isFinite(amount)||amount<=0)) fail('Enter the payment amount first.',400);
        const pool=await getPool(), booking=await loadBooking(pool,bookingId);
        assertHistorical(booking); assertHasLedgerAccount(booking);
        const rq=pool.request().input('gl',sql.Int,booking.PartyGLID);
        let amountClause='',searchClause='';
        if(!wantsAll) { rq.input('amt',sql.Decimal(18,2),amount); amountClause=' AND cap.CustomerAmount-cap.LinkedAmount>=@amt'; }
        searchClause = applyVoucherFilters(rq, req.query);
        const r=await rq.query(`SELECT TOP 50 v.VoucherID,v.VoucherNo,v.VoucherDate,v.TotalAmount,v.Remarks,vt.Title AS VoucherType,
                cap.CustomerAmount,cap.LinkedAmount,
                CASE WHEN cap.CustomerAmount>cap.LinkedAmount THEN cap.CustomerAmount-cap.LinkedAmount ELSE 0 END AS AvailableAmount
            FROM data_FinanceVoucherInfo v LEFT JOIN GLVoucherType vt ON vt.Voucherid=v.VoucherTypeID
            CROSS APPLY (SELECT ${CUSTOMER_AMOUNT_SQL} AS CustomerAmount,${LINKED_AMOUNT_SQL} AS LinkedAmount) cap
            WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
              AND ISNULL(v.SourceDocType,'') NOT IN (${GENERATED_SALES_SQL}) AND ${NONLINKED_PAYMENT_SQL} IS NULL
              AND cap.CustomerAmount>0 ${amountClause} ${searchClause}
            ORDER BY v.VoucherDate DESC,v.VoucherID DESC`);
        res.json({CustomerName:booking.PartyName,CustomerGLCAID:booking.PartyGLID,vouchers:r.recordset});
    } catch(err) { res.status(err.statusCode||500).json({error:err.message}); }
};

// ---------------------------------------------------------------------------
// Money already forwarded to Master, on an old deal
// ---------------------------------------------------------------------------
//
// Owner report 2026-09-25: Pay Master on a historical booking was posting a
// fresh voucher into the ledger. On an old deal the remittance was made and
// posted long ago, so posting again counts it twice.
//
// What a booking has forwarded to Master is not stored anywhere: it is read
// back out of the ledger as the BOOKING_VARIANT_RECEIVABLE debits carrying
// that BookingID (salesBookingController, AmountPaidToMaster). An old voucher
// predates DealerDesk and carries no BookingID, which is exactly why the
// booking looks unpaid and somebody reaches for Pay Master.
//
// New links allocate a selected portion in dms_HistoricalMasterAllocations;
// opening ledger amounts and tags remain intact. Booking, lifecycle, delivery
// and reconciliation totals add active allocations to their tagged GL balance.
// Legacy tag-based links remain visible and can be unlinked independently.

/** The system account Master remittances are debited to. */
async function masterReceivableGL(pool) {
    const r = await pool.request().query(
        `SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey = 'BOOKING_VARIANT_RECEIVABLE'`);
    if (!r.recordset.length) {
        fail('BOOKING_VARIANT_RECEIVABLE is not mapped in Accounting Setup, so nothing can be matched against it.');
    }
    return r.recordset[0].GLCAID;
}

/**
 * GET /api/sales/historical/bookings/:id/linkable-master-vouchers
 *     ?amount=&search=&all=1
 *
 * Posted vouchers carrying a Master-receivable debit that no booking has
 * claimed yet.
 */
exports.linkableMasterVouchers = async (req,res) => {
    try {
        const bookingId=Number(req.params.id), wantsAll=['1','true'].includes(req.query.all), amount=Number(req.query.amount);
        if(!Number.isSafeInteger(bookingId)||bookingId<=0) fail('Invalid booking id.',400);
        if(!wantsAll&&(!Number.isFinite(amount)||amount<=0)) fail('Enter this booking’s allocation amount.',400);
        const pool=await getPool(), booking=await loadBooking(pool,bookingId); assertHistorical(booking);
        const gl=await masterReceivableGL(pool);
        const rq=pool.request().input('gl',sql.Int,gl);
        let amountClause='',searchClause='';
        if(!wantsAll) { rq.input('amt',sql.Decimal(18,2),amount); amountClause=' AND cap.MasterAmount-cap.LinkedAmount>=@amt'; }
        searchClause = applyVoucherFilters(rq, req.query);
        const r=await rq.query(`SELECT TOP 50 v.VoucherID,v.VoucherNo,v.VoucherDate,v.TotalAmount,v.Remarks,vt.Title AS VoucherType,
                cap.MasterAmount,cap.LinkedAmount,
                CASE WHEN cap.MasterAmount>cap.LinkedAmount THEN cap.MasterAmount-cap.LinkedAmount ELSE 0 END AS UnclaimedToMaster
            FROM data_FinanceVoucherInfo v LEFT JOIN GLVoucherType vt ON vt.Voucherid=v.VoucherTypeID
            CROSS APPLY (SELECT ${MASTER_AMOUNT_SQL} AS MasterAmount,${MASTER_LINKED_SQL} AS LinkedAmount) cap
            WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
              AND ISNULL(v.SourceDocType,'') NOT IN (${GENERATED_SALES_SQL})
              AND cap.MasterAmount>0 ${amountClause} ${searchClause}
            ORDER BY v.VoucherDate DESC,v.VoucherID DESC`);
        res.json({bookingNo:booking.BookingNo,vouchers:r.recordset});
    } catch(err) { res.status(err.statusCode||500).json({error:err.message}); }
};

/**
 * POST /api/sales/historical/bookings/:id/link-master   { VoucherID, Amount }
 *
 * Reserves only Amount from the remaining Master-receivable net debit budget.
 * Multiple bookings can share the original voucher. Nothing is posted.
 */
exports.linkMasterPayment = async (req,res) => {
    let tx;
    try {
        const bookingId=Number(req.params.id),voucherId=Number(req.body?.VoucherID),amount=Number(req.body?.Amount);
        if(!Number.isSafeInteger(bookingId)||bookingId<=0) fail('Invalid booking id.',400);
        const pool=await getPool(); tx=new sql.Transaction(pool); await tx.begin();
        const booking=await loadBooking(tx,bookingId,true); assertHistorical(booking);
        const gl=await masterReceivableGL(tx);
        const linked=await linkMasterVoucher(tx,booking,voucherId,amount,gl,req.user);
        await logBookingTransition(tx,bookingId,booking.Status,booking.Status,req.user,
            `PKR ${money(linked.Amount)} allocated from Master voucher ${linked.VoucherNo}. Other bookings’ allocations and ledger amounts are unchanged.`);
        await tx.commit();
        res.json({message:`Linked PKR ${money(linked.Amount)} from ${linked.VoucherNo} to this booking.`,VoucherNo:linked.VoucherNo,Amount:linked.Amount});
    } catch(err) {
        if(tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode||400).json({error:err.message});
    }
};

/** POST /api/sales/historical/bookings/:id/unlink-master   { VoucherID } */
exports.unlinkMasterPayment = async (req,res) => {
    let tx;
    try {
        const bookingId=Number(req.params.id),voucherId=Number(req.body?.VoucherID);
        if(!Number.isSafeInteger(bookingId)||bookingId<=0||!Number.isSafeInteger(voucherId)||voucherId<=0) fail('Invalid booking or voucher.',400);
        const pool=await getPool(); tx=new sql.Transaction(pool); await tx.begin();
        const booking=await loadBooking(tx,bookingId,true); assertHistorical(booking);
        const gl=await masterReceivableGL(tx);
        const header=await new sql.Request(tx).input('v',sql.Int,voucherId)
            .query('SELECT SourceDocType FROM data_FinanceVoucherInfo WITH (UPDLOCK,HOLDLOCK) WHERE VoucherID=@v');
        if(!header.recordset.length) fail('Voucher not found.',404);
        if(GENERATED_SALES_SOURCES.includes(header.recordset[0].SourceDocType)) fail('Use the payment void process for an automatically created sales voucher.');
        const removed=await new sql.Request(tx).input('v',sql.Int,voucherId).input('gl',sql.Int,gl).input('b',sql.Int,bookingId)
            .query('DELETE FROM dms_HistoricalMasterAllocations WHERE VoucherID=@v AND GLCAID=@gl AND BookingID=@b');
        // Preserve support for links made by the old tag-based implementation.
        const legacyAmount=await new sql.Request(tx).input('v',sql.Int,voucherId).input('gl',sql.Int,gl).input('b',sql.Int,bookingId)
            .query('SELECT ISNULL(SUM(Debit-Credit),0) AS Amount FROM data_FinanceVoucherDetail WHERE VoucherID=@v AND GLCAID=@gl AND BookingID=@b');
        const legacy=Number(legacyAmount.recordset[0]?.Amount)>0
            ? await new sql.Request(tx).input('v',sql.Int,voucherId).input('gl',sql.Int,gl).input('b',sql.Int,bookingId)
                .query('UPDATE data_FinanceVoucherDetail SET BookingID=NULL WHERE VoucherID=@v AND GLCAID=@gl AND BookingID=@b')
            : { rowsAffected:[0] };
        if(!removed.rowsAffected[0]&&!legacy.rowsAffected[0]) fail('That voucher is not linked to this booking.',404);
        if(legacy.rowsAffected[0]) await new sql.Request(tx).input('v',sql.Int,voucherId).input('gl',sql.Int,gl).input('b',sql.Int,bookingId)
            .query('UPDATE dms_PartyLedger SET BookingID=NULL WHERE VoucherID=@v AND GLCAID=@gl AND BookingID=@b');
        await logBookingTransition(tx,bookingId,booking.Status,booking.Status,req.user,
            'This booking’s Master allocation was unlinked. Other bookings and ledger amounts stay unchanged.');
        await tx.commit(); res.json({message:'This booking’s allocation was unlinked.'});
    } catch(err) {
        if(tx) { try { await tx.rollback(); } catch {} }
        res.status(err.statusCode||400).json({error:err.message});
    }
};

/** GET /api/sales/historical/bookings/:id/linked-master — what is matched so far. */
exports.linkedMasterPayments = async (req,res) => {
    try {
        const bookingId=Number(req.params.id);
        if(!Number.isSafeInteger(bookingId)||bookingId<=0) fail('Invalid booking id.',400);
        const pool=await getPool(),gl=await masterReceivableGL(pool);
        const r=await pool.request().input('b',sql.Int,bookingId).input('gl',sql.Int,gl)
            .query(`SELECT VoucherID,VoucherNo,VoucherDate,SUM(Amount) AS Amount FROM (
                SELECT v.VoucherID,v.VoucherNo,v.VoucherDate,SUM(d.Debit-d.Credit) AS Amount
                FROM data_FinanceVoucherDetail d JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                WHERE d.BookingID=@b AND d.GLCAID=@gl AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
                  AND ISNULL(v.SourceDocType,'') NOT IN (${GENERATED_SALES_SQL})
                GROUP BY v.VoucherID,v.VoucherNo,v.VoucherDate HAVING SUM(d.Debit-d.Credit)>0
                UNION ALL
                SELECT v.VoucherID,v.VoucherNo,v.VoucherDate,a.Amount
                FROM dms_HistoricalMasterAllocations a JOIN data_FinanceVoucherInfo v ON v.VoucherID=a.VoucherID
                WHERE a.BookingID=@b AND a.GLCAID=@gl AND v.Status='Posted' AND v.ReversesVoucherID IS NULL
            ) links GROUP BY VoucherID,VoucherNo,VoucherDate ORDER BY VoucherDate DESC`);
        res.json(r.recordset);
    } catch(err) { res.status(err.statusCode||500).json({error:err.message}); }
};
