/**
 * backfill_parts_cost.js
 * =====================================================================
 * Repairs historical parts-issue lines that were written with
 * UnitLandedCost = 0, and prepares the correcting JV for the COGS /
 * inventory relief those job cards never posted.
 *
 * Owner ask 2026-09-10: "fix the history too for the month of august".
 *
 * WHY THOSE LINES ARE ZERO
 *   saveJobCardPartsIssue used to resolve cost as
 *       ISNULL(WeightedRate, ItemPurchasePrice)
 *   ISNULL only falls back on NULL, so a WeightedRate of 0 returned 0 and
 *   ItemPurchasePrice was never consulted. Nothing in AutoDMS maintains
 *   WeightedRate, so every item created after the original import sat at 0.
 *   Fixed forward-only in commit aa43d27; this script handles the history.
 *
 * COST BASIS, most authoritative first
 *   1. GRN_ON_OR_BEFORE     the item's most recent GRN line dated on or
 *                           before the issue date. This is the actual
 *                           supplier rate in force when the part was issued.
 *   2. GRN_EARLIEST         the item's earliest GRN line, used when the part
 *                           was issued before it was ever formally received.
 *   3. ITEM_PURCHASE_PRICE  the purchase price on the item master.
 *   4. ITEM_WEIGHTED_RATE   last resort.
 *   A line that resolves to nothing is LEFT ALONE and reported.
 *
 *   GRN history is preferred over the item master deliberately: it is the
 *   transaction record, and the item master's purchase price is a default
 *   someone typed once. Note the GRN screen pre-fills its rate from that
 *   same field, so where nobody overrode it the two agree — in which case
 *   this ordering changes nothing.
 *
 * WHAT IT WRITES
 *   - data_StockIssuetoJobCardDetail.UnitLandedCost  (the repair)
 *   - dms_PartsCostBackfill                          (audit + undo trail)
 *   - one DRAFT correcting JV, if --apply is given and there are already-
 *     finalized job cards in scope. Draft, never posted: you review and
 *     Finalize it in the UI. Dr COGS_PARTS per job card, Cr INVENTORY_PARTS
 *     in total, dated the last day of the month being corrected.
 *
 *   Job cards still in Draft need NO voucher — they read UnitLandedCost at
 *   finalize time, so repairing the line is enough for them.
 *
 * USAGE
 *   node scripts/backfill_parts_cost.js                  # dry run, 2026-08
 *   node scripts/backfill_parts_cost.js --month=2026-08  # dry run, explicit
 *   node scripts/backfill_parts_cost.js --month=2026-08 --apply
 *
 * Dry run is the default and changes NOTHING. Re-running after --apply is
 * safe: lines already in dms_PartsCostBackfill for the batch are skipped.
 * =====================================================================
 */
require('dotenv').config();
const { getPool, sql } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const { resolveRole } = require('../controllers/systemAccountsController');

const args  = process.argv.slice(2);
const APPLY = args.includes('--apply');
const MONTH = (args.find(a => a.startsWith('--month=')) || '--month=2026-08').split('=')[1];

if (!/^\d{4}-\d{2}$/.test(MONTH)) {
    console.error(`Bad --month value "${MONTH}". Expected YYYY-MM, e.g. --month=2026-08`);
    process.exit(1);
}

// Scope by the month STRING, not a JS Date range. Passing Date objects through
// the ODBC driver invites an off-by-a-timezone shift that would pull in the
// last evening of the previous month and drop the last evening of this one —
// unacceptable when the whole point is to correct one month cleanly.
// CONVERT(CHAR(7), IssueDate, 126) yields 'YYYY-MM' entirely inside SQL Server.
const [yy, mm]   = MONTH.split('-').map(Number);
const lastDay    = new Date(yy, mm, 0).getDate();
const MONTH_LAST = `${MONTH}-${String(lastDay).padStart(2, '0')}`;   // JV date, e.g. 2026-08-31
const money      = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

async function main() {
    const pool = await getPool();

    console.log('='.repeat(70));
    console.log(`PARTS COST BACKFILL  ·  ${MONTH}  ·  ${APPLY ? 'APPLY (will write)' : 'DRY RUN (writes nothing)'}`);
    console.log(`Window: ${MONTH}-01 .. ${MONTH_LAST}  (issue date)`);
    console.log('='.repeat(70));

    // ---- 1. Candidate lines, each with every possible cost basis attached ----
    const cand = await pool.request()
        .input('month', sql.Char(7), MONTH)
        .query(`
            SELECT sid.StockIssueDetailID, sid.JobCardId, sid.ItemId,
                   sid.IssueQuantity, sid.ItemRate, sid.DiscAmt, sid.UnitLandedCost,
                   si.IssueDate, si.IssueNo,
                   j.JobCardNo, ISNULL(j.IsFinalized, 0) AS IsFinalized,
                   i.ItenName AS ItemName,
                   ISNULL(i.ManualNumber, CAST(i.ItemNumber AS NVARCHAR(50))) AS PartNo,
                   NULLIF(i.ItemPurchasePrice, 0) AS ItemPurchasePrice,
                   NULLIF(i.WeightedRate, 0)      AS WeightedRate,
                   (SELECT TOP 1 pd.UnitLandedCost
                    FROM   data_PurchaseDetail pd
                    JOIN   data_PurchaseInfo   pi ON pi.PurchaseID = pd.PurchaseID
                    WHERE  pd.ItemId = sid.ItemId
                      AND  ISNULL(pd.UnitLandedCost, 0) > 0
                      AND  pi.PurchaseDate <= si.IssueDate
                    ORDER  BY pi.PurchaseDate DESC, pd.PurchaseDetailID DESC) AS GrnOnOrBefore,
                   (SELECT TOP 1 pd.UnitLandedCost
                    FROM   data_PurchaseDetail pd
                    JOIN   data_PurchaseInfo   pi ON pi.PurchaseID = pd.PurchaseID
                    WHERE  pd.ItemId = sid.ItemId
                      AND  ISNULL(pd.UnitLandedCost, 0) > 0
                    ORDER  BY pi.PurchaseDate ASC, pd.PurchaseDetailID ASC) AS GrnEarliest,
                   (SELECT COUNT(*) FROM dms_PartsCostBackfill b
                    WHERE b.StockIssueDetailID = sid.StockIssueDetailID) AS AlreadyDone
            FROM   data_StockIssuetoJobCardDetail sid
            JOIN   data_StockIssuetoJobCard si ON si.StockIssueID = sid.StockIssueID
            LEFT   JOIN Addata_JobCardInfo  j  ON j.JobCardId    = sid.JobCardId
            LEFT   JOIN InventItems         i  ON i.ItemId       = sid.ItemId
            WHERE  CONVERT(CHAR(7), si.IssueDate, 126) = @month
              AND  ISNULL(sid.UnitLandedCost, 0) = 0
            ORDER  BY si.IssueDate, sid.StockIssueDetailID`);

    const rows = cand.recordset;
    if (!rows.length) {
        console.log(`\nNo zero-cost issue lines found in ${MONTH}. Nothing to do.`);
        return;
    }

    // ---- 2. Resolve a cost for each ----
    const planned = [], skipped = [], unresolved = [];
    for (const r of rows) {
        if (r.AlreadyDone > 0) { skipped.push(r); continue; }

        let cost = null, source = null;
        if (Number(r.GrnOnOrBefore)     > 0) { cost = Number(r.GrnOnOrBefore);     source = 'GRN_ON_OR_BEFORE'; }
        else if (Number(r.GrnEarliest)  > 0) { cost = Number(r.GrnEarliest);       source = 'GRN_EARLIEST'; }
        else if (Number(r.ItemPurchasePrice) > 0) { cost = Number(r.ItemPurchasePrice); source = 'ITEM_PURCHASE_PRICE'; }
        else if (Number(r.WeightedRate) > 0) { cost = Number(r.WeightedRate);      source = 'ITEM_WEIGHTED_RATE'; }

        if (cost === null) { unresolved.push(r); continue; }
        planned.push({ ...r, NewCost: cost, CostSource: source });
    }

    // ---- 3. Report the plan ----
    const bySource = {};
    let totalCost = 0, finalizedCost = 0, draftCost = 0;
    const finalizedJcs = new Map();

    for (const p of planned) {
        const qty  = Number(p.IssueQuantity || 0);
        const line = qty * p.NewCost;
        totalCost += line;
        bySource[p.CostSource] = bySource[p.CostSource] || { lines: 0, cost: 0 };
        bySource[p.CostSource].lines += 1;
        bySource[p.CostSource].cost  += line;

        if (p.IsFinalized) {
            finalizedCost += line;
            const k = p.JobCardId;
            if (!finalizedJcs.has(k)) finalizedJcs.set(k, { JobCardId: k, JobCardNo: p.JobCardNo, cost: 0, lines: 0 });
            const e = finalizedJcs.get(k); e.cost += line; e.lines += 1;
        } else {
            draftCost += line;
        }
    }

    console.log(`\nCandidate zero-cost lines in ${MONTH}: ${rows.length}`);
    if (skipped.length)    console.log(`  already corrected in a previous run : ${skipped.length}  (skipped)`);
    if (unresolved.length) console.log(`  no cost available anywhere          : ${unresolved.length}  (LEFT ALONE)`);
    console.log(`  will be corrected                   : ${planned.length}`);

    console.log('\nCost basis used:');
    for (const [s, v] of Object.entries(bySource)) {
        console.log(`  ${s.padEnd(22)} ${String(v.lines).padStart(4)} lines   PKR ${money(v.cost).padStart(16)}`);
    }

    console.log('\nCost to be recognised:');
    console.log(`  On job cards still in Draft   PKR ${money(draftCost).padStart(16)}   (no voucher needed — posts correctly when finalized)`);
    console.log(`  On FINALIZED job cards        PKR ${money(finalizedCost).padStart(16)}   (${finalizedJcs.size} job cards — needs the correcting JV)`);
    console.log(`  ${''.padEnd(30)}${'-'.repeat(20)}`);
    console.log(`  Total                         PKR ${money(totalCost).padStart(16)}`);

    if (unresolved.length) {
        console.log('\nLines with no cost available anywhere (left untouched):');
        for (const u of unresolved.slice(0, 20)) {
            console.log(`  JC-${String(u.JobCardNo || '?').padEnd(8)} ${String(u.PartNo || '').padEnd(22)} ${String(u.ItemName || '').slice(0, 38)}`);
        }
        if (unresolved.length > 20) console.log(`  ... and ${unresolved.length - 20} more`);
    }

    console.log('\nThe correcting JV would be:');
    console.log(`  Dr  COGS - Parts        PKR ${money(finalizedCost)}   (split ${finalizedJcs.size} ways, one line per job card)`);
    console.log(`  Cr  Inventory - Parts   PKR ${money(finalizedCost)}`);
    console.log(`  Dated ${MONTH_LAST}, created as DRAFT for you to review and finalize.`);

    if (!APPLY) {
        console.log('\n' + '='.repeat(70));
        console.log('DRY RUN — nothing was written.');
        console.log(`Re-run with --apply to make these changes:`);
        console.log(`   node scripts/backfill_parts_cost.js --month=${MONTH} --apply`);
        console.log('='.repeat(70));
        return;
    }

    // ---- 4. Apply ----
    if (!planned.length) { console.log('\nNothing left to apply.'); return; }

    const cogsGL = await resolveRole('COGS_PARTS');
    const invGL  = await resolveRole('INVENTORY_PARTS');

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        let voucherId = null, voucherNo = null;

        // 4a. Correcting JV for the finalized job cards only
        if (finalizedCost > 0.005) {
            const vt = await new sql.Request(tx).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'");
            if (!vt.recordset.length) throw new Error('JV voucher type missing.');
            voucherNo = await nextVoucherNo(tx, 'JV');

            const hdr = await new sql.Request(tx)
                .input('vd',    sql.VarChar(10),       MONTH_LAST)
                .input('vno',   sql.NVarChar(50),      voucherNo)
                .input('vtId',  sql.Int,               vt.recordset[0].Voucherid)
                .input('rem',   sql.NVarChar(sql.MAX),
                       `Parts COGS correction ${MONTH} — cost was booked as zero on ${planned.filter(p => p.IsFinalized).length} issue line(s) ` +
                       `across ${finalizedJcs.size} finalized job card(s); inventory was never relieved.`)
                .input('total', sql.Decimal(18, 2),    Number(finalizedCost.toFixed(2)))
                .input('src',   sql.NVarChar(50),      'PARTS_COST_CORRECTION')
                .input('srcId', sql.Int,               null)
                .input('cby',   sql.Int,               null)
                .input('cbyN',  sql.NVarChar(100),     'Parts cost backfill')
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @rem, @total,
                                'Draft', 0, @src, @srcId, @cby, @cbyN)`);
            voucherId = hdr.recordset[0].VoucherID;

            // Dr COGS — one line per job card, so the GL stays traceable
            for (const jc of finalizedJcs.values()) {
                await new sql.Request(tx)
                    .input('vid',  sql.Int,               voucherId)
                    .input('gl',   sql.Int,               cogsGL)
                    .input('nar',  sql.NVarChar(sql.MAX), `COGS - parts consumed (cost correction ${MONTH}) - JC-${jc.JobCardNo}`)
                    .input('dr',   sql.Decimal(18, 2),    Number(jc.cost.toFixed(2)))
                    .input('cr',   sql.Decimal(18, 2),    0)
                    .input('jcid', sql.Int,               jc.JobCardId)
                    .query(`INSERT INTO data_FinanceVoucherDetail
                                (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                            VALUES (@vid, @gl, @nar, @dr, @cr, NULL, @jcid)`);
            }

            // Cr Inventory — single aggregate line
            await new sql.Request(tx)
                .input('vid', sql.Int,               voucherId)
                .input('gl',  sql.Int,               invGL)
                .input('nar', sql.NVarChar(sql.MAX), `Inventory relieved for parts issued in ${MONTH} (cost correction)`)
                .input('dr',  sql.Decimal(18, 2),    0)
                .input('cr',  sql.Decimal(18, 2),    Number(finalizedCost.toFixed(2)))
                .query(`INSERT INTO data_FinanceVoucherDetail
                            (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                        VALUES (@vid, @gl, @nar, @dr, @cr, NULL, NULL)`);

            console.log(`\nCreated DRAFT correcting JV ${voucherNo} (VoucherID ${voucherId}).`);
        }

        // 4b. Repair the lines + write the audit trail
        for (const p of planned) {
            await new sql.Request(tx)
                .input('id',   sql.Int,           p.StockIssueDetailID)
                .input('cost', sql.Decimal(18, 4), p.NewCost)
                .query('UPDATE data_StockIssuetoJobCardDetail SET UnitLandedCost=@cost WHERE StockIssueDetailID=@id');

            await new sql.Request(tx)
                .input('sid',  sql.Int,            p.StockIssueDetailID)
                .input('jcid', sql.Int,            p.JobCardId || null)
                .input('iid',  sql.Int,            p.ItemId || null)
                .input('idt',  sql.DateTime,       p.IssueDate || null)
                .input('qty',  sql.Decimal(18, 4), Number(p.IssueQuantity || 0))
                .input('old',  sql.Decimal(18, 4), Number(p.UnitLandedCost || 0))
                .input('new',  sql.Decimal(18, 4), p.NewCost)
                .input('src',  sql.NVarChar(60),   p.CostSource)
                .input('fin',  sql.Bit,            p.IsFinalized ? 1 : 0)
                .input('tag',  sql.NVarChar(40),   MONTH)
                .input('vid',  sql.Int,            p.IsFinalized ? voucherId : null)
                .input('by',   sql.NVarChar(100),  'backfill_parts_cost.js')
                .query(`INSERT INTO dms_PartsCostBackfill
                            (StockIssueDetailID, JobCardId, ItemId, IssueDate, Quantity,
                             OldUnitLandedCost, NewUnitLandedCost, CostSource, WasFinalized,
                             BatchTag, VoucherID, AppliedBy)
                        VALUES (@sid, @jcid, @iid, @idt, @qty, @old, @new, @src, @fin, @tag, @vid, @by)`);
        }

        await tx.commit();

        console.log('\n' + '='.repeat(70));
        console.log('APPLIED');
        console.log(`  Issue lines repaired : ${planned.length}`);
        console.log(`  Cost recognised      : PKR ${money(totalCost)}`);
        if (voucherNo) {
            console.log(`  Draft JV             : ${voucherNo}  —  PKR ${money(finalizedCost)}`);
            console.log('');
            console.log('  The JV is a DRAFT. Review it in Finance > Vouchers and Finalize it');
            console.log('  when you are satisfied. Nothing has hit the ledger yet.');
        }
        console.log(`  Audit + undo trail   : dms_PartsCostBackfill (BatchTag='${MONTH}')`);
        console.log('='.repeat(70));
    } catch (err) {
        await tx.rollback();
        console.error('\nFAILED — transaction rolled back, nothing was changed.');
        console.error(err.message);
        process.exitCode = 2;
    }
}

main().then(() => process.exit(process.exitCode || 0))
      .catch(e => { console.error(e); process.exit(1); });
