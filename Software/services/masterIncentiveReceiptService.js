/**
 * Master Receipt Voucher (MRV) — ledger posting service.
 *
 * Closes the MASTER_INCENTIVE_RECEIVABLE asset that was accrued at Master
 * Invoice time. Each receipt row in dms_MasterIncentiveReceipts is linked
 * 1:1 to an accrual row in dms_SalesIncentiveAccruals (EarnerType='Master').
 *
 *   Cr MASTER_INCENTIVE_RECEIVABLE  (GrossAmount — closes the asset)
 *   Dr <Bank GL>                     (NetCashReceived)
 *   Dr TRADE_DEBTORS                 (WHTAmount — temporary WHT-receivable bucket;
 *                                     a dedicated WHT_RECEIVABLE role is on the
 *                                     backlog per memory project_wht_receivable)
 *   Cr GST_PAYABLE                   (GSTOnIncentive — output GST collected)
 *
 * After posting, the accrual is moved to Status='Disbursed' if fully covered;
 * partial cover leaves the accrual in 'PartiallyDisbursed' (per check constraint).
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');

async function loadReceipt(receiptId, tx) {
    const r = await new sql.Request(tx)
        .input('id', sql.Int, receiptId)
        .query(`SELECT r.ReceiptID, r.AccrualID, r.GrossAmount, r.WHTAmount, r.GSTOnIncentive,
                       r.NetCashReceived, r.ReceiptVoucherID, r.Status,
                       a.BookingID, a.IncentiveCategory, a.EarnerType, a.AmountAccrued,
                       a.DisbursedAmount, a.Status AS AccrualStatus,
                       b.BookingNo
                FROM dms_MasterIncentiveReceipts r
                INNER JOIN dms_SalesIncentiveAccruals a ON a.AccrualID = r.AccrualID
                LEFT JOIN dms_SalesBookings b           ON b.BookingID  = a.BookingID
                WHERE r.ReceiptID=@id`);
    if (!r.recordset.length) throw new Error(`Master receipt ${receiptId} not found.`);
    return r.recordset[0];
}

async function resolveBank(bankAccountGLCAID, tx) {
    if (!bankAccountGLCAID) throw new Error('Bank account is required for MRV.');
    const r = await new sql.Request(tx)
        .input('id', sql.Int, bankAccountGLCAID)
        .query(`SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1`);
    if (!r.recordset.length) throw new Error(`Bank account ${bankAccountGLCAID} not active or unregistered.`);
    return r.recordset[0].GLCAID;
}

/**
 * Posts the MRV voucher. Caller MUST be inside an open transaction. Returns
 * the new VoucherID and stamps it back onto the receipt row.
 */
async function postMasterReceiptVoucher(receiptId, bankAccountGLCAID, userInfo, tx) {
    const r = await loadReceipt(receiptId, tx);
    if (r.EarnerType !== 'Master') {
        throw new Error('Receipt is not tied to a Master accrual.');
    }
    if (r.ReceiptVoucherID) return r.ReceiptVoucherID;  // idempotent

    const gross = Number(r.GrossAmount || 0);
    const wht   = Number(r.WHTAmount   || 0);
    const gst   = Number(r.GSTOnIncentive || 0);
    const net   = Number(r.NetCashReceived || 0);
    if (gross <= 0) throw new Error('GrossAmount must be > 0.');
    if (Math.abs(net - (gross - wht + gst)) > 0.01) {
        throw new Error(`NetCashReceived must equal Gross - WHT + GST (got ${net} vs ${gross - wht + gst}).`);
    }

    const recvGL = await resolveRole('MASTER_INCENTIVE_RECEIVABLE');
    const bankGL = await resolveBank(bankAccountGLCAID, tx);
    const whtGL  = wht > 0 ? await resolveRole('TRADE_DEBTORS') : null;       // placeholder — WHT_RECEIVABLE role is backlog
    const gstGL  = gst > 0 ? await resolveRole('GST_PAYABLE')    : null;

    const vt = await new sql.Request(tx).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='BRV'`);
    if (!vt.recordset.length) throw new Error('BRV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqMRV = await new sql.Request(tx).query(`SELECT NEXT VALUE FOR dbo.seq_MasterIncentiveReceiptNo AS n`);
    const mrvNo  = `MRV-${String(seqMRV.recordset[0].n).padStart(4, '0')}`;

    const narration = `Master incentive received — accrual #${r.AccrualID} (${r.IncentiveCategory}) for booking ${r.BookingNo}`;

    const hdr = await new sql.Request(tx)
        .input('vd',   sql.DateTime,         new Date())
        .input('vno',  sql.NVarChar(50),     mrvNo)
        .input('vtId', sql.Int,              voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX),narration)
        .input('tot',  sql.Decimal(18,2),    gross + gst)   // total debit side
        .input('src',  sql.NVarChar(20),     'MASTER_INCENTIVE_RECEIPT')
        .input('srcId',sql.Int,              receiptId)
        .input('cby',  sql.Int,              userInfo?.userId || null)
        .input('cbyN', sql.NVarChar(100),    userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @rem, @tot,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = hdr.recordset[0].VoucherID;

    const insertLine = async (glcaid, dr, cr, lineNar, bookingId) => {
        await new sql.Request(tx)
            .input('vid', sql.Int,           voucherId)
            .input('gl',  sql.Int,           glcaid)
            .input('nar', sql.NVarChar(sql.MAX), lineNar)
            .input('dr',  sql.Decimal(18,2), dr || 0)
            .input('cr',  sql.Decimal(18,2), cr || 0)
            .input('bid', sql.Int,           bookingId || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, BookingID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @bid)`);
    };

    await insertLine(bankGL, net, 0, `MRV ${mrvNo} — bank deposit`, r.BookingID);
    if (wht > 0) await insertLine(whtGL, wht, 0, `WHT withheld by Master (claimable)`, r.BookingID);
    if (gst > 0) await insertLine(gstGL, 0, gst, `Output GST on incentive`, r.BookingID);
    await insertLine(recvGL, 0, gross, `Closing Master incentive receivable (accrual #${r.AccrualID})`, r.BookingID);

    // Flip Status=Posted (balanced-entry trigger validates here)
    await new sql.Request(tx)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Stamp the receipt
    await new sql.Request(tx)
        .input('rid', sql.Int, receiptId)
        .input('vid', sql.Int, voucherId)
        .input('vno', sql.NVarChar(20), mrvNo)
        .query(`UPDATE dms_MasterIncentiveReceipts
                SET ReceiptVoucherID=@vid, ReceiptVoucherNo=@vno
                WHERE ReceiptID=@rid`);

    // Update the accrual's DisbursedAmount + Status. The check constraint
    // forces DisbursedAmount <= AmountAccrued, so we clamp; Status flips
    // to Disbursed when fully covered, else PartiallyDisbursed.
    const newDisbursed = Math.min(Number(r.DisbursedAmount || 0) + gross, Number(r.AmountAccrued || 0));
    const newStatus = newDisbursed >= Number(r.AmountAccrued || 0) - 0.01 ? 'Disbursed' : 'PartiallyDisbursed';
    await new sql.Request(tx)
        .input('aid', sql.Int,           r.AccrualID)
        .input('amt', sql.Decimal(18,2), newDisbursed)
        .input('st',  sql.NVarChar(20),  newStatus)
        .query(`UPDATE dms_SalesIncentiveAccruals
                SET DisbursedAmount=@amt, Status=@st, LastDisbursedAt=GETDATE()
                WHERE AccrualID=@aid`);

    return voucherId;
}

module.exports = { postMasterReceiptVoucher };
