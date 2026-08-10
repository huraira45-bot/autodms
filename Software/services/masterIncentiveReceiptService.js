/**
 * Master Receipt Voucher (MRV) — ledger posting service.
 *
 * Closes the MASTER_INCENTIVE_RECEIVABLE asset that was accrued at Master
 * Invoice time. Each receipt row in dms_MasterIncentiveReceipts is linked
 * 1:1 to an accrual row in dms_SalesIncentiveAccruals (EarnerType='Master').
 *
 *   Cr MASTER_INCENTIVE_RECEIVABLE  (GrossAmount — closes the asset)
 *   Dr <Bank GL> or POS_CLEARING     (NetCashReceived — owner ask 2026-08-08:
 *                                     incentive can be received via POS same
 *                                     as any other receipt, same POS_CLEARING
 *                                     role salesPaymentPostingService/
 *                                     paymentController already use)
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
 *
 * @param {string} paymentMode - 'Bank' (default) or 'POS'. POS debits the
 *   POS_CLEARING role account instead of a specific bank account — bankAccountGLCAID
 *   is ignored/optional in that case.
 */
async function postMasterReceiptVoucher(receiptId, bankAccountGLCAID, userInfo, tx, paymentMode = 'Bank') {
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
    const isPOS  = paymentMode === 'POS';
    const debitGL = isPOS ? await resolveRole('POS_CLEARING') : await resolveBank(bankAccountGLCAID, tx);
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
        .input('src',  sql.NVarChar(50),     'MASTER_INCENTIVE_RECEIPT')
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

    await insertLine(debitGL, net, 0, `MRV ${mrvNo} — ${isPOS ? 'POS receipt' : 'bank deposit'}`, r.BookingID);
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

/**
 * Posts ONE MRV voucher covering MULTIPLE already-inserted receipt rows —
 * owner ask 2026-08-08: Master pays the whole month's incentive as a single
 * lump sum, not one bank transfer per accrual. The receipt rows themselves
 * stay 1:1 with their accrual (dms_MasterIncentiveReceipts' existing shape,
 * FIFO-split across accruals by the caller — see masterIncentiveController.
 * createBulkReceipt), but here they share one physical payment: a single Dr
 * Bank/POS_CLEARING line for the combined net, one Cr Master Incentive
 * Receivable line PER receipt (keeps booking-level audit trail on the credit
 * side even though the debit side is one lump entry, same as how the money
 * actually arrived).
 *
 * Caller MUST be inside an open transaction. Returns the new VoucherID and
 * stamps it back onto every receipt row.
 */
async function postBulkMasterReceiptVoucher(receiptIds, bankAccountGLCAID, userInfo, tx, paymentMode = 'Bank') {
    if (!Array.isArray(receiptIds) || !receiptIds.length) throw new Error('receiptIds is required.');

    const receipts = [];
    for (const id of receiptIds) {
        const r = await loadReceipt(id, tx);
        if (r.EarnerType !== 'Master') throw new Error(`Receipt ${id} is not tied to a Master accrual.`);
        if (r.ReceiptVoucherID) throw new Error(`Receipt ${id} already has a voucher — not idempotent for bulk (call one at a time to resume).`);
        receipts.push(r);
    }

    const gross = receipts.reduce((s, r) => s + Number(r.GrossAmount || 0), 0);
    const wht   = receipts.reduce((s, r) => s + Number(r.WHTAmount || 0), 0);
    const gst   = receipts.reduce((s, r) => s + Number(r.GSTOnIncentive || 0), 0);
    const net   = receipts.reduce((s, r) => s + Number(r.NetCashReceived || 0), 0);
    if (gross <= 0) throw new Error('Combined GrossAmount must be > 0.');

    const recvGL = await resolveRole('MASTER_INCENTIVE_RECEIVABLE');
    const isPOS  = paymentMode === 'POS';
    const debitGL = isPOS ? await resolveRole('POS_CLEARING') : await resolveBank(bankAccountGLCAID, tx);
    const whtGL  = wht > 0 ? await resolveRole('TRADE_DEBTORS') : null;
    const gstGL  = gst > 0 ? await resolveRole('GST_PAYABLE')    : null;

    const vt = await new sql.Request(tx).query(`SELECT Voucherid FROM GLVoucherType WHERE Title='BRV'`);
    if (!vt.recordset.length) throw new Error('BRV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const seqMRV = await new sql.Request(tx).query(`SELECT NEXT VALUE FOR dbo.seq_MasterIncentiveReceiptNo AS n`);
    const mrvNo  = `MRV-${String(seqMRV.recordset[0].n).padStart(4, '0')}`;

    const narration = `Master incentive received (lump sum) — ${receipts.length} accrual${receipts.length===1?'':'s'}: `
        + receipts.map(r => `#${r.AccrualID} (${r.BookingNo})`).join(', ');

    const hdr = await new sql.Request(tx)
        .input('vd',   sql.DateTime,         new Date())
        .input('vno',  sql.NVarChar(50),     mrvNo)
        .input('vtId', sql.Int,              voucherTypeId)
        .input('rem',  sql.NVarChar(sql.MAX),narration)
        .input('tot',  sql.Decimal(18,2),    gross + gst)
        .input('src',  sql.NVarChar(50),     'MASTER_INCENTIVE_RECEIPT')
        .input('srcId',sql.Int,              receiptIds[0])   // representative — SourceDocID is single-valued; full list lives in Remarks
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

    await insertLine(debitGL, net, 0, `MRV ${mrvNo} — ${isPOS ? 'POS receipt' : 'bank deposit'} (lump sum, ${receipts.length} accruals)`, null);
    if (wht > 0) await insertLine(whtGL, wht, 0, `WHT withheld by Master (claimable)`, null);
    if (gst > 0) await insertLine(gstGL, 0, gst, `Output GST on incentive`, null);
    for (const r of receipts) {
        await insertLine(recvGL, 0, Number(r.GrossAmount), `Closing Master incentive receivable (accrual #${r.AccrualID}, ${r.BookingNo})`, r.BookingID);
    }

    await new sql.Request(tx)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    for (const r of receipts) {
        await new sql.Request(tx)
            .input('rid', sql.Int, r.ReceiptID)
            .input('vid', sql.Int, voucherId)
            .input('vno', sql.NVarChar(20), mrvNo)
            .query(`UPDATE dms_MasterIncentiveReceipts
                    SET ReceiptVoucherID=@vid, ReceiptVoucherNo=@vno
                    WHERE ReceiptID=@rid`);

        const newDisbursed = Math.min(Number(r.DisbursedAmount || 0) + Number(r.GrossAmount), Number(r.AmountAccrued || 0));
        const newStatus = newDisbursed >= Number(r.AmountAccrued || 0) - 0.01 ? 'Disbursed' : 'PartiallyDisbursed';
        await new sql.Request(tx)
            .input('aid', sql.Int,           r.AccrualID)
            .input('amt', sql.Decimal(18,2), newDisbursed)
            .input('st',  sql.NVarChar(20),  newStatus)
            .query(`UPDATE dms_SalesIncentiveAccruals
                    SET DisbursedAmount=@amt, Status=@st, LastDisbursedAt=GETDATE()
                    WHERE AccrualID=@aid`);
    }

    return voucherId;
}

module.exports = { postMasterReceiptVoucher, postBulkMasterReceiptVoucher };
