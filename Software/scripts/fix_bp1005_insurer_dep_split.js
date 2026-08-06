// One-off: JC B&P-1005 (JobCardId=260, Voucher #3563 posted 2026-08-06).
// A depreciation row (529.12, tied to StockIssueDetailID=2324) went
// orphaned after that part row was removed from
// data_StockIssuetoJobCardDetail outside the normal unfinalize workflow
// (no dms_UnfinalizeRequests record exists for this JC at all). The
// invoice total is unchanged (317,658.95 then and now) -- only the
// insurer/customer SPLIT is stale: the posted voucher used the OLD
// depreciation grid (Insurer 302,696.88 / Customer 14,962.07), but the
// CURRENT correct grid is Insurer 303,226.00 / Customer 14,432.95. The
// customer already paid their correct current share in full (14,432.95).
//
// This posts a correcting JV: Dr Insurer 529.12 / Cr General Customer
// (JobCardID-tagged) 529.12 -- shifting the gap from the customer's
// walk-out balance to the insurer's payable, zeroing the Gate Pass check.
//
// Deliberately tagged SourceDocType='VOUCHER' (not 'JOBCARD') on the
// header so it can never be picked up by getJobCardBalance's "find this
// JC's main invoice voucher" lookup (which orders by VoucherID DESC and
// would otherwise mistake this 529.12 correction for the real invoice).
// The JobCardID/PartyID tags that actually matter for the Gate Pass
// check and Make Payment live on the individual detail rows, which
// don't filter by header SourceDocType.
//
// Run from Software/: node scripts\fix_bp1005_insurer_dep_split.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const JOB_CARD_ID     = 260;   // B&P-1005
const GENCUST_GLCAID  = 32325; // GENERAL CUSTOMER A/C
const INSURER_GLCAID  = 32334; // IGI (INTERNATIONAL GENERAL INSURANCE)
const INSURER_PARTY_ID = 7663;
const AMOUNT          = 529.12;

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const vt = await new sql.Request(tx).query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid");
        if (!vt.recordset.length) throw new Error('JV voucher type missing.');
        const voucherTypeId = vt.recordset[0].Voucherid;
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = 'Correction: shift depreciation-split gap to insurer — JC-B&P-1005 (orphaned dep row, part removed post-finalize outside unfinalize workflow)';

        const hdr = await new sql.Request(tx)
            .input('vd',  sql.DateTime,          new Date())
            .input('vno', sql.NVarChar(50),      voucherNo)
            .input('vt',  sql.Int,               voucherTypeId)
            .input('nar', sql.NVarChar(sql.MAX), narration)
            .input('tot', sql.Decimal(18,2),     AMOUNT)
            .input('src', sql.NVarChar(20),      'VOUCHER')
            .input('cbyN',sql.NVarChar(100),     'fix_bp1005_insurer_dep_split.js')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vt, @nar, @tot, 'Draft', 0, @src, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        // Dr Insurer — they now owe 529.12 more.
        await new sql.Request(tx)
            .input('vid',  sql.Int,               voucherId)
            .input('gl',   sql.Int,               INSURER_GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), narration)
            .input('dr',   sql.Decimal(18,2),     AMOUNT)
            .input('pid',  sql.Int,               INSURER_PARTY_ID)
            .input('jcid', sql.Int,               JOB_CARD_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, 0, @pid, @jcid)`);

        // Cr General Customer (walk-out) — customer's outstanding drops by 529.12.
        await new sql.Request(tx)
            .input('vid',  sql.Int,               voucherId)
            .input('gl',   sql.Int,               GENCUST_GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), narration)
            .input('cr',   sql.Decimal(18,2),     AMOUNT)
            .input('jcid', sql.Int,               JOB_CARD_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                    VALUES (@vid, @gl, @nar, 0, @cr, @jcid)`);

        // Subsidiary ledger — insurer payable increases.
        await new sql.Request(tx)
            .input('pid', sql.Int,               INSURER_PARTY_ID)
            .input('vid', sql.Int,               voucherId)
            .input('gl',  sql.Int,               INSURER_GLCAID)
            .input('dr',  sql.Decimal(18,2),     AMOUNT)
            .input('nar', sql.NVarChar(500),     narration)
            .query(`INSERT INTO dms_PartyLedger (PartyID, VoucherID, GLCAID, Debit, Credit, Narration)
                    VALUES (@pid, @vid, @gl, @dr, 0, @nar)`);

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`Posted correcting JV ${voucherNo} (VoucherID ${voucherId}) for PKR ${AMOUNT}.`);
        console.log('Insurer payable +529.12, Customer walk-out balance -529.12.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
