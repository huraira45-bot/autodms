/**
 * Pay Master — agency model (migration 045).
 *
 * When dealer remits the wholesale price to Master Changan against a specific
 * booking, the cash leaves us and Master becomes obligated to deliver:
 *
 *   Dr BOOKING_VARIANT_RECEIVABLE  (subsidiary by BookingID)
 *   Cr <Bank GL>                   (or CASH_BOOK for cash)
 *
 * Sits as our asset until the chassis is physically delivered to the customer;
 * salesDeliveryPostingService clears the BOOKING_VARIANT_RECEIVABLE Cr leg at
 * delivery time.
 *
 * Mode: 'Cash' | 'Bank'. Bank requires BankAccountGLCAID.
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

async function postPayMasterVoucher({ bookingId, amount, mode, bankAccountGLCAID, reference, notes }, userInfo, tx) {
    if (!bookingId)            throw new Error('bookingId is required.');
    if (!(amount > 0))         throw new Error('Amount must be > 0.');
    if (!['Cash', 'Bank'].includes(mode)) throw new Error('Mode must be Cash or Bank.');

    const bookingRes = await new sql.Request(tx)
        .input('id', sql.Int, bookingId)
        .query(`SELECT BookingID, BookingNo, PartyID FROM dms_SalesBookings WHERE BookingID=@id`);
    if (!bookingRes.recordset.length) throw new Error(`Booking ${bookingId} not found.`);
    const b = bookingRes.recordset[0];

    const bvrGL = await resolveRole('BOOKING_VARIANT_RECEIVABLE');
    let crGL;
    if (mode === 'Cash') {
        crGL = await resolveRole('CASH_BOOK');
    } else {
        if (!bankAccountGLCAID) throw new Error('Bank account is required for Bank mode.');
        const bk = await new sql.Request(tx)
            .input('id', sql.Int, bankAccountGLCAID)
            .query(`SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1`);
        if (!bk.recordset.length) throw new Error('Bank account not active.');
        crGL = bk.recordset[0].GLCAID;
    }

    const vtCode = mode === 'Cash' ? 'CPV' : 'BPV';
    const vt = await new sql.Request(tx).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='${vtCode}'`);
    if (!vt.recordset.length) throw new Error(`${vtCode} voucher type missing.`);
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqRes = await new sql.Request(tx).query(`SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS n`);
    const voucherNo = `${vtCode}-${String(seqRes.recordset[0].n).padStart(4, '0')}`;

    const narration = `Pay Master Motors for booking ${b.BookingNo}`
        + (reference ? ` — ref ${reference}` : '');

    const hdr = await new sql.Request(tx)
        .input('vd',   sql.DateTime,     new Date())
        .input('vno',  sql.NVarChar(50), voucherNo)
        .input('vtId', sql.Int,          voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX), narration + (notes ? ` (${notes})` : ''))
        .input('tot',  sql.Decimal(18,2), amount)
        .input('src',  sql.NVarChar(20), 'PAY_MASTER')
        .input('srcId',sql.Int,          bookingId)
        .input('cby',  sql.Int,          userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdr.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNar) => {
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNar)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('bid', sql.Int, bookingId)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @bid)`);
    };

    await insertLine(bvrGL, amount, 0, `Paid Master for booking ${b.BookingNo}`);
    await insertLine(crGL,  0, amount, `${mode} disbursement to Master`);

    // Track booking-side balance in subsidiary ledger
    await new sql.Request(tx)
        .input('pid', sql.Int, b.PartyID || null)
        .input('bid', sql.Int, bookingId)
        .input('vid', sql.Int, voucherId)
        .input('gl',  sql.Int, bvrGL)
        .input('dr',  sql.Decimal(18,2), amount)
        .input('nar', sql.NVarChar(500), `Booking variant receivable raised — ${b.BookingNo}`)
        .query(`INSERT INTO dms_PartyLedger (PartyID, BookingID, VoucherID, GLCAID, Debit, Credit, Narration)
                VALUES (@pid, @bid, @vid, @gl, @dr, 0, @nar)`);

    await new sql.Request(tx)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    return { voucherId, voucherNo };
}

module.exports = { postPayMasterVoucher };
