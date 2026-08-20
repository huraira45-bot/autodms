/**
 * Fixed Asset Register + IAS 16 SLM depreciation runs.
 * Posting/computation logic lives in services/fixedAssetDepreciationService.js.
 */
const { sql, getPool } = require('../config/db');
const {
    previewRun, createDraftRun, cancelDraftRun, getAssetCost, getPostedAccumDep,
} = require('../services/fixedAssetDepreciationService');

// GET /api/fixed-assets/candidates
// Depreciable-category GL leaves (isParent=0 under a mapped category, i.e.
// excludes LAND) not yet registered as a Fixed Asset — for the "add asset" picker.
exports.listCandidates = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT leaf.GLCAID, leaf.GLCode, leaf.GLTitle, cat.GLTitle AS CategoryName
            FROM GLChartOFAccount leaf
            JOIN dms_FixedAssetCategoryGL m ON m.CategoryGLCAID = (
                SELECT c.GLCAID FROM GLChartOFAccount c WHERE c.GLCode = LEFT(leaf.GLCode, 6)
            )
            JOIN GLChartOFAccount cat ON cat.GLCAID = m.CategoryGLCAID
            WHERE leaf.isParent = 0 AND leaf.GLLevel = 4
              AND NOT EXISTS (SELECT 1 FROM dms_FixedAssets fa WHERE fa.AssetGLCAID = leaf.GLCAID)
            ORDER BY leaf.GLCode`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/fixed-assets
// The register, with Cost / Accumulated Depreciation / NBV computed live.
exports.listAssets = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT fa.*, costGl.GLCode AS AssetCode, costGl.GLTitle AS AssetName,
                   catGl.GLTitle AS CategoryName,
                   accumGl.GLCode AS AccumDepCode, accumGl.GLTitle AS AccumDepTitle,
                   expGl.GLCode AS DepExpenseCode, expGl.GLTitle AS DepExpenseTitle
            FROM dms_FixedAssets fa
            JOIN GLChartOFAccount costGl  ON costGl.GLCAID = fa.AssetGLCAID
            JOIN GLChartOFAccount accumGl ON accumGl.GLCAID = fa.AccumDepGLCAID
            JOIN GLChartOFAccount expGl   ON expGl.GLCAID   = fa.DepExpenseGLCAID
            LEFT JOIN dms_FixedAssetCategoryGL catMap ON catMap.AccumDepGLCAID = fa.AccumDepGLCAID
            LEFT JOIN GLChartOFAccount catGl ON catGl.GLCAID = catMap.CategoryGLCAID
            ORDER BY costGl.GLCode`);

        const out = [];
        for (const a of r.recordset) {
            const cost = await getAssetCost(pool, a.AssetGLCAID);
            const postedAccumDep = await getPostedAccumDep(pool, a.FixedAssetID);
            const accumDepToDate = Math.round((Number(a.OpeningAccumulatedDepreciation) + postedAccumDep) * 100) / 100;
            out.push({
                ...a,
                Cost: cost,
                AccumulatedDepreciation: accumDepToDate,
                NetBookValue: Math.round((cost - accumDepToDate) * 100) / 100,
            });
        }
        res.json(out);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/fixed-assets
exports.createAsset = async (req, res) => {
    try {
        const {
            AssetGLCAID, ResidualValue, DepreciationRatePct, DepreciationStartDate,
            OpeningAccumulatedDepreciation, Notes,
        } = req.body || {};
        if (!AssetGLCAID) return res.status(400).json({ error: 'AssetGLCAID is required.' });
        const rate = Number(DepreciationRatePct);
        if (!Number.isFinite(rate) || rate <= 0 || rate > 100) {
            return res.status(400).json({ error: 'DepreciationRatePct must be a number between 0 and 100.' });
        }
        if (!DepreciationStartDate) return res.status(400).json({ error: 'DepreciationStartDate is required.' });

        const pool = await getPool();
        const dup = await pool.request().input('gl', sql.Int, AssetGLCAID)
            .query(`SELECT 1 FROM dms_FixedAssets WHERE AssetGLCAID=@gl`);
        if (dup.recordset.length) return res.status(409).json({ error: 'This asset is already registered.' });

        const map = await pool.request().input('gl', sql.Int, AssetGLCAID).query(`
            SELECT m.AccumDepGLCAID, m.DepExpenseGLCAID
            FROM dms_FixedAssetCategoryGL m
            JOIN GLChartOFAccount asset ON asset.GLCAID = @gl
            JOIN GLChartOFAccount cat   ON cat.GLCAID = m.CategoryGLCAID
            WHERE cat.GLCode = LEFT(asset.GLCode, 6)`);
        if (!map.recordset.length) {
            return res.status(400).json({ error: 'This account has no Accumulated Depreciation / Depreciation Expense mapping (is it Land, or not a Non-Current Asset leaf?).' });
        }
        const { AccumDepGLCAID, DepExpenseGLCAID } = map.recordset[0];

        const ins = await pool.request()
            .input('gl', sql.Int, AssetGLCAID)
            .input('adgl', sql.Int, AccumDepGLCAID)
            .input('degl', sql.Int, DepExpenseGLCAID)
            .input('res', sql.Decimal(18, 2), Number(ResidualValue) || 0)
            .input('rate', sql.Decimal(5, 2), rate)
            .input('start', sql.Date, new Date(DepreciationStartDate))
            .input('open', sql.Decimal(18, 2), Number(OpeningAccumulatedDepreciation) || 0)
            .input('notes', sql.NVarChar(500), Notes || null)
            .input('cby', sql.Int, req.user?.userId || null)
            .input('cbyN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_FixedAssets
                        (AssetGLCAID, AccumDepGLCAID, DepExpenseGLCAID, ResidualValue,
                         DepreciationRatePct, DepreciationStartDate, OpeningAccumulatedDepreciation,
                         Notes, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.FixedAssetID
                    VALUES (@gl, @adgl, @degl, @res, @rate, @start, @open, @notes, @cby, @cbyN)`);
        res.json({ message: 'Asset registered.', FixedAssetID: ins.recordset[0].FixedAssetID });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// PATCH /api/fixed-assets/:id
// Depreciation policy fields only — not the GL linkage, which is fixed at creation.
exports.updateAsset = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const { ResidualValue, DepreciationRatePct, DepreciationStartDate, Notes, Status } = req.body || {};
        if (Status && !['ACTIVE', 'DISPOSED'].includes(Status)) {
            return res.status(400).json({ error: "Status must be 'ACTIVE' or 'DISPOSED' (FULLY_DEPRECIATED is system-set)." });
        }
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('res', sql.Decimal(18, 2), Number(ResidualValue) || 0)
            .input('rate', sql.Decimal(5, 2), Number(DepreciationRatePct))
            .input('start', sql.Date, new Date(DepreciationStartDate))
            .input('notes', sql.NVarChar(500), Notes || null)
            .input('status', sql.NVarChar(20), Status || null)
            .query(`UPDATE dms_FixedAssets
                    SET ResidualValue=@res, DepreciationRatePct=@rate, DepreciationStartDate=@start,
                        Notes=@notes, Status=COALESCE(@status, Status)
                    WHERE FixedAssetID=@id;
                    SELECT @@ROWCOUNT AS affected;`);
        if (!r.recordset[0].affected) return res.status(404).json({ error: 'Asset not found.' });
        res.json({ message: 'Asset updated.' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/fixed-assets/runs/preview?year=&month=
exports.previewRun = async (req, res) => {
    try {
        const year = parseInt(req.query.year);
        const month = parseInt(req.query.month);
        if (!year || !month || month < 1 || month > 12) {
            return res.status(400).json({ error: 'year and month (1-12) are required.' });
        }
        const result = await previewRun(year, month);
        res.json(result);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/fixed-assets/runs   body: { year, month }
exports.createRun = async (req, res) => {
    try {
        const { year, month } = req.body || {};
        const y = parseInt(year), m = parseInt(month);
        if (!y || !m || m < 1 || m > 12) {
            return res.status(400).json({ error: 'year and month (1-12) are required.' });
        }
        const result = await createDraftRun(y, m, req.user);
        res.json({
            message: `Draft depreciation JV ${result.voucherNo} created for ${result.candidates.length} asset(s). Finalize it from Vouchers to post to the ledger.`,
            ...result,
        });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// GET /api/fixed-assets/runs
exports.listRuns = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT r.RunID, r.PeriodYear, r.PeriodMonth, r.CreatedAt, r.CreatedByName,
                   v.VoucherID, v.VoucherNo, v.Status AS VoucherStatus, v.TotalAmount,
                   (SELECT COUNT(*) FROM dms_FixedAssetDepreciationEntries e WHERE e.RunID = r.RunID) AS AssetCount
            FROM dms_FixedAssetDepreciationRuns r
            LEFT JOIN data_FinanceVoucherInfo v ON v.VoucherID = r.VoucherID
            ORDER BY r.PeriodYear DESC, r.PeriodMonth DESC`);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/fixed-assets/runs/:id/cancel
exports.cancelRun = async (req, res) => {
    try {
        await cancelDraftRun(parseInt(req.params.id), req.user);
        res.json({ message: 'Draft run cancelled.' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};
