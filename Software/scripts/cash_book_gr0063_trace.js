/**
 * Traces every Cash-Book entry attributable to JC GR-0063 across every
 * status filter combination — so we can see WHERE the Rs 400 shortage
 * is coming from (real GL, or a report-side filter artifact).
 *
 * Prints:
 *   1. Every voucher detail row on CASH_BOOK tied to GR-0063
 *      (either JobCardID=182, or SourceDocType=JOBCARD + SourceDocID=182)
 *   2. Net balance under 4 different filter policies:
 *        A. All Posted + Reversed included               ← real GL
 *        B. Exclude Status='Reversed'                    ← common report filter
 *        C. Exclude Status='Reversed' AND reversal vouchers
 *        D. Only ReversesVoucherID IS NULL (originals only)
 *
 * Run:  node scripts\cash_book_gr0063_trace.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';
const JC_ID = 182;

(async () => {
    try {
        const pool = await getPool();
        const cashGL = (await pool.request().query(
            `SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='CASH_BOOK'`
        )).recordset[0]?.GLCAID;
        if (!cashGL) throw new Error('CASH_BOOK role not mapped.');

        // Pull every Cash line touching JC 182 either by tag or by source doc.
        const r = await pool.request()
            .input('gl', sql.Int, cashGL).input('jc', sql.Int, JC_ID)
            .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.Status,
                           v.SourceDocType, v.SourceDocID, v.ReversesVoucherID,
                           d.Debit, d.Credit, d.PartyID, d.JobCardID,
                           d.Narration
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE d.GLCAID=@gl
                      AND (d.JobCardID = @jc
                           OR (v.SourceDocType='JOBCARD' AND v.SourceDocID = @jc))
                    ORDER BY v.VoucherDate, v.VoucherID`);

        console.log(`\nCASH_BOOK activity attributable to GR-0063 (JobCardId=${JC_ID}):\n`);
        console.log('Date        Voucher        Status    Src              Rev?    JCID   Dr           Cr');
        console.log('─'.repeat(105));
        let sumDrAll = 0, sumCrAll = 0;
        let sumDrExRev = 0, sumCrExRev = 0;
        let sumDrExRevAndReversal = 0, sumCrExRevAndReversal = 0;
        let sumDrOrigOnly = 0, sumCrOrigOnly = 0;
        for (const x of r.recordset) {
            const src = x.SourceDocType ? `${x.SourceDocType}#${x.SourceDocID || '-'}` : 'MANUAL';
            const rev = x.ReversesVoucherID ? `→#${x.ReversesVoucherID}` : '';
            console.log(`${d(x.VoucherDate)}  ${(x.VoucherNo || '').padEnd(14)} ${x.Status.padEnd(9)} ${src.padEnd(16)} ${rev.padEnd(7)} ${(x.JobCardID || '-').toString().padEnd(6)} ${fmt(x.Debit).padStart(11)} ${fmt(x.Credit).padStart(12)}`);
            const dr = Number(x.Debit) || 0, cr = Number(x.Credit) || 0;
            sumDrAll += dr; sumCrAll += cr;
            if (x.Status !== 'Reversed') { sumDrExRev += dr; sumCrExRev += cr; }
            if (x.Status !== 'Reversed' && !x.ReversesVoucherID) { sumDrExRevAndReversal += dr; sumCrExRevAndReversal += cr; }
            if (!x.ReversesVoucherID) { sumDrOrigOnly += dr; sumCrOrigOnly += cr; }
        }

        console.log('\n─'.repeat(105));
        console.log('\nNet balance under different filter policies (Dr - Cr):');
        console.log(`  A. ALL vouchers included               : ${fmt(sumDrAll - sumCrAll).padStart(12)}     ← real GL truth`);
        console.log(`  B. Exclude Status='Reversed'           : ${fmt(sumDrExRev - sumCrExRev).padStart(12)}     ← common report filter`);
        console.log(`  C. Exclude Reversed AND their reversals: ${fmt(sumDrExRevAndReversal - sumCrExRevAndReversal).padStart(12)}     ← proper netting filter`);
        console.log(`  D. Only originals (ReversesID IS NULL) : ${fmt(sumDrOrigOnly - sumCrOrigOnly).padStart(12)}\n`);

        console.log('If (B) shows -400 and (A)/(C) show 5,093.78, the shortage is a FILTER ARTIFACT.');
        console.log('If (A) itself shows -400, that\'s a real GL discrepancy that needs a correction.\n');
        process.exit(0);
    } catch (e) {
        console.error('Trace failed:', e.message);
        process.exit(1);
    }
})();
