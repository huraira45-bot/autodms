/**
 * One-liner fix: stamp AllocatedToVoucherID = 325 (CRV-0278) onto the
 * Cr POS_CLEARING line of JV-0145, so the POS Settlement screen sees
 * that correction as a partial settlement of the original CRV-0278.
 *
 * Without this, POS Settlement still shows CRV-0278's full Rs 25,093.78
 * as pending — but only Rs 20,000 is really pending on the bank side
 * (Rs 5,093.78 was moved to cash by fix_gr_0063_cashbook.js).
 *
 * DRY RUN:  node scripts\link_dep_correction_to_crv.js
 * COMMIT:   node scripts\link_dep_correction_to_crv.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const JV_VOUCHER_ID  = 482;   // JV-0145 posted by fix_gr_0063_cashbook.js
const SOURCE_CRV_ID  = 325;   // CRV-0278 — the auto-settle voucher we're partially settling
const COMMIT = process.argv.includes('--commit');

(async () => {
    try {
        const pool = await getPool();

        const posGL = (await pool.request().query(
            `SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='POS_CLEARING'`
        )).recordset[0]?.GLCAID;
        if (!posGL) throw new Error('POS_CLEARING role not mapped.');

        const line = await pool.request()
            .input('vid', sql.Int, JV_VOUCHER_ID)
            .input('gl',  sql.Int, posGL)
            .query(`SELECT VoucherDetailID, Debit, Credit, AllocatedToVoucherID
                    FROM data_FinanceVoucherDetail
                    WHERE VoucherID=@vid AND GLCAID=@gl AND Credit > 0`);
        if (!line.recordset.length) throw new Error(`No Cr POS_CLEARING line found on VoucherID=${JV_VOUCHER_ID}.`);
        const l = line.recordset[0];

        console.log(`\nMode: ${COMMIT ? 'COMMIT' : 'DRY RUN'}`);
        console.log(`  JV VoucherID:              #${JV_VOUCHER_ID}`);
        console.log(`  Detail row:                #${l.VoucherDetailID}`);
        console.log(`  Cr amount:                 ${Number(l.Credit).toFixed(2)}`);
        console.log(`  Current AllocatedTo:       ${l.AllocatedToVoucherID || '(null)'}`);
        console.log(`  New     AllocatedTo:       #${SOURCE_CRV_ID}  (CRV-0278)`);

        if (!COMMIT) {
            console.log(`\nDRY RUN complete. To apply, re-run with --commit.\n`);
            process.exit(0);
        }

        await pool.request()
            .input('did', sql.Int, l.VoucherDetailID)
            .input('to',  sql.Int, SOURCE_CRV_ID)
            .query(`UPDATE data_FinanceVoucherDetail
                    SET AllocatedToVoucherID=@to
                    WHERE VoucherDetailID=@did`);

        console.log(`\n  ✓ Stamped VoucherDetailID #${l.VoucherDetailID} → AllocatedToVoucherID=#${SOURCE_CRV_ID}.`);
        console.log(`\nReload the POS Settlement screen: CRV-0278 should now show`);
        console.log(`Rs 20,000 remaining (was 25,093.78) — the Rs 5,093.78 you moved`);
        console.log(`to Cash Book via JV-0145 counts as partial settlement.\n`);
        process.exit(0);
    } catch (e) {
        console.error('link failed:', e.message);
        process.exit(1);
    }
})();
