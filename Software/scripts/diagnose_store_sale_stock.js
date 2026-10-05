/**
 * Why a Store Sale cannot be found in the Item Ledger.
 *
 * Owner report 2026-10-05: store sales 00907 and 00863 do not show up in the
 * part ledger.
 *
 * Two separate things can be going on, and this tells them apart.
 *
 * 1. THE NUMBER. The Item Ledger is built from stock movements, not from the
 *    sale. sp_SaveStoreSale stamps each movement with
 *    StockIONo = MAX(StockIONo) + 1 -- a running serial shared with job-card
 *    issues, GRNs and everything else -- and records NOTHING that ties the
 *    movement back to the sale. The ledger's reference column therefore shows
 *    that serial, never 'SAL-00907'. Searching the ledger for the invoice
 *    number will never find it, for ANY store sale.
 *
 * 2. THE MOVEMENT ITSELF. updateStoreSale rewrites data_StoreSaleDetail but
 *    never touches the stock rows, so a sale that was unfinalized, edited and
 *    saved again keeps its ORIGINAL stock movement: a line added in the edit
 *    never leaves stock at all, a removed line stays out, a changed quantity
 *    is not applied, and a changed sale date leaves the movement on the old
 *    date where a ledger run for the new date will not see it.
 *
 * Because nothing links the two, this matches a sale to its movement on
 * date + warehouse + item, which is how they are actually written. A line
 * reported as missing really is absent from that item's ledger for that day.
 *
 * Read-only -- it changes nothing.
 *
 *   node scripts\diagnose_store_sale_stock.js 00907 00863
 *   node scripts\diagnose_store_sale_stock.js SAL-00907 907
 *   node scripts\diagnose_store_sale_stock.js            (scans them all)
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const q2 = (n) => Number(n || 0).toFixed(2);
const day = (v) => v ? new Date(v).toISOString().slice(0, 10) : null;
const dt = (v) => day(v) || '—';

// '00907' / '907' / 'SAL-00907' / 'sal-907' all mean the same sale.
async function findSales(pool, refs) {
    if (!refs.length) {
        return (await pool.request().query(
            `SELECT SaleID, InvoiceNo, SaleDate, IsFinalized, WHID, PartyID
             FROM data_StoreSaleInfo ORDER BY SaleID`)).recordset;
    }
    const out = [];
    for (const ref of refs) {
        const digits = String(ref).replace(/\D/g, '');
        const r = await pool.request()
            .input('ref',   sql.NVarChar(100), ref)
            .input('padded', sql.NVarChar(100), digits ? 'SAL-' + digits.padStart(5, '0') : '~none~')
            .input('id',    sql.Int, digits ? parseInt(digits, 10) : -1)
            .query(`SELECT SaleID, InvoiceNo, SaleDate, IsFinalized, WHID, PartyID
                    FROM   data_StoreSaleInfo
                    WHERE  InvoiceNo = @ref OR InvoiceNo = @padded OR SaleID = @id
                    ORDER BY SaleID`);
        if (!r.recordset.length) console.log(`\n!! no store sale matches "${ref}"`);
        for (const row of r.recordset) if (!out.some(o => o.SaleID === row.SaleID)) out.push(row);
    }
    return out;
}

async function report(pool, sale, verbose) {
    const lines = (await pool.request().input('id', sql.Int, sale.SaleID).query(`
        SELECT d.ItemID, SUM(d.Quantity) AS Quantity,
               MAX(i.ManualNumber) AS PartNumber, MAX(i.ItenName) AS ItemName
        FROM   data_StoreSaleDetail d
        LEFT   JOIN InventItems i ON i.ItemId = d.ItemID
        WHERE  d.SaleID = @id
        GROUP  BY d.ItemID`)).recordset;

    // Every Sale-type stock-out in that warehouse on that date, whole
    // movements at a time. Nothing links a movement to a sale, so the only
    // confident identification is a movement whose lines are exactly this
    // sale's lines.
    const sameDay = lines.length ? (await pool.request()
        .input('d',  sql.Date, day(sale.SaleDate))
        .input('wh', sql.Int,  sale.WHID)
        .query(`
            SELECT oi.StockIOID, oi.StockIONo, od.ItemId, od.Quantity,
                   i.ManualNumber AS PartNumber
            FROM   data_StockInOutInfo   oi
            JOIN   data_StockInOutDetail od ON od.StockIOID = oi.StockIOID
            LEFT   JOIN InventItems      i  ON i.ItemId     = od.ItemId
            WHERE  oi.StockType = 'Sale'
              AND  oi.StockIODate = @d
              AND  (@wh IS NULL OR oi.WHID = @wh)`)).recordset : [];

    const byMovement = new Map();
    for (const m of sameDay) {
        if (!byMovement.has(m.StockIOID)) byMovement.set(m.StockIOID, { no: m.StockIONo, lines: [] });
        byMovement.get(m.StockIOID).lines.push(m);
    }

    // A fingerprint of "which items, how many of each", so a movement can be
    // compared with the invoice as a whole.
    const fingerprint = (rows, qtyOf) => rows
        .map(x => `${x.ItemID ?? x.ItemId}:${Math.abs(Number(qtyOf(x)) || 0).toFixed(3)}`)
        .sort().join('|');
    const saleFp = fingerprint(lines, x => x.Quantity);
    let paired = null;
    for (const [ioId, mv] of byMovement) {
        const rolled = [...mv.lines.reduce((m, x) => m.set(x.ItemId, (m.get(x.ItemId) || 0) + Math.abs(Number(x.Quantity) || 0)), new Map())]
            .map(([ItemId, Quantity]) => ({ ItemId, Quantity }));
        if (fingerprint(rolled, x => x.Quantity) === saleFp) { paired = { ioId, ...mv }; break; }
    }

    const problems = [];
    let dayShort = null;
    if (!paired && lines.length) {
        // Fall back to the day as a whole: everything sold that day against
        // everything that left stock that day, for this sale's items. This
        // cannot name which sale is at fault, only that the day is short.
        const soldDay = (await pool.request()
            .input('d', sql.Date, day(sale.SaleDate))
            .input('wh', sql.Int, sale.WHID)
            .query(`SELECT d.ItemID, SUM(d.Quantity) AS Qty
                    FROM   data_StoreSaleDetail d
                    JOIN   data_StoreSaleInfo   s ON s.SaleID = d.SaleID
                    WHERE  CAST(s.SaleDate AS DATE) = @d
                      AND  (@wh IS NULL OR s.WHID = @wh)
                      AND  d.ItemID IN (${lines.map(l => l.ItemID).join(',')})
                    GROUP  BY d.ItemID`)).recordset;
        const movedDay = new Map();
        for (const m of sameDay) movedDay.set(m.ItemId, (movedDay.get(m.ItemId) || 0) + Math.abs(Number(m.Quantity) || 0));

        dayShort = [];
        for (const s of soldDay) {
            const sold = Number(s.Qty) || 0;
            const moved = movedDay.get(s.ItemID) || 0;
            if (moved + 0.0001 < sold) {
                const part = lines.find(l => l.ItemID === s.ItemID)?.PartNumber || `item ${s.ItemID}`;
                dayShort.push(`${part}: ${q2(sold)} sold on ${dt(sale.SaleDate)}, only ${q2(moved)} left stock — ${q2(sold - moved)} never reached the ledger`);
            }
        }
        if (!sameDay.length) {
            problems.push(`NOTHING LEFT STOCK on ${dt(sale.SaleDate)} in this warehouse — this sale is genuinely absent from the item ledgers`);
        } else if (dayShort.length) {
            problems.push(...dayShort);
        } else {
            problems.push(`its exact lines do not match any single movement that day, though the day as a whole balances — it was probably edited after it was saved`);
        }
    }

    if (!verbose && !problems.length) return problems;

    const serials = paired ? [paired.no] : [...new Set(sameDay.map(m => m.StockIONo))];
    const moves = paired ? paired.lines : sameDay.filter(m => lines.some(l => l.ItemID === m.ItemId));
    console.log(`\n=== ${sale.InvoiceNo || '(no invoice no)'}  ·  SaleID ${sale.SaleID}  ·  ${dt(sale.SaleDate)}  ·  ${sale.IsFinalized ? 'Finalized' : 'NOT finalized'} ===`);
    console.log(`  invoice lines (${lines.length}):`);
    for (const l of lines) console.log(`    ${String(l.PartNumber || '').padEnd(22)} qty ${q2(l.Quantity)}   ${l.ItemName || ''}`);
    console.log(paired
        ? `  matched to one stock movement, line for line (${moves.length}):`
        : `  could NOT be matched to a single movement. Sale-type stock-outs of its items that day (${moves.length}):`);
    for (const m of moves) console.log(`    ${String(m.PartNumber || '').padEnd(22)} qty ${q2(m.Quantity)}   ledger ref "${m.StockIONo}"`);

    console.log('  IN THE ITEM LEDGER THIS SALE IS NOT CALLED ' + (sale.InvoiceNo || '?') + '.');
    console.log(serials.length
        ? `    Look under Type "Sale" on ${dt(sale.SaleDate)}, reference ${serials.map(s => `"${s}"`).join(' / ')}.`
        : '    There is no movement to look under — see the problems below.');

    if (problems.length) {
        console.log('  PROBLEMS:');
        for (const p of problems) console.log(`    - ${p}`);
        console.log('    A sale that was unfinalized, edited and saved again keeps its original');
        console.log('    stock movement — updateStoreSale does not rewrite it.');
        if (dayShort && dayShort.length) {
            console.log('    Nothing links a movement to a sale, so the shortfall is for the whole');
            console.log('    day — another sale on the same date could be the one at fault.');
        }
    } else {
        console.log('  Its stock movement is present and matches the invoice line for line.');
    }
    return problems;
}

(async () => {
    try {
        const refs = process.argv.slice(2);
        const pool = await getPool();
        const sales = await findSales(pool, refs);
        if (!sales.length) { console.log('Nothing to check.'); process.exit(0); }

        if (refs.length) {
            for (const s of sales) await report(pool, s, true);
        } else {
            console.log(`Scanning ${sales.length} store sales for stock that disagrees with the invoice…`);
            let bad = 0;
            for (const s of sales) {
                const problems = await report(pool, s, false);
                if (problems.length) {
                    bad++;
                    console.log(`\n${s.InvoiceNo} (SaleID ${s.SaleID}, ${dt(s.SaleDate)}):`);
                    for (const p of problems) console.log(`    - ${p}`);
                }
            }
            console.log(`\n${bad} of ${sales.length} store sales have a stock problem.`);
            console.log('Note: none of them show their invoice number in the Item Ledger — that is');
            console.log('separate, and true of every store sale.');
        }
        process.exit(0);
    } catch (err) {
        console.error('diagnose_store_sale_stock:', err.message);
        process.exit(1);
    }
})();
