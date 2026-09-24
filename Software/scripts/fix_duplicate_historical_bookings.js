/**
 * Finds — and on request removes — historical bookings that were imported
 * twice.
 *
 *   node scripts/fix_duplicate_historical_bookings.js                 # look only
 *   node scripts/fix_duplicate_historical_bookings.js --commit        # remove
 *   node scripts/fix_duplicate_historical_bookings.js --by "MAHNOOR"  # narrow it
 *
 * Why this exists: on 2026-09-24 a second run of import_historical_bookings.js
 * failed to recognise five bookings it had already created and made them again.
 * This finds every historical booking that shares a customer and a vehicle with
 * another one, keeps the FIRST (lowest booking number) and removes the rest.
 *
 * It refuses to touch a booking that has anything hanging off it — a payment, a
 * vehicle allocation, a delivery voucher. Those are reported and left alone,
 * because deleting one would take real money or stock records with it.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const COMMIT = args.includes('--commit');
const argVal = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const BY = argVal('--by');

(async () => {
    const pool = await getPool();
    console.log('Historical bookings imported more than once');
    console.log('mode : ' + (COMMIT ? 'COMMIT — duplicates will be deleted' : 'LOOK ONLY — nothing is deleted'));
    if (BY) console.log(`only : those entered by "${BY}"`);
    console.log('');

    const rq = pool.request();
    let filter = '';
    if (BY) { rq.input('by', sql.NVarChar(200), BY); filter = 'AND b.CreatedByName = @by'; }

    // A duplicate is the same customer and the same vehicle twice. Booking
    // dates are compared as dates so a pair that differs only by time of day
    // still counts; NULL (not yet dated) matches NULL.
    const rows = (await rq.query(`
        SELECT b.BookingID, b.BookingNo, b.PartyID, b.VehicleVariantID, b.BookingDate,
               b.Status, b.CreatedByName, b.NegotiatedPrice,
               p.PartyName, c.GLCode, v.VariantName,
               (SELECT COUNT(*) FROM dms_SalesPayments sp WHERE sp.BookingID = b.BookingID) AS Payments,
               b.AllocatedVehicleID, b.DeliveryVoucherID
        FROM   dms_SalesBookings b
        JOIN   gen_PartiesInfo   p ON p.PartyID  = b.PartyID
        LEFT   JOIN GLChartOFAccount c ON c.GLCAID = p.PartyGLID
        JOIN   dms_VehicleVariant v ON v.VariantID = b.VehicleVariantID
        WHERE  b.IsHistorical = 1 ${filter}
        ORDER  BY b.BookingID`)).recordset;

    // The same deal twice is keyed on the LEDGER ACCOUNT, not the customer
    // record. Owner report 2026-09-24: a second import made five bookings that
    // already existed, and grouping by customer found nothing — because the
    // two copies sat on two different customer records sharing one account
    // code. The account is the deal's identity; the customer row is not.
    const groups = new Map();
    for (const b of rows) {
        const identity = b.GLCode ? `acct:${String(b.GLCode).trim()}` : `party:${b.PartyID}`;
        const key = [identity, b.VehicleVariantID,
                     b.BookingDate ? b.BookingDate.toISOString().slice(0, 10) : 'nodate'].join('|');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(b);
    }
    const dupes = [...groups.values()].filter(g => g.length > 1);

    console.log(`historical bookings looked at : ${rows.length}`);
    console.log(`duplicated deals              : ${dupes.length}`);

    // Grouping on the account can still miss a pair sitting on two different
    // accounts, so say how many bookings there are per account either way —
    // a count above one is worth a look even when the grouping found nothing.
    const perAccount = (await pool.request().query(`
        SELECT c.GLCode, p.PartyName, COUNT(*) AS n,
               STRING_AGG(CAST(b.BookingNo AS NVARCHAR(40)), ', ') AS Bookings
        FROM   dms_SalesBookings b
        JOIN   gen_PartiesInfo p ON p.PartyID = b.PartyID
        LEFT   JOIN GLChartOFAccount c ON c.GLCAID = p.PartyGLID
        WHERE  b.IsHistorical = 1
        GROUP  BY c.GLCode, p.PartyName
        HAVING COUNT(*) > 1
        ORDER  BY c.GLCode`)).recordset;
    if (perAccount.length) {
        console.log(`\nACCOUNTS CARRYING MORE THAN ONE HISTORICAL BOOKING: ${perAccount.length}`);
        perAccount.slice(0, 30).forEach(a =>
            console.log(`  ${(a.GLCode || '—').padEnd(12)} ${String(a.n)}  ${a.PartyName}  [${a.Bookings}]`));
        console.log('  A customer who really did buy two vehicles will show here too — check before deleting.');
    }
    if (!dupes.length) {
        console.log('\nNothing is duplicated.');
        process.exit(0);
    }

    const toDelete = [];
    const blocked = [];
    for (const g of dupes) {
        const keep = g[0];                       // lowest BookingID = first made
        console.log(`\naccount ${keep.GLCode || '—'}  ·  ${keep.VariantName}`);
        console.log(`  keep    ${keep.BookingNo}  ${keep.PartyName}`);
        for (const b of g.slice(1)) {
            const attached = [];
            if (b.Payments > 0) attached.push(`${b.Payments} payment(s)`);
            if (b.AllocatedVehicleID) attached.push('an allocated vehicle');
            if (b.DeliveryVoucherID) attached.push('a delivery voucher');
            if (attached.length) {
                blocked.push(b);
                console.log(`  KEEP    ${b.BookingNo}  ${b.PartyName} — has ${attached.join(' and ')}, so it is left alone`);
            } else {
                toDelete.push(b);
                console.log(`  delete  ${b.BookingNo}  ${b.PartyName}`);
            }
        }
    }

    console.log(`\nto delete : ${toDelete.length}`);
    if (blocked.length) {
        console.log(`left alone: ${blocked.length}  — these have payments or stock attached; sort them out by hand`);
    }

    if (!COMMIT) {
        console.log('\nNothing was deleted. Re-run with --commit to remove the duplicates listed above.');
        process.exit(0);
    }
    if (!toDelete.length) { console.log('\nNothing safe to delete.'); process.exit(0); }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const ids = toDelete.map(b => b.BookingID).join(',');
        await new sql.Request(tx).query(
            `DELETE FROM dms_BookingStateTransitions WHERE BookingID IN (${ids})`);
        const r = await new sql.Request(tx).query(
            `DELETE FROM dms_SalesBookings WHERE BookingID IN (${ids})`);
        await tx.commit();
        console.log(`\ndeleted ${r.rowsAffected[0]} duplicate booking(s).`);
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('\nNothing was deleted — ' + err.message);
        process.exit(1);
    }
    process.exit(0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
