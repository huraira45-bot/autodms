/**
 * One-off: make the 11 DMS-linked ROs from backfill_paint_lab_cost.js also
 * show up in the Paint Lab module's own reports (Paint Lab Dashboard,
 * Paint Reports "Consumption by JC/Business Type", Business Unit P&L) --
 * all three of which read paint_Issue / paint_IssueDetail directly, NOT
 * the GL, so the GL-only backfill (backfill_paint_lab_cost.js) never
 * reached them.
 *
 * Owner decision 2026-08-01: proceed for the 11 eligible ROs, explicitly
 * WITHOUT drawing down current paint stock.
 *
 * Hard scope limit: paint_Issue.JobCardID is NOT NULL with a real FK to
 * Addata_JobCardInfo. Only the 11 DMS-linked ROs from the GL backfill can
 * ever get a paint_Issue row -- the 12 legacy-only ROs and the 3 lump-sum
 * ROs (PKR 117,766 combined) have no real JobCardId and structurally
 * cannot appear in these reports without fabricating fake job cards,
 * which this script does not do.
 *
 * HONESTY NOTE, read before running: paint_Issue rows normally mean
 * "this stock physically left the shelf" (see column comment on
 * paint_Issue.TotalCost). These 11 will NOT have a matching stock
 * movement -- no paint_Item.StockQty change, no paint_StockLedger row.
 * Locked=1 and the Remarks/placeholder item name make this as visible as
 * possible to anyone auditing later, but a future physical paint count
 * or a paint_Issue-vs-paint_StockLedger reconciliation will find these
 * 11 records with nothing behind them. That is the deliberate tradeoff
 * for not touching current inventory (owner ask).
 *
 * Creates ONE placeholder paint_Item ("BACKFILL-MISC", IsActive=0 so it
 * won't appear in the normal Paint Issue item picker) if it doesn't
 * already exist, then one paint_Issue + one paint_IssueDetail line per
 * RO (Quantity=1, cost = the RO's amount).
 *
 * Skips (and warns about) any JobCardID that already has ANY paint_Issue
 * row, real or previously backfilled -- protects against double-counting
 * and makes re-running --commit safe.
 *
 * DRY RUN:  node scripts\backfill_paint_lab_stock_records.js
 * COMMIT:   node scripts\backfill_paint_lab_stock_records.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const PLACEHOLDER_CODE = 'BACKFILL-MISC';
const PLACEHOLDER_NAME = 'Historical Paint Cost Backfill — Unspecified Item (no real stock movement)';
const WAREHOUSE_CODE   = 'PAINT-01';
const UOM_NAME          = 'Piece';
const BACKFILL_DATE     = new Date().toISOString().slice(0, 10);
const BACKFILL_MARKER   = 'paint-lab-cost-backfill-2026-08';
const COMMIT            = process.argv.includes('--commit');
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// The 11 DMS-linked ROs from backfill_paint_lab_cost.js's already-posted
// GL run (JV-0437..JV-0447). JobCardId values as resolved on live 2026-08-01.
const ENTRIES = [
    ['B&P-0022', 180, 750],
    ['B&P-1007', 279, 2816],
    ['B&P-1014', 368, 10611],
    ['B&P-1008', 289, 931],
    ['B&P-1004', 256, 1242],
    ['B&P-1065', 894, 1673],
    ['CT-2011',  981, 2591],
    ['CT-2006',  692, 181540],
    ['CT-2002',  263, 2850],
    ['CT-0001',   65, 168446],
    ['CT-2001',  251, 174447],
];

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    // ── Resolve / preview the placeholder item, warehouse, UOM ──
    let placeholderId = (await pool.request().input('c', sql.NVarChar(50), PLACEHOLDER_CODE)
        .query(`SELECT PaintItemID FROM paint_Item WHERE PaintCode=@c`)).recordset[0]?.PaintItemID;
    console.log(placeholderId
        ? `  Placeholder item already exists: PaintItemID=${placeholderId}`
        : `  Placeholder item does not exist yet -- will create "${PLACEHOLDER_CODE}" on --commit.`);

    const wh = (await pool.request().input('c', sql.NVarChar(50), WAREHOUSE_CODE)
        .query(`SELECT PaintWHID, WHDesc FROM paint_Warehouse WHERE WHCode=@c`)).recordset[0]
        || (await pool.request().query(`SELECT TOP 1 PaintWHID, WHDesc FROM paint_Warehouse ORDER BY PaintWHID`)).recordset[0];
    if (!wh) { console.error(`  X No paint_Warehouse row exists at all.`); if (COMMIT) process.exit(1); }
    else console.log(`  Warehouse: ${wh.WHDesc} (PaintWHID=${wh.PaintWHID})`);

    const uom = (await pool.request().input('n', sql.NVarChar(50), UOM_NAME)
        .query(`SELECT PaintUOMID FROM paint_UOM WHERE UOMName=@n`)).recordset[0];
    if (!uom) { console.error(`  X UOM '${UOM_NAME}' not found.`); if (COMMIT) process.exit(1); }
    else console.log(`  UOM: ${UOM_NAME} (PaintUOMID=${uom.PaintUOMID})`);

    // ── Resolve each JC: any existing paint_Issue already? ──
    const toPost = [];
    const skipExisting = [];
    for (const [ro, jobCardId, cost] of ENTRIES) {
        const existing = await pool.request().input('jc', sql.Int, jobCardId)
            .query(`SELECT PaintIssueID, IssueNo, TotalCost, Remarks FROM paint_Issue WHERE JobCardID=@jc`);
        if (existing.recordset.length) {
            skipExisting.push({ ro, jobCardId, cost, existing: existing.recordset });
            continue;
        }
        toPost.push([ro, jobCardId, cost]);
    }

    console.log(`\n  ${toPost.length} of ${ENTRIES.length} ROs ready to post as paint_Issue records.`);
    if (skipExisting.length) {
        console.log(`\n  ALREADY HAS A paint_Issue RECORD (skipped — would double-count):`);
        skipExisting.forEach(x => {
            console.log(`      ${x.ro}  (JobCardId=${x.jobCardId})`);
            x.existing.forEach(e => console.log(`          -> ${e.IssueNo}  TotalCost=${fmt(e.TotalCost)}  Remarks="${(e.Remarks || '').slice(0, 60)}"`));
        });
    }

    const total = toPost.reduce((s, [, , cost]) => s + cost, 0);
    console.log(`\n  Preview (${toPost.length} paint_Issue records, dated ${BACKFILL_DATE}, Locked=1, no stock movement):`);
    console.log(`  ${'RO'.padEnd(12)} ${'JobCardId'.padStart(10)} ${'Cost'.padStart(12)}`);
    for (const [ro, jc, cost] of toPost) {
        console.log(`  ${ro.padEnd(12)} ${String(jc).padStart(10)} ${fmt(cost).padStart(12)}`);
    }
    console.log(`\n  TOTAL to post: PKR ${fmt(total)} across ${toPost.length} paint_Issue records.\n`);

    if (!COMMIT) {
        console.log(`DRY RUN complete. Review the lists above before committing.`);
        console.log(`To actually post, re-run with --commit:`);
        console.log(`  node scripts\\backfill_paint_lab_stock_records.js --commit\n`);
        process.exit(0);
    }
    if (!toPost.length) { console.error(`\n  Nothing to post.\n`); process.exit(0); }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        if (!placeholderId) {
            const ins = await new sql.Request(tx)
                .input('code', sql.NVarChar(50),  PLACEHOLDER_CODE)
                .input('name', sql.NVarChar(200), PLACEHOLDER_NAME)
                .input('uom',  sql.Int,           uom.PaintUOMID)
                .query(`INSERT INTO paint_Item (PaintCode, PaintName, PaintUOMID, GSTDefaultOn, IsActive, StockQty, AvgCost)
                        OUTPUT INSERTED.PaintItemID
                        VALUES (@code, @name, @uom, 0, 0, 0, 0)`);
            placeholderId = ins.recordset[0].PaintItemID;
            console.log(`  + Created placeholder paint_Item (PaintItemID=${placeholderId}, IsActive=0)`);
        }

        for (const [ro, jobCardId, cost] of toPost) {
            const seq = await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_PaintIssueNo AS n');
            const issueNo = `PI-${String(seq.recordset[0].n).padStart(4, '0')}`;
            const remarks = `${BACKFILL_MARKER} — RO ${ro} — synthetic record for Paint Lab reporting only, NO physical stock movement (owner ask: don't disturb inventory), cost already posted to GL separately. Posted ${BACKFILL_DATE}.`;

            const hdr = await new sql.Request(tx)
                .input('no',  sql.NVarChar(30), issueNo)
                .input('dt',  sql.Date, BACKFILL_DATE)
                .input('jc',  sql.Int, jobCardId)
                .input('wh',  sql.Int, wh.PaintWHID)
                .input('rm',  sql.NVarChar(500), remarks)
                .input('tot', sql.Decimal(18,2), cost)
                .input('cbn', sql.NVarChar(100), 'system-paintlab-cost-backfill')
                .query(`INSERT INTO paint_Issue (IssueNo, IssueDate, JobCardID, PaintWHID, Remarks, TotalCost, Locked, CreatedByName)
                        OUTPUT INSERTED.PaintIssueID
                        VALUES (@no, @dt, @jc, @wh, @rm, @tot, 1, @cbn)`);
            const issueId = hdr.recordset[0].PaintIssueID;

            await new sql.Request(tx)
                .input('pid', sql.Int, issueId)
                .input('pit', sql.Int, placeholderId)
                .input('uom', sql.Int, uom.PaintUOMID)
                .input('q',   sql.Decimal(18,4), 1)
                .input('uc',  sql.Decimal(18,4), cost)
                .input('lt',  sql.Decimal(18,2), cost)
                .query(`INSERT INTO paint_IssueDetail (PaintIssueID, PaintItemID, PaintUOMID, Quantity, IssueUnitCost, LineTotal)
                        VALUES (@pid, @pit, @uom, @q, @uc, @lt)`);

            // Deliberately NOT touching paint_Item.StockQty/AvgCost and NOT
            // inserting into paint_StockLedger -- owner ask: don't disturb inventory.

            console.log(`  + Posted ${issueNo} — ${ro} (JobCardId=${jobCardId}) — PKR ${fmt(cost)}`);
        }

        await tx.commit();
        console.log(`\nDone. Posted ${toPost.length} paint_Issue records totalling PKR ${fmt(total)}.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  X FAILED (rolled back): ${e.message}`);
        process.exit(1);
    }
})().catch(e => { console.error('backfill failed:', e.message); process.exit(1); });
