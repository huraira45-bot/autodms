/**
 * One-off correction JV for JC GR-0063 (JobCardId=182).
 *
 * State after bulk_reverse_cust_adv:
 *   POS_CLEARING (tagged to JC 182)  Dr  25,093.78   ← over by 5,093.78
 *   CASH_IN_HAND (tagged to JC 182)    0.00           ← real Rs 5,093.78 in till missing
 *   Gen-Cust                           0.00 (closed)   ✓
 *   Cust-Adv                           0.00           ✓
 *
 * Reality (owner-confirmed 2026-07-05): customer paid exactly the
 * invoice amount — Rs 20,000 on POS + Rs 5,093.78 cash. Total
 * PKR 25,093.78. No overpayment. The BRV-0268 narration mentioning
 * Rs 5,493.78 in cash was a data-entry typo.
 *
 * Correction voucher (JV, dated today):
 *   Dr  CASH_IN_HAND     5,093.78   JobCardID=182   "Cash portion — GR-0063"
 *   Cr  POS_CLEARING     5,093.78   JobCardID=182   "Correct POS from full-amount auto-settle to actual card charge"
 *
 * DRY RUN:  node scripts\fix_gr_0063_cashbook.js
 * COMMIT:   node scripts\fix_gr_0063_cashbook.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const JC_NO      = 'GR-0063';
const JC_ID      = 182;
const AMOUNT     = 5093.78;
// Owner ask: post the correction on the SAME date as the original
// receipt (BRV-0268) so the cash book and POS clearing show the
// activity on the day the customer actually paid.
const VOUCHER_DATE = '2026-07-03';
const COMMIT     = process.argv.includes('--commit');
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    // Resolve accounts
    const roles = await pool.request().query(`
        SELECT RoleKey, GLCAID FROM dms_SystemAccounts
        WHERE RoleKey IN ('CASH_BOOK','POS_CLEARING')`);
    const rm = Object.fromEntries(roles.recordset.map(r => [r.RoleKey, r.GLCAID]));
    if (!rm.CASH_BOOK || !rm.POS_CLEARING) {
        throw new Error(`Missing system-account mapping. CASH_BOOK=${rm.CASH_BOOK} POS_CLEARING=${rm.POS_CLEARING}`);
    }

    console.log(`  Job Card:      ${JC_NO} (JobCardId=${JC_ID})`);
    console.log(`  Voucher date:  ${VOUCHER_DATE}   (same day as original receipt)`);
    console.log(`  Cash Dr:       ${fmt(AMOUNT).padStart(12)}   GLCAID=${rm.CASH_BOOK}`);
    console.log(`  POS Clear Cr:  ${fmt(AMOUNT).padStart(12)}   GLCAID=${rm.POS_CLEARING}`);

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. To post, re-run with --commit:`);
        console.log(`  node scripts\\fix_gr_0063_cashbook.js --commit\n`);
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // JV type
        const vt = await new sql.Request(tx)
            .query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid");
        if (!vt.recordset.length) throw new Error('JV voucher type missing.');
        const voucherTypeId = vt.recordset[0].Voucherid;

        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = `Cash-book correction for ${JC_NO} — reallocate Rs ${fmt(AMOUNT)} from POS_CLEARING (over-stated by finalize auto-settle) to CASH_IN_HAND (actual cash received)`;

        const hdr = await new sql.Request(tx)
            .input('vd',   sql.DateTime,     new Date(VOUCHER_DATE + 'T12:00:00'))
            .input('vno',  sql.NVarChar(50), voucherNo)
            .input('vtId', sql.Int,          voucherTypeId)
            .input('rem',  sql.NVarChar(sql.MAX), narration)
            .input('tot',  sql.Decimal(18,2), AMOUNT)
            .input('src',  sql.NVarChar(20), 'JOBCARD')
            .input('srcId',sql.Int,          JC_ID)
            .input('cby',  sql.Int,          null)
            .input('cbyN', sql.NVarChar(100),'system-cashbook-fix-GR-0063')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @rem, @tot,
                            'Draft', 0, @src, @srcId, @cby, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        // Dr CASH_IN_HAND
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, rm.CASH_BOOK)
            .input('nar', sql.NVarChar(sql.MAX), `Cash portion of GR-0063 receipt — restore after reversal`)
            .input('dr',  sql.Decimal(18,2), AMOUNT)
            .input('cr',  sql.Decimal(18,2), 0)
            .input('jc',  sql.Int, JC_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @jc)`);

        // Cr POS_CLEARING
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('gl',  sql.Int, rm.POS_CLEARING)
            .input('nar', sql.NVarChar(sql.MAX), `Reduce POS_CLEARING from full-amount auto-settle to actual card charge (Rs 20,000)`)
            .input('dr',  sql.Decimal(18,2), 0)
            .input('cr',  sql.Decimal(18,2), AMOUNT)
            .input('jc',  sql.Int, JC_ID)
            .query(`INSERT INTO data_FinanceVoucherDetail
                        (VoucherID, GLCAID, Narration, Debit, Credit, JobCardID)
                    VALUES (@vid, @gl, @nar, @dr, @cr, @jc)`);

        // Flip to Posted (balanced-entry trigger will validate)
        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n  ✓ Posted ${voucherNo} (VoucherID=${voucherId})`);
        console.log(`\nVerify:  node scripts\\jc_ledger_dump.js ${JC_NO}`);
        console.log(`Expected:  CASH_BOOK  Dr ${fmt(AMOUNT)}   POS_CLEARING  Dr 20,000.00\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`  ✗ FAILED: ${e.message}`);
        process.exit(1);
    }
})().catch((e) => { console.error('fix failed:', e.message); process.exit(1); });
