/**
 * IAS 16 non-current asset depreciation (Straight-Line Method).
 *
 * Cost is never duplicated here — it's read live from the linked GL leaf
 * account's posted ledger balance (Debit - Credit). Accumulated Depreciation
 * to date = the asset's one-time OpeningAccumulatedDepreciation (for assets
 * that already had some life consumed before this register existed) + the
 * sum of every prior period's charge that actually finalized (Posted
 * voucher only — a still-Draft run must not be counted, since it may yet be
 * cancelled).
 *
 * Proration policy (owner decision 2026-08-20): an asset's start month
 * itself gets NO charge — the first real month of depreciation is the month
 * AFTER DepreciationStartDate. Every asset is capped so it never depreciates
 * past (Cost - ResidualValue); once it hits that floor it's marked
 * FULLY_DEPRECIATED and drops out of future run candidates.
 */
const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');

const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const monthKey = (y, m) => y * 12 + m;

async function getAssetCost(txOrPool, glcaid) {
    const r = await new sql.Request(txOrPool)
        .input('gl', sql.Int, glcaid)
        .query(`SELECT ISNULL(SUM(d.Debit - d.Credit), 0) AS Cost
                FROM data_FinanceVoucherDetail d
                JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                WHERE d.GLCAID = @gl AND v.Status = 'Posted'`);
    return round2(r.recordset[0].Cost);
}

// Sum of every prior period's charge that actually finalized. Draft runs
// (including the one currently being built, if any) are excluded — a
// not-yet-finalized amount hasn't really happened yet and may be cancelled.
async function getPostedAccumDep(txOrPool, fixedAssetId, excludeRunId = null) {
    const req = new sql.Request(txOrPool).input('id', sql.Int, fixedAssetId);
    if (excludeRunId) req.input('exr', sql.Int, excludeRunId);
    const r = await req.query(`
        SELECT ISNULL(SUM(e.DepreciationAmount), 0) AS Total
        FROM dms_FixedAssetDepreciationEntries e
        JOIN dms_FixedAssetDepreciationRuns r ON r.RunID = e.RunID
        JOIN data_FinanceVoucherInfo v ON v.VoucherID = r.VoucherID
        WHERE e.FixedAssetID = @id AND v.Status = 'Posted'
        ${excludeRunId ? 'AND e.RunID <> @exr' : ''}`);
    return round2(r.recordset[0].Total);
}

// Computes what each active, in-service asset would be charged for the
// given period, without writing anything. Used both for the preview screen
// and as the first step of createDraftRun.
async function buildRunCandidates(txOrPool, periodYear, periodMonth) {
    const pool = txOrPool;
    const assets = await new sql.Request(pool).query(`
        SELECT fa.FixedAssetID, fa.AssetGLCAID, fa.AccumDepGLCAID, fa.DepExpenseGLCAID,
               fa.ResidualValue, fa.DepreciationRatePct, fa.DepreciationStartDate,
               fa.OpeningAccumulatedDepreciation, fa.Status,
               costGl.GLCode AS AssetCode, costGl.GLTitle AS AssetName,
               catGl.GLTitle AS CategoryName,
               accumGl.GLCode AS AccumDepCode, accumGl.GLTitle AS AccumDepTitle,
               expGl.GLCode AS DepExpenseCode, expGl.GLTitle AS DepExpenseTitle
        FROM dms_FixedAssets fa
        JOIN GLChartOFAccount costGl  ON costGl.GLCAID = fa.AssetGLCAID
        JOIN GLChartOFAccount accumGl ON accumGl.GLCAID = fa.AccumDepGLCAID
        JOIN GLChartOFAccount expGl   ON expGl.GLCAID   = fa.DepExpenseGLCAID
        LEFT JOIN dms_FixedAssetCategoryGL catMap ON catMap.AccumDepGLCAID = fa.AccumDepGLCAID
        LEFT JOIN GLChartOFAccount catGl ON catGl.GLCAID = catMap.CategoryGLCAID
        WHERE fa.Status = 'ACTIVE'
        ORDER BY costGl.GLCode`);

    const thisMonthKey = monthKey(periodYear, periodMonth);
    const candidates = [];
    for (const a of assets.recordset) {
        const startDate = new Date(a.DepreciationStartDate);
        const startMonthKey = monthKey(startDate.getFullYear(), startDate.getMonth() + 1);
        // Owner decision: no charge in the start month itself.
        const firstChargeableMonthKey = startMonthKey + 1;
        if (thisMonthKey < firstChargeableMonthKey) continue;

        const cost = await getAssetCost(pool, a.AssetGLCAID);
        const residual = round2(a.ResidualValue);
        const depreciableAmount = round2(cost - residual);
        if (depreciableAmount <= 0) continue;

        const postedAccumDep = await getPostedAccumDep(pool, a.FixedAssetID);
        const accumDepToDate = round2(Number(a.OpeningAccumulatedDepreciation) + postedAccumDep);
        const remaining = round2(depreciableAmount - accumDepToDate);
        if (remaining <= 0.01) continue; // already fully depreciated

        const monthlyCharge = round2(depreciableAmount * (Number(a.DepreciationRatePct) / 100) / 12);
        const charge = Math.min(monthlyCharge, remaining);
        if (charge <= 0) continue;

        candidates.push({
            fixedAssetId: a.FixedAssetID,
            assetCode: a.AssetCode,
            assetName: a.AssetName,
            categoryName: a.CategoryName || '',
            accumDepGLCAID: a.AccumDepGLCAID,
            accumDepCode: a.AccumDepCode,
            accumDepTitle: a.AccumDepTitle,
            depExpenseGLCAID: a.DepExpenseGLCAID,
            depExpenseCode: a.DepExpenseCode,
            depExpenseTitle: a.DepExpenseTitle,
            cost,
            residualValue: residual,
            ratePct: Number(a.DepreciationRatePct),
            openingNBV: round2(cost - accumDepToDate),
            charge: round2(charge),
            closingNBV: round2(cost - accumDepToDate - charge),
            willBeFullyDepreciated: round2(remaining - charge) <= 0.01,
        });
    }
    return candidates;
}

// GET-side preview — read-only, posts nothing.
async function previewRun(periodYear, periodMonth) {
    const pool = await getPool();
    const existing = await pool.request()
        .input('y', sql.Int, periodYear).input('m', sql.Int, periodMonth)
        .query(`SELECT r.RunID, v.Status AS VoucherStatus, v.VoucherNo
                FROM dms_FixedAssetDepreciationRuns r
                LEFT JOIN data_FinanceVoucherInfo v ON v.VoucherID = r.VoucherID
                WHERE r.PeriodYear=@y AND r.PeriodMonth=@m`);
    const candidates = await buildRunCandidates(pool, periodYear, periodMonth);
    return {
        existingRun: existing.recordset[0] || null,
        candidates,
        totalCharge: round2(candidates.reduce((s, c) => s + c.charge, 0)),
    };
}

// Creates the Draft JV + run header + per-asset entries. Returns the same
// shape as previewRun plus voucherId/runId. Throws if a run already exists
// for the period (cancel it first via cancelDraftRun) or nothing is due.
async function createDraftRun(periodYear, periodMonth, user) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const dup = await new sql.Request(tx)
            .input('y', sql.Int, periodYear).input('m', sql.Int, periodMonth)
            .query(`SELECT RunID FROM dms_FixedAssetDepreciationRuns WHERE PeriodYear=@y AND PeriodMonth=@m`);
        if (dup.recordset.length) {
            throw new Error(`A depreciation run already exists for ${MONTH_NAMES[periodMonth]} ${periodYear}.`);
        }

        const candidates = await buildRunCandidates(tx, periodYear, periodMonth);
        if (!candidates.length) {
            throw new Error(`No assets are due for depreciation in ${MONTH_NAMES[periodMonth]} ${periodYear}.`);
        }

        // Group by category's GL pair — one Dr/Cr line per category, not
        // per asset. Per-asset detail lives in dms_FixedAssetDepreciationEntries.
        const byCategory = new Map();
        for (const c of candidates) {
            const key = c.accumDepGLCAID;
            if (!byCategory.has(key)) {
                byCategory.set(key, {
                    accumDepGLCAID: c.accumDepGLCAID, accumDepTitle: c.accumDepTitle,
                    depExpenseGLCAID: c.depExpenseGLCAID, depExpenseTitle: c.depExpenseTitle,
                    categoryName: c.categoryName, total: 0, count: 0,
                });
            }
            const g = byCategory.get(key);
            g.total = round2(g.total + c.charge);
            g.count += 1;
        }

        const totalAmount = round2(candidates.reduce((s, c) => s + c.charge, 0));
        const periodLabel = `${MONTH_NAMES[periodMonth]} ${periodYear}`;

        // 1. Run header stub (VoucherID backfilled below).
        const runIns = await new sql.Request(tx)
            .input('y', sql.Int, periodYear)
            .input('m', sql.Int, periodMonth)
            .input('cby', sql.Int, user?.userId || null)
            .input('cbyN', sql.NVarChar(100), user?.userName || null)
            .query(`INSERT INTO dms_FixedAssetDepreciationRuns (PeriodYear, PeriodMonth, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.RunID
                    VALUES (@y, @m, @cby, @cbyN)`);
        const runId = runIns.recordset[0].RunID;

        // 2. Draft JV — dated at period end (standard practice for a
        // monthly systematic charge, regardless of which day it's actually
        // posted on).
        const periodEnd = new Date(periodYear, periodMonth, 0); // day 0 of next month = last day of this month
        const vt = await new sql.Request(tx).query("SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title='JV'");
        if (!vt.recordset.length) throw new Error('JV voucher type not found.');
        const voucherNo = await nextVoucherNo(tx, 'JV');
        const remarks = `Depreciation (SLM) — ${periodLabel} — ${candidates.length} asset(s)`;

        const hdr = await new sql.Request(tx)
            .input('vd', sql.DateTime, periodEnd)
            .input('vno', sql.NVarChar(50), voucherNo)
            .input('vt', sql.Int, vt.recordset[0].Voucherid)
            .input('rem', sql.NVarChar(sql.MAX), remarks)
            .input('tot', sql.Decimal(18, 2), totalAmount)
            .input('src', sql.NVarChar(50), 'FIXED_ASSET_DEPRECIATION')
            .input('srcId', sql.Int, runId)
            .input('cby', sql.Int, user?.userId || null)
            .input('cbyN', sql.NVarChar(100), user?.userName || null)
            .query(`INSERT INTO data_FinanceVoucherInfo
                        (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                         Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.VoucherID
                    VALUES (@vd, @vno, @vt, @rem, @tot, 'Draft', 0, @src, @srcId, @cby, @cbyN)`);
        const voucherId = hdr.recordset[0].VoucherID;

        await new sql.Request(tx).input('rid', sql.Int, runId).input('vid', sql.Int, voucherId)
            .query(`UPDATE dms_FixedAssetDepreciationRuns SET VoucherID=@vid WHERE RunID=@rid`);

        // 3. Dr Depreciation Expense / Cr Accumulated Depreciation, one pair per category.
        for (const g of byCategory.values()) {
            const narration = `Depreciation - ${g.categoryName} - ${periodLabel} (${g.count} asset${g.count === 1 ? '' : 's'})`;
            await new sql.Request(tx)
                .input('vid', sql.Int, voucherId).input('gl', sql.Int, g.depExpenseGLCAID)
                .input('nar', sql.NVarChar(sql.MAX), narration).input('dr', sql.Decimal(18, 2), g.total)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, @dr, 0)`);
            await new sql.Request(tx)
                .input('vid', sql.Int, voucherId).input('gl', sql.Int, g.accumDepGLCAID)
                .input('nar', sql.NVarChar(sql.MAX), narration).input('cr', sql.Decimal(18, 2), g.total)
                .query(`INSERT INTO data_FinanceVoucherDetail (VoucherID, GLCAID, Narration, Debit, Credit)
                        VALUES (@vid, @gl, @nar, 0, @cr)`);
        }

        // 4. Per-asset audit trail.
        for (const c of candidates) {
            await new sql.Request(tx)
                .input('rid', sql.Int, runId).input('aid', sql.Int, c.fixedAssetId)
                .input('amt', sql.Decimal(18, 2), c.charge)
                .input('onbv', sql.Decimal(18, 2), c.openingNBV)
                .input('cnbv', sql.Decimal(18, 2), c.closingNBV)
                .query(`INSERT INTO dms_FixedAssetDepreciationEntries
                            (RunID, FixedAssetID, DepreciationAmount, OpeningNBV, ClosingNBV)
                        VALUES (@rid, @aid, @amt, @onbv, @cnbv)`);
        }

        await tx.commit();
        return { runId, voucherId, voucherNo, candidates, totalAmount };
    } catch (err) {
        try { await tx.rollback(); } catch {}
        throw err;
    }
}

// Only allowed while the linked voucher is still Draft — deletes the run,
// its entries, and the voucher itself, so the period can be redone cleanly.
async function cancelDraftRun(runId, user) {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const run = await new sql.Request(tx).input('id', sql.Int, runId)
            .query(`SELECT r.RunID, r.VoucherID, v.Status FROM dms_FixedAssetDepreciationRuns r
                    LEFT JOIN data_FinanceVoucherInfo v ON v.VoucherID = r.VoucherID
                    WHERE r.RunID=@id`);
        if (!run.recordset.length) throw new Error('Run not found.');
        const row = run.recordset[0];
        if (row.Status && row.Status !== 'Draft') {
            throw new Error(`Cannot cancel — voucher is already ${row.Status}.`);
        }

        await new sql.Request(tx).input('id', sql.Int, runId)
            .query(`DELETE FROM dms_FixedAssetDepreciationEntries WHERE RunID=@id`);
        await new sql.Request(tx).input('id', sql.Int, runId)
            .query(`DELETE FROM dms_FixedAssetDepreciationRuns WHERE RunID=@id`);
        if (row.VoucherID) {
            await new sql.Request(tx).input('id', sql.Int, row.VoucherID)
                .query(`DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@id`);
            await new sql.Request(tx).input('id', sql.Int, row.VoucherID)
                .query(`DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
        }
        await tx.commit();
    } catch (err) {
        try { await tx.rollback(); } catch {}
        throw err;
    }
}

// Dispatched from finalizeController.js's POST_COMMIT_HOOKS.VOUCHER once a
// Draft voucher flips to Posted. Marks any asset that hit its residual-value
// floor this run as FULLY_DEPRECIATED so it drops out of future candidates.
async function handleFixedAssetVoucherPosted(voucherId, sourceDocType, sourceDocId, user) {
    if (sourceDocType !== 'FIXED_ASSET_DEPRECIATION') return;
    const runId = sourceDocId;
    const pool = await getPool();

    const entries = await pool.request().input('rid', sql.Int, runId)
        .query(`SELECT e.FixedAssetID, fa.ResidualValue, fa.OpeningAccumulatedDepreciation, fa.AssetGLCAID
                FROM dms_FixedAssetDepreciationEntries e
                JOIN dms_FixedAssets fa ON fa.FixedAssetID = e.FixedAssetID
                WHERE e.RunID = @rid`);

    for (const row of entries.recordset) {
        const cost = await getAssetCost(pool, row.AssetGLCAID);
        const depreciableAmount = round2(cost - Number(row.ResidualValue));
        const accumDep = round2(Number(row.OpeningAccumulatedDepreciation) + await getPostedAccumDep(pool, row.FixedAssetID));
        if (round2(depreciableAmount - accumDep) <= 0.01) {
            await pool.request().input('id', sql.Int, row.FixedAssetID)
                .query(`UPDATE dms_FixedAssets SET Status='FULLY_DEPRECIATED' WHERE FixedAssetID=@id AND Status='ACTIVE'`);
        }
    }
}

module.exports = {
    getAssetCost, getPostedAccumDep, buildRunCandidates,
    previewRun, createDraftRun, cancelDraftRun, handleFixedAssetVoucherPosted,
};
