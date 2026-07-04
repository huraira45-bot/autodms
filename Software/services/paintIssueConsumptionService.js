/**
 * Paint Consumption posting service — fires on Job Card finalize.
 *
 * Owner spec 2026-07-04: Paint Issue posts stock immediately, but the GL
 * impact is deferred until the linked Job Card finalizes. Once the JC
 * finalizes we post ONE separate voucher per JC (Dr PAINT_CONSUMPTION /
 * Cr PAINT_INVENTORY) that totals all this JC's Paint Issues.
 *
 * This voucher is SEPARATE from the main JC voucher (revenue + parts +
 * services), so paint costing lives on its own line in the GL. JC
 * unfinalize triggers a mirror reversal — see finalizeController.js.
 *
 * paint_Issue rows are also marked Locked=1 here so the UI knows to freeze
 * them (and Draft-only guards on the Paint Issue controller reject edits).
 */
const { sql } = require('../config/db');
const { resolveRole } = require('../controllers/systemAccountsController');
const { nextVoucherNo } = require('../utils/voucherNumbering');

async function postPaintConsumptionForJC(jobCardId, userInfo, transaction) {
    // Sum only rows that are still Unlocked (i.e. not already consumed
    // by an earlier finalize). Under the state machine this SHOULD be all
    // of them, but the guard makes re-finalize / partial-finalize safe.
    const tot = await new sql.Request(transaction)
        .input('jc', sql.Int, jobCardId)
        .query(`SELECT ISNULL(SUM(TotalCost), 0) AS total, COUNT(*) AS cnt
                FROM paint_Issue
                WHERE JobCardID=@jc AND (Locked IS NULL OR Locked=0)`);
    const total = Number(tot.recordset[0].total) || 0;
    const cnt   = Number(tot.recordset[0].cnt)   || 0;
    if (cnt === 0 || total <= 0) return null;

    const jcRes = await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT JobCardNo FROM Addata_JobCardInfo WHERE JobCardId=@id`);
    const jcNo = jcRes.recordset[0]?.JobCardNo || `JC#${jobCardId}`;

    const paintInv  = await resolveRole('PAINT_INVENTORY');
    const paintCons = await resolveRole('PAINT_CONSUMPTION');

    const vt = await new sql.Request(transaction)
        .query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing.');
    const voucherTypeId = vt.recordset[0].Voucherid;

    const voucherNo = await nextVoucherNo(transaction, 'JV');
    const narration = `Paint consumption — Job Card ${jcNo}`;

    const newHdr = await new sql.Request(transaction)
        .input('vd',      sql.DateTime,          new Date())
        .input('vno',     sql.NVarChar(50),      voucherNo)
        .input('vtId',    sql.Int,               voucherTypeId)
        .input('remarks', sql.NVarChar(sql.MAX), narration)
        .input('total',   sql.Decimal(18,2),     total)
        // SourceDocType JC_PAINT_CONS keeps this voucher separately
        // identifiable from the main JOBCARD voucher, so downstream tools
        // (list, reports, reversal loop) can pick it out.
        .input('src',     sql.NVarChar(20),      'JC_PAINT_CONS')
        .input('srcId',   sql.Int,               jobCardId)
        .input('cby',     sql.Int,               userInfo?.userId || null)
        .input('cbyN',    sql.NVarChar(100),     userInfo?.userName || null)
        .query(`INSERT INTO data_FinanceVoucherInfo
                    (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                     Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                OUTPUT INSERTED.VoucherID
                VALUES (@vd, @vno, @vtId, @remarks, @total,
                        'Draft', 0, @src, @srcId, @cby, @cbyN)`);
    const voucherId = newHdr.recordset[0].VoucherID;

    // Dr Paint Consumption (JobCardID tag so JC-level cost roll-up is easy)
    await new sql.Request(transaction)
        .input('vid',  sql.Int,               voucherId)
        .input('gl',   sql.Int,               paintCons)
        .input('nar',  sql.NVarChar(sql.MAX), narration)
        .input('dr',   sql.Decimal(18,2),     total)
        .input('jcid', sql.Int,               jobCardId)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                VALUES (@vid, @gl, @nar, @dr, 0, @jcid)`);

    // Cr Paint Inventory
    await new sql.Request(transaction)
        .input('vid', sql.Int,               voucherId)
        .input('gl',  sql.Int,               paintInv)
        .input('nar', sql.NVarChar(sql.MAX), `Paint drawn from inventory — JC ${jcNo}`)
        .input('cr',  sql.Decimal(18,2),     total)
        .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                VALUES (@vid, @gl, @nar, 0, @cr)`);

    // Draft → Posted (fires balanced-entry trigger)
    await new sql.Request(transaction)
        .input('vid', sql.Int, voucherId)
        .input('pby', sql.Int, userInfo?.userId || null)
        .query(`UPDATE data_FinanceVoucherInfo
                SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                WHERE VoucherID=@vid`);

    // Lock the paint_Issue rows so nobody edits them once accounted for.
    await new sql.Request(transaction)
        .input('jc', sql.Int, jobCardId)
        .query(`UPDATE paint_Issue SET Locked=1, UpdatedAt=GETDATE()
                WHERE JobCardID=@jc AND (Locked IS NULL OR Locked=0)`);

    return { voucherId, voucherNo, total };
}

// Called on JC unfinalize to free the Paint Issue rows so they can be
// edited again in the next finalize cycle. Reversal of the PAINT_CONS
// voucher itself is handled by the generic loop in finalizeController.
async function unlockPaintIssuesForJC(jobCardId, transaction) {
    await new sql.Request(transaction)
        .input('jc', sql.Int, jobCardId)
        .query(`UPDATE paint_Issue SET Locked=0, UpdatedAt=GETDATE() WHERE JobCardID=@jc`);
}

module.exports = { postPaintConsumptionForJC, unlockPaintIssuesForJC };
