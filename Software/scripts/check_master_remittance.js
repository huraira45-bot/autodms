/**
 * check_master_remittance.js
 * =====================================================================
 * Finds bookings where the customer's money and Master's money do not
 * reconcile to the variant's defined rate, and reports what is stranded.
 *
 * BACKGROUND (owner report 2026-09-11, BK-2026-0002)
 *   A customer can pay two ways at once: into our bank, and by pay order
 *   made out to Master. Both must add up to the variant's defined rate
 *   before the chassis leaves.
 *
 *   The gate pass only ever checked that the CUSTOMER had paid, never that
 *   MASTER had been paid. On BK-2026-0002 the customer paid 8,617,980 in
 *   full — 50,000 into our bank, 8,567,980 straight to Master — but only
 *   the pay order had reached Master. The car went out while we still held
 *   50,000.
 *
 *   The delivery voucher settles the customer against what actually reached
 *   Master (the net Dr on BOOKING_VARIANT_RECEIVABLE), so that 50,000 was
 *   left as a credit on the customer's account with nothing to clear it.
 *
 * WHAT THIS REPORTS, per booking
 *   definedRate   the variant's wholesale rate — what Master is owed
 *   remitted      net Dr on BVR tagged to the booking — what reached Master
 *   shortfall     definedRate - remitted; the amount still to send
 *   customerPaid  what the customer has paid us in total
 *   stranded      credit left on the customer's GL account after delivery
 *
 * READ-ONLY. Always. Fixing a booking means paying Master the balance
 * through the normal Pay Master screen so the cash movement is real — this
 * script deliberately cannot post anything, because the shortfall is money
 * that genuinely has not moved yet.
 *
 * USAGE
 *   node scripts/check_master_remittance.js              # all live bookings
 *   node scripts/check_master_remittance.js --all        # include closed/cancelled
 *   node scripts/check_master_remittance.js --booking=BK-2026-0002
 * =====================================================================
 */
require('dotenv').config();
const { getPool, sql } = require('../config/db');

const args    = process.argv.slice(2);
const ALL     = args.includes('--all');
const ONE     = (args.find(a => a.startsWith('--booking=')) || '').split('=')[1] || null;
const money   = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
    const pool = await getPool();

    const roleRes = await pool.request()
        .query(`SELECT RoleKey, GLCAID FROM dms_SystemAccounts
                WHERE RoleKey IN ('BOOKING_VARIANT_RECEIVABLE','BOOKING_ADVANCE')`);
    const roles = Object.fromEntries(roleRes.recordset.map(r => [r.RoleKey, r.GLCAID]));
    if (!roles.BOOKING_VARIANT_RECEIVABLE) {
        console.error('BOOKING_VARIANT_RECEIVABLE is not mapped — nothing to check.');
        process.exit(2);
    }

    const rq = pool.request().input('bvr', sql.Int, roles.BOOKING_VARIANT_RECEIVABLE);
    let where = ONE ? 'b.BookingNo = @bno'
                    : (ALL ? '1=1' : `b.Status NOT IN ('Cancelled')`);
    if (ONE) rq.input('bno', sql.NVarChar(50), ONE);

    const r = await rq.query(`
        SELECT b.BookingID, b.BookingNo, b.Status,
               -- No AmountPaidToMaster column exists; what reached Master is
               -- read from the GL below, which is the authoritative figure
               -- anyway (and the one the delivery voucher settles against).
               b.NegotiatedPrice, b.AmountPaidToDate,
               v.VariantCode, v.WholesalePrice,
               veh.ChasisNo, veh.EngineNo,
               p.PartyName, p.PartyGLID,
               ISNULL((SELECT SUM(CASE WHEN d.Debit>0 THEN d.Debit ELSE 0 END)
                            - SUM(CASE WHEN d.Credit>0 THEN d.Credit ELSE 0 END)
                       FROM data_FinanceVoucherDetail d
                       JOIN data_FinanceVoucherInfo   fv ON fv.VoucherID = d.VoucherID
                       WHERE fv.Status='Posted' AND d.GLCAID=@bvr AND d.BookingID=b.BookingID), 0) AS Remitted,
               -- The customer's ACTUAL posted balance for this booking, on
               -- their own GL leaf. Credit means they have paid more than has
               -- been settled against them.
               --
               -- This replaced a (customerPaid - remitted) proxy, which gave a
               -- false all-clear: if the delivery voucher settled a smaller
               -- figure and the balance was remitted to Master afterwards, the
               -- proxy nets to zero while the customer's account is still
               -- carrying the difference. Only the leaf balance shows that.
               ISNULL((SELECT SUM(CASE WHEN d.Credit>0 THEN d.Credit ELSE 0 END)
                            - SUM(CASE WHEN d.Debit >0 THEN d.Debit  ELSE 0 END)
                       FROM data_FinanceVoucherDetail d
                       JOIN data_FinanceVoucherInfo   fv ON fv.VoucherID = d.VoucherID
                       WHERE fv.Status='Posted' AND d.GLCAID=p.PartyGLID
                         AND d.BookingID=b.BookingID), 0) AS CustomerNetCredit
        FROM   dms_SalesBookings b
        LEFT   JOIN dms_VehicleVariant v   ON v.VariantID  = b.VehicleVariantID
        LEFT   JOIN dms_Vehicle        veh ON veh.VehicleID = b.AllocatedVehicleID
        LEFT   JOIN gen_PartiesInfo    p   ON p.PartyID     = b.PartyID
        WHERE  ${where}
        ORDER  BY b.BookingID DESC`);

    if (!r.recordset.length) { console.log('No bookings matched.'); return; }

    console.log('='.repeat(78));
    console.log('MASTER REMITTANCE RECONCILIATION');
    console.log('Defined rate = the variant wholesale rate (what Master is owed)');
    console.log('='.repeat(78));

    const bad = [];
    for (const b of r.recordset) {
        const defined  = Number(b.WholesalePrice) > 0 ? Number(b.WholesalePrice) : Number(b.NegotiatedPrice || 0);
        const remitted = Number(b.Remitted) || 0;
        const short    = Math.round((defined - remitted) * 100) / 100;
        const custPaid = Number(b.AmountPaidToDate) || 0;
        const delivered = ['Closed', 'GatePassIssued', 'Delivered'].includes(b.Status);

        // Measured from the customer's own GL leaf, not inferred. A leftover
        // credit after delivery is money they have paid that nothing has been
        // settled against.
        const netCredit = Math.round((Number(b.CustomerNetCredit) || 0) * 100) / 100;
        const stranded  = delivered && netCredit > 0.01 ? netCredit : 0;

        // When one booking is named explicitly the caller is verifying it, so
        // show the numbers even when they reconcile — "nothing to report" is
        // not the same as seeing the figures line up.
        if (short > 0.01 || stranded > 0.01 || ONE) {
            bad.push({ ...b, defined, remitted, short, custPaid, stranded, netCredit, delivered });
        }
    }

    if (!bad.length) {
        console.log('\nEvery booking reconciles to its defined rate. Nothing to fix.');
        return;
    }

    for (const b of bad) {
        console.log('');
        console.log(`${b.BookingNo}  [${b.Status}]  ${b.PartyName || ''}`);
        console.log(`   Variant ${b.VariantCode || '?'}   chassis ${b.ChasisNo || '—'}   engine ${b.EngineNo || '—'}`);
        console.log(`   Defined rate (owed to Master) : PKR ${money(b.defined).padStart(16)}`);
        console.log(`   Reached Master               : PKR ${money(b.remitted).padStart(16)}`);
        console.log(`   Customer has paid us         : PKR ${money(b.custPaid).padStart(16)}`);
        console.log(`   Customer a/c balance now     : PKR ${money(b.netCredit).padStart(16)}  ${b.netCredit > 0.01 ? 'credit' : ''}`);
        if (b.short > 0.01)
            console.log(`   >> STILL TO SEND MASTER      : PKR ${money(b.short).padStart(16)}`);
        if (b.stranded > 0.01)
            console.log(`   >> STRANDED on customer a/c  : PKR ${money(b.stranded).padStart(16)}  (delivered already)`);
        if (b.short <= 0.01 && b.stranded <= 0.01)
            console.log(`   >> Reconciled - nothing outstanding.`);
    }

    // When one booking is named, list its vouchers too. A stranded balance can
    // mean the delivery voucher was never finalized (still Draft) rather than
    // that it settled the wrong figure — and those need different fixes.
    if (ONE && bad.length) {
        const v = await pool.request().input('bid', sql.Int, bad[0].BookingID).query(`
            SELECT DISTINCT fv.VoucherID, fv.VoucherNo, fv.Status, fv.Posted,
                   CONVERT(CHAR(10), fv.VoucherDate, 120) AS VoucherDate,
                   fv.SourceDocType,
                   CAST(fv.TotalAmount AS DECIMAL(18,2)) AS TotalAmount
            FROM   data_FinanceVoucherInfo   fv
            JOIN   data_FinanceVoucherDetail d ON d.VoucherID = fv.VoucherID
            WHERE  d.BookingID = @bid
            ORDER  BY fv.VoucherID`);
        console.log('');
        console.log('   Vouchers tagged to this booking:');
        if (!v.recordset.length) console.log('     (none)');
        for (const x of v.recordset) {
            console.log(`     ${String(x.VoucherNo).padEnd(12)} ${String(x.Status).padEnd(9)} `
                      + `${x.VoucherDate}  PKR ${money(x.TotalAmount).padStart(16)}  ${x.SourceDocType || ''}`);
        }
        console.log('');
        console.log('   A Draft here has NOT reached the ledger. If the delivery voucher is still');
        console.log('   Draft, the whole customer balance stays unsettled — and if it was built');
        console.log('   before the last remittance, its amount is stale too. Check the figure');
        console.log('   against the defined rate above before finalizing it.');
    }

    console.log('');
    console.log('='.repeat(78));
    console.log(`${bad.length} booking(s) do not reconcile.`);
    console.log('');
    console.log('HOW TO FIX');
    console.log('  Not yet delivered — open the booking, use "Pay Master Motors" to send the');
    console.log('  balance, then issue the gate pass. It will then settle the full defined rate');
    console.log('  and the customer account will clear to zero.');
    console.log('');
    console.log('  Already delivered (stranded) — the money still has to reach Master, so pay it');
    console.log('  through Pay Master Motors as normal. That posts Dr BVR / Cr Bank. The customer');
    console.log('  credit then needs a JV to clear it against BVR:');
    console.log('      Dr  <customer GL>                  (the stranded amount)');
    console.log('      Cr  BOOKING_VARIANT_RECEIVABLE     (same amount)');
    console.log('  Review it as a Draft before finalizing. Nothing here posts on your behalf —');
    console.log('  the shortfall is cash that has genuinely not moved yet.');
    console.log('='.repeat(78));
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
