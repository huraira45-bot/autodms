/**
 * One-off top-up: B&P-1004 (JobCardId=256) already has a real, pre-existing
 * Paint Issue (PI-0105, TotalCost=85,267.19) that was never GL-posted
 * because this JC hasn't finalized yet (GL posting is deferred to finalize
 * -- see services/paintIssueConsumptionService). The earlier backfill
 * (backfill_paint_lab_cost.js, JV-0441) posted only 1,242.00 for this RO,
 * based on the owner's original list -- far short of the real amount.
 *
 * Owner decision 2026-08-01: where the real cost is higher than what was
 * backfilled, top up the difference (don't reverse). Where it's lower or
 * equal, leave it. CT-2011's gap was 0.10 (rounding noise, skipped
 * entirely -- not posted anywhere).
 *
 * Posts ONE JV for the difference only (84,025.19 = 85,267.19 - 1,242.00):
 *   Dr PAINT_CONSUMPTION (tagged JobCardID=256), SourceDocType='JC_PAINT_CONS'
 *   Cr Capital (301001001)
 * Does not touch paint_Item / stock / paint_StockLedger -- same "don't
 * disturb inventory" rule as every other script in this backfill.
 *
 * KNOWN RESIDUAL RISK (told to owner before running): if this JC is later
 * finalized through the normal workflow, the automatic consumption flow
 * will post its OWN JV for the full real Paint Issue total (85,267.19)
 * at that time, since topping up here does not lock PI-0105. That would
 * duplicate this top-up. Flagged for the owner to catch when B&P-1004
 * eventually closes -- not something this script can prevent without
 * freezing an open, active operational record.
 *
 * DRY RUN:  node scripts\topup_paint_lab_cost_bp1004.js
 * COMMIT:   node scripts\topup_paint_lab_cost_bp1004.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const CAPITAL_GLCODE = '301001001';
const PAINT_ROLE     = 'PAINT_CONSUMPTION';
const JOB_CARD_ID    = 256;   // B&P-1004
const PAINT_ISSUE_NO = 'PI-0105';
const ALREADY_POSTED = 1242.00;   // JV-0441
const REAL_TOTAL      = 85267.19; // PI-0105.TotalCost, confirmed live 2026-08-01
const TOPUP           = +(REAL_TOTAL - ALREADY_POSTED).toFixed(2);
const BACKFILL_DATE   = new Date().toISOString().slice(0, 10);
const COMMIT          = process.argv.includes('--commit');
const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);
    console.log(`  B&P-1004 (JobCardId=${JOB_CARD_ID}): already posted ${fmt(ALREADY_POSTED)}, real Paint Issue ${PAINT_ISSUE_NO} total ${fmt(REAL_TOTAL)}.`);
    console.log(`  Top-up amount: PKR ${fmt(TOPUP)}\n`);

    // Re-verify the real total hasn't changed since this was written.
    const check = await pool.request().input('jc', sql.Int, JOB_CARD_ID)
        .query(`SELECT PaintIssueID, IssueNo, TotalCost, Locked FROM paint_Issue WHERE JobCardID=@jc`);
    if (check.recordset.length !== 1 || check.recordset[0].IssueNo !== PAINT_ISSUE_NO) {
        console.error(`  X Expected exactly one paint_Issue (${PAINT_ISSUE_NO}) for JobCardID=${JOB_CARD_ID}; found: ${JSON.stringify(check.recordset)}`);
        process.exit(1);
    }
    const currentTotal = Number(check.recordset[0].TotalCost);
    if (Math.abs(currentTotal - REAL_TOTAL) > 0.01) {
        console.error(`  X ${PAINT_ISSUE_NO}.TotalCost has changed since this script was written (was ${fmt(REAL_TOTAL)}, now ${fmt(currentTotal)}). Stopping -- re-check before running.`);
        process.exit(1);
    }
    console.log(`  Re-verified: ${PAINT_ISSUE_NO}.TotalCost is still ${fmt(currentTotal)}, Locked=${check.recordset[0].Locked}.`);

    // Duplicate guard: has this exact top-up already been posted?
    const paintGL = (await pool.request().input('rk', sql.NVarChar(50), PAINT_ROLE)
        .query(`SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey=@rk`)).recordset[0]?.GLCAID;
    if (!paintGL) { console.error(`  X System account role '${PAINT_ROLE}' is not mapped.`); process.exit(1); }
    const dup = await pool.request()
        .input('jc', sql.Int, JOB_CARD_ID).input('gl', sql.Int, paintGL)
        .input('mk', sql.NVarChar(200), '%top-up%B&P-1004%')
        .query(`SELECT TOP 1 vi.VoucherNo FROM data_FinanceVoucherDetail vd
                JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = vd.VoucherID
                WHERE vd.JobCardID=@jc AND vd.GLCAID=@gl AND vi.Status='Posted' AND vd.Narration LIKE @mk`);
    if (dup.recordset.length) {
        console.log(`\n  Already posted as ${dup.recordset[0].VoucherNo}. Nothing to do.\n`);
        process.exit(0);
    }

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. To actually post, re-run with --commit:`);
        console.log(`  node scripts\\topup_paint_lab_cost_bp1004.js --commit\n`);
        process.exit(0);
    }

    const capital = (await pool.request().input('c', sql.NVarChar(50), CAPITAL_GLCODE)
        .query(`SELECT GLCAID FROM GLChartOFAccount WHERE GLCode=@c`)).recordset[0];
    if (!capital) { console.error(`  X Capital account (GLCode=${CAPITAL_GLCODE}) not found.`); process.exit(1); }

    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const vt = await new sql.Request(tx).query(`SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV' ORDER BY Voucherid`);
        const vtId = vt.recordset[0].Voucherid;
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const narration = `Paint Lab cost top-up — RO B&P-1004 — real ${PAINT_ISSUE_NO} total is ${fmt(REAL_TOTAL)}, only ${fmt(ALREADY_POSTED)} was backfilled (JV-0441); topping up the difference, posted ${BACKFILL_DATE}`;

        const hdr = await new sql.Request(tx)
            .input('vd', sql.DateTime, new Date(BACKFILL_DATE + 'T12:00:00'))
            .input('vno', sql.NVarChar(50), voucherNo)
            .input('vtId', sql.Int, vtId)
            .input('rem', sql.NVarChar(sql.MAX), narration)
            .input('tot', sql.Decimal(18,2), TOPUP)
            .input('src', sql.NVarChar(20), 'JC_PAINT_CONS')
            .input('srcId', sql.Int, JOB_CARD_ID)
            .input('cbn', sql.NVarChar(100), 'system-paintlab-cost-backfill')
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount, Status, Posted, SourceDocType, SourceDocID, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vtId, @rem, @tot, 'Draft', 0, @src, @srcId, @cbn)`);
        const vid = hdr.recordset[0].VoucherID;

        await new sql.Request(tx)
            .input('vid', sql.Int, vid).input('gl', sql.Int, paintGL).input('jc', sql.Int, JOB_CARD_ID)
            .input('nar', sql.NVarChar(sql.MAX), narration).input('dr', sql.Decimal(18,2), TOPUP)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, JobCardID, Narration, Debit, Credit) VALUES (@vid, @gl, @jc, @nar, @dr, 0)`);

        await new sql.Request(tx)
            .input('vid', sql.Int, vid).input('gl', sql.Int, capital.GLCAID)
            .input('nar', sql.NVarChar(sql.MAX), narration + ' — Cr Capital').input('cr', sql.Decimal(18,2), TOPUP)
            .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit) VALUES (@vid, @gl, @nar, 0, @cr)`);

        await new sql.Request(tx).input('vid', sql.Int, vid)
            .query(`UPDATE data_FinanceVoucherInfo SET Status='Posted', Posted=1, PostedAt=GETDATE() WHERE VoucherID=@vid`);

        await tx.commit();
        console.log(`\n  + Posted ${voucherNo} — B&P-1004 top-up — PKR ${fmt(TOPUP)}`);
        console.log(`\nDone.\n`);
        process.exit(0);
    } catch (e) {
        try { await tx.rollback(); } catch {}
        console.error(`\n  X FAILED (rolled back): ${e.message}`);
        process.exit(1);
    }
})().catch(e => { console.error('topup failed:', e.message); process.exit(1); });
