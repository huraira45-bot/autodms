/**
 * Read-only diagnostic: does the PAINT_CONSUMPTION system account's GLCode
 * fall under a prefix the P&L-by-Department report recognises as Paint/
 * Service cost (502002 or 501001002 -- see reportsController.js
 * PNL_DEPARTMENTS)? If not, that's why the 24 backfilled JVs don't show up
 * in the Paint Lab / Service department cost figure even though they
 * posted successfully to the GL.
 *
 * Makes no writes.
 *
 * RUN:  node scripts\check_paint_gl_mapping.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const RECOGNISED_PREFIXES = ['502002', '501001002'];

(async () => {
    const pool = await getPool();

    console.log('\n-- dms_SystemAccounts: PAINT_CONSUMPTION / PAINT_INVENTORY -> GL account --');
    const roles = await pool.request().query(
        `SELECT sa.RoleKey, sa.GLCAID, g.GLCode, g.GLTitle
         FROM dms_SystemAccounts sa
         JOIN GLChartOFAccount g ON g.GLCAID = sa.GLCAID
         WHERE sa.RoleKey IN ('PAINT_CONSUMPTION', 'PAINT_INVENTORY')`
    );
    console.table(roles.recordset);

    for (const row of roles.recordset) {
        if (row.RoleKey !== 'PAINT_CONSUMPTION') continue;
        const ok = RECOGNISED_PREFIXES.some(p => String(row.GLCode).startsWith(p));
        console.log(ok
            ? `  OK: GLCode '${row.GLCode}' matches a recognised Service/Paint cost prefix (${RECOGNISED_PREFIXES.join(' or ')}).`
            : `  MISMATCH: GLCode '${row.GLCode}' (${row.GLTitle}) does NOT start with ${RECOGNISED_PREFIXES.join(' or ')} -- P&L by Department will bucket this under "Unmapped accounts", not any department's cost.`);
    }

    console.log('\n-- Recent postings to the PAINT_CONSUMPTION account (last 30), to confirm they landed --');
    const recent = await pool.request().query(
        `SELECT TOP 30 vi.VoucherNo, vi.VoucherDate, vi.Status, vd.Debit, vd.Credit, vd.Narration
         FROM data_FinanceVoucherDetail vd
         JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
         JOIN dms_SystemAccounts sa ON sa.GLCAID = vd.GLCAID AND sa.RoleKey = 'PAINT_CONSUMPTION'
         ORDER BY vi.VoucherID DESC`
    );
    console.table(recent.recordset.map(r => ({ VoucherNo: r.VoucherNo, Date: r.VoucherDate ? new Date(r.VoucherDate).toISOString().slice(0,10) : '', Status: r.Status, Debit: r.Debit, Narration: (r.Narration || '').slice(0, 60) })));

    console.log('\n-- What GLCode(s) actually exist under 502002 / 501001002 (for comparison) --');
    const existing = await pool.request().query(
        `SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount
         WHERE GLCode LIKE '502002%' OR GLCode LIKE '501001002%'
         ORDER BY GLCode`
    );
    console.table(existing.recordset);

    console.log('');
    process.exit(0);
})().catch(e => { console.error('check failed:', e.message); process.exit(1); });
