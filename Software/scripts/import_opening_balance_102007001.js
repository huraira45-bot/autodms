/**
 * Owner ask 2026-07-03: post one additional opening-balance JV.
 *
 *   Credit  102007001  POS CLEAR         PKR    57,281.00
 *   Debit   301001001  Capital Account   PKR    57,281.00
 *   Date    2026-07-01
 *
 * Same header + posting pattern as import_opening_balances_2026_07.js.
 * Idempotent: refuses to run again once a voucher matching VOUCHER_PREFIX is
 * present in data_FinanceVoucherInfo.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const PARTY_CODE     = '102007001';
const CAPITAL_CODE   = '301001001';
const AMOUNT         = 57281.00;
const VOUCHER_PREFIX = 'JV-OB-102007001';
const VOUCHER_DATE   = new Date('2026-07-01T00:00:00');
const REMARKS        = 'Opening balance 2026-07-01 — 102007001 POS CLEAR Cr 57,281 vs Capital';

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

    // Resolve the two accounts + the JV voucher type.
    const party   = await findLeaf(pool, PARTY_CODE);
    const capital = await findLeaf(pool, CAPITAL_CODE);
    console.log(`Credit → ${PARTY_CODE} · ${party.GLTitle}  (GLCAID=${party.GLCAID})`);
    console.log(`Debit  → ${CAPITAL_CODE} · ${capital.GLTitle}  (GLCAID=${capital.GLCAID})`);
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
        // Header — Draft so we can insert lines before the balanced-entry
        // trigger checks Dr=Cr on the Posted flip.
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

        // Two lines: Dr Capital, Cr 102007001 POS CLEAR.
        const lines = [
            { glcaid: capital.GLCAID, dr: AMOUNT, cr: 0,      title: capital.GLTitle,  code: CAPITAL_CODE },
            { glcaid: party.GLCAID,   dr: 0,      cr: AMOUNT, title: party.GLTitle,    code: PARTY_CODE },
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

        // Flip to Posted — trg_VoucherInfo_PostBalanced trigger enforces Dr=Cr.
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
