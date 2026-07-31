/**
 * One-off backfill: 31 historical Paint Lab job-card costs the owner
 * flagged as never recorded (owner ask 2026-08-01, list attached as an
 * image — RO prefix confirmed "B&P", not "BRP"; the '&' was lost when the
 * list was made).
 *
 * Root cause: Paint Issue refuses to post once a JC is finalized
 * (paintIssueController.assertJCEligible). These are all old, already-
 * finalized ROs, so the normal Paint Issue -> finalize -> auto-JV flow
 * (services/paintIssueConsumptionService.postPaintConsumptionForJC) could
 * never run for them.
 *
 * This script posts the SAME SHAPE of voucher that flow posts automatically
 * — one JV per RO:
 *      Dr  PAINT_CONSUMPTION            <cost>   (tagged JobCardID)
 *      Cr  Capital (301001001)          <cost>   (owner's explicit choice,
 *                                                  this posting only)
 *   SourceDocType='JC_PAINT_CONS', SourceDocID=<JobCardId>  — identical
 *   tag the automatic flow uses, so these show up correctly wherever the
 *   app already knows how to find paint-consumption vouchers.
 *
 * Deliberately different from the automatic flow: normally it credits
 * PAINT_INVENTORY (stock value) because paint_Item stock was actually
 * decremented by a real Paint Issue. Here NOTHING in paint_Item /
 * InventItems / any stock-quantity table is touched — owner ask: "don't
 * disturb our inventory on anything." Credit goes to Capital instead,
 * exactly as the owner specified for this posting only.
 *
 * Dated TODAY (not backdated into each RO's original month) — same
 * convention the automatic flow itself uses (VoucherDate = time of
 * posting, not the JC's date), so no previously-reported historical P&L
 * period is silently rewritten.
 *
 * Before touching anything it checks whether a JC already has a
 * JC_PAINT_CONS voucher tagged to it and SKIPS those (would otherwise
 * double-cost that job card) — review the dry-run output for any
 * "ALREADY HAS A PAINT COST ENTRY" lines before deciding whether to force
 * them through by hand.
 *
 * DRY RUN:  node scripts\backfill_paint_lab_cost.js
 * COMMIT:   node scripts\backfill_paint_lab_cost.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const CAPITAL_GLCODE = '301001001';
const PAINT_ROLE     = 'PAINT_CONSUMPTION';
const BACKFILL_DATE  = new Date().toISOString().slice(0, 10); // edit here to backdate instead
const COMMIT         = process.argv.includes('--commit');
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// RO -> Cost, exactly as given by the owner (prefix corrected BRP -> B&P).
const ENTRIES = [
    ['B&P-11919', 6615],
    ['B&P-1206', 3161],
    ['B&P-12067', 590],
    ['B&P-12066', 8542],
    ['B&P-12062', 7013],
    ['B&P-12072', 11191],
    ['B&P-12071', 4876],
    ['B&P-12077', 3674],
    ['B&P-12075', 6090],
    ['B&P-12074', 4643],
    ['B&P-12084', 46891],
    ['B&P-12076', 5528],
    ['B&P-12081', 1496],
    ['B&P-100131', 5328],
    ['B&P-110011', 2128],
    ['B&P-0022', 750],
    ['B&P-1007', 2816],
    ['B&P-1014', 10611],
    ['B&P-1008', 931],
    ['B&P-1004', 1242],
    ['B&P-1022', 1373],
    ['B&P-1065', 1673],
    ['B&P-1067', 326],
    ['B&P-1068', 878],
    ['B&P-1056', 539],
    ['B&P-1038', 1620],
    ['CT-2011', 2591],
    ['CT-2006', 181540],
    ['CT-2002', 2850],
    ['CT-0001', 168446],
    ['CT-2001', 174447],
];

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    // ── Resolve GL accounts first ───────────────────────────
    const paintGL = (await pool.request().input('rk', sql.NVarChar(50), PAINT_ROLE)
        .query(`SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk`)).recordset[0]?.GLCAID;
    if (!paintGL) {
        console.error(`  X System account role '${PAINT_ROLE}' is not mapped in Accounting Setup.`);
        if (COMMIT) process.exit(1);
    } else {
        console.log(`  ${PAINT_ROLE} GLCAID=${paintGL}`);
    }
    const capital = (await pool.request().input('c', sql.NVarChar(50), CAPITAL_GLCODE)
        .query(`SELECT GLCAID, GLTitle FROM GLChartOFAccount WHERE GLCode=@c`)).recordset[0];
    if (!capital) {
        console.error(`  X Capital account (GLCode=${CAPITAL_GLCODE}) not found in COA.`);
        if (COMMIT) process.exit(1);
    } else {
        console.log(`  Capital: ${capital.GLTitle} (GLCAID=${capital.GLCAID})`);
    }

    // ── Resolve each RO -> JobCardId, and check for an existing entry ──
    const resolved = [];
    const missing = [];
    const alreadyPosted = [];
    for (const [ro, cost] of ENTRIES) {
        const r = await pool.request()
            .input('no', sql.NVarChar(100), ro)
            .query(`SELECT JobCardId, IsFinalized FROM Addata_JobCardInfo WHERE JobCardNo=@no`);
        if (!r.recordset.length) { missing.push(ro); continue; }
        const jobCardId = r.recordset[0].JobCardId;
        const finalized = !!r.recordset[0].IsFinalized;

        if (paintGL) {
            const dup = await pool.request()
                .input('jc', sql.Int, jobCardId)
                .input('gl', sql.Int, paintGL)
                .query(`SELECT TOP 1 vd.VoucherID, vi.VoucherNo
                        FROM data_FinanceVoucherDetail vd
                        JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                        WHERE vd.JobCardID=@jc AND vd.GLCAID=@gl AND vi.Status='Posted'`);
            if (dup.recordset.length) {
                alreadyPosted.push({ ro, cost, jobCardId, existingVoucherNo: dup.recordset[0].VoucherNo });
                continue;
            }
        }
        resolved.push({ ro, cost, jobCardId, finalized });
    }

    console.log(`\n  ${resolved.length} of ${ENTRIES.length} ROs ready to post.`);
    if (missing.length) {
        console.log(`\n  NOT FOUND in Addata_JobCardInfo (skipped):`);
        missing.forEach(ro => console.log(`      ${ro}`));
    }
    if (alreadyPosted.length) {
        console.log(`\n  ALREADY HAS A PAINT COST ENTRY (skipped — would double-count):`);
        alreadyPosted.forEach(x => console.log(`      ${x.ro}  (JobCardId=${x.jobCardId}, existing voucher ${x.existingVoucherNo})`));
    }

    const total = resolved.reduce((s, r) => s + r.cost, 0);
    console.log(`\n  Preview (${resolved.length} JVs, one per RO, dated ${BACKFILL_DATE}):`);
    console.log(`  ${'RO'.padEnd(14)} ${'JobCardId'.padStart(10)} ${'Finalized'.padStart(10)} ${'Cost'.padStart(12)}`);
    for (const r of resolved) {
        console.log(`  ${r.ro.padEnd(14)} ${String(r.jobCardId).padStart(10)} ${(r.finalized ? 'yes' : 'no').padStart(10)} ${fmt(r.cost).padStart(12)}`);
    }
    console.log(`\n  Total to post: PKR ${fmt(total)} across ${resolved.length} JVs.\n`);

    if (!COMMIT) {
        console.log(`DRY RUN complete. Review the lists above (NOT FOUND / ALREADY HAS AN ENTRY) before committing.`);
        console.log(`To actually post, re-run with --commit:`);
        console.log(`  node scripts\\backfill_paint_lab_cost.js --commit\n`);
        process.exit(0);
    }
    if (!resolved.length) {
        console.error(`\n  Nothing to post.\n`);
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const vt = await new sql.Request(tx).query(`SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid`);
        const vtId = vt.recordset[0].Voucherid;

        for (const r of resolved) {
            const voucherNo = await nextVoucherNo(tx, 'JV');
            const narration = `Paint Lab cost backfill — RO ${r.ro} — recorded late (Paint Issue blocked once JC finalized), posted ${BACKFILL_DATE}`;

            const hdr = await new sql.Request(tx)
                .input('vd',   sql.DateTime,          new Date(BACKFILL_DATE + 'T12:00:00'))
                .input('vno',  sql.NVarChar(50),      voucherNo)
                .input('vtId', sql.Int,               vtId)
                .input('rem',  sql.NVarChar(sql.MAX), narration)
                .input('tot',  sql.Decimal(18,2),     r.cost)
                .input('src',  sql.NVarChar(20),      'JC_PAINT_CONS')
                .input('srcId',sql.Int,               r.jobCardId)
                .input('cbn',  sql.NVarChar(100),     'system-paintlab-cost-backfill')
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, SourceDocType, SourceDocID, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @rem, @tot,
                                'Draft', 0, @src, @srcId, @cbn)`);
            const vid = hdr.recordset[0].VoucherID;

            // Dr Paint Consumption — tagged JobCardID, same as the automatic flow
            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, paintGL)
                .input('jc',  sql.Int, r.jobCardId)
                .input('nar', sql.NVarChar(sql.MAX), narration)
                .input('dr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, JobCardID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @jc, @nar, @dr, 0)`);

            // Cr Capital — owner's explicit choice for this posting only
            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, capital.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), narration + ' — Cr Capital')
                .input('cr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, 0, @cr)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET Status='Posted', Posted=1, PostedAt=GETDATE()
                        WHERE VoucherID=@vid`);

            console.log(`  + Posted ${voucherNo} — ${r.ro} — PKR ${fmt(r.cost)}`);
        }

        await tx.commit();
        console.log(`\nDone. Posted ${resolved.length} JVs totalling PKR ${fmt(total)}.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  X FAILED (rolled back): ${e.message}`);
        process.exit(1);
    }
})().catch(e => { console.error('backfill failed:', e.message); process.exit(1); });
