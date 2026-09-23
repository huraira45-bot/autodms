/**
 * Imports historical vehicle bookings from the owner's customer sheet.
 *
 *   node scripts/import_historical_bookings.js "C:\\...\\Customer_Data_Changan AUG.xlsx"
 *   node scripts/import_historical_bookings.js "<file>" --commit --executive 1019
 *
 * Dry run unless --commit is given: it reads everything, works out exactly what
 * it would do to each row, and writes nothing.
 *
 * Decisions taken with the owner (2026-09-23):
 *   - every booking goes in as IsHistorical with status PendingPayment;
 *   - the booking date is OPTIONAL (owner, 2026-09-23: the dates were still
 *     being dug out of the files, so the deals go on record first and staff
 *     fill the date in afterwards on the booking page). A booking with no date
 *     gets none rather than a made-up one, and carries a "No booking date"
 *     mark until somebody sets it;
 *   - the A/C number in the sheet is an account that ALREADY exists in the
 *     chart of accounts, so this never creates GL accounts. A row whose account
 *     is missing is reported and skipped, not invented;
 *   - the part-payments in columns I/J are deliberately NOT imported yet;
 *   - corporate customers legitimately share one NTN (it is the financing
 *     bank's), so nothing here treats a repeated NTN as a duplicate.
 *
 * Safe to run twice: a booking already on record for the same customer,
 * variant and date is recognised and left alone.
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const XLSX = require('xlsx');
const { sql, getPool } = require('../config/db');

const args = process.argv.slice(2);
const FILE = args.find(a => !a.startsWith('--'));
const COMMIT = args.includes('--commit');
const PARTIAL = args.includes('--partial');
const argVal = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; };
// Either an employee id or part of a name — typing a name is easier than
// looking an id up first, and cmd.exe swallows angle-bracket placeholders.
const EXECUTIVE_ARG = argVal('--executive');
let EXECUTIVE = null;
let USERNAME = argVal('--user') || null;

const STATUS = 'PendingPayment';
const GL_PARENT = '201002';        // CUSTOMER ADVANCES - VEHICLE PARTIES

const norm = (v) => String(v == null ? '' : v).trim().replace(/\s+/g, ' ');
const up = (v) => norm(v).toUpperCase();
const digits = (v) => norm(v).replace(/\D/g, '');
const money = (n) => Number(n || 0).toLocaleString('en-PK');

if (!FILE) {
    console.error('usage: node scripts/import_historical_bookings.js "<file.xlsx>" [--commit] [--executive <employeeId>] [--user "<name>"] [--partial]');
    process.exit(1);
}
if (!require('fs').existsSync(FILE)) {
    console.error(`There is no file at:\n  ${FILE}\n`);
    if (/\.\.\.|<.*>/.test(FILE)) {
        console.error('That looks like a placeholder rather than a real path. Put the full path to the');
        console.error('spreadsheet in quotes, e.g. "D:\\saher 2.0\\autodms\\Software\\customers.xlsx".');
    } else {
        console.error('Check the path. The sheet has to be on THIS machine — the import talks to the');
        console.error('database directly, so copy the file to the server first.');
    }
    process.exit(1);
}

// ---------------------------------------------------------------------------
// Reading the sheet
// ---------------------------------------------------------------------------
const DATE_HEADERS = ['BOOKING DATE', 'BOOKINGDATE', 'BOOKING DT', 'DATE'];

/** Excel dates arrive as Date, as a serial number, or as text. */
function parseBookingDate(v) {
    if (v == null || norm(v) === '') return { error: 'no booking date' };
    if (v instanceof Date && !isNaN(v)) return { date: v };
    if (typeof v === 'number' && v > 20000 && v < 60000) {
        // Excel serial: day 1 is 1900-01-01, with the famous 1900 leap bug.
        return { date: new Date(Date.UTC(1899, 11, 30) + v * 86400000) };
    }
    const s = norm(v);
    let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return { date: new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) };
    m = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/.exec(s);
    if (m) {
        // Day first, as written locally. Flagged when it could be read either
        // way, so a wrong reading is seen rather than silently imported.
        const [, a, b, y] = m;
        const ambiguous = +a <= 12 && +b <= 12 && a !== b;
        return { date: new Date(Date.UTC(+y, +b - 1, +a)), ambiguous: ambiguous ? `${a}/${b}/${y} read as ${a} ${monthName(+b)} ${y}` : null };
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return { date: d };
    return { error: `cannot read the date "${s}"` };
}
const monthName = (m) => ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m - 1] || '?';
const iso = (d) => d.toISOString().slice(0, 10);

function readSheet(file) {
    const wb = XLSX.readFile(file, { cellDates: true });
    const wsName = wb.SheetNames.find(n => /customer/i.test(n)) || wb.SheetNames[0];
    const raw = XLSX.utils.sheet_to_json(wb.Sheets[wsName], { header: 1, defval: '' });
    const header = raw[0].map(up);
    const col = (...names) => { for (const n of names) { const i = header.indexOf(n); if (i >= 0) return i; } return -1; };

    const idx = {
        ac:      col('A/C NO. INTERNAL', 'A/C NO', 'ACCOUNT NO'),
        name:    col('CUSTOMER NAME', 'NAME'),
        id:      col('CNIC # /NTN #', 'CNIC', 'CNIC #', 'NTN'),
        phone:   col('PHONE #', 'PHONE'),
        model:   col('VEHICLE', 'MODEL'),
        variant: col('VARIANT'),
        price:   col('RETAIL PRICE', 'PRICE'),
        type:    col('CUSTOMER TYPE', 'TYPE'),
        date:    col(...DATE_HEADERS),
    };

    const rows = [];
    const seen = new Map();
    for (let i = 1; i < raw.length; i++) {
        const r = raw[i];
        if (!norm(r[idx.name])) continue;
        const rec = {
            excelRow: i + 1,
            ac: norm(r[idx.ac]),
            name: norm(r[idx.name]),
            id: norm(r[idx.id]),
            phone: digits(r[idx.phone]),
            model: norm(r[idx.model]),
            variant: norm(r[idx.variant]),
            price: Number(r[idx.price]) || 0,
            type: up(r[idx.type]),
            dateCell: idx.date >= 0 ? r[idx.date] : null,
        };
        // The sheet has one row entered twice; import the customer once.
        const key = [rec.ac, up(rec.name), up(rec.variant)].join('|');
        if (seen.has(key)) { rec.duplicateOf = seen.get(key); rows.push(rec); continue; }
        seen.set(key, rec.excelRow);
        rows.push(rec);
    }
    return { sheetName: wsName, hasDateColumn: idx.date >= 0, rows };
}

// ---------------------------------------------------------------------------
// Matching against DealerDesk
// ---------------------------------------------------------------------------
async function loadLookups(pool) {
    const q = async (s) => (await pool.request().query(s)).recordset;
    const accounts = new Map();
    for (const a of await q(`SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount`)) accounts.set(norm(a.GLCode), a);
    const partyByGL = new Map();
    for (const p of await q(`SELECT PartyID, PartyName, PartyGLID, PartyCategory FROM gen_PartiesInfo WHERE PartyGLID IS NOT NULL`)) {
        partyByGL.set(p.PartyGLID, p);
    }
    const variants = new Map();
    for (const v of await q(`SELECT v.VariantID, v.VariantName, v.ModelID, m.ModelName
                             FROM dms_VehicleVariant v JOIN dms_VehicleModel m ON m.ModelID = v.ModelID`)) {
        variants.set(up(v.VariantName), v);
    }
    return { accounts, partyByGL, variants };
}

/** What would happen to this row, without doing any of it. */
function planRow(rec, look) {
    const p = { rec, problems: [] };
    if (rec.duplicateOf) { p.action = 'skip'; p.note = `same customer as row ${rec.duplicateOf}`; return p; }

    // No date is allowed: the deal still goes on record and the date is filled
    // in later on the booking page. Only an unreadable one is a problem.
    const d = parseBookingDate(rec.dateCell);
    if (d.error === 'no booking date') p.date = null;
    else if (d.error) p.problems.push(d.error);
    else { p.date = d.date; p.ambiguous = d.ambiguous; }
    if (p.date && p.date.getTime() > Date.now() + 86400000) p.problems.push('booking date is in the future');
    if (!(rec.price > 0)) p.problems.push('no retail price');

    const acct = look.accounts.get(rec.ac);
    if (!acct) p.problems.push(`account ${rec.ac || '(blank)'} is not in the chart of accounts`);
    else {
        p.account = acct;
        p.party = look.partyByGL.get(acct.GLCAID) || null;
    }

    const variant = look.variants.get(up(rec.variant));
    if (!variant) p.problems.push(`variant "${rec.variant}" is not set up in DealerDesk`);
    else p.variant = variant;

    if (p.problems.length) { p.action = 'blocked'; return p; }
    p.action = p.party ? 'booking' : 'party+booking';
    return p;
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------
async function bookingNoForYear(tx, year) {
    const r = await new sql.Request(tx)
        .input('p', sql.NVarChar(20), `BK-${year}-%`)
        .query(`SELECT ISNULL(MAX(CAST(SUBSTRING(BookingNo, 9, 10) AS INT)), 0) + 1 AS nextNo
                FROM dms_SalesBookings WHERE BookingNo LIKE @p`);
    return `BK-${year}-${String(r.recordset[0].nextNo).padStart(4, '0')}`;
}

async function alreadyImported(pool, partyId, variantId, date) {
    // A dateless import is matched on customer and variant alone, so running
    // this again before the dates are filled in does not double anything up.
    const r = await pool.request()
        .input('p', sql.Int, partyId).input('v', sql.Int, variantId).input('d', sql.Date, date || null)
        .query(`SELECT TOP 1 BookingNo FROM dms_SalesBookings
                WHERE IsHistorical = 1 AND PartyID=@p AND VehicleVariantID=@v
                  AND ((@d IS NULL AND BookingDate IS NULL) OR CAST(BookingDate AS DATE)=@d)`);
    return r.recordset.length ? r.recordset[0].BookingNo : null;
}

async function importOne(pool, p) {
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        let partyId = p.party?.PartyID;

        if (!partyId) {
            // A repeated NTN is normal for corporate buyers financed by the
            // same bank, so nothing here rejects one.
            const isCNIC = digits(p.rec.id).length === 13;
            const r = await new sql.Request(tx)
                .input('nm', sql.VarChar(100), p.rec.name.slice(0, 100))
                .input('gl', sql.Int, p.account.GLCAID)
                .input('ph', sql.VarChar(50), p.rec.phone || null)
                .input('cnic', sql.VarChar(20), isCNIC ? digits(p.rec.id).slice(0, 20) : null)
                .input('ntn', sql.VarChar(30), isCNIC ? null : p.rec.id.slice(0, 30) || null)
                .input('cat', sql.NVarChar(40), p.rec.type === 'CORPORATE' ? 'Corporate'
                                              : p.rec.type === 'INDIVIDUAL' ? 'Individual' : null)
                .query(`INSERT INTO gen_PartiesInfo (PartyName, PartyGLID, PhoneOne, CNIC, NTNNO, PartyType, PartyCategory, ReadOnly)
                        OUTPUT INSERTED.PartyID
                        VALUES (@nm, @gl, @ph, @cnic, @ntn, 'Customer', @cat, 0)`);
            partyId = r.recordset[0].PartyID;
            p.createdParty = partyId;
        } else if (!p.party.PartyCategory && (p.rec.type === 'CORPORATE' || p.rec.type === 'INDIVIDUAL')) {
            // The sheet is the owner's own classification — fill it in where
            // the party has none, but never overwrite one already chosen.
            await new sql.Request(tx)
                .input('id', sql.Int, partyId)
                .input('cat', sql.NVarChar(40), p.rec.type === 'CORPORATE' ? 'Corporate' : 'Individual')
                .query(`UPDATE gen_PartiesInfo SET PartyCategory=@cat WHERE PartyID=@id AND PartyCategory IS NULL`);
            p.categorised = true;
        }

        // With no date, the booking is numbered in the year it was entered.
        const bookingNo = await bookingNoForYear(tx, (p.date || new Date()).getFullYear());
        const br = await new sql.Request(tx)
            .input('no', sql.NVarChar(20), bookingNo)
            .input('pid', sql.Int, partyId)
            .input('mid', sql.Int, p.variant.ModelID)
            .input('vid', sql.Int, p.variant.VariantID)
            .input('price', sql.Decimal(18, 2), p.rec.price)
            .input('st', sql.NVarChar(30), STATUS)
            .input('exe', sql.Int, EXECUTIVE)
            .input('exeN', sql.NVarChar(100), USERNAME || 'Historical import')
            .input('bd', sql.DateTime, p.date || null)
            .query(`INSERT INTO dms_SalesBookings
                        (BookingNo, PartyID, VehicleModelID, VehicleVariantID,
                         StandardPrice, NegotiatedPrice, Status,
                         CreatedBy_SalesExecutiveID, CreatedByName,
                         IsHistorical, BookingDate, HistoricalEnteredAt, CreatedAt)
                    OUTPUT INSERTED.BookingID
                    VALUES (@no, @pid, @mid, @vid, @price, @price, @st, @exe, @exeN,
                            1, @bd, GETDATE(), ISNULL(@bd, GETDATE()))`);
        const bookingId = br.recordset[0].BookingID;

        await new sql.Request(tx)
            .input('bid', sql.Int, bookingId)
            .input('to', sql.NVarChar(30), STATUS)
            .input('emp', sql.Int, EXECUTIVE)
            .input('name', sql.NVarChar(100), USERNAME || 'Historical import')
            .input('reason', sql.NVarChar(sql.MAX),
                   `Historical booking imported from the customer sheet (row ${p.rec.excelRow}) `
                   + (p.date ? `for a deal dated ${iso(p.date)}. ` : 'with no date yet — to be set on the booking page. ')
                   + `Payments are linked to vouchers already in the ledger; `
                   + `nothing is posted to the GL and no staff incentive is raised.`)
            .query(`INSERT INTO dms_BookingStateTransitions
                        (BookingID, FromState, ToState, ActorEmployeeID, ActorName, ActorRole, Reason)
                    VALUES (@bid, 'Historical', @to, @emp, @name, 'Import', @reason)`);

        await tx.commit();
        return { bookingNo, bookingId };
    } catch (err) {
        await tx.rollback();
        throw err;
    }
}

/** Shows who could be picked, when what was given matches nothing. */
async function listEmployees(pool, like = null) {
    const rq = pool.request();
    let where = '';
    if (like) { rq.input('q', sql.NVarChar(200), `%${like}%`); where = 'WHERE EmployeeName LIKE @q'; }
    const r = await rq.query(`SELECT TOP 30 EmployeeID, EmployeeName FROM gen_EmployeeInfo
                              ${where} ORDER BY EmployeeName`);
    if (!r.recordset.length) { console.error('  (no employees matched)'); return; }
    console.error('  id     name');
    r.recordset.forEach(e => console.error(`  ${String(e.EmployeeID).padEnd(6)} ${e.EmployeeName}`));
}

/** Takes an employee id, or a piece of a name to search for. */
async function resolveExecutive(pool, arg) {
    const asId = parseInt(arg);
    if (String(asId) === String(arg).trim()) {
        const r = await pool.request().input('id', sql.Int, asId)
            .query(`SELECT EmployeeID, EmployeeName FROM gen_EmployeeInfo WHERE EmployeeID=@id`);
        if (r.recordset.length) return r.recordset[0];
        console.error(`\nThere is no employee ${asId}.\n`);
        await listEmployees(pool);
        return null;
    }
    const r = await pool.request().input('q', sql.NVarChar(200), `%${arg}%`)
        .query(`SELECT EmployeeID, EmployeeName FROM gen_EmployeeInfo
                WHERE EmployeeName LIKE @q ORDER BY EmployeeName`);
    if (r.recordset.length === 1) return r.recordset[0];
    if (!r.recordset.length) {
        console.error(`\nNo employee matches "${arg}". Some of the names on file:\n`);
        await listEmployees(pool);
        return null;
    }
    console.error(`\n"${arg}" matches ${r.recordset.length} employees — be more specific, or give the id:\n`);
    await listEmployees(pool, arg);
    return null;
}

// ---------------------------------------------------------------------------
(async () => {
    console.log('DealerDesk — historical booking import');
    console.log('file : ' + FILE);
    console.log('mode : ' + (COMMIT ? 'COMMIT — this writes to the database' : 'DRY RUN — nothing is written'));

    const { sheetName, hasDateColumn, rows } = readSheet(FILE);
    console.log(`sheet: ${sheetName} — ${rows.length} customer rows\n`);

    if (!hasDateColumn) {
        console.log('Note: there is no BOOKING DATE column in this sheet, so every booking goes on');
        console.log('      record without one. Staff set the date afterwards on the booking page.\n');
    }

    const pool = await getPool();
    const look = await loadLookups(pool);
    const plans = rows.map(r => planRow(r, look));

    // ---- what is in the way ----
    const blocked = plans.filter(p => p.action === 'blocked');
    if (blocked.length) {
        const byProblem = {};
        blocked.forEach(p => p.problems.forEach(t => {
            const kind = t.replace(/".*?"/, '"…"').replace(/account \S+/, 'account …');
            (byProblem[kind] = byProblem[kind] || []).push(p);
        }));
        console.log('BLOCKED ROWS');
        for (const [kind, ps] of Object.entries(byProblem)) {
            console.log(`  ${String(ps.length).padStart(3)}  ${kind}`);
            [...new Set(ps.map(p => p.problems.find(t => t.replace(/".*?"/, '"…"').replace(/account \S+/, 'account …') === kind)))]
                .slice(0, 12).forEach(t => console.log(`         ${t}`));
        }
        console.log('');
    }

    const ambiguous = plans.filter(p => p.ambiguous);
    if (ambiguous.length) {
        console.log(`DATES THAT COULD BE READ EITHER WAY (${ambiguous.length}) — check these:`);
        ambiguous.slice(0, 10).forEach(p => console.log(`  row ${String(p.rec.excelRow).padStart(3)}  ${p.ambiguous}`));
        console.log('');
    }

    // ---- what would be done ----
    const doable = plans.filter(p => p.action === 'booking' || p.action === 'party+booking');
    for (const p of doable) {
        const done = await alreadyImported(pool, p.party?.PartyID || -1, p.variant.VariantID, p.date);
        if (done) { p.action = 'already'; p.note = `already on record as ${done}`; }
    }
    const toDo = plans.filter(p => p.action === 'booking' || p.action === 'party+booking');

    console.log('PLAN');
    toDo.slice(0, 200).forEach(p => console.log(
        `  row ${String(p.rec.excelRow).padStart(3)}  ${p.rec.ac.padEnd(10)} ${p.rec.name.slice(0, 34).padEnd(35)}`
        + `${(p.date ? iso(p.date) : 'no date').padEnd(11)} ${money(p.rec.price).padStart(12)}  `
        + (p.action === 'party+booking' ? 'create customer + booking' : 'booking (customer exists)')));

    const counts = plans.reduce((m, p) => { m[p.action] = (m[p.action] || 0) + 1; return m; }, {});
    console.log('\nSUMMARY');
    console.log(`  bookings to create        ${toDo.length}`);
    console.log(`  customers to create       ${plans.filter(p => p.action === 'party+booking').length}`);
    console.log(`  customers already there   ${plans.filter(p => p.action === 'booking').length}`);
    console.log(`  already imported          ${counts.already || 0}`);
    console.log(`  duplicate rows skipped    ${plans.filter(p => p.rec.duplicateOf).length}`);
    console.log(`  blocked                   ${blocked.length}`);
    const undated = toDo.filter(p => !p.date).length;
    console.log(`  without a booking date    ${undated}${undated ? '   <-- set these on the booking page afterwards' : ''}`);
    console.log(`  total value               PKR ${money(toDo.reduce((s, p) => s + p.rec.price, 0))}`);

    if (!COMMIT) {
        console.log('\nNothing was written. To import, add --commit and say who handled these deals:');
        console.log('  --commit --executive "part of their name"        (or their employee id)');
        process.exit(0);
    }

    // ---- who handled these deals ----
    if (!EXECUTIVE_ARG) {
        console.error('\n--executive is required for --commit: every booking records who handled it.');
        console.error('Give an employee id, or part of a name in quotes.\n');
        await listEmployees(pool);
        process.exit(1);
    }
    const chosen = await resolveExecutive(pool, EXECUTIVE_ARG);
    if (!chosen) process.exit(1);
    EXECUTIVE = chosen.EmployeeID;
    USERNAME = USERNAME || chosen.EmployeeName;
    console.log(`\nrecording these against: ${chosen.EmployeeName} (employee ${EXECUTIVE})`);
    if (blocked.length && !PARTIAL) {
        console.error(`\n${blocked.length} rows are blocked. Fix them, or re-run with --partial to import only the ${toDo.length} that are ready.`);
        process.exit(1);
    }

    console.log('\nIMPORTING…');
    let ok = 0, failed = 0;
    for (const p of toDo) {
        try {
            const r = await importOne(pool, p);
            ok++;
            console.log(`  ${r.bookingNo}  row ${String(p.rec.excelRow).padStart(3)}  ${p.rec.name.slice(0, 40)}`
                        + (p.createdParty ? '  (customer created)' : '')
                        + (p.categorised ? '  (categorised)' : ''));
        } catch (err) {
            failed++;
            console.error(`  FAILED row ${p.rec.excelRow} ${p.rec.name}: ${err.message}`);
        }
    }
    console.log(`\nimported ${ok}, failed ${failed}, skipped ${plans.length - toDo.length}`);
    process.exit(failed ? 1 : 0);
})().catch(err => { console.error('\nCRASHED:', err.message); process.exit(1); });
