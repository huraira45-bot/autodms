/**
 * Audit — every Posted, non-reversed voucher touching CUSTOMER_ADVANCE_RECEIVED.
 *
 * Groups by the SOURCE DOC (JC / Store Sale / manual) so we can see the pattern
 * that pushed money there. Prints:
 *   - The Cr side (advance received) with its narration & counter-account
 *   - The current NET balance sitting on Customer Advance today
 *
 * Read-only. Run:  node scripts\audit_customer_advance.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';

(async () => {
    try {
        const pool = await getPool();
        const roles = await pool.request().query(`
            SELECT RoleKey, GLCAID FROM dms_SystemAccounts
            WHERE RoleKey='CUSTOMER_ADVANCE_RECEIVED'`);
        const caGL = roles.recordset[0]?.GLCAID;
        if (!caGL) throw new Error('CUSTOMER_ADVANCE_RECEIVED role is not mapped in Accounting Setup.');

        // Net balance
        const bal = await pool.request().input('ca', sql.Int, caGL)
            .query(`SELECT ISNULL(SUM(d.Credit) - SUM(d.Debit), 0) AS Net
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE v.Status='Posted' AND d.GLCAID=@ca`);
        console.log(`\nCurrent Customer Advance net balance: PKR ${fmt(bal.recordset[0].Net)}\n`);

        // Every voucher hitting Customer Advance (both Cr and Dr sides).
        const rows = await pool.request().input('ca', sql.Int, caGL)
            .query(`
                SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.Status,
                       v.SourceDocType, v.SourceDocID, v.ReversesVoucherID,
                       v.Remarks,
                       d.Debit, d.Credit, d.PartyID, d.JobCardID,
                       -- Human ref for the source doc
                       COALESCE(
                           (SELECT jc.JobCardNo FROM Addata_JobCardInfo jc
                              WHERE v.SourceDocType='JOBCARD' AND jc.JobCardId=v.SourceDocID),
                           (SELECT ss.InvoiceNo FROM data_StoreSaleInfo ss
                              WHERE v.SourceDocType='STORE_SALE' AND ss.SaleID=v.SourceDocID),
                           '—') AS SourceRef,
                       (SELECT p.PartyName FROM gen_PartiesInfo p WHERE p.PartyID = d.PartyID) AS PartyName,
                       -- The counter-account on this same voucher (excluding Customer Advance itself).
                       -- Useful to see whether the money came from POS / Cash / Bank / etc.
                       STUFF((
                           SELECT ', ' + coa.GLCode + ' ' + coa.GLTitle
                                  + ' Dr ' + FORMAT(d2.Debit, 'N2')
                                  + ' Cr ' + FORMAT(d2.Credit, 'N2')
                           FROM data_FinanceVoucherDetail d2
                           INNER JOIN GLChartOFAccount coa ON coa.GLCAID = d2.GLCAID
                           WHERE d2.VoucherID = v.VoucherID AND d2.GLCAID <> @ca
                           FOR XML PATH(''), TYPE
                       ).value('.', 'NVARCHAR(MAX)'), 1, 2, '') AS CounterAccounts
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                WHERE d.GLCAID=@ca AND v.Status='Posted'
                ORDER BY v.VoucherDate DESC, v.VoucherID DESC`);

        if (!rows.recordset.length) {
            console.log('No vouchers touch Customer Advance yet.');
            process.exit(0);
        }

        console.log(`Vouchers touching Customer Advance (${rows.recordset.length}):\n`);
        for (const r of rows.recordset) {
            const side = Number(r.Credit) > 0 ? 'Cr' : 'Dr';
            const amt  = Number(r.Credit) > 0 ? r.Credit : r.Debit;
            const src  = r.SourceDocType ? `${r.SourceDocType}:${r.SourceRef || r.SourceDocID}` : 'MANUAL';
            console.log(`─ ${dt(r.VoucherDate)}  ${r.VoucherNo.padEnd(14)}  ${side} ${fmt(amt).padStart(12)}  [${src}]`);
            console.log(`    Party: ${r.PartyName || '—'}   JC#: ${r.JobCardID || '—'}`);
            console.log(`    Narration: ${(r.Remarks || '').slice(0, 100)}`);
            if (r.CounterAccounts) {
                console.log(`    Counter:   ${r.CounterAccounts.slice(0, 140)}`);
            }
            if (r.ReversesVoucherID) console.log(`    (this voucher reverses #${r.ReversesVoucherID})`);
            console.log('');
        }
        process.exit(0);
    } catch (e) {
        console.error('Audit failed:', e.message);
        process.exit(1);
    }
})();
