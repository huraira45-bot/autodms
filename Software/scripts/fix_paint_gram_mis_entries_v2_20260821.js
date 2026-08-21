// Corrected v2 of fix_paint_gram_mis_entries_20260820.js. That version tried
// to preserve "current StockValue" while rescaling quantity by a fixed
// amount -- broke down for items whose stock was already mostly drawn down
// at the wrong rate before it ran (produced near-zero AvgCost for 1K ASTAR).
// See revert_paint_gram_fix_20260820.js, which undid that run.
//
// This version instead recomputes what AvgCost SHOULD have been right after
// each bad GRN, blending from the known (trustworthy) state immediately
// BEFORE that GRN -- not from the current, already-depleted live state.
// Only AvgCost is corrected; StockQty is left exactly as it is live right
// now (going-forward only, no attempt to reconcile quantity against the
// mis-costed issues that already happened in between).
//
// 247 NIPPON 2K SLOW THINNER: pre-GRN#17/PGRN-0065 state (11854.0005 @ 1.5490)
//                              + bad GRN (5 x 3400 misread as 5g @ Rs3400)
//                              correctly = 5x3400=17000g @ value 17000
// 202 2K CLEAR:                pre-GRN#20/PGRN-0068 state (12550 @ 1.4254,
//                              carried from the 08-07 PGRN-0060 correction)
//                              + bad GRN (10 x 1000g=10000g @ value 17500)
// 238 2K HARDNER:               pre-GRN#20/PGRN-0068 state (2800.9999 @ 1.9656,
//                              carried from the 08-07 PGRN-0060 correction)
//                              + bad GRN (10 x 500g=5000g @ value 10500)
// 236 1K ASTAR:                 never corrected before -- full history is just
//                              GRN#4 (4x1000=4000g @ 10000) + GRN#69
//                              (3x1000=3000g @ 7500) = 7000g @ 17500 total
//
// Run from Software/: node scripts\fix_paint_gram_mis_entries_v2_20260821.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const ITEMS = [
    {
        label: 'NIPPON 2K SLOW THINNER',
        paintItemID: 247,
        expectedCurrentAvg: 2.9819, // value just before this fix (post-revert)
        preQty: 11854.0005, preAvg: 1.5490, badQty: 5, badRate: 3400, gramsPerUnit: 3400,
        note: 'Correction: PGRN-0065 rate re-derived from pre-GRN baseline (5 cans x Rs3400, not 5g)',
    },
    {
        label: '2K CLEAR',
        paintItemID: 202,
        expectedCurrentAvg: 4.0868,
        preQty: 12550.0000, preAvg: 1.4254, badQty: 10, badRate: 1750, gramsPerUnit: 1000,
        note: 'Correction: PGRN-0068 rate re-derived from pre-GRN baseline (10 cans x Rs1750, not 10g)',
    },
    {
        label: '2K HARDNER',
        paintItemID: 238,
        expectedCurrentAvg: 7.4185,
        preQty: 2800.9999, preAvg: 1.9656, badQty: 10, badRate: 1050, gramsPerUnit: 500,
        note: 'Correction: PGRN-0068 rate re-derived from pre-GRN baseline (10 cans x Rs1050, not 10g)',
    },
    {
        label: '1K ASTAR (NAX LUMINA)',
        paintItemID: 236,
        expectedCurrentAvg: 21.1967,
        preQty: 0, preAvg: 0, badQty: 7, badRate: null, gramsPerUnit: 1000,
        // Two bad GRNs, blended together from zero (item never previously corrected).
        badGrns: [{ qty: 4, rate: 2500 }, { qty: 3, rate: 2500 }],
        note: 'Correction: PGRN-0004 + PGRN-0069 rate re-derived (7 cans total x Rs2500, not 7g)',
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

            // paint_Item has no PaintWHID column -- resolve from the item's own ledger.
            const whRes = await new sql.Request(tx).input('id', sql.Int, it.paintItemID)
                .query('SELECT TOP 1 PaintWHID FROM paint_StockLedger WHERE PaintItemID=@id ORDER BY LedgerID DESC');
            const whId = whRes.recordset[0]?.PaintWHID;
            if (!whId) throw new Error(`Could not resolve warehouse for item ${it.paintItemID} from its ledger.`);

            const curQty = Number(row.StockQty);
            const curAvg = Number(row.AvgCost);
            if (Math.abs(curAvg - it.expectedCurrentAvg) > 0.01) {
                throw new Error(
                    `${it.label} (${row.PaintCode}): AvgCost changed since diagnosis -- ` +
                    `expected ${it.expectedCurrentAvg}, found ${curAvg}. Stopping -- re-diagnose before correcting.`
                );
            }

            let targetAvg;
            if (it.badGrns) {
                let qty = it.preQty, val = it.preQty * it.preAvg;
                for (const g of it.badGrns) { qty += g.qty * it.gramsPerUnit; val += g.qty * g.rate; }
                targetAvg = round4(val / qty);
            } else {
                const preValue = round2(it.preQty * it.preAvg);
                const addGrams = it.badQty * it.gramsPerUnit;
                const addValue = it.badQty * it.badRate;
                targetAvg = round4((preValue + addValue) / (it.preQty + addGrams));
            }

            // Only the rate changes -- StockQty (curQty) is left exactly as-is.
            const dVal = round2((targetAvg - curAvg) * curQty);

            await new sql.Request(tx)
                .input('it',  sql.Int,           it.paintItemID)
                .input('wh',  sql.Int,           whId)
                .input('src', sql.NVarChar(20),  'ADJUSTMENT')
                .input('dq',  sql.Decimal(18,4), 0)
                .input('uc',  sql.Decimal(18,4), targetAvg)
                .input('dv',  sql.Decimal(18,2), dVal)
                .input('rq',  sql.Decimal(18,4), curQty)
                .input('ra',  sql.Decimal(18,4), targetAvg)
                .input('nt',  sql.NVarChar(200), it.note)
                .query(`INSERT INTO paint_StockLedger
                            (PaintItemID, PaintWHID, SourceType, QuantityDelta, UnitCost, ValueDelta,
                             RunningQty, RunningAvgCost, Note)
                        VALUES (@it, @wh, @src, @dq, @uc, @dv, @rq, @ra, @nt)`);

            await new sql.Request(tx)
                .input('id', sql.Int, it.paintItemID)
                .input('a',  sql.Decimal(18,4), targetAvg)
                .query(`UPDATE paint_Item SET AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@id`);

            console.log(`${it.label} (${row.PaintCode}): qty stays ${curQty}, AvgCost ${curAvg} -> ${targetAvg} (StockValue swing ${dVal})`);
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
