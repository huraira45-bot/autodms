/**
 * Full ledger dump for one Job Card — every voucher that touched it,
 * every leg it hit, and the current net balance on the four cashier-side
 * roles (CASH_BOOK, POS_CLEARING, GENERAL_CUSTOMER, CUSTOMER_ADVANCE_RECEIVED).
 *
 * Run:  node scripts\jc_ledger_dump.js <JobCardNo>
 *   e.g. node scripts\jc_ledger_dump.js GR-0063
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';

const jcArg = (process.argv[2] || '').trim();
if (!jcArg) { console.log('Usage: node scripts\\jc_ledger_dump.js <JobCardNo>'); process.exit(1); }

(async () => {
    try {
        const pool = await getPool();
        const jcRes = await pool.request().input('no', sql.NVarChar(50), jcArg)
            .query(`SELECT JobCardId, JobCardNo, IsFinalized FROM Addata_JobCardInfo WHERE JobCardNo=@no`);
        if (!jcRes.recordset.length) throw new Error(`Job Card ${jcArg} not found.`);
        const jc = jcRes.recordset[0];
        console.log(`\nJob Card ${jc.JobCardNo}  (JobCardId=${jc.JobCardId})  Finalized: ${jc.IsFinalized ? 'YES' : 'NO'}\n`);

        // Every voucher line whose JobCardID = this JC, plus any voucher whose
        // SourceDoc is JOBCARD/SourceDocID matches.
        const legs = await pool.request().input('jc', sql.Int, jc.JobCardId)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.Status, v.SourceDocType, v.SourceDocID,
                       v.ReversesVoucherID, v.Remarks,
                       d.VoucherDetailID, d.GLCAID, coa.GLCode, coa.GLTitle,
                       d.Debit, d.Credit, d.PartyID, d.JobCardID, d.AllocatedToVoucherID,
                       d.Narration,
                       sa.RoleKey
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                INNER JOIN GLChartOFAccount coa      ON coa.GLCAID = d.GLCAID
                LEFT  JOIN dms_SystemAccounts sa     ON sa.GLCAID  = d.GLCAID
                WHERE d.JobCardID = @jc
                   OR (v.SourceDocType='JOBCARD' AND v.SourceDocID = @jc)
                ORDER BY v.VoucherDate, v.VoucherID, d.VoucherDetailID`);

        // Group by voucher
        const byVoucher = new Map();
        for (const l of legs.recordset) {
            if (!byVoucher.has(l.VoucherID)) byVoucher.set(l.VoucherID, []);
            byVoucher.get(l.VoucherID).push(l);
        }

        console.log(`Vouchers touching this JC (${byVoucher.size}):\n`);
        for (const [vid, lines] of byVoucher) {
            const h = lines[0];
            const statusMarker = h.Status === 'Reversed' ? ' [REVERSED]' : h.Status === 'Draft' ? ' [DRAFT]' : '';
            const revMark = h.ReversesVoucherID ? `  (reverses #${h.ReversesVoucherID})` : '';
            console.log(`─ ${dt(h.VoucherDate)}  ${h.VoucherNo.padEnd(14)}  ID#${vid}${statusMarker}${revMark}`);
            for (const l of lines) {
                const roleTag = l.RoleKey ? `  [${l.RoleKey}]` : '';
                const allocTag = l.AllocatedToVoucherID ? `  → alloc #${l.AllocatedToVoucherID}` : '';
                console.log(`    ${l.GLCode.padEnd(11)}  ${(l.GLTitle || '').padEnd(30)}  Dr ${fmt(l.Debit).padStart(12)}  Cr ${fmt(l.Credit).padStart(12)}${roleTag}${allocTag}`);
            }
            console.log('');
        }

        // Net balance per system role tied to this JC
        console.log('─'.repeat(78));
        console.log('Net balance on each role tagged to this JC (Posted + Reversed included — real GL):\n');
        const roles = await pool.request().query(`
            SELECT RoleKey, GLCAID FROM dms_SystemAccounts
            WHERE RoleKey IN ('CASH_BOOK','POS_CLEARING','GENERAL_CUSTOMER','CUSTOMER_ADVANCE_RECEIVED','CHEQUES_ON_HAND')`);
        for (const r of roles.recordset) {
            const q = await pool.request()
                .input('gl', sql.Int, r.GLCAID).input('jc', sql.Int, jc.JobCardId)
                .query(`SELECT ISNULL(SUM(d.Debit),0) - ISNULL(SUM(d.Credit),0) AS Net
                        FROM data_FinanceVoucherDetail d
                        INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                        WHERE v.Status IN ('Posted','Reversed')
                          AND d.GLCAID=@gl AND d.JobCardID=@jc`);
            const net = Number(q.recordset[0].Net) || 0;
            const sign = net > 0 ? 'Dr' : net < 0 ? 'Cr' : '  ';
            console.log(`  ${r.RoleKey.padEnd(28)}  ${sign} ${fmt(Math.abs(net)).padStart(14)}`);
        }
        console.log('');
        process.exit(0);
    } catch (e) {
        console.error('Dump failed:', e.message);
        process.exit(1);
    }
})();
