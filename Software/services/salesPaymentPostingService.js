/**
 * Sales Payment → ledger posting service.
 *
 * Posts a balanced voucher when a customer pays against a sales booking.
 *
 *   Cash mode:        Dr CASH_BOOK              Cr BOOKING_ADVANCE / BOOKING_RECEIVABLE
 *   Bank/POS/Cheque:  Dr <chosen bank>          Cr same
 *   Cheque:           Dr CHEQUES_ON_HAND        Cr same   (until clearance is reconciled — manual JV)
 *   PayOrder:         Dr <issuing bank>         Cr same   (Pay Order is treated like a bank receipt)
 *
 * Credit side picks BOOKING_RECEIVABLE if the booking has been confirmed
 * (post-MasterInvoice / RevenueRecognized) and BOOKING_ADVANCE otherwise.
 * Per Decision #14 (locked design): premium portion sits in BOOKING_ADVANCE
 * until delivery, where it transfers to PREMIUM_INCOME.
 *
 * Subsidiary ledger: a paired dms_PartyLedger row keyed by PartyID + BookingID
 * tracks the customer's running booking-level balance.
 *
 * Gated: if any system-account role required is unmapped, the posting service
 * throws SYSTEM_ACCOUNT_NOT_CONFIGURED. The controller catches that specific
 * code and logs a warning while keeping the payment row saved (matches the
 * existing job-card / store-sale pattern).
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

const REVENUE_RECOGNIZED_STATES = new Set([
    'MasterInvoicePosted', 'ReadyForDelivery', 'DeliveryApproved', 'GatePassIssued', 'Closed',
]);

async function resolveAccounts(transaction) {
    const need = ['CASH_BOOK', 'CHEQUES_ON_HAND', 'BOOKING_ADVANCE', 'BOOKING_RECEIVABLE'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function resolveBank(bankAccountId, transaction) {
    if (!bankAccountId) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, bankAccountId)
        .query(`SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1`);
    if (!r.recordset.length) throw new Error(`Bank account ${bankAccountId} is not active or not registered.`);
    return { GLCAID: r.recordset[0].GLCAID };
}

async function loadPayment(paymentId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, paymentId)
        .query(`SELECT p.PaymentID, p.BookingID, p.PaymentPath, p.PaymentMode, p.Amount,
                       p.PremiumPortion, p.BankAccountID, p.ChequeNumber, p.POSTransactionRef,
                       p.PayOrderNumber, p.ReceivedAt,
                       b.BookingNo, b.PartyID, b.Status, b.NegotiatedPrice
                FROM dms_SalesPayments p
                INNER JOIN dms_SalesBookings b ON p.BookingID = b.BookingID
                WHERE p.PaymentID = @id`);
    if (!r.recordset.length) throw new Error(`Sales payment ${paymentId} not found.`);
    return r.recordset[0];
}

/**
 * Posts a balanced voucher for a single sales-payment row.
 * Caller MUST be inside an open transaction.
 *
 * @returns {number} new VoucherID, or null if amount is 0
 */
async function postSalesPaymentVoucher(paymentId, userInfo, transaction) {
    const p = await loadPayment(paymentId, transaction);
    const amount = Number(p.Amount || 0);
    if (amount <= 0) return null;

    const accounts = await resolveAccounts(transaction);
    const bank = await resolveBank(p.BankAccountID, transaction);

    // Debit side
    let debitGL, debitNarrationTail;
    if (p.PaymentMode === 'Cash') {
        debitGL = accounts.CASH_BOOK.GLCAID;
        debitNarrationTail = 'Cash receipt';
    } else if (p.PaymentMode === 'Cheque') {
        // Until cheque clears, sit in CHEQUES_ON_HAND. Reconciliation JV moves to bank.
        debitGL = accounts.CHEQUES_ON_HAND.GLCAID;
        debitNarrationTail = `Cheque #${p.ChequeNumber || ''} (uncleared)`;
    } else if (p.PaymentMode === 'BankTransfer' || p.PaymentMode === 'POS' || p.PaymentMode === 'PayOrder') {
        if (!bank) throw new Error(`Bank account is required for PaymentMode=${p.PaymentMode}`);
        debitGL = bank.GLCAID;
        debitNarrationTail = p.PaymentMode === 'POS' ? `POS ref ${p.POSTransactionRef || ''}`
                          : p.PaymentMode === 'PayOrder' ? `Pay Order ${p.PayOrderNumber || ''}`
                          : 'Bank transfer';
    } else {
        throw new Error(`Unknown PaymentMode: ${p.PaymentMode}`);
    }

    // Credit side — booking-stage-aware
    const recognized = REVENUE_RECOGNIZED_STATES.has(p.Status);
    const creditGL = recognized ? accounts.BOOKING_RECEIVABLE.GLCAID : accounts.BOOKING_ADVANCE.GLCAID;
    const creditLabel = recognized ? 'Booking Receivable' : 'Booking Advance';

    // Voucher numbering — use CRV for cash, BRV otherwise
    const isCash = p.PaymentMode === 'Cash';
    const vtCode = isCash ? 'CRV' : 'BRV';
    const vt = await new sql.Request(transaction).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='${vtCode}'`);
    if (!vt.recordset.length) throw new Error(`${vtCode} voucher type missing`);
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT ISNULL(MAX(VoucherID),0) + 1 AS nextNo FROM data_FinanceVoucherInfo`);
    const voucherNo = `${vtCode}-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = `Booking ${p.BookingNo} — ${debitNarrationTail} → ${creditLabel}`;

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     p.ReceivedAt || new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), amount)
        .input('src',  sql.NVarChar(20), 'SALES_PAYMENT')
        .input('srcId',sql.Int,          p.PaymentID)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdrRes.recordset[0].VoucherID;

    // Lines
    const insertLine = async (glcaid, dr, cr, lineNarration) => {
        await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           glcaid)
            .input('nar',  sql.NVarChar(sql.MAX), lineNarration)
            .input('dr',   sql.Decimal(18,2), dr || 0)
            .input('cr',   sql.Decimal(18,2), cr || 0)
            .input('pid',  sql.Int,           p.PartyID || null)
            .input('bid',  sql.Int,           p.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @bid)`);
    };

    await insertLine(debitGL, amount, 0, `${debitNarrationTail} for booking ${p.BookingNo}`);
    await insertLine(creditGL, 0, amount, `${creditLabel} reduced for booking ${p.BookingNo}`);

    // Subsidiary ledger — only the customer-side leg goes into dms_PartyLedger
    // so per-booking running balance can be queried by PartyID + BookingID.
    await new sql.Request(transaction)
        .input('pid', sql.Int, p.PartyID)
        .input('bid', sql.Int, p.BookingID)
        .input('vid', sql.Int, voucherId)
        .input('gl',  sql.Int, creditGL)
        .input('cr',  sql.Decimal(18,2), amount)
        .input('nar', sql.NVarChar(500), `Receipt against booking ${p.BookingNo}`)
        .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                VALUES (@pid, @bid, @vid, @gl, 0, @cr, @nar)`);

    // Flip to Posted (balanced-entry trigger validates here)
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp the VoucherID back onto the payment row
    await new sql.Request(transaction)
        .input('pid', sql.Int, paymentId)
        .input('vid', sql.Int, voucherId)
        .input('vno', sql.NVarChar(50), voucherNo)
        .query(`UPDATE dms_SalesPayments SET VoucherID=@vid, VoucherNo=@vno WHERE PaymentID=@pid`);

    return voucherId;
}

module.exports = { postSalesPaymentVoucher };
