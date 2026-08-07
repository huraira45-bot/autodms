// One-off: corrects PGRN-0063 (2026-08-07)'s stock-quantity mistake for six
// paint items, all received against their raw weight UOM ("Gram") when the
// operator meant pieces/cans (each item has a GramsPerUnit conversion set):
//   239 SCRAPPER STEEL       (1000 g/unit)   228 THINER LOCAL (R-M) (800 g/unit)
//   224 DECO BLACK PAINT     (1000 g/unit)   225 SIPRIT WIPE        (700 g/unit)
//   237 SILICON RM            (900 g/unit)   247 NIPPON 2K SLOW THINNER (3400 g/unit)
//
// Same root cause as the 2K CLEAR/HARDENER fix (migrations 118 +
// fix_2k_clear_hardner_avgcost.js): GRN Quantity/Rate were entered as
// piece-count/price-per-piece but saved against the gram UOM directly.
//
// Two of these items (224 DECO BLACK PAINT, 228 THINER LOCAL) were ALSO
// hit by an earlier, identical mis-entry on GRN #10 (2026-07-30) that was
// never corrected -- items 225 and 247 WERE fixed at the time (see the
// SourceDocID=0 ISSUE_ADJ rows in their ledger history), but 224 and 228
// were missed. This script's target values already fold in that missed
// 2026-07-30 correction for those two, so this is the only patch needed --
// no separate historical fix required.
//
// Four of the six (224, 225, 237, 247) are currently reserved as DRAFT
// lines on the still-OPEN Paint Issue PI-0226 (PaintIssueID=94, Locked=0)
// -- nothing has posted to a job card or the GL yet. Targets below are
// computed net of that current draft reservation, matching the same
// convention as the 2K CLEAR/HARDENER fix. After this runs, remove and
// re-add those 4 lines on PI-0226 (in addition to the already-known 2K
// CLEAR / 2K HARDENER lines) so they pick up the corrected cost -- do this
// BEFORE posting/finalizing the issue.
//
// Requires migration 118 (adds 'ADJUSTMENT' to paint_StockLedger's
// SourceType check constraint) to already be applied.
//
// Run from Software/: node scripts\fix_pgrn0063_gram_mis_entries.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const GRN_ID = 15; // PGRN-0063 -- source of the warehouse for all six items

const ITEMS = [
    {
        label: 'SCRAPPER STEEL',
        paintItemID: 239,
        expectedCurrentQty: 18.0000,
        expectedCurrentAvg: 482.2222,
        targetQty: 16002.0000,
        targetAvg: 0.5424,
    },
    {
        label: 'THINER LOCAL (R-M)',
        paintItemID: 228,
        expectedCurrentQty: 10.0001,
        expectedCurrentAvg: 379.9962,
        targetQty: 8000.0001,
        targetAvg: 0.4750,
    },
    {
        label: 'DECO BLACK PAINT',
        paintItemID: 224,
        expectedCurrentQty: 4.0000,
        expectedCurrentAvg: 6.4075,
        targetQty: 4002.0000,
        targetAvg: 1.1711,
    },
    {
        label: 'SIPRIT WIPE',
        paintItemID: 225,
        expectedCurrentQty: 724.0000,
        expectedCurrentAvg: 5.7345,
        targetQty: 3520.0000,
        targetAvg: 2.0230,
    },
    {
        label: 'SILICON RM',
        paintItemID: 237,
        expectedCurrentQty: 7.0000,
        expectedCurrentAvg: 8.1686,
        targetQty: 906.0000,
        targetAvg: 2.2270,
    },
    {
        label: 'NIPPON 2K SLOW THINNER',
        paintItemID: 247,
        expectedCurrentQty: 1258.0005,
        expectedCurrentAvg: 3.3612,
        targetQty: 14854.0005,
        targetAvg: 1.0000,
    },
];

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const whRes = await new sql.Request(tx).input('id', sql.Int, GRN_ID)
            .query('SELECT PaintWHID FROM paint_GRN WHERE PaintGRNID=@id');
        const whId = whRes.recordset[0]?.PaintWHID;
        if (!whId) throw new Error(`Could not resolve warehouse from GRN ${GRN_ID}.`);

        for (const it of ITEMS) {
            const row = (await new sql.Request(tx).input('id', sql.Int, it.paintItemID)
                .query('SELECT PaintCode, StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@id')).recordset[0];
            if (!row) throw new Error(`Paint item ${it.paintItemID} not found.`);

            const curQty = Number(row.StockQty);
            const curAvg = Number(row.AvgCost);
            if (Math.abs(curQty - it.expectedCurrentQty) > 0.01 || Math.abs(curAvg - it.expectedCurrentAvg) > 0.01) {
                throw new Error(
                    `${it.label} (${row.PaintCode}): current state changed since diagnosis -- ` +
                    `expected StockQty=${it.expectedCurrentQty}/AvgCost=${it.expectedCurrentAvg}, ` +
                    `found StockQty=${curQty}/AvgCost=${curAvg}. Stopping -- re-diagnose before correcting.`
                );
            }

            const dQty = round4(it.targetQty - curQty);
            const dVal = round2((it.targetQty * it.targetAvg) - round2(curQty * curAvg));
            const unitCost = dQty > 0 ? round4(dVal / dQty) : 0;

            await new sql.Request(tx)
                .input('it',  sql.Int,           it.paintItemID)
                .input('wh',  sql.Int,           whId)
                .input('src', sql.NVarChar(20),  'ADJUSTMENT')
                .input('dq',  sql.Decimal(18,4), dQty)
                .input('uc',  sql.Decimal(18,4), unitCost)
                .input('dv',  sql.Decimal(18,2), dVal)
                .input('rq',  sql.Decimal(18,4), it.targetQty)
                .input('ra',  sql.Decimal(18,4), it.targetAvg)
                .input('nt',  sql.NVarChar(200), `Correction: PGRN-0063 received as grams instead of pieces (GramsPerUnit conversion missed)`)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note)
                        VALUES (@it, @wh, @src, @dq, @uc, @dv, @rq, @ra, @nt)`);

            await new sql.Request(tx)
                .input('id', sql.Int, it.paintItemID)
                .input('q',  sql.Decimal(18,4), it.targetQty)
                .input('a',  sql.Decimal(18,4), it.targetAvg)
                .query(`UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@id`);

            console.log(`${it.label} (${row.PaintCode}): ${curQty} @ ${curAvg} -> ${it.targetQty} @ ${it.targetAvg} (dQty=${dQty}, dVal=${dVal})`);
        }

        await tx.commit();
        console.log('\nDone. Remember: on PI-0226, remove and re-add the DECO BLACK PAINT, SIPRIT WIPE, SILICON RM, and NIPPON 2K SLOW THINNER lines (plus the already-known 2K CLEAR / 2K HARDENER lines) before posting it, so they all pick up the corrected cost.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
