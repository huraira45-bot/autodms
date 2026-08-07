// One-off: corrects PGRN-0060's stock-quantity mistake for two paint
// items -- "2K CLEAR" (PaintItemID 202) and "2K HARDNER" (PaintItemID
// 238). Both were received on that GRN against the "Gram (base)" UOM
// with Qty=16, when the operator meant 16 cans/units (both items have
// GramsPerUnit configured: 1000g/can for Clear, 500g/can for Hardener).
// The GRN's total cost paid was correct; only the gram-quantity
// interpretation was wrong, which inflated AvgCost ~12x (Clear) and
// ~420x (Hardener). Confirmed via full stock-ledger history that both
// items were costed reasonably (1.53/g and 2.22/g respectively) right
// up until this one GRN -- not a long-standing problem.
//
// Posts one 'ADJUSTMENT' stock-ledger entry per item (migration 118)
// bringing StockQty/AvgCost to what they should be if the GRN had used
// the correct gram-equivalent quantity, replaying the real issues that
// have happened since (Issue #93's 40g draw on Clear, and the still-
// OPEN PI-0226's current 1360g/15g draws) at the corrected rate. Job
// Card COGS already posted for Issue #93 is deliberately left as-is
// (small $ impact, already closed) -- see chat for the fuller writeup.
//
// After this runs: on the still-OPEN PI-0226, remove and re-add the
// "2K CLEAR" and "2K HARDNER" lines so they pick up the corrected cost
// (the line's stored cost was snapshotted when originally added and
// won't refresh on its own) -- do this BEFORE posting/finalizing it.
//
// Run from Software/: node scripts\fix_2k_clear_hardner_avgcost.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

const ITEMS = [
    {
        label: 'CLEAR',
        paintItemID: 202,
        expectedCurrentQty: 6.0000,
        expectedCurrentAvg: 17.6283,
        targetQty: 15990.0000,
        targetAvg: 1.4254,
    },
    {
        label: 'HARDENER',
        paintItemID: 238,
        expectedCurrentQty: 1.9998,
        expectedCurrentAvg: 925.1275,
        targetQty: 7985.9998,
        targetAvg: 1.9656,
    },
];

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const it of ITEMS) {
            // paint_Item has no PaintWHID column itself; ledger rows are per-warehouse,
            // so the warehouse is resolved separately below from stock ledger history.
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

            const whRes = await new sql.Request(tx).input('id', sql.Int, it.paintItemID)
                .query(`SELECT TOP 1 PaintWHID FROM paint_StockLedger WHERE PaintItemID=@id ORDER BY LedgerID DESC`);
            const whId = whRes.recordset[0]?.PaintWHID;
            if (!whId) throw new Error(`${it.label}: could not resolve a warehouse from stock ledger history.`);

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
                .input('nt',  sql.NVarChar(200), `Correction: PGRN-0060 received as grams instead of cans (GramsPerUnit conversion missed)`)
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
        console.log('\nDone. Remember: on PI-0226, remove and re-add the 2K CLEAR and 2K HARDNER lines before posting it, so they pick up the corrected cost.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
