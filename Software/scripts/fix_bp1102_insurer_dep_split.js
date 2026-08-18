// One-off: JC B&P-1102 (JobCardId=1287, Voucher SI-1473 posted 2026-08-18).
// A depreciation row (1492.40, tied to StockIssueDetailID=3077, 20% dep)
// went orphaned after that part row was removed from
// data_StockIssuetoJobCardDetail before finalize -- no cascade-delete
// existed for dms_JobCardPartsDepreciation when a part line is deleted
// (see the matching code fix in workshopController.js's stock-issue-line
// delete handler, same commit). Finalize sums dms_JobCardPartsDepreciation
// directly without validating against the current parts list, so it
// picked up the phantom 1492.40 anyway.
//
// The invoice total is correct and unaffected (153,405.00 -- Parts/Labour/
// GST/PST all reflect only the 3 real parts still on the JC). Only the
// insurer/customer SPLIT is wrong: the posted voucher billed Adamjee
// Insurance 124,711.60 and the customer (Gen-Cust) 28,693.40, but the
// CURRENT correct depreciation grid (3 real parts, 27,201.00) means
// Adamjee should owe 126,204.00 (Invoice 153,405.00 - Dep 27,201.00) and
// the customer only 27,201.00 -- which the customer already paid in full
// via BRV-1095.
//
// This posts a correcting JV: Dr Insurer 1492.40 / Cr General Customer
// (JobCardID-tagged) 1492.40 -- shifting the gap from the customer's
// walk-out balance to the insurer's payable, zeroing the Gate Pass check.
//
// Deliberately tagged SourceDocType='VOUCHER' (not 'JOBCARD') on the
// header so it can never be picked up by getJobCardBalance's "find this
// JC's main invoice voucher" lookup (which orders by VoucherID DESC and
// would otherwise mistake this correction for the real invoice). The
// JobCardID/PartyID tags that actually matter for the Gate Pass check and
// Make Payment live on the individual detail rows, which don't filter by
// header SourceDocType. Same precedent as fix_bp1005_insurer_dep_split.js.
//
// Run from Software/: node scripts\fix_bp1102_insurer_dep_split.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const JOB_CARD_ID      = 1287;  // B&P-1102
const GENCUST_GLCAID   = 32325; // GENERAL CUSTOMER A/C
const INSURER_GLCAID   = 32332; // ADAMJEE INSURANCE COMPANY LIMITED
const INSURER_PARTY_ID = 7661;
const AMOUNT            = 1492.40;

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Safety: re-verify the exact state this script assumes before touching
        // anything -- abort cleanly if the JC has moved on since diagnosis
        // (e.g. someone already corrected it, or the orphaned row is gone).
        const orphanCheck = await new sql.Request(tx)
            .input('jc', sql.Int, JOB_CARD_ID)
            .query(`SELECT d.DepID, d.DepAmount
                    FROM dms_JobCardPartsDepreciation d
                    WHERE d.JobCardId=@jc AND d.StockIssueDetailID=3077
                      AND NOT EXISTS (SELECT 1 FROM data_StockIssuetoJobCardDetail sid WHERE sid.StockIssueDetailID=3077)`);
        if (!orphanCheck.recordset.length) {
            throw new Error('Orphaned depreciation row (StockIssueDetailID=3077) not found in the expected state -- aborting, re-check before re-running.');
        }
        if (Math.abs(Number(orphanCheck.recordset[0].DepAmount) - AMOUNT) > 0.01) {
            throw new Error(`Orphaned row's DepAmount (${orphanCheck.recordset[0].DepAmount}) no longer matches expected ${AMOUNT} -- aborting.`);
        }
        const already = await new sql.Request(tx)
            .input('jc', sql.Int, JOB_CARD_ID)
            .query(`SELECT TOP 1 VoucherID FROM data_FinanceVoucherDetail
                    WHERE JobCardID=@jc AND Narration LIKE 'Correction: shift depreciation-split gap to insurer%'`);
        if (already.recordset.length) {
            throw new Error(`This correction already appears to have been posted (VoucherID ${already.recordset[0].VoucherID}) -- aborting to avoid double-posting.`);
        }

        const vt = await new sql.Request(tx).query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid");
        if (!vt.recordset.length) throw new Error('JV voucher type missing.');
        const voucherTypeId = vt.recordset[0].Voucherid;
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = 'Correction: shift depreciation-split gap to insurer — JC-B&P-1102 (orphaned dep row, part removed pre-finalize, no cascade-delete existed)';

        const hdr = await new sql.Request(tx)
            .input('vd',  sql.DateTime,          new Date())
            .input('vno', sql.NVarChar(50),      voucherNo)
            .input('vt',  sql.Int,               voucherTypeId)
            .input('nar', sql.NVarChar(sql.MAX), narration)
            .input('tot', sql.Decimal(18,2),     AMOUNT)
            .input('src', sql.NVarChar(20),      'VOUCHER')
            .input('cbyN',sql.NVarChar(100),     'fix_bp1102_insurer_dep_split.js')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vt, @nar, @tot, 'Draft', 0, @src, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        // Dr Insurer — they now owe 1492.40 more.
        await new sql.Request(tx)
            .input('vid',  sql.Int,               voucherId)
            .input('gl',   sql.Int,               INSURER_GLCAID)
            .input('nar',  sql.NVarChar(sql.MAX), narration)
            .input('dr',   sql.Decimal(18,2),     AMOUNT)
            .input('pid',  sql.Int,               INSURER_PARTY_ID)
            .input('jcid', sql.Int,               JOB_CARD_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, 0, @pid, @jcid)`);

        // Cr General Customer (walk-out) — customer's outstanding drops by 1492.40.
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
        console.log('Insurer payable +1492.40, Customer walk-out balance -1492.40. Gate Pass should now be issuable.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
