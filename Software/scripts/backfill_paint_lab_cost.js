/**
 * One-off backfill: historical Paint Lab job-card costs the owner flagged
 * as never recorded (owner ask 2026-08-01, list attached as an image — RO
 * prefix confirmed "B&P", not "BRP"; the '&' was lost when the list was
 * made).
 *
 * Investigation (see check_ro_prefix.js / check_legacy_ro.js) found three
 * groups among the original 31 ROs:
 *   1. Real DMS job cards (Addata_JobCardInfo) with no paint cost posted
 *      yet — root cause: Paint Issue refuses to post once a JC is
 *      finalized (paintIssueController.assertJCEligible), and these are
 *      all already-finalized.
 *   2. ROs that only exist in Legacy_JobCards (the pre-DMS FIS-system
 *      shadow import, migration 091) — several dated June/July 2026,
 *      concurrent with DMS go-live, meaning they were simply never
 *      entered as DMS job cards at all. No JobCardId to link to.
 *   3. B&P-100131 / B&P-110011 — not found anywhere (DMS or legacy).
 *      Owner decision 2026-08-01: skip these two.
 *
 * Posting shape:
 *   Group 1 — one JV per RO, same shape the automatic flow posts at JC
 *     finalize (services/paintIssueConsumptionService):
 *       Dr PAINT_CONSUMPTION (tagged JobCardID), SourceDocType='JC_PAINT_CONS'
 *       Cr Capital (301001001) — owner's explicit choice, this posting only
 *   Group 2 — same Dr/Cr pair, but NO JobCardID tag and NO SourceDocType/
 *     SourceDocID (there's no real JobCardId to reference) — RO number is
 *     carried only in the Narration text. Owner decision 2026-08-01: post
 *     these too.
 *
 * Nothing in paint_Item / InventItems / any stock-quantity table is
 * touched anywhere in this script — owner ask: "don't disturb our
 * inventory on anything."
 *
 * Dated TODAY (not backdated into each RO's original month) — same
 * convention the automatic flow itself uses (VoucherDate = time of
 * posting, not the JC's date), so no previously-reported historical P&L
 * period is silently rewritten.
 *
 * Duplicate guards (both run before every --commit, and are what makes a
 * re-run safe):
 *   - Group 1: skips if that JobCardID already has a posted PAINT_CONSUMPTION
 *     line.
 *   - Group 2: skips if a posted PAINT_CONSUMPTION line's Narration already
 *     mentions that RO number.
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
// B&P-100131 / B&P-110011 excluded — owner decision 2026-08-01, not found
// in the DMS or the legacy shadow table.
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

    // ── Resolve each RO: DMS job card, legacy-only, or not found ──
    const dmsRows = [];      // {ro, cost, jobCardId, finalized}
    const legacyRows = [];   // {ro, cost, legacyId}
    const missing = [];
    const alreadyPosted = [];
    for (const [ro, cost] of ENTRIES) {
        const jc = await pool.request()
            .input('no', sql.NVarChar(100), ro)
            .query(`SELECT JobCardId, IsFinalized FROM Addata_JobCardInfo WHERE JobCardNo=@no`);
        if (jc.recordset.length) {
            const jobCardId = jc.recordset[0].JobCardId;
            const finalized = !!jc.recordset[0].IsFinalized;
            if (paintGL) {
                const dup = await pool.request()
                    .input('jc', sql.Int, jobCardId)
                    .input('gl', sql.Int, paintGL)
                    .query(`SELECT TOP 1 vi.VoucherNo
                            FROM data_FinanceVoucherDetail vd
                            JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                            WHERE vd.JobCardID=@jc AND vd.GLCAID=@gl AND vi.Status='Posted'`);
                if (dup.recordset.length) {
                    alreadyPosted.push({ ro, cost, ref: `JobCardId=${jobCardId}`, existingVoucherNo: dup.recordset[0].VoucherNo });
                    continue;
                }
            }
            dmsRows.push({ ro, cost, jobCardId, finalized });
            continue;
        }

        const leg = await pool.request()
            .input('no', sql.NVarChar(100), ro)
            .query(`SELECT LegacyID FROM Legacy_JobCards WHERE WorkOrderNo=@no`);
        if (leg.recordset.length) {
            const legacyId = leg.recordset[0].LegacyID;
            if (paintGL) {
                const dup = await pool.request()
                    .input('ro', sql.NVarChar(100), `%${ro}%`)
                    .input('gl', sql.Int, paintGL)
                    .query(`SELECT TOP 1 vi.VoucherNo
                            FROM data_FinanceVoucherDetail vd
                            JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                            WHERE vd.GLCAID=@gl AND vi.Status='Posted' AND vd.Narration LIKE @ro`);
                if (dup.recordset.length) {
                    alreadyPosted.push({ ro, cost, ref: `LegacyID=${legacyId}`, existingVoucherNo: dup.recordset[0].VoucherNo });
                    continue;
                }
            }
            legacyRows.push({ ro, cost, legacyId });
            continue;
        }

        missing.push(ro);
    }

    console.log(`\n  ${dmsRows.length} DMS-linked + ${legacyRows.length} legacy-only = ${dmsRows.length + legacyRows.length} of ${ENTRIES.length} ROs ready to post.`);
    if (missing.length) {
        console.log(`\n  NOT FOUND anywhere (skipped):`);
        missing.forEach(ro => console.log(`      ${ro}`));
    }
    if (alreadyPosted.length) {
        console.log(`\n  ALREADY HAS A PAINT COST ENTRY (skipped — would double-count):`);
        alreadyPosted.forEach(x => console.log(`      ${x.ro}  (${x.ref}, existing voucher ${x.existingVoucherNo})`));
    }

    const dmsTotal = dmsRows.reduce((s, r) => s + r.cost, 0);
    const legacyTotal = legacyRows.reduce((s, r) => s + r.cost, 0);

    console.log(`\n  DMS-linked (tagged to a real JobCardID), dated ${BACKFILL_DATE}:`);
    console.log(`  ${'RO'.padEnd(14)} ${'JobCardId'.padStart(10)} ${'Finalized'.padStart(10)} ${'Cost'.padStart(12)}`);
    for (const r of dmsRows) {
        console.log(`  ${r.ro.padEnd(14)} ${String(r.jobCardId).padStart(10)} ${(r.finalized ? 'yes' : 'no').padStart(10)} ${fmt(r.cost).padStart(12)}`);
    }
    console.log(`  Subtotal: PKR ${fmt(dmsTotal)} across ${dmsRows.length} JVs.`);

    console.log(`\n  Legacy-only (no JobCardID, RO number in narration only), dated ${BACKFILL_DATE}:`);
    console.log(`  ${'RO'.padEnd(14)} ${'LegacyID'.padStart(10)} ${'Cost'.padStart(12)}`);
    for (const r of legacyRows) {
        console.log(`  ${r.ro.padEnd(14)} ${String(r.legacyId).padStart(10)} ${fmt(r.cost).padStart(12)}`);
    }
    console.log(`  Subtotal: PKR ${fmt(legacyTotal)} across ${legacyRows.length} JVs.`);

    console.log(`\n  GRAND TOTAL to post: PKR ${fmt(dmsTotal + legacyTotal)} across ${dmsRows.length + legacyRows.length} JVs.\n`);

    if (!COMMIT) {
        console.log(`DRY RUN complete. Review the lists above before committing.`);
        console.log(`To actually post, re-run with --commit:`);
        console.log(`  node scripts\\backfill_paint_lab_cost.js --commit\n`);
        process.exit(0);
    }
    if (!dmsRows.length && !legacyRows.length) {
        console.error(`\n  Nothing to post.\n`);
        process.exit(0);
    }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const vt = await new sql.Request(tx).query(`SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid`);
        const vtId = vt.recordset[0].Voucherid;

        // ── Group 1: DMS-linked ─────────────────────────────
        for (const r of dmsRows) {
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

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, paintGL)
                .input('jc',  sql.Int, r.jobCardId)
                .input('nar', sql.NVarChar(sql.MAX), narration)
                .input('dr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, JobCardID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @jc, @nar, @dr, 0)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, capital.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), narration + ' — Cr Capital')
                .input('cr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, 0, @cr)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .query(`UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@vid`);

            console.log(`  + Posted ${voucherNo} — ${r.ro} (JobCardId=${r.jobCardId}) — PKR ${fmt(r.cost)}`);
        }

        // ── Group 2: legacy-only, no JobCardID / SourceDoc tag ──
        for (const r of legacyRows) {
            const voucherNo = await nextVoucherNo(tx, 'JV');
            const narration = `Paint Lab cost backfill — RO ${r.ro} — legacy RO (LegacyID=${r.legacyId}), never entered as a DMS job card, posted ${BACKFILL_DATE}`;

            const hdr = await new sql.Request(tx)
                .input('vd',   sql.DateTime,          new Date(BACKFILL_DATE + 'T12:00:00'))
                .input('vno',  sql.NVarChar(50),      voucherNo)
                .input('vtId', sql.Int,               vtId)
                .input('rem',  sql.NVarChar(sql.MAX), narration)
                .input('tot',  sql.Decimal(18,2),     r.cost)
                .input('cbn',  sql.NVarChar(100),     'system-paintlab-cost-backfill')
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @rem, @tot,
                                'Draft', 0, @cbn)`);
            const vid = hdr.recordset[0].VoucherID;

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, paintGL)
                .input('nar', sql.NVarChar(sql.MAX), narration)
                .input('dr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, 0)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .input('gl',  sql.Int, capital.GLCAID)
                .input('nar', sql.NVarChar(sql.MAX), narration + ' — Cr Capital')
                .input('cr',  sql.Decimal(18,2), r.cost)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, 0, @cr)`);

            await new sql.Request(tx)
                .input('vid', sql.Int, vid)
                .query(`UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@vid`);

            console.log(`  + Posted ${voucherNo} — ${r.ro} (legacy, LegacyID=${r.legacyId}) — PKR ${fmt(r.cost)}`);
        }

        await tx.commit();
        console.log(`\nDone. Posted ${dmsRows.length + legacyRows.length} JVs totalling PKR ${fmt(dmsTotal + legacyTotal)}.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  X FAILED (rolled back): ${e.message}`);
        process.exit(1);
    }
})().catch(e => { console.error('backfill failed:', e.message); process.exit(1); });
