// One-off: corrects four paint items whose AvgCost is inflated by GRN lines
// where the operator meant "N cans at Rs/can" but the system recorded it as
// literally N GRAMS at Rs/GRAM (same root cause as fix_2k_clear_hardner_
// avgcost.js and fix_pgrn0063_gram_mis_entries.js — GramsPerUnit conversion
// never applied). Owner report 2026-08-20, JC B&P-1111 / Paint Issue PI-0339
// costing too high.
//
// 202 2K CLEAR              — bad GRN PGRN-0068 (qty=10, GramsPerUnit=1000)
// 238 2K HARDNER            — bad GRN PGRN-0068 (qty=10, GramsPerUnit=500)
// 236 1K ASTAR (NAX LUMINA) — bad GRN PGRN-0004 (qty=4) AND PGRN-0069 (qty=3),
//                             GramsPerUnit=1000 — this item was NEVER corrected before
// 247 NIPPON 2K SLOW THINNER — bad GRN PGRN-0065 (qty=5, GramsPerUnit=3400)
//
// 202/238/247 were each already corrected once before (PGRN-0060 / PGRN-0063
// fixes) but got hit AGAIN by a later GRN after that fix. This script only
// reinterprets the NEW uncorrected GRN(s) — it does not touch the earlier,
// already-correct ADJUSTMENT entries.
//
// Method: total money paid (LineTotal = recorded Qty x recorded Rate) is
// unchanged by the mistake -- only the gram-quantity was undercounted by a
// factor of GramsPerUnit. So StockValue (Qty x AvgCost) stays exactly what
// it is now; only the split between Qty and AvgCost is corrected:
//   targetQty = currentQty + sum(badGrnQty_i x (GramsPerUnit - 1))
//   targetAvg = (currentQty x currentAvg) / targetQty
// Going-forward only (owner decision 2026-08-20): this brings each item's
// CURRENT balance to the correct figure. Historical GRN/Issue rows are left
// exactly as posted.
//
// All 4 items are currently DRAFT lines on two still-OPEN Paint Issues —
// PI-0339 (all 4 items) and PI-0340 (238 + 247 only), both Locked=0.
// Checked every OTHER issue that ever touched these items: all are already
// Locked=1 and were posted BEFORE the bad GRNs landed, at the then-correct
// cost — nothing finalized has the wrong cost baked in. Targets are
// computed from each item's live current StockQty/AvgCost, which already
// nets out both drafts' reservations. After this runs, remove and re-add
// the affected lines on PI-0339 AND PI-0340 so they pick up the corrected
// cost before either is saved/posted.
//
// Requires migration 118 (ADJUSTMENT source type) already applied.
// Run from Software/: node scripts\fix_paint_gram_mis_entries_20260820.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const ITEMS = [
    {
        label: 'NIPPON 2K SLOW THINNER',
        paintItemID: 247,
        expectedCurrentQty: 5509.0005,
        expectedCurrentAvg: 2.9819,
        gramsPerUnit: 3400,
        badGrns: [{ grnNo: 'PGRN-0065', qty: 5 }],
        note: 'Correction: PGRN-0065 received as cans instead of grams (GramsPerUnit conversion missed)',
    },
    {
        label: '2K CLEAR',
        paintItemID: 202,
        expectedCurrentQty: 12560.0000,
        expectedCurrentAvg: 4.0868,
        gramsPerUnit: 1000,
        badGrns: [{ grnNo: 'PGRN-0068', qty: 10 }],
        note: 'Correction: PGRN-0068 received as cans instead of grams (GramsPerUnit conversion missed)',
    },
    {
        label: '2K HARDNER',
        paintItemID: 238,
        expectedCurrentQty: 2810.9999,
        expectedCurrentAvg: 7.4185,
        gramsPerUnit: 500,
        badGrns: [{ grnNo: 'PGRN-0068', qty: 10 }],
        note: 'Correction: PGRN-0068 received as cans instead of grams (GramsPerUnit conversion missed)',
    },
    {
        label: '1K ASTAR (NAX LUMINA)',
        paintItemID: 236,
        expectedCurrentQty: 403.0000,
        expectedCurrentAvg: 21.1964,
        gramsPerUnit: 1000,
        badGrns: [{ grnNo: 'PGRN-0004', qty: 4 }, { grnNo: 'PGRN-0069', qty: 3 }],
        note: 'Correction: PGRN-0004 and PGRN-0069 both received as cans instead of grams (GramsPerUnit conversion missed, item never previously corrected)',
    },
];

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
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

            // Resolve warehouse from the first bad GRN.
            const whRes = await new sql.Request(tx).input('no', sql.NVarChar(50), it.badGrns[0].grnNo)
                .query('SELECT PaintWHID FROM paint_GRN WHERE GRNNo=@no');
            const whId = whRes.recordset[0]?.PaintWHID;
            if (!whId) throw new Error(`Could not resolve warehouse from GRN ${it.badGrns[0].grnNo}.`);

            const extraGrams = it.badGrns.reduce((s, g) => s + g.qty * (it.gramsPerUnit - 1), 0);
            const targetQty = round4(curQty + extraGrams);
            const stockValue = round2(curQty * curAvg);
            const targetAvg = round4(stockValue / targetQty);

            const dQty = round4(targetQty - curQty);
            const dVal = round2((targetQty * targetAvg) - stockValue);
            const unitCost = dQty > 0 ? round4(dVal / dQty) : 0;

            await new sql.Request(tx)
                .input('it',  sql.Int,           it.paintItemID)
                .input('wh',  sql.Int,           whId)
                .input('src', sql.NVarChar(20),  'ADJUSTMENT')
                .input('dq',  sql.Decimal(18,4), dQty)
                .input('uc',  sql.Decimal(18,4), unitCost)
                .input('dv',  sql.Decimal(18,2), dVal)
                .input('rq',  sql.Decimal(18,4), targetQty)
                .input('ra',  sql.Decimal(18,4), targetAvg)
                .input('nt',  sql.NVarChar(200), it.note)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note)
                        VALUES (@it, @wh, @src, @dq, @uc, @dv, @rq, @ra, @nt)`);

            await new sql.Request(tx)
                .input('id', sql.Int, it.paintItemID)
                .input('q',  sql.Decimal(18,4), targetQty)
                .input('a',  sql.Decimal(18,4), targetAvg)
                .query(`UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@id`);

            console.log(`${it.label} (${row.PaintCode}): ${curQty} @ ${curAvg} -> ${targetQty} @ ${targetAvg} (dQty=${dQty}, dVal=${dVal})`);
        }

        await tx.commit();
        console.log('\nDone. Remove and re-add: on PI-0339, all 4 lines (1K ASTAR, 2K CLEAR, 2K HARDNER, NIPPON 2K SLOW THINNER); on PI-0340, the 2K HARDNER and NIPPON 2K SLOW THINNER lines. Do this before saving/posting either issue.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
