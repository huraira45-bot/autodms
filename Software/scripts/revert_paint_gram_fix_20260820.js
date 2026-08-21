// Emergency revert of fix_paint_gram_mis_entries_20260820.js's last run --
// that correction produced degenerate near-zero AvgCost for items whose
// stock had already been mostly drawn down at the wrong rate before the fix
// ran. Restores the exact pre-correction StockQty/AvgCost this script's own
// console output reported, then deletes the ADJUSTMENT rows it inserted.
// Run from Software/: node scripts\revert_paint_gram_fix_20260820.js
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const ITEMS = [
    { label: 'NIPPON 2K SLOW THINNER', paintItemID: 247, restoreQty: 5309.0005, restoreAvg: 2.9819 },
    { label: '2K CLEAR',               paintItemID: 202, restoreQty: 9560.0000, restoreAvg: 4.0868 },
    { label: '2K HARDNER',             paintItemID: 238, restoreQty: 960.9999,  restoreAvg: 7.4185 },
    { label: '1K ASTAR (NAX LUMINA)',  paintItemID: 236, restoreQty: 3.0000,    restoreAvg: 21.1967 },
];

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        for (const it of ITEMS) {
            const del = await new sql.Request(tx)
                .input('id', sql.Int, it.paintItemID)
                .query(`DELETE FROM paint_StockLedger
                        WHERE PaintItemID=@id AND SourceType='ADJUSTMENT'
                          AND CreatedAt >= DATEADD(hour, -2, GETDATE())
                          AND Note LIKE 'Correction:%received as cans instead of grams%';
                        SELECT @@ROWCOUNT AS n;`);
            await new sql.Request(tx)
                .input('id', sql.Int, it.paintItemID)
                .input('q',  sql.Decimal(18,4), it.restoreQty)
                .input('a',  sql.Decimal(18,4), it.restoreAvg)
                .query(`UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@id`);
            console.log(`${it.label}: restored to ${it.restoreQty} @ ${it.restoreAvg} (deleted ${del.recordset[0].n} adjustment row(s))`);
        }
        await tx.commit();
        console.log('\nReverted. Costs are back to their (still-wrong, but not degenerate) pre-fix values -- do NOT remove/re-add lines yet, a proper fix is coming.');
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('FAILED:', err.message);
        process.exit(1);
    }
    process.exit(0);
})();
