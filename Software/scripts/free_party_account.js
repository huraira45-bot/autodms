/**
 * Frees a chart-of-accounts code by removing the customer sitting on it.
 *
 *   node scripts/free_party_account.js 201002062              # look only
 *   node scripts/free_party_account.js 201002062 --commit     # do it
 *
 * Owner ask 2026-09-24: account 201002062 is titled MUHAMMAD AHMAD but carries
 * a customer record named MUHAMMAD TAHIR HAMID SHEIKH, who is somebody else.
 * The wrong record and its bookings have to go so the right customer can be
 * created on that account.
 *
 * An account belongs to exactly one party (UX_gen_PartiesInfo_PartyGLID), so
 * freeing it means deleting that party. That is not a small thing: fifty-odd
 * tables can point at a customer. So this discovers every foreign key into
 * gen_PartiesInfo from the database itself rather than trusting a list written
 * by hand, counts what is attached, and REFUSES to delete if anything but
 * bookings is holding on — ledger entries, vouchers, job cards, invoices.
 * Those are real history and are never silently thrown away.
 *
 * The GL account itself is untouched. It is only vacated.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const CODE = args.find(a => !a.startsWith('--'));
const COMMIT = args.includes('--commit');

// What may be removed along with the customer. Bookings because that is the
// point of the exercise, and the rest because they carry no history: an access
// grant and a "hide this party" preference say nothing about what happened,
// and every party tends to have them — blocking on those would mean this
// script refused almost every time, for no good reason.
const REMOVABLE = new Set([
    'dms_SalesBookings',
    'dms_PartyBusinessAccess',
    'dms_SSReceivablesHiddenParties',
]);
const PLUMBING = new Set(['dms_PartyBusinessAccess', 'dms_SSReceivablesHiddenParties']);

if (!CODE) {
    console.error('usage: node scripts/free_party_account.js <GLCode> [--commit]');
    console.error('   eg: node scripts/free_party_account.js 201002062');
    process.exit(1);
}

/** Every table with a foreign key into `table`, and the column that points. */
async function childrenOf(pool, table) {
    const r = await pool.request().input('t', sql.NVarChar(200), table).query(`
        SELECT OBJECT_NAME(fk.parent_object_id) AS ChildTable, c.name AS ChildColumn
        FROM   sys.foreign_keys fk
        JOIN   sys.foreign_key_columns fkc ON fkc.constraint_object_id = fk.object_id
        JOIN   sys.columns c ON c.object_id = fkc.parent_object_id AND c.column_id = fkc.parent_column_id
        WHERE  fk.referenced_object_id = OBJECT_ID(@t)`);
    return r.recordset;
}

const countIn = async (pool, table, column, ids) => {
    if (!ids.length) return 0;
    const r = await pool.request().query(
        `SELECT COUNT(*) AS n FROM [${table}] WHERE [${column}] IN (${ids.join(',')})`);
    return r.recordset[0].n;
};

(async () => {
    const pool = await getPool();
    console.log('Free a chart-of-accounts code');
    console.log('mode : ' + (COMMIT ? 'COMMIT — the customer will be deleted' : 'LOOK ONLY — nothing is deleted'));
    console.log('');

    const acct = (await pool.request().input('c', sql.NVarChar(50), CODE)
        .query(`SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount WHERE GLCode = @c`)).recordset[0];
    if (!acct) { console.error(`No account ${CODE} in the chart of accounts.`); process.exit(1); }
    console.log(`account : ${acct.GLCode}  "${acct.GLTitle}"  (GLCAID ${acct.GLCAID})`);

    const party = (await pool.request().input('gl', sql.Int, acct.GLCAID)
        .query(`SELECT PartyID, PartyName, PartyType, PartyCategory, CNIC, NTNNO, PhoneOne
                FROM gen_PartiesInfo WHERE PartyGLID = @gl`)).recordset[0];
    if (!party) {
        console.log('\nNobody holds this account — it is already free.');
        process.exit(0);
    }
    console.log(`customer: ${party.PartyName}  (PartyID ${party.PartyID}, ${party.PartyType || '—'})`);

    // ---- what is attached ----
    const kids = await childrenOf(pool, 'gen_PartiesInfo');
    const attached = [];
    for (const k of kids) {
        // gen_PartiesInfo points at itself; a party is not its own child.
        const selfRef = k.ChildTable.toLowerCase() === 'gen_partiesinfo';
        const r = await pool.request().input('id', sql.Int, party.PartyID).query(
            `SELECT COUNT(*) AS n FROM [${k.ChildTable}] WHERE [${k.ChildColumn}] = @id`
            + (selfRef ? ' AND PartyID <> @id' : ''));
        if (r.recordset[0].n > 0) attached.push({ ...k, n: r.recordset[0].n });
    }

    if (!attached.length) {
        console.log('\nNothing is attached to this customer.');
    } else {
        console.log('\nATTACHED TO THIS CUSTOMER');
        for (const a of attached) {
            const note = PLUMBING.has(a.ChildTable) ? '   (settings — removed with them)'
                       : REMOVABLE.has(a.ChildTable) ? '   (would be deleted)'
                       : '   <-- stops the delete';
            console.log(`  ${String(a.n).padStart(5)}  ${a.ChildTable}.${a.ChildColumn}${note}`);
        }
    }

    const blocking = attached.filter(a => !REMOVABLE.has(a.ChildTable));

    // ---- the bookings, named ----
    const bookings = (await pool.request().input('id', sql.Int, party.PartyID).query(`
        SELECT b.BookingID, b.BookingNo, b.Status, b.IsHistorical, b.NegotiatedPrice, b.AmountPaidToDate,
               v.VariantName,
               (SELECT COUNT(*) FROM dms_SalesPayments p WHERE p.BookingID = b.BookingID) AS Payments
        FROM   dms_SalesBookings b
        LEFT   JOIN dms_VehicleVariant v ON v.VariantID = b.VehicleVariantID
        WHERE  b.PartyID = @id ORDER BY b.BookingID`)).recordset;

    if (bookings.length) {
        console.log('\nBOOKINGS THAT WOULD GO');
        for (const b of bookings) {
            console.log(`  ${b.BookingNo}  ${b.Status.padEnd(20)} ${(b.VariantName || '').slice(0, 28).padEnd(29)}`
                        + `PKR ${Number(b.NegotiatedPrice).toLocaleString('en-PK').padStart(14)}`
                        + (b.Payments ? `  ${b.Payments} PAYMENT(S)` : '')
                        + (Number(b.AmountPaidToDate) ? `  PAID ${Number(b.AmountPaidToDate).toLocaleString('en-PK')}` : ''));
        }
    }
    const paidBookings = bookings.filter(b => b.Payments > 0 || Number(b.AmountPaidToDate) > 0);

    // ---- refusals ----
    if (blocking.length) {
        console.error(`\nNOT SAFE. This customer still has ${blocking.map(b => b.ChildTable).join(', ')}.`);
        console.error('That is real history — ledger, vouchers, job cards or invoices. Deleting the customer');
        console.error('would take it with them. Move or reverse those first, or rename this customer instead.');
        process.exit(1);
    }
    if (paidBookings.length) {
        console.error(`\nNOT SAFE. ${paidBookings.map(b => b.BookingNo).join(', ')} has money recorded against it.`);
        console.error('Void the payment first — money is never removed by this script.');
        process.exit(1);
    }

    if (!COMMIT) {
        console.log(`\nNothing was deleted. Re-run with --commit to delete "${party.PartyName}"`
                    + `${bookings.length ? ` and ${bookings.length} booking(s)` : ''}, freeing ${acct.GLCode}.`);
        process.exit(0);
    }

    // ---- do it ----
    const bookingIds = bookings.map(b => b.BookingID);
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        if (bookingIds.length) {
            // Whatever hangs off a booking goes first, discovered the same way.
            for (const k of await childrenOf(pool, 'dms_SalesBookings')) {
                const n = await countIn(pool, k.ChildTable, k.ChildColumn, bookingIds);
                if (!n) continue;
                await new sql.Request(tx).query(
                    `DELETE FROM [${k.ChildTable}] WHERE [${k.ChildColumn}] IN (${bookingIds.join(',')})`);
                console.log(`  removed ${n} row(s) from ${k.ChildTable}`);
            }
            const r = await new sql.Request(tx).query(
                `DELETE FROM dms_SalesBookings WHERE BookingID IN (${bookingIds.join(',')})`);
            console.log(`  removed ${r.rowsAffected[0]} booking(s)`);
        }
        for (const table of PLUMBING) {
            const col = kids.find(k => k.ChildTable === table)?.ChildColumn;
            if (!col) continue;
            const r = await new sql.Request(tx).input('id', sql.Int, party.PartyID)
                .query(`DELETE FROM [${table}] WHERE [${col}] = @id`);
            if (r.rowsAffected[0]) console.log(`  removed ${r.rowsAffected[0]} row(s) from ${table}`);
        }
        const p = await new sql.Request(tx).input('id', sql.Int, party.PartyID)
            .query(`DELETE FROM gen_PartiesInfo WHERE PartyID = @id`);
        if (!p.rowsAffected[0]) throw new Error('the customer row was already gone');
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('\nNothing was deleted — ' + err.message);
        process.exit(1);
    }

    console.log(`\nDone. "${party.PartyName}" is gone and ${acct.GLCode} "${acct.GLTitle}" is free.`);
    console.log('Create the right customer on it from the booking form, picking that existing account.');
    process.exit(0);
})().catch(err => { console.error('CRASHED:', err.message); process.exit(1); });
