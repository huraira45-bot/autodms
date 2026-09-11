/**
 * fix_delivery_voucher_amount.js
 * =====================================================================
 * Corrects a DRAFT delivery voucher that was built before the last
 * remittance reached Master, so its amount is short of the variant's
 * defined rate.
 *
 * WHY THIS HAPPENS (owner report 2026-09-11, BK-2026-0002)
 *   The delivery voucher is built at gate-pass time and settles the
 *   customer against whatever had reached Master AT THAT MOMENT. On
 *   BK-2026-0002 the pass was issued when 8,567,980 of the 8,617,980
 *   defined rate had arrived; the remaining 50,000 was remitted
 *   afterwards (BPV-0389). The draft kept the old figure.
 *
 *   Finalizing it as-is would leave 50,000 stranded on the customer AND
 *   50,000 sitting in Booking Variant Receivable. This rewrites the draft
 *   to the defined rate first.
 *
 *   Cannot recur: the gate pass is now blocked until the full defined rate
 *   has reached Master, so the draft is always built at the right figure.
 *
 * WHAT IT TOUCHES
 *   Only a voucher whose Status is 'Draft'. A posted voucher is never
 *   modified — correcting one of those means a reversing entry, not an
 *   edit, and that is a different job.
 *
 *   It rewrites the customer leg and the BOOKING_VARIANT_RECEIVABLE leg to
 *   the defined rate and re-totals the header. Premium legs, if any, are
 *   left exactly as they are.
 *
 *   It does NOT finalize. The voucher stays a Draft for you to review and
 *   post from Finance > Vouchers.
 *
 * USAGE
 *   node scripts/fix_delivery_voucher_amount.js --booking=BK-2026-0002
 *   node scripts/fix_delivery_voucher_amount.js --booking=BK-2026-0002 --apply
 *
 * Dry run is the default and writes nothing.
 * =====================================================================
 */
require('dotenv').config();
const { getPool, sql } = require('../config/db');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const BNO   = (args.find(a => a.startsWith('--booking=')) || '').split('=')[1] || null;
const money = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function die(msg) { console.error('\n' + msg + '\n'); process.exit(2); }

async function main() {
    if (!BNO) die('Pass a booking, e.g. --booking=BK-2026-0002');

    const pool = await getPool();

    const bvrRes = await pool.request()
        .query(`SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='BOOKING_VARIANT_RECEIVABLE'`);
    if (!bvrRes.recordset.length) die('BOOKING_VARIANT_RECEIVABLE is not mapped.');
    const bvrGL = bvrRes.recordset[0].GLCAID;

    const bRes = await pool.request().input('no', sql.NVarChar(50), BNO).query(`
        SELECT b.BookingID, b.BookingNo, b.Status, b.NegotiatedPrice,
               v.VariantCode, v.WholesalePrice,
               veh.ChasisNo, veh.EngineNo,
               p.PartyName, p.PartyGLID,
               c.GLCode AS PartyGLCode, c.GLTitle AS PartyGLTitle
        FROM   dms_SalesBookings b
        LEFT   JOIN dms_VehicleVariant v   ON v.VariantID   = b.VehicleVariantID
        LEFT   JOIN dms_Vehicle        veh ON veh.VehicleID = b.AllocatedVehicleID
        LEFT   JOIN gen_PartiesInfo    p   ON p.PartyID     = b.PartyID
        LEFT   JOIN GLChartOFAccount   c   ON c.GLCAID      = p.PartyGLID
        WHERE  b.BookingNo = @no`);
    if (!bRes.recordset.length) die(`Booking ${BNO} not found.`);
    const b = bRes.recordset[0];
    if (!b.PartyGLID) die(`Booking ${BNO} has no customer GL account — nothing to settle against.`);

    const definedRate = Number(b.WholesalePrice) > 0 ? Number(b.WholesalePrice) : Number(b.NegotiatedPrice || 0);
    if (!(definedRate > 0)) die(`Booking ${BNO} has no defined rate.`);

    // Never settle more than has actually reached Master — that would credit
    // BVR below zero and invent a receivable that was never paid.
    const remRes = await pool.request().input('gl', sql.Int, bvrGL).input('bid', sql.Int, b.BookingID)
        .query(`SELECT ISNULL(SUM(CASE WHEN d.Debit>0 THEN d.Debit ELSE 0 END)
                           - SUM(CASE WHEN d.Credit>0 THEN d.Credit ELSE 0 END), 0) AS Net
                FROM data_FinanceVoucherDetail d
                JOIN data_FinanceVoucherInfo   v ON v.VoucherID = d.VoucherID
                WHERE v.Status='Posted' AND d.GLCAID=@gl AND d.BookingID=@bid`);
    const remitted = Number(remRes.recordset[0].Net) || 0;

    const vRes = await pool.request().input('bid', sql.Int, b.BookingID).query(`
        SELECT DISTINCT fv.VoucherID, fv.VoucherNo, fv.Status,
               CAST(fv.TotalAmount AS DECIMAL(18,2)) AS TotalAmount
        FROM   data_FinanceVoucherInfo   fv
        JOIN   data_FinanceVoucherDetail d ON d.VoucherID = fv.VoucherID
        WHERE  d.BookingID=@bid AND fv.SourceDocType='SALES_DELIVERY'
        ORDER  BY fv.VoucherID`);

    const drafts = vRes.recordset.filter(v => v.Status === 'Draft');
    const posted = vRes.recordset.filter(v => v.Status === 'Posted');

    console.log('='.repeat(74));
    console.log(`DELIVERY VOUCHER CORRECTION  ·  ${b.BookingNo}  ·  ${APPLY ? 'APPLY' : 'DRY RUN (writes nothing)'}`);
    console.log('='.repeat(74));
    console.log(`Customer      : ${b.PartyName}   (${b.PartyGLCode} ${b.PartyGLTitle})`);
    console.log(`Variant       : ${b.VariantCode || '?'}   chassis ${b.ChasisNo || '—'}   engine ${b.EngineNo || '—'}`);
    console.log(`Defined rate  : PKR ${money(definedRate)}`);
    console.log(`Reached Master: PKR ${money(remitted)}`);

    if (posted.length) {
        console.log(`\nNOTE: a delivery voucher is already POSTED for this booking ` +
                    `(${posted.map(p => p.VoucherNo).join(', ')}). It will not be touched.`);
    }
    if (!drafts.length) die('No DRAFT delivery voucher on this booking — nothing to correct.');
    if (drafts.length > 1) die(`More than one draft delivery voucher (${drafts.map(d => d.VoucherNo).join(', ')}). Resolve by hand.`);

    const v = drafts[0];
    if (definedRate - remitted > 0.01) {
        die(`PKR ${money(definedRate - remitted)} of the defined rate has NOT reached Master yet.\n`
          + `Pay Master the balance first — settling the customer for money Master never received\n`
          + `would push Booking Variant Receivable negative.`);
    }

    const lRes = await pool.request().input('vid', sql.Int, v.VoucherID).query(`
        SELECT d.VoucherDetailID, d.GLCAID, c.GLCode, c.GLTitle,
               CAST(d.Debit AS DECIMAL(18,2)) AS Debit,
               CAST(d.Credit AS DECIMAL(18,2)) AS Credit, d.Narration
        FROM   data_FinanceVoucherDetail d
        LEFT   JOIN GLChartOFAccount c ON c.GLCAID = d.GLCAID
        WHERE  d.VoucherID=@vid
        ORDER  BY d.VoucherDetailID`);
    const lines = lRes.recordset;

    const custLine = lines.find(l => l.GLCAID === b.PartyGLID && Number(l.Debit) > 0);
    const bvrLine  = lines.find(l => l.GLCAID === bvrGL       && Number(l.Credit) > 0);
    if (!custLine) die(`Draft ${v.VoucherNo} has no debit line on the customer account — not the voucher this script handles.`);
    if (!bvrLine)  die(`Draft ${v.VoucherNo} has no credit line on Booking Variant Receivable — not the voucher this script handles.`);
    if (Math.abs(Number(custLine.Debit) - Number(bvrLine.Credit)) > 0.01) {
        die(`Draft ${v.VoucherNo}: the customer debit and the BVR credit already disagree — resolve by hand.`);
    }

    const current = Number(custLine.Debit);
    const delta   = Math.round((definedRate - current) * 100) / 100;

    console.log(`\nDraft voucher : ${v.VoucherNo}  (VoucherID ${v.VoucherID})`);
    console.log('\nLines now:');
    for (const l of lines) {
        console.log(`   ${String(l.GLCode).padEnd(12)} ${String(l.GLTitle || '').slice(0, 34).padEnd(34)} `
                  + `Dr ${money(l.Debit).padStart(15)}  Cr ${money(l.Credit).padStart(15)}`);
    }

    if (Math.abs(delta) < 0.01) {
        console.log('\nAlready at the defined rate — nothing to change. Finalize it as it stands.');
        return;
    }

    console.log(`\nChange: PKR ${money(current)}  ->  PKR ${money(definedRate)}   (${delta > 0 ? '+' : ''}${money(delta)})`);
    console.log('   on both the customer debit and the BVR credit.');

    const otherDr = lines.filter(l => l.VoucherDetailID !== custLine.VoucherDetailID)
                         .reduce((s, l) => s + Number(l.Debit), 0);
    const newTotal = Math.round((definedRate + otherDr) * 100) / 100;
    console.log(`   Header total: PKR ${money(v.TotalAmount)}  ->  PKR ${money(newTotal)}`);

    console.log('\nAfter finalizing, this booking should land at:');
    console.log(`   Customer account : 0.00`);
    console.log(`   Booking Variant Receivable : 0.00`);

    if (!APPLY) {
        console.log('\n' + '='.repeat(74));
        console.log('DRY RUN — nothing written. To apply:');
        console.log(`   node scripts/fix_delivery_voucher_amount.js --booking=${BNO} --apply`);
        console.log('='.repeat(74));
        return;
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Re-assert Draft inside the transaction — it must not have been
        // finalized between the read above and this write.
        const still = await new sql.Request(tx).input('vid', sql.Int, v.VoucherID)
            .query(`SELECT Status FROM data_FinanceVoucherInfo WHERE VoucherID=@vid`);
        if (still.recordset[0]?.Status !== 'Draft') {
            throw new Error(`${v.VoucherNo} is no longer a Draft — it is now ${still.recordset[0]?.Status}. Nothing changed.`);
        }

        await new sql.Request(tx)
            .input('id', sql.Int, custLine.VoucherDetailID)
            .input('amt', sql.Decimal(18, 2), definedRate)
            .query(`UPDATE data_FinanceVoucherDetail SET Debit=@amt WHERE VoucherDetailID=@id`);
        await new sql.Request(tx)
            .input('id', sql.Int, bvrLine.VoucherDetailID)
            .input('amt', sql.Decimal(18, 2), definedRate)
            .query(`UPDATE data_FinanceVoucherDetail SET Credit=@amt WHERE VoucherDetailID=@id`);
        await new sql.Request(tx)
            .input('vid', sql.Int, v.VoucherID)
            .input('tot', sql.Decimal(18, 2), newTotal)
            .query(`UPDATE data_FinanceVoucherInfo SET TotalAmount=@tot WHERE VoucherID=@vid`);

        // The voucher must still balance, or we have made things worse.
        const chk = await new sql.Request(tx).input('vid', sql.Int, v.VoucherID)
            .query(`SELECT CAST(SUM(Debit) AS DECIMAL(18,2)) AS Dr,
                           CAST(SUM(Credit) AS DECIMAL(18,2)) AS Cr
                    FROM data_FinanceVoucherDetail WHERE VoucherID=@vid`);
        const { Dr, Cr } = chk.recordset[0];
        if (Math.abs(Number(Dr) - Number(Cr)) > 0.01) {
            throw new Error(`Voucher would not balance after the edit (Dr ${money(Dr)} vs Cr ${money(Cr)}). Rolled back.`);
        }

        await tx.commit();
        console.log('\n' + '='.repeat(74));
        console.log(`APPLIED — ${v.VoucherNo} now settles PKR ${money(definedRate)} and balances (Dr = Cr = ${money(Dr)}).`);
        console.log('It is still a DRAFT. Review it in Finance > Vouchers and Finalize it there.');
        console.log('Then re-run check_master_remittance.js to confirm it reconciles.');
        console.log('='.repeat(74));
    } catch (err) {
        try { await tx.rollback(); } catch {}
        die('FAILED — rolled back, nothing changed.\n' + err.message);
    }
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
