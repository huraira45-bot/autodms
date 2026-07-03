/**
 * Reverse a single posted voucher by ID.
 *
 * Owner ask 2026-07-03: JV-OB-102007001-0182 (VoucherID=341) was posted
 * with the Dr/Cr on the wrong sides. Reverse it via the standard
 * postReversalVoucher service so both vouchers remain visible and the
 * net GL impact is zero.
 *
 * Usage (from D:\saher 2.0\autodms\Software):
 *   node scripts\reverse_voucher_id.js <voucherId>
 *
 * Safety:
 *   - Refuses if the voucher isn't currently Posted (service check).
 *   - All writes happen inside a single SQL transaction — rolls back on
 *     any error.
 *   - The service also bumps the original to Reversed and syncs
 *     dms_PendingCheques so historical reports still balance.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');
const { postReversalVoucher } = require('../services/voucherReversalService');

const voucherId = parseInt(process.argv[2] || '', 10);
if (!voucherId) {
    console.error('Usage: node scripts\\reverse_voucher_id.js <voucherId>');
    process.exit(1);
}

(async () => {
    console.log('Connecting to database…');
    const pool = await getPool();
    console.log('Connected.');

    // Preview
    const head = await pool.request()
        .input('id', sql.Int, voucherId)
        .query(`SELECT VoucherID, VoucherNo, VoucherDate, Status, TotalAmount, Remarks
                FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
    if (!head.recordset.length) {
        console.error(`Voucher ${voucherId} not found.`);
        process.exit(2);
    }
    const h = head.recordset[0];
    console.log(`Original: ${h.VoucherNo}  ${h.VoucherDate.toISOString().slice(0,10)}  Status=${h.Status}  Total=PKR ${Number(h.TotalAmount).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    if (h.Remarks) console.log(`Remarks:  ${h.Remarks}`);
    if (h.Status !== 'Posted') {
        console.error(`Refusing: voucher is ${h.Status}, not Posted.`);
        process.exit(3);
    }

    const lines = await pool.request()
        .input('id', sql.Int, voucherId)
        .query(`SELECT vd.Debit, vd.Credit, a.GLCode, a.GLTitle
                FROM data_FinanceVoucherDetail vd
                LEFT JOIN GLChartOFAccount a ON a.GLCAID = vd.GLCAID
                WHERE vd.VoucherID=@id ORDER BY vd.DetailID`);
    console.log('Lines being reversed (Dr/Cr will swap in the reversal):');
    for (const l of lines.recordset) {
        console.log(`   ${l.GLCode}  ${l.GLTitle}   Dr ${Number(l.Debit).toFixed(2)}   Cr ${Number(l.Credit).toFixed(2)}`);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const { reversalId, reversalNo } = await postReversalVoucher(voucherId, {
            userId: null,
            userName: 'ManualReversalScript',
        }, tx);
        await tx.commit();
        console.log(`\n✓ Posted reversal ${reversalNo} (VoucherID=${reversalId}).`);
        console.log(`  Original ${h.VoucherNo} is now Reversed. Net GL impact of the pair = 0.`);
        process.exit(0);
    } catch (e) {
        await tx.rollback();
        console.error('Rolled back:', e.message);
        process.exit(1);
    }
})();
