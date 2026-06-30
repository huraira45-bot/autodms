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

// Agency model (migration 045). Two journal patterns based on PaymentMode:
//
// CASE 1 — customer pays the DEALER (Cash / Cheque / BankTransfer / POS).
//   Dr Bank/Cash/POS-clearing/Cheques-on-hand  (Amount + PremiumPortion)
//        Cr Customer A/c (PartyGLID)                       (Amount)
//        Cr PREMIUM_DEFERRED                                (PremiumPortion)
//   Dealer holds the cash; Pay Master step later forwards wholesale.
//
// CASE 2 — customer pays MASTER directly via PayOrder; dealer is pass-through.
//   Dr BOOKING_VARIANT_RECEIVABLE   (Amount = vehicle only — PayOrder is in Master's name)
//        Cr Customer A/c (PartyGLID)                       (Amount)
//   No bank movement on our side; no premium (premium can't ride this PO).
//   Counts toward AmountPaidToMaster, so the Pay Master button correctly
//   reflects the remaining wholesale owed.

async function resolveAccounts(transaction) {
    const need = ['CASH_BOOK', 'CHEQUES_ON_HAND', 'BOOKING_ADVANCE',
                  'PREMIUM_DEFERRED', 'BOOKING_VARIANT_RECEIVABLE'];
    const out = {};
    for (const r of need) out[r] = { GLCAID: await resolveRole(r) };
    return out;
}

async function resolveCustomerGL(partyId, fallbackGL, transaction) {
    if (!partyId) return { GLCAID: fallbackGL, isPartyLeaf: false };
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, partyId)
        .query(`SELECT PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id`);
    const gl = r.recordset[0]?.PartyGLID;
    return gl
        ? { GLCAID: gl, isPartyLeaf: true }
        : { GLCAID: fallbackGL, isPartyLeaf: false };
}

async function resolveBank(bankAccountId, transaction) {
    if (!bankAccountId) return null;
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, bankAccountId)
        .query(`SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1`);
    if (!r.recordset.length) throw new Error(`Bank account ${bankAccountId} is not active or not registered.`);
    return { GLCAID: r.recordset[0].GLCAID };
}

/**
 * CASE 2 helper — customer pays Master directly via PayOrder. Dealer is the
 * pass-through; our books just record the obligation flip:
 *   Dr BOOKING_VARIANT_RECEIVABLE  (we have a claim on Master for the chassis)
 *        Cr Customer A/c           (customer has paid us in substance)
 * No bank movement. Voucher type is JV (not BRV — no bank receipt).
 */
async function postDirectPayOrderVoucher(paymentId, p, amount, accounts, customerLeaf, userInfo, transaction) {
    const bvrGL = accounts.BOOKING_VARIANT_RECEIVABLE.GLCAID;

    const vt = await new sql.Request(transaction).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='JV'`);
    if (!vt.recordset.length) throw new Error('JV voucher type missing');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `JV-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = `Booking ${p.BookingNo} — Pay Order ${p.PayOrderNumber || ''}`
        + (p.PayOrderBankName ? ` (${p.PayOrderBankName})` : '')
        + ` direct to Master Motors`;

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

    const insertLine = async (glcaid, dr, cr, lineNarration) => {
        await new sql.Request(transaction)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNarration)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('pid', sql.Int, p.PartyID || null)
            .input('bid', sql.Int, p.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @bid)`);
    };

    await insertLine(bvrGL,             amount, 0, `Master to fulfil booking ${p.BookingNo} (PayOrder direct)`);
    await insertLine(customerLeaf.GLCAID, 0, amount,
        `Customer paid Master via Pay Order ${p.PayOrderNumber || ''} — booking ${p.BookingNo}`
        + (customerLeaf.isPartyLeaf ? '' : ' (Booking Advance fallback)'));

    // Subsidiary ledger entry for the customer-side Cr
    await new sql.Request(transaction)
        .input('pid', sql.Int, p.PartyID)
        .input('bid', sql.Int, p.BookingID)
        .input('vid', sql.Int, voucherId)
        .input('gl',  sql.Int, customerLeaf.GLCAID)
        .input('cr',  sql.Decimal(18,2), amount)
        .input('nar', sql.NVarChar(500), `Pay Order direct to Master — booking ${p.BookingNo}`)
        .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                VALUES (@pid, @bid, @vid, @gl, 0, @cr, @nar)`);

    // Flip Posted; balanced-entry trigger validates here.
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp voucher # back on the payment row
    await new sql.Request(transaction)
        .input('pid', sql.Int, paymentId)
        .input('vid', sql.Int, voucherId)
        .input('vno', sql.NVarChar(50), voucherNo)
        .query(`UPDATE dms_SalesPayments SET VoucherID=@vid, VoucherNo=@vno WHERE PaymentID=@pid`);

    return voucherId;
}

async function loadPayment(paymentId, transaction) {
    const r = await new sql.Request(transaction)
        .input('id', sql.Int, paymentId)
        .query(`SELECT p.PaymentID, p.BookingID, p.PaymentPath, p.PaymentMode, p.Amount,
                       p.PremiumPortion, p.BankAccountID, p.ChequeNumber, p.ChequeDate,
                       p.POSTransactionRef, p.PayOrderNumber, p.ReceivedAt,
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
    const vehicleAmount = Number(p.Amount || 0);
    const premium       = Math.max(0, Number(p.PremiumPortion || 0));
    if (vehicleAmount + premium <= 0) return null;

    const accounts = await resolveAccounts(transaction);
    const customerLeaf = await resolveCustomerGL(p.PartyID, accounts.BOOKING_ADVANCE.GLCAID, transaction);

    // CASE 2 — PayOrder direct to Master, dealer pass-through.
    if (p.PaymentMode === 'PayOrder') {
        if (premium > 0) {
            throw new Error('Pay Order is direct to Master and covers vehicle only — enter premium as a separate Cash/Bank/POS payment.');
        }
        return await postDirectPayOrderVoucher(paymentId, p, vehicleAmount, accounts, customerLeaf, userInfo, transaction);
    }

    // CASE 1 — customer pays the dealer; cash hits our bank/cash/etc.
    const totalReceived = Math.round((vehicleAmount + premium) * 100) / 100;
    const bank = await resolveBank(p.BankAccountID, transaction);

    let debitGL, debitNarrationTail;
    if (p.PaymentMode === 'Cash') {
        debitGL = accounts.CASH_BOOK.GLCAID;
        debitNarrationTail = 'Cash receipt';
    } else if (p.PaymentMode === 'Cheque') {
        debitGL = accounts.CHEQUES_ON_HAND.GLCAID;
        debitNarrationTail = `Cheque #${p.ChequeNumber || ''} (uncleared)`;
    } else if (p.PaymentMode === 'BankTransfer' || p.PaymentMode === 'POS') {
        if (!bank) throw new Error(`Bank account is required for PaymentMode=${p.PaymentMode}`);
        debitGL = bank.GLCAID;
        debitNarrationTail = p.PaymentMode === 'POS' ? `POS ref ${p.POSTransactionRef || ''}` : 'Bank transfer';
    } else {
        throw new Error(`Unknown PaymentMode: ${p.PaymentMode}`);
    }

    const premiumDeferredGL = accounts.PREMIUM_DEFERRED.GLCAID;

    // Voucher numbering — use CRV for cash, BRV otherwise
    const isCash = p.PaymentMode === 'Cash';
    const vtCode = isCash ? 'CRV' : 'BRV';
    const vt = await new sql.Request(transaction).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='${vtCode}'`);
    if (!vt.recordset.length) throw new Error(`${vtCode} voucher type missing`);
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`);
    const voucherNo = `${vtCode}-${String(seqRes.recordset[0].nextNo).padStart(4, '0')}`;

    const narration = premium > 0
        ? `Booking ${p.BookingNo} — ${debitNarrationTail} → vehicle ${vehicleAmount} + premium ${premium} (total ${totalReceived})`
        : `Booking ${p.BookingNo} — ${debitNarrationTail} → customer account`;

    const hdrRes = await new sql.Request(transaction)
        .input('vd',   sql.DateTime,     p.ReceivedAt || new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration)
        .input('tot',  sql.Decimal(18,2), totalReceived)
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
        const r = await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('gl',   sql.Int,           glcaid)
            .input('nar',  sql.NVarChar(sql.MAX), lineNarration)
            .input('dr',   sql.Decimal(18,2), dr || 0)
            .input('cr',   sql.Decimal(18,2), cr || 0)
            .input('pid',  sql.Int,           p.PartyID || null)
            .input('bid',  sql.Int,           p.BookingID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, BookingID)
                    OUTPUT INSERTED.VoucherDetailID
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @bid)`);
        return r.recordset[0].VoucherDetailID;
    };

    const drDetailId = await insertLine(debitGL, totalReceived, 0, `${debitNarrationTail} for booking ${p.BookingNo}`);
    if (vehicleAmount > 0) {
        await insertLine(customerLeaf.GLCAID, 0, vehicleAmount,
            `Vehicle portion — booking ${p.BookingNo}` + (customerLeaf.isPartyLeaf ? '' : ' (Booking Advance fallback)'));
    }
    if (premium > 0) {
        await insertLine(premiumDeferredGL, 0, premium,
            `Premium portion (deferred — recognized at delivery) — booking ${p.BookingNo}`);
    }

    // Subsidiary ledger — vehicle leg only (premium has its own dedicated GL).
    if (vehicleAmount > 0) {
        await new sql.Request(transaction)
            .input('pid', sql.Int, p.PartyID)
            .input('bid', sql.Int, p.BookingID)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, customerLeaf.GLCAID)
            .input('cr',  sql.Decimal(18,2), vehicleAmount)
            .input('nar', sql.NVarChar(500), `Vehicle receipt — booking ${p.BookingNo}`)
            .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @bid, @vid, @gl, 0, @cr, @nar)`);
    }

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

    // Cheque receipts also register on the Cheque Clearance queue so the
    // deposit-bank movement is posted via the Clearance screen, not lost.
    if (p.PaymentMode === 'Cheque') {
        if (!p.ChequeDate)   throw new Error('Cheque payment requires ChequeDate.');
        if (!p.ChequeNumber) throw new Error('Cheque payment requires ChequeNumber.');
        if (!bank)           throw new Error('Cheque payment requires a deposit BankAccountID.');
        await new sql.Request(transaction)
            .input('vid',  sql.Int,           voucherId)
            .input('did',  sql.Int,           drDetailId)
            .input('dir',  sql.NVarChar(20),  'Received')
            .input('no',   sql.NVarChar(50),  p.ChequeNumber)
            .input('dt',   sql.Date,          p.ChequeDate)
            .input('amt',  sql.Decimal(18,2), totalReceived)
            .input('dbg',  sql.Int,           bank.GLCAID)
            .input('pid',  sql.Int,           p.PartyID || null)
            .input('cby',  sql.Int,           userInfo?.userId || null)
            .input('cbyN', sql.NVarChar(100), userInfo?.userName || null)
            .query(`INSERT INTO dms_PendingCheques
                        (ReceiptVoucherID, ReceiptDetailID, Direction,
                         ChequeNo, ChequeDate, Amount, DepositBankGLCAID, PartyID,
                         CreatedBy, CreatedByName)
                    VALUES (@vid, @did, @dir,
                            @no, @dt, @amt, @dbg, @pid,
                            @cby, @cbyN)`);
    }

    return voucherId;
}

module.exports = { postSalesPaymentVoucher };
