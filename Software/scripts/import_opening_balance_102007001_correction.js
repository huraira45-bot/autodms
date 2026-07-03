/**
 * Owner ask 2026-07-03: the earlier opening-balance JV for 102007001
 * (JV-OB-102007001-0182, VoucherID=341) had Dr/Cr on the wrong sides.
 * After reversing that voucher, re-post with the correct direction:
 *
 *   Debit   102007001  POS CLEAR         PKR    57,281.00
 *   Credit  301001001  Capital Account   PKR    57,281.00
 *   Date    2026-07-01
 *
 * Fresh voucher prefix so this script is idempotent independently of
 * the earlier (wrong-side) run.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const DR_CODE        = '102007001';   // POS CLEAR — should be Debited
const CR_CODE        = '301001001';   // Capital Account — should be Credited
const AMOUNT         = 57281.00;
const VOUCHER_PREFIX = 'JV-OB-102007001-FIX';
const VOUCHER_DATE   = new Date('2026-07-01T00:00:00');
const REMARKS        = 'Opening balance 2026-07-01 — 102007001 POS CLEAR Dr 57,281 vs Capital (corrected direction)';

async function findLeaf(pool, code) {
    const r = await pool.request()
        .input('c', sql.NVarChar(50), code)
        .query('SELECT GLCAID, GLTitle FROM GLChartOFAccount WHERE GLCode=@c AND isParent=0');
    if (!r.recordset.length) {
        throw new Error(`GLCode ${code} not found (or is a parent). Verify the code exists on this DB.`);
    }
    return r.recordset[0];
}

(async () => {
    console.log('Connecting to database…');
    const pool = await getPool();
    console.log('Connected.');

    // Idempotency guard — refuse to run twice.
    const dup = await pool.request()
        .input('p', sql.NVarChar(50), VOUCHER_PREFIX + '%')
        .query('SELECT TOP 1 VoucherNo FROM data_FinanceVoucherInfo WHERE VoucherNo LIKE @p');
    if (dup.recordset.length) {
        console.error(`Refusing to run — voucher '${dup.recordset[0].VoucherNo}' already exists.`);
        console.error('Delete it first if you need to re-import.');
        process.exit(2);
    }

    const drAcc = await findLeaf(pool, DR_CODE);
    const crAcc = await findLeaf(pool, CR_CODE);
    console.log(`Debit  → ${DR_CODE} · ${drAcc.GLTitle}  (GLCAID=${drAcc.GLCAID})`);
    console.log(`Credit → ${CR_CODE} · ${crAcc.GLTitle}  (GLCAID=${crAcc.GLCAID})`);
    console.log(`Amount: PKR ${AMOUNT.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
    console.log(`Date:   ${VOUCHER_DATE.toISOString().slice(0, 10)}`);

    const vt = await pool.request().query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
    if (!vt.recordset.length) throw new Error('JV voucher type missing.');
    const jvTypeId = vt.recordset[0].Voucherid;

    const seq = await pool.request().query('SELECT NEXT VALUE FOR dbo.seq_FinanceVoucherNo AS nextNo');
    const voucherNo = `${VOUCHER_PREFIX}-${String(seq.recordset[0].nextNo).padStart(4, '0')}`;
    console.log(`Voucher No: ${voucherNo}`);

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const hdr = await new sql.Request(tx)
            .input('vd',   sql.DateTime, VOUCHER_DATE)
            .input('vno',  sql.NVarChar(50), voucherNo)
            .input('vtId', sql.Int, jvTypeId)
            .input('rem',  sql.NVarChar(sql.MAX), REMARKS)
            .input('tot',  sql.Decimal(18, 2), AMOUNT)
            .input('src',  sql.NVarChar(20), 'VOUCHER')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @rem, @tot,
                            'Draft', 0, @src, 'OpeningBalanceImport')`);
        const voucherId = hdr.recordset[0].VoucherID;

        // Corrected: Dr 102007001 POS CLEAR, Cr 301001001 Capital.
        const lines = [
            { glcaid: drAcc.GLCAID, dr: AMOUNT, cr: 0,      title: drAcc.GLTitle, code: DR_CODE },
            { glcaid: crAcc.GLCAID, dr: 0,      cr: AMOUNT, title: crAcc.GLTitle, code: CR_CODE },
        ];
        for (const l of lines) {
            await new sql.Request(tx)
                .input('vid', sql.Int, voucherId)
                .input('gl',  sql.Int, l.glcaid)
                .input('nar', sql.NVarChar(sql.MAX), `Opening balance 2026-07-01 — ${l.code} ${l.title}`)
                .input('dr',  sql.Decimal(18, 2), l.dr)
                .input('cr',  sql.Decimal(18, 2), l.cr)
                .query(`INSERT INTO data_FinanceVoucherDetail
                            (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, @cr)`);
        }

        await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .query(`UPDATE data_FinanceVoucherInfo
                    SET Status='Posted', Posted=1, PostedAt=GETDATE()
                    WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n✓ Posted ${voucherNo} (VoucherID=${voucherId}), Dr=Cr=PKR ${AMOUNT.toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}.`);
        process.exit(0);
    } catch (e) {
        await tx.rollback();
        console.error('Rolled back:', e.message);
        process.exit(1);
    }
})();
