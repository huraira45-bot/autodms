/**
 * Posts a mirror-reversal voucher for a previously-posted manual voucher.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.5 (Voucher lifecycle — Reversed status).
 *
 * Behavior:
 *   - Reads the original voucher header + all detail lines + subsidiary ledger entries.
 *   - Inserts a new voucher header with the SAME VoucherType, flagged ReversesVoucherID = original.
 *   - Inserts mirror detail lines (Debit ↔ Credit swapped).
 *   - Inserts mirror subsidiary ledger rows so per-party balances net to zero.
 *   - Flips original Status='Reversed' + ReversedBy/ReversedByName/ReversedAt.
 *   - Both vouchers remain visible in reports; net GL impact is zero.
 *
 * Throws on any error so the caller's transaction rolls back.
 *
 * Note: the balanced-entry trigger fires when we flip the reversal Status to 'Posted'.
 */
const { sql } = require('../config/db');

async function postReversalVoucher(originalVoucherId, userInfo, transaction) {
    // 1. Load original header
    const hdrRes = await new sql.Request(transaction)
        .input('id', sql.Int, originalVoucherId)
        .query(`SELECT VoucherID, VoucherDate, VoucherNo, VoucherTypeID, Remarks,
                       TotalAmount, Status, SourceDocType, SourceDocID
                FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
    if (!hdrRes.recordset.length) throw new Error(`Voucher ${originalVoucherId} not found.`);
    const orig = hdrRes.recordset[0];
    if (orig.Status !== 'Posted') {
        throw new Error(`Cannot reverse voucher ${orig.VoucherNo} — current status is ${orig.Status}.`);
    }

    // 2. Load original detail lines. Critical: carry AllocatedToVoucherID
    // through so settlement-aware reports (Receive Payment outstanding,
    // POS Settlement pending) net the mirror against the original.
    const linesRes = await new sql.Request(transaction)
        .input('id', sql.Int, originalVoucherId)
        .query(`SELECT GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID
                FROM data_FinanceVoucherDetail WHERE VoucherID=@id`);

    // 3. Load original subsidiary ledger rows
    const subRes = await new sql.Request(transaction)
        .input('id', sql.Int, originalVoucherId)
        .query(`SELECT PartyID, JobCardID, GLCAID, Debit, Credit, Narration
                FROM dms_PartyLedger WHERE VoucherID=@id`);

    // 4. Generate reversal voucher number — same type prefix, next sequential
    const seqRes = await new sql.Request(transaction).query(
        `SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo`
    );
    const nextId = seqRes.recordset[0].nextNo;
    const typeRes = await new sql.Request(transaction)
        .input('vt', sql.Int, orig.VoucherTypeID)
        .query(`SELECT Title FROM GLVoucherType WHERE Voucherid=@vt`);
    const prefix = typeRes.recordset[0]?.Title || 'JV';
    const reversalNo = `${prefix}-REV-${String(nextId).padStart(4,'0')}`;

    const reversalRemarks = `Reversal of ${orig.VoucherNo}` +
        (orig.Remarks ? ` — ${orig.Remarks}` : '');

    // 5. Insert reversal header as Draft first, so balanced-entry trigger fires after lines are in
    const newHdr = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,         new Date())
        .input('vno',     sql.NVarChar(50),     reversalNo)
        .input('vtId',    sql.Int,              orig.VoucherTypeID)
        .input('remarks', sql.NVarChar(sql.MAX),reversalRemarks)
        .input('total',   sql.Decimal(18,2),    orig.TotalAmount)
        .input('rev',     sql.Int,              originalVoucherId)
        .input('src',     sql.NVarChar(20),     orig.SourceDocType)
        .input('srcId',   sql.Int,              orig.SourceDocID)
        .input('cby',     sql.Int,              userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),    userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, ReversesVoucherID, SourceDocType, SourceDocID,
                     CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @rev, @src, @srcId,
                        @cby, @cbyN)`);
    const reversalId = newHdr.recordset[0].VoucherID;

    // 6. Insert mirror detail lines (Debit ↔ Credit swapped), preserving the
    // AllocatedToVoucherID tag from the original.
    for (const l of linesRes.recordset) {
        await new sql.Request(transaction)
            .input('vid',  sql.Int,              reversalId)
            .input('gl',   sql.Int,              l.GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX),`Reversal: ${l.Narration || ''}`)
            .input('dr',   sql.Decimal(18,2),    l.Credit || 0)
            .input('cr',   sql.Decimal(18,2),    l.Debit  || 0)
            .input('pid',  sql.Int,              l.PartyID  || null)
            .input('jcid', sql.Int,              l.JobCardID || null)
            .input('alloc',sql.Int,              l.AllocatedToVoucherID || null)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID, AllocatedToVoucherID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid, @alloc)`);
    }

    // 7. Insert mirror subsidiary ledger rows (Debit ↔ Credit swapped)
    for (const s of subRes.recordset) {
        await new sql.Request(transaction)
            .input('pid',  sql.Int,              s.PartyID || null)
            .input('jcid', sql.Int,              s.JobCardID || null)
            .input('vid',  sql.Int,              reversalId)
            .input('gl',   sql.Int,              s.GLCAID)
            .input('dr',   sql.Decimal(18,2),    s.Credit || 0)
            .input('cr',   sql.Decimal(18,2),    s.Debit  || 0)
            .input('nar',  sql.NVarChar(500),    `Reversal: ${s.Narration || ''}`)
            .query(`INSERT INTO dms_PartyLedger
                        (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @jcid, @vid, @gl, @dr, @cr, @nar)`);
    }

    // 8. Flip reversal voucher Status='Posted' (triggers balanced-entry guard)
    await new sql.Request(transaction)
        .input('vid', sql.Int, reversalId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // 9. Mark the original as Reversed
    await new sql.Request(transaction)
        .input('id',   sql.Int,           originalVoucherId)
        .input('by',   sql.Int,           userInfo?.userId || null)
        .input('byN',  sql.NVarChar(100), userInfo?.userName || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Reversed', ReversedBy=@by, ReversedByName=@byN, ReversedAt=GETDATE()
                WHERE VoucherID=@id`);

    // 10. Sync dms_PendingCheques with the reversal:
    //   - If the reversed voucher is the original receipt/issue → any Pending row
    //     tied to it is forcibly Bounced (the receipt didn't really happen).
    //   - If the reversed voucher is a Clearance/Bounce voucher → revert that
    //     row back to Pending so it shows up on the Clearance screen again.
    await new sql.Request(transaction)
        .input('vid',  sql.Int,           originalVoucherId)
        .input('uby',  sql.Int,           userInfo?.userId || null)
        .input('ubyN', sql.NVarChar(100), userInfo?.userName || null)
        .query(`UPDATE dms_PendingCheques
                SET Status='Bounced', ClearedAt=GETDATE(), ClearanceVoucherID=NULL,
                    UpdatedAt=GETDATE(), UpdatedBy=@uby, UpdatedByName=@ubyN,
                    Notes=COALESCE(Notes + ' / ', '') + 'Auto-bounced: source voucher reversed.'
                WHERE ReceiptVoucherID=@vid AND Status='Pending';

                UPDATE dms_PendingCheques
                SET Status='Pending', ClearedAt=NULL, ClearanceVoucherID=NULL,
                    UpdatedAt=GETDATE(), UpdatedBy=@uby, UpdatedByName=@ubyN,
                    Notes=COALESCE(Notes + ' / ', '') + 'Reverted: clearance voucher reversed.'
                WHERE ClearanceVoucherID=@vid AND Status IN ('Cleared','Bounced');`);

    return { reversalId, reversalNo };
}

module.exports = { postReversalVoucher };
