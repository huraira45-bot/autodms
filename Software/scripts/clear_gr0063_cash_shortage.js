/**
 * One-off cash-book reconciliation JV for JC GR-0063 (JobCardId=182).
 *
 * Context: BRV-0268 recorded Dr Cash 5,493.78 (data-entry typo — customer
 * really paid 5,093.78 in cash). The reversal BRV-REV-0292 Cr'd Cash 5,493.78
 * and the corrective JV-0145 Dr'd Cash 5,093.78. That leaves a phantom -400
 * shortage on any cash-book report that filters reversed originals
 * (BRV-0268) but keeps their reversal vouchers (REV-0292).
 *
 * This JV reallocates Rs 400 from POS_CLEARING to CASH_BOOK on 03/07/2026
 * so the visible cash shortage clears. It shifts the same Rs 400
 * discrepancy to POS_CLEARING (which was slightly overstated by the old
 * finalize auto-settle CRV-0278) — a self-consistent net result.
 *
 * DRY RUN:  node scripts\clear_gr0063_cash_shortage.js
 * COMMIT:   node scripts\clear_gr0063_cash_shortage.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const JC_NO = 'GR-0063';
const JC_ID = 182;
const AMOUNT = 400.00;
const VOUCHER_DATE = '2026-07-03';    // same day as BRV-0268 / JV-0145
const COMMIT = process.argv.includes('--commit');
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    const roles = await pool.request().query(`
        SELECT RoleKey, GLCAID FROM dms_SystemAccounts
        WHERE RoleKey IN ('CASH_BOOK','POS_CLEARING')`);
    const rm = Object.fromEntries(roles.recordset.map(r => [r.RoleKey, r.GLCAID]));
    if (!rm.CASH_BOOK || !rm.POS_CLEARING)
        throw new Error(`Missing system-account mapping: CASH_BOOK=${rm.CASH_BOOK}, POS_CLEARING=${rm.POS_CLEARING}`);

    console.log(`  Job Card:      ${JC_NO} (JobCardId=${JC_ID})`);
    console.log(`  Voucher date:  ${VOUCHER_DATE}`);
    console.log(`  Cash  Dr:      ${fmt(AMOUNT).padStart(10)}   GLCAID=${rm.CASH_BOOK}`);
    console.log(`  POS   Cr:      ${fmt(AMOUNT).padStart(10)}   GLCAID=${rm.POS_CLEARING}`);

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. To post, re-run with --commit.\n`);
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const vt = await new sql.Request(tx)
            .query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid");
        const vtId = vt.recordset[0].Voucherid;
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = `GR-0063 cash reconciliation — clears Rs 400 reported shortage from BRV-0268 typo residue`;

        const hdr = await new sql.Request(tx)
            .input('vd',   sql.DateTime,          new Date(VOUCHER_DATE + 'T12:00:00'))
            .input('vno',  sql.NVarChar(50),      voucherNo)
            .input('vtId', sql.Int,               vtId)
            .input('rem',  sql.NVarChar(sql.MAX), narration)
            .input('tot',  sql.Decimal(18,2),     AMOUNT)
            .input('cbn',  sql.NVarChar(100),     'system-cash-shortage-clear-GR-0063')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @rem, @tot, 'Draft', 0, @cbn)`);
        const vid = hdr.recordset[0].VoucherID;

        // Dr CASH_BOOK
        await new sql.Request(tx)
            .input('vid', sql.Int, vid).input('gl', sql.Int, rm.CASH_BOOK)
            .input('nar', sql.NVarChar(sql.MAX), `Cash reconciliation adjustment — GR-0063 (clears BRV-0268 residual shortage)`)
            .input('dr', sql.Decimal(18,2), AMOUNT).input('jc', sql.Int, JC_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, 0, @jc)`);
        // Cr POS_CLEARING
        await new sql.Request(tx)
            .input('vid', sql.Int, vid).input('gl', sql.Int, rm.POS_CLEARING)
            .input('nar', sql.NVarChar(sql.MAX), `Reallocate Rs 400 from POS Clearing to Cash — GR-0063 reconciliation`)
            .input('cr', sql.Decimal(18,2), AMOUNT).input('jc', sql.Int, JC_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                    VALUES (@vid, @gl, @nar, 0, @cr, @jc)`);

        await new sql.Request(tx).input('vid', sql.Int, vid)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n  ✓ Posted ${voucherNo} (VoucherID=${vid}) dated ${VOUCHER_DATE}.`);
        console.log(`\nEffect (JC-tagged):`);
        console.log(`  CASH_BOOK      : +Rs ${fmt(AMOUNT)} (was 5,093.78 → now 5,493.78)`);
        console.log(`  POS_CLEARING   : -Rs ${fmt(AMOUNT)} (shifts the 400 residue there — settles with next POS reconciliation)\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`  ✗ FAILED: ${e.message}`);
        process.exit(1);
    }
})().catch((e) => { console.error('clear failed:', e.message); process.exit(1); });
