/**
 * One-off: reclassify historical Store Sale / SSR discount GL lines out of
 * the old shared discount account and into the now-separate Store Sale
 * Discount Given account.
 *
 * Owner ask 2026-08-01: after splitting SERVICE_DISCOUNT_GIVEN /
 * STORE_SALE_DISCOUNT_GIVEN apart (owner has already reassigned
 * STORE_SALE_DISCOUNT_GIVEN to a different GL account than
 * SERVICE_DISCOUNT_GIVEN via Accounting Setup), only NEW postings go to
 * the right account. Every Store Sale/SSR discount posted BEFORE the
 * split is still sitting in the old shared account (which
 * SERVICE_DISCOUNT_GIVEN currently also points to), mixed in with real
 * Job Card discounts. This moves just those historical lines.
 *
 * Identification is unambiguous, not date-based: every
 * data_FinanceVoucherDetail row on the SERVICE_DISCOUNT_GIVEN account
 * whose voucher has SourceDocType IN ('STORE_SALE','SSR') is a
 * historical Store Sale/SSR discount that was never supposed to be
 * mixed with Job Card discounts. Job Card lines (SourceDocType='JOBCARD')
 * are never touched.
 *
 * Only the GLCAID on each line is changed — same voucher, same Debit/
 * Credit amounts, same date, still balances. Narration gets a short
 * appended note for audit trail. Nothing in inventory or any other
 * table is touched.
 *
 * Refuses to run if SERVICE_DISCOUNT_GIVEN and STORE_SALE_DISCOUNT_GIVEN
 * currently point to the same account (nothing meaningful to move yet —
 * reassign them apart in Accounting Setup first).
 *
 * DRY RUN:  node scripts\segregate_legacy_discount_given.js
 * COMMIT:   node scripts\segregate_legacy_discount_given.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const COMMIT = process.argv.includes('--commit');
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    const serviceGL = (await pool.request().query(
        `SELECT sa.GLCAID, g.GLCode, g.GLTitle FROM dms_SystemAccounts sa
         JOIN GLChartOFAccount g ON g.GLCAID = sa.GLCAID
         WHERE sa.RoleKey='SERVICE_DISCOUNT_GIVEN'`
    )).recordset[0];
    const storeSaleGL = (await pool.request().query(
        `SELECT sa.GLCAID, g.GLCode, g.GLTitle FROM dms_SystemAccounts sa
         JOIN GLChartOFAccount g ON g.GLCAID = sa.GLCAID
         WHERE sa.RoleKey='STORE_SALE_DISCOUNT_GIVEN'`
    )).recordset[0];

    if (!serviceGL) { console.error('  X SERVICE_DISCOUNT_GIVEN is not mapped in Accounting Setup.'); process.exit(1); }
    if (!storeSaleGL) { console.error('  X STORE_SALE_DISCOUNT_GIVEN is not mapped in Accounting Setup.'); process.exit(1); }

    console.log(`  FROM (currently mislabeled Store Sale/SSR lines sit here): ${serviceGL.GLCode} ${serviceGL.GLTitle} (GLCAID=${serviceGL.GLCAID})`);
    console.log(`  TO   (where Store Sale/SSR discount belongs):              ${storeSaleGL.GLCode} ${storeSaleGL.GLTitle} (GLCAID=${storeSaleGL.GLCAID})`);

    if (serviceGL.GLCAID === storeSaleGL.GLCAID) {
        console.error(`\n  X SERVICE_DISCOUNT_GIVEN and STORE_SALE_DISCOUNT_GIVEN both point to the same account right now.`);
        console.error(`    Reassign one of them to a different account in Accounting Setup first, then re-run this.\n`);
        process.exit(1);
    }

    const rows = await pool.request()
        .input('gl', sql.Int, serviceGL.GLCAID)
        .query(`
            SELECT vd.VoucherDetailID, vd.VoucherID, vd.Debit, vd.Credit, vd.Narration,
                   vi.VoucherNo, vi.VoucherDate, vi.SourceDocType, vi.SourceDocID
            FROM data_FinanceVoucherDetail vd
            JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
            WHERE vd.GLCAID = @gl
              AND vi.SourceDocType IN ('STORE_SALE', 'SSR')
              AND vi.Status = 'Posted'
            ORDER BY vi.VoucherDate, vi.VoucherNo
        `);

    if (!rows.recordset.length) {
        console.log(`\n  Nothing to reclassify — no Store Sale/SSR lines found on ${serviceGL.GLCode}.\n`);
        process.exit(0);
    }

    const byType = { STORE_SALE: { count: 0, total: 0 }, SSR: { count: 0, total: 0 } };
    let grandTotal = 0;
    for (const r of rows.recordset) {
        const amt = Number(r.Debit) || Number(r.Credit) || 0;
        byType[r.SourceDocType].count += 1;
        byType[r.SourceDocType].total += amt;
        grandTotal += amt;
    }

    console.log(`\n  ${rows.recordset.length} line(s) to reclassify:`);
    console.log(`    STORE_SALE: ${byType.STORE_SALE.count} line(s), PKR ${fmt(byType.STORE_SALE.total)}`);
    console.log(`    SSR:        ${byType.SSR.count} line(s), PKR ${fmt(byType.SSR.total)}`);
    console.log(`    Total:      PKR ${fmt(grandTotal)}`);

    console.log(`\n  Preview (first 20):`);
    console.log(`  ${'Voucher'.padEnd(12)} ${'Date'.padEnd(12)} ${'Type'.padEnd(11)} ${'Amount'.padStart(12)}`);
    for (const r of rows.recordset.slice(0, 20)) {
        const amt = Number(r.Debit) || Number(r.Credit) || 0;
        console.log(`  ${r.VoucherNo.padEnd(12)} ${new Date(r.VoucherDate).toISOString().slice(0,10).padEnd(12)} ${r.SourceDocType.padEnd(11)} ${fmt(amt).padStart(12)}`);
    }
    if (rows.recordset.length > 20) console.log(`  … and ${rows.recordset.length - 20} more.`);

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. Review the list above before committing.`);
        console.log(`To actually reclassify, re-run with --commit:`);
        console.log(`  node scripts\\segregate_legacy_discount_given.js --commit\n`);
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const today = new Date().toISOString().slice(0, 10);
        let moved = 0;
        for (const r of rows.recordset) {
            const note = ` | Reclassified ${today}: moved from ${serviceGL.GLCode} to ${storeSaleGL.GLCode} (legacy shared discount account split).`;
            await new sql.Request(tx)
                .input('id', sql.Int, r.VoucherDetailID)
                .input('gl', sql.Int, storeSaleGL.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), (r.Narration || '') + note)
                .query(`UPDATE data_FinanceVoucherDetail SET GLCAID=@gl, Narration=@nar WHERE VoucherDetailID=@id`);
            moved++;
        }
        await tx.commit();
        console.log(`\nDone. Reclassified ${moved} line(s) totalling PKR ${fmt(grandTotal)} from ${serviceGL.GLCode} to ${storeSaleGL.GLCode}.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  X FAILED (rolled back): ${e.message}`);
        process.exit(1);
    }
})().catch(e => { console.error('segregation failed:', e.message); process.exit(1); });
