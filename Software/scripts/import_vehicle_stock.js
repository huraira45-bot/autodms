/**
 * Load a sheet of vehicle stock into dms_Vehicle.
 *
 * Owner ask 2026-10-06: 72 chassis from the stock sheet onto live.
 *
 * Dry run by default. Nothing is written until --apply, and even then only
 * rows that come back OK are inserted -- anything the script cannot resolve is
 * reported and skipped rather than guessed at, because a wrong VariantID on a
 * chassis is far more expensive to unpick than a row that was never loaded.
 *
 *   node scripts\import_vehicle_stock.js
 *   node scripts\import_vehicle_stock.js --apply
 *   node scripts\import_vehicle_stock.js --file scripts\data\other.tsv
 *
 * The sheet's columns:
 *   Model | Chassis | Engine | Colour | Phone | Date1 | Date2 | Marker | X | Y | StockStatus
 *
 * How each maps:
 *   StockStatus  IN STOCK / INSTOCK -> AtDealer,  TRANSIT -> InTransit
 *   Date2        ReceivedAt when present, else Date1
 *   Marker       BOOKING / Allocation are NOT imported as state. Every row goes
 *                in as OpenAllocation: the sheet's marker says somebody has
 *                spoken for the car, but there is no booking record behind it,
 *                and a vehicle flagged Booked with no CurrentBookingID reads as
 *                allocated to nobody. The rows carrying a marker and a phone
 *                are listed at the end so they can be booked properly in the
 *                app, which is what creates the paperwork.
 *   Phone        reported, never stored -- dms_Vehicle has nowhere for it.
 */
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');

const APPLY = process.argv.includes('--apply');
const fileArg = process.argv.indexOf('--file');
const FILE = fileArg > -1 && process.argv[fileArg + 1]
    ? path.resolve(process.argv[fileArg + 1])
    : path.join(__dirname, 'data', 'vehicle_stock_2026_10_06.tsv');

// "KARVAAN POWER PLUS 1.2L (UG)" and "KARVAAN POWER PLUS UG 1.2L" are the same
// car typed twice. Strip everything that is not a letter or digit and sort the
// words, so word order and punctuation stop mattering.
const norm = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
const bag = (s) => norm(s).split(' ').filter(Boolean).sort().join(' ');
const tokens = (s) => new Set(norm(s).split(' ').filter(Boolean));

// How much of the shorter name the two share. 1 means one name contains every
// word of the other.
function overlap(a, b) {
    const A = tokens(a), B = tokens(b);
    if (!A.size || !B.size) return 0;
    let hit = 0;
    for (const t of A) if (B.has(t)) hit++;
    return hit / Math.min(A.size, B.size);
}

// A chassis is 17 characters on every real VIN in this sheet. The short
// numeric ones are a stock code somebody typed into the wrong column.
const chassisLooksReal = (c) => /^[A-Z0-9]{12,20}$/i.test(String(c || '').trim());

const parseDate = (s) => {
    const m = /^(\d{2})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    if (!m) return null;
    // dd-mm-yy, and every year in this sheet is 2025 or 2026.
    return new Date(Date.UTC(2000 + Number(m[3]), Number(m[2]) - 1, Number(m[1])));
};

const STATUS = { 'IN STOCK': 'AtDealer', 'INSTOCK': 'AtDealer', 'TRANSIT': 'InTransit' };

function readSheet(file) {
    const lines = fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(l => l.trim());
    const head = lines.shift().split('\t');
    return lines.map((line, i) => {
        const c = line.split('\t');
        const row = {};
        head.forEach((h, j) => { row[h] = (c[j] || '').trim(); });
        row.__line = i + 2;
        return row;
    });
}

(async () => {
    try {
        const rows = readSheet(FILE);
        const pool = await getPool();

        const variants = (await pool.request().query(`
            SELECT v.VariantID, v.VariantName, v.VariantCode, m.ModelName
            FROM   dms_VehicleVariant v
            LEFT   JOIN dms_VehicleModel m ON m.ModelID = v.ModelID`)).recordset;
        if (!variants.length) throw new Error('No variants defined. Set up models and variants before importing stock.');

        const existing = new Map();
        for (const v of (await pool.request().query(
            `SELECT VehicleID, ChasisNo, Status FROM dms_Vehicle`)).recordset) {
            existing.set(norm(v.ChasisNo).replace(/ /g, ''), v);
        }

        // Index the variants by their full "model + variant" name and by the
        // variant name alone, since the sheet uses both shapes.
        const byBag = new Map();
        for (const v of variants) {
            for (const label of [`${v.ModelName || ''} ${v.VariantName}`, v.VariantName, v.VariantCode]) {
                const k = bag(label);
                if (k && !byBag.has(k)) byBag.set(k, v);
            }
        }

        const match = (modelText) => {
            const exact = byBag.get(bag(modelText));
            if (exact) return { variant: exact, how: 'exact', score: 1 };
            let best = null, bestScore = 0, tied = false;
            for (const v of variants) {
                const score = Math.max(
                    overlap(modelText, `${v.ModelName || ''} ${v.VariantName}`),
                    overlap(modelText, v.VariantName));
                if (score > bestScore) { best = v; bestScore = score; tied = false; }
                else if (score === bestScore && score > 0 && best && v.VariantID !== best.VariantID) tied = true;
            }
            if (!best || bestScore < 0.6) return { variant: null, how: 'no match', score: bestScore };
            if (tied) return { variant: null, how: 'ambiguous', score: bestScore };
            return { variant: best, how: bestScore === 1 ? 'contains' : 'closest', score: bestScore };
        };

        const existingEngines = new Map();
        for (const v of (await pool.request().query(
            `SELECT VehicleID, EngineNo FROM dms_Vehicle WHERE EngineNo IS NOT NULL AND EngineNo <> ''`)).recordset) {
            existingEngines.set(norm(v.EngineNo).replace(/ /g, ''), v.VehicleID);
        }

        const seen = new Set(), seenEngines = new Set();
        const planned = [], skipped = [], warnings = [];

        for (const r of rows) {
            const chassis = r.Chassis.toUpperCase();
            const key = norm(chassis).replace(/ /g, '');
            const note = (msg) => warnings.push(`line ${r.__line}  ${chassis || '(no chassis)'} — ${msg}`);

            if (!chassis) { skipped.push({ r, why: 'no chassis number' }); continue; }
            if (!chassisLooksReal(chassis)) {
                skipped.push({ r, why: `"${chassis}" is not a chassis number — looks like a stock code in the wrong column` });
                continue;
            }
            if (existing.has(key)) { skipped.push({ r, why: `already in stock as VehicleID ${existing.get(key).VehicleID} (${existing.get(key).Status})` }); continue; }
            if (seen.has(key)) { skipped.push({ r, why: 'duplicate chassis within the sheet' }); continue; }

            const status = STATUS[r.StockStatus.toUpperCase()];
            if (!status) { skipped.push({ r, why: `stock status "${r.StockStatus}" is not one I can map` }); continue; }

            const m = match(r.Model);
            if (!m.variant) { skipped.push({ r, why: `${m.how} for model "${r.Model}" (best ${(m.score * 100).toFixed(0)}%)` }); continue; }
            if (m.how === 'closest') note(`model "${r.Model}" matched "${m.variant.ModelName || ''} ${m.variant.VariantName}" at ${(m.score * 100).toFixed(0)}% — check it`);

            // EngineNo is NOT NULL and UNIQUE, so blanks collide with each
            // other the moment there is more than one (caught rehearsing this
            // on dev). A placeholder keyed to the chassis is unique by
            // construction and says plainly that it needs replacing.
            const engine = r.Engine || `PENDING-${chassis}`;
            const eKey = norm(engine).replace(/ /g, '');
            if (!r.Engine) note(`no engine number — going in as ${engine}, replace it when the papers arrive`);
            if (existingEngines.has(eKey)) {
                skipped.push({ r, why: `engine "${engine}" is already on VehicleID ${existingEngines.get(eKey)}` });
                continue;
            }
            if (seenEngines.has(eKey)) { skipped.push({ r, why: `engine "${engine}" appears twice in the sheet` }); continue; }
            if (r.Engine && r.Engine.length < 10) note(`engine "${r.Engine}" is short for a real engine number`);
            if (r.Phone === 'OVERFLOW') note('the phone cell was unreadable in the sheet (#####) — not imported');
            if (r.Marker) note(`sheet marks this ${r.Marker}${r.Phone && r.Phone !== 'OVERFLOW' ? ` for ${r.Phone}` : ''} — imported as open stock, book it in the app`);

            seen.add(key);
            seenEngines.add(eKey);
            planned.push({
                chassis, engine, colour: r.Colour || null,
                variant: m.variant, status,
                receivedAt: parseDate(r.Date2) || parseDate(r.Date1),
                marker: r.Marker || null, phone: r.Phone && r.Phone !== 'OVERFLOW' ? r.Phone : null,
                line: r.__line,
            });
        }

        console.log(`Sheet: ${path.basename(FILE)} — ${rows.length} rows\n`);
        console.log(`WILL IMPORT (${planned.length})`);
        for (const p of planned) {
            console.log(`  ${p.chassis.padEnd(20)} ${String(p.variant.VariantName).slice(0, 34).padEnd(34)} ${p.status.padEnd(10)} ${p.colour || ''}`);
        }
        if (skipped.length) {
            console.log(`\nSKIPPED (${skipped.length}) — nothing is guessed at`);
            for (const s of skipped) console.log(`  line ${s.r.__line}  ${(s.r.Chassis || '(blank)').padEnd(20)} ${s.why}`);
        }
        if (warnings.length) {
            console.log(`\nWORTH A LOOK (${warnings.length})`);
            for (const w of warnings) console.log(`  ${w}`);
        }

        const marked = planned.filter(p => p.marker);
        if (marked.length) {
            console.log(`\nSPOKEN FOR IN THE SHEET (${marked.length}) — imported as open stock, raise the booking in the app`);
            for (const p of marked) console.log(`  ${p.chassis.padEnd(20)} ${p.marker.padEnd(10)} ${p.phone || '(no phone)'}`);
        }

        if (!APPLY) {
            console.log('\nDRY RUN — nothing written. Re-run with --apply once the matches above look right.');
            process.exit(0);
        }

        let inserted = 0;
        for (const p of planned) {
            await pool.request()
                .input('var', sql.Int, p.variant.VariantID)
                .input('ch',  sql.NVarChar(100), p.chassis)
                .input('en',  sql.NVarChar(100), p.engine)
                .input('col', sql.NVarChar(100), p.colour)
                .input('st',  sql.NVarChar(40), p.status)
                .input('rc',  sql.DateTime, p.receivedAt)
                .query(`INSERT INTO dms_Vehicle
                            (VariantID, ChasisNo, EngineNo, Color, AllocationType, Status, ReceivedAt, CreatedAt, CreatedByName)
                        VALUES (@var, @ch, @en, @col, 'OpenAllocation', @st, @rc, GETDATE(), 'stock sheet import 2026-10-06')`);
            inserted++;
        }
        console.log(`\nImported ${inserted} vehicle(s). Re-run to confirm they now come back as already in stock.`);
        process.exit(0);
    } catch (err) {
        console.error('import_vehicle_stock:', err.message);
        process.exit(1);
    }
})();
