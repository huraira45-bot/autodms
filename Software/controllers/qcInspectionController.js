/**
 * QC Inspection Checksheet — the sheet worked through before the car goes back.
 *
 * Owner ask 2026-09-25, from the dealership's paper sheet: 44 points in 8
 * sections, confirmed at delivery. Two decisions taken then, which this file
 * holds to:
 *
 *   * RECORD ONLY. An incomplete sheet never blocks finalizing a job card.
 *     Nothing here is called from the finalize path.
 *   * The points are EDITABLE in Workshop Settings. Retiring one is a soft
 *     retire (IsActive = 0), never a delete, so sheets that already used it
 *     keep reading correctly.
 *
 * A sheet snapshots each point's WORDING when it is started. Reword a point
 * next year and last year's sheet still says what was actually checked — the
 * whole value of a signed-off inspection is that it cannot change afterwards.
 *
 * Confirmed is deliberately three-state: NULL not looked at yet, 1 confirmed,
 * 0 checked and not right. A half-finished sheet must never read as a passed
 * one, which a plain bit defaulting to 0 would have made easy.
 */
const { sql, getPool } = require('../config/db');

const httpError = (status, message) => Object.assign(new Error(message), { status });
const fail = (res, err, where) => {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error(`${where}:`, err);
    res.status(500).json({ error: err.message });
};

// =========================================================================
// The master list — Workshop Settings
// =========================================================================

/** GET /api/workshop/qc/points?all=1 */
exports.listPoints = async (req, res) => {
    try {
        const pool = await getPool();
        const all = String(req.query.all || '') === '1';
        const r = await pool.request().query(`
            SELECT PointID, Section, SectionSeq, PointSeq, PointText, IsActive
            FROM   dms_QCInspectionPoints
            ${all ? '' : 'WHERE IsActive = 1'}
            ORDER  BY SectionSeq, PointSeq, PointID`);
        res.json(r.recordset);
    } catch (err) { fail(res, err, 'listPoints'); }
};

const readPoint = (b) => {
    const section = String(b.Section || '').trim();
    const text = String(b.PointText || '').trim();
    if (!section) throw httpError(400, 'Which section does this point belong to?');
    if (!text) throw httpError(400, 'Type what is being checked.');
    if (section.length > 60) throw httpError(400, 'The section name is longer than 60 characters.');
    if (text.length > 300) throw httpError(400, 'The point is longer than 300 characters.');
    return { section, text };
};

/** POST /api/workshop/qc/points   { Section, PointText, SectionSeq?, PointSeq? } */
exports.createPoint = async (req, res) => {
    try {
        const { section, text } = readPoint(req.body || {});
        const pool = await getPool();

        // A new point in an existing section joins that section rather than
        // starting a second one with the same name further down the sheet.
        const seqRow = (await pool.request().input('s', sql.NVarChar(60), section).query(`
            SELECT TOP 1 SectionSeq FROM dms_QCInspectionPoints WHERE Section = @s ORDER BY SectionSeq`)).recordset[0];
        const maxSection = (await pool.request().query(
            'SELECT ISNULL(MAX(SectionSeq), 0) AS m FROM dms_QCInspectionPoints')).recordset[0].m;
        const sectionSeq = Number.isInteger(parseInt(req.body?.SectionSeq))
            ? parseInt(req.body.SectionSeq)
            : (seqRow ? seqRow.SectionSeq : maxSection + 1);

        const maxPoint = (await pool.request().input('ss', sql.Int, sectionSeq).query(
            'SELECT ISNULL(MAX(PointSeq), 0) AS m FROM dms_QCInspectionPoints WHERE SectionSeq = @ss')).recordset[0].m;

        const ins = await pool.request()
            .input('sec',  sql.NVarChar(60),  section)
            .input('ss',   sql.Int,           sectionSeq)
            .input('ps',   sql.Int,           maxPoint + 1)
            .input('txt',  sql.NVarChar(300), text)
            .query(`INSERT INTO dms_QCInspectionPoints (Section, SectionSeq, PointSeq, PointText)
                    OUTPUT INSERTED.PointID, INSERTED.Section, INSERTED.SectionSeq,
                           INSERTED.PointSeq, INSERTED.PointText, INSERTED.IsActive
                    VALUES (@sec, @ss, @ps, @txt)`);
        res.status(201).json(ins.recordset[0]);
    } catch (err) { fail(res, err, 'createPoint'); }
};

/** PUT /api/workshop/qc/points/:id   { Section, PointText, IsActive? } */
exports.updatePoint = async (req, res) => {
    try {
        const { section, text } = readPoint(req.body || {});
        const pool = await getPool();
        const r = await pool.request()
            .input('id',  sql.Int,           parseInt(req.params.id))
            .input('sec', sql.NVarChar(60),  section)
            .input('txt', sql.NVarChar(300), text)
            .input('act', sql.Bit,           req.body?.IsActive === undefined ? null : (req.body.IsActive ? 1 : 0))
            .query(`UPDATE dms_QCInspectionPoints
                    SET    Section = @sec, PointText = @txt,
                           IsActive = ISNULL(@act, IsActive), UpdatedAt = GETDATE()
                    OUTPUT INSERTED.PointID, INSERTED.Section, INSERTED.SectionSeq,
                           INSERTED.PointSeq, INSERTED.PointText, INSERTED.IsActive
                    WHERE  PointID = @id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'That inspection point no longer exists.' });
        res.json(r.recordset[0]);
    } catch (err) { fail(res, err, 'updatePoint'); }
};

/**
 * DELETE /api/workshop/qc/points/:id
 * Retired, not deleted: sheets already filled name this point, and a sheet
 * that silently loses a line is worse than one with a line nobody checks now.
 */
exports.retirePoint = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id))
            .query(`UPDATE dms_QCInspectionPoints SET IsActive = 0, UpdatedAt = GETDATE()
                    OUTPUT INSERTED.PointID WHERE PointID = @id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'That inspection point no longer exists.' });
        res.json({ ok: true, PointID: r.recordset[0].PointID, retired: true });
    } catch (err) { fail(res, err, 'retirePoint'); }
};

// =========================================================================
// The sheet against a job card
// =========================================================================

const loadInspection = async (pool, inspectionId) => {
    const head = (await pool.request().input('id', sql.Int, inspectionId).query(`
        SELECT * FROM dms_QCInspections WHERE InspectionID = @id`)).recordset[0];
    if (!head) return null;
    const results = (await pool.request().input('id', sql.Int, inspectionId).query(`
        SELECT ResultID, PointID, Section, SectionSeq, PointSeq, PointText,
               Confirmed, Remarks, CheckedAt
        FROM   dms_QCInspectionResults
        WHERE  InspectionID = @id
        ORDER  BY SectionSeq, PointSeq, ResultID`)).recordset;
    const checked = results.filter(r => r.Confirmed !== null).length;
    return {
        ...head,
        Results: results,
        Progress: {
            total: results.length,
            checked,
            confirmed: results.filter(r => r.Confirmed === true).length,
            failed: results.filter(r => r.Confirmed === false).length,
            outstanding: results.length - checked,
        },
    };
};

/** GET /api/workshop/job-cards/:id/qc — every sheet on this job card. */
exports.listForJobCard = async (req, res) => {
    try {
        const pool = await getPool();
        const rows = (await pool.request().input('jc', sql.Int, parseInt(req.params.id)).query(`
            SELECT InspectionID FROM dms_QCInspections WHERE JobCardID = @jc ORDER BY InspectionID`)).recordset;
        const sheets = [];
        for (const row of rows) sheets.push(await loadInspection(pool, row.InspectionID));
        res.json(sheets);
    } catch (err) { fail(res, err, 'listForJobCard'); }
};

/**
 * POST /api/workshop/job-cards/:id/qc
 * Starts a sheet, copying today's active points onto it. An unfinished sheet
 * is handed back instead of starting a second — two half-filled sheets on one
 * car is how a point gets missed.
 */
exports.startForJobCard = async (req, res) => {
    try {
        const jobCardId = parseInt(req.params.id);
        if (!Number.isInteger(jobCardId)) return res.status(400).json({ error: 'Which job card?' });
        const pool = await getPool();

        const jc = (await pool.request().input('id', sql.Int, jobCardId).query(`
            SELECT JobCardId, JobCardNo, VehicleRegNo, VersionCode, KiloMeter
            FROM   Addata_JobCardInfo WHERE JobCardId = @id`)).recordset[0];
        if (!jc) return res.status(404).json({ error: 'Job card not found.' });

        const open = (await pool.request().input('jc', sql.Int, jobCardId).query(`
            SELECT TOP 1 InspectionID FROM dms_QCInspections
            WHERE  JobCardID = @jc AND Status = 'InProgress' ORDER BY InspectionID DESC`)).recordset[0];
        if (open) return res.json(await loadInspection(pool, open.InspectionID));

        const points = (await pool.request().query(`
            SELECT PointID, Section, SectionSeq, PointSeq, PointText
            FROM   dms_QCInspectionPoints WHERE IsActive = 1
            ORDER  BY SectionSeq, PointSeq, PointID`)).recordset;
        if (!points.length) {
            return res.status(400).json({
                error: 'There are no inspection points set up. Add them in Workshop Settings first.' });
        }

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const ins = await new sql.Request(tx)
                .input('jc',    sql.Int,           jobCardId)
                .input('no',    sql.NVarChar(100), jc.JobCardNo || null)
                .input('reg',   sql.NVarChar(150), jc.VehicleRegNo || null)
                .input('model', sql.NVarChar(300), jc.VersionCode || null)
                .input('km',    sql.Decimal(18,2), jc.KiloMeter == null ? null : Number(jc.KiloMeter))
                .input('uid',   sql.Int,           req.user?.userId || null)
                .input('uname', sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_QCInspections
                            (JobCardID, JobCardNo, VehicleRegNo, VehicleModel, Odometer,
                             InspectedByUserID, InspectedByName)
                        OUTPUT INSERTED.InspectionID
                        VALUES (@jc, @no, @reg, @model, @km, @uid, @uname)`);
            const inspectionId = ins.recordset[0].InspectionID;

            // A fresh request per row — the same "parameter already declared"
            // trap the rest of this codebase avoids inside a transaction loop.
            for (const p of points) {
                await new sql.Request(tx)
                    .input('insp', sql.Int,           inspectionId)
                    .input('pid',  sql.Int,           p.PointID)
                    .input('sec',  sql.NVarChar(60),  p.Section)
                    .input('ss',   sql.Int,           p.SectionSeq)
                    .input('ps',   sql.Int,           p.PointSeq)
                    .input('txt',  sql.NVarChar(300), p.PointText)
                    .query(`INSERT INTO dms_QCInspectionResults
                                (InspectionID, PointID, Section, SectionSeq, PointSeq, PointText)
                            VALUES (@insp, @pid, @sec, @ss, @ps, @txt)`);
            }
            await tx.commit();
            res.status(201).json(await loadInspection(pool, inspectionId));
        } catch (err) {
            try { await tx.rollback(); } catch { /* already gone */ }
            throw err;
        }
    } catch (err) { fail(res, err, 'startForJobCard'); }
};

/**
 * PUT /api/workshop/qc/:inspectionId
 * Body: { Results: [{ ResultID, Confirmed (true|false|null), Remarks }],
 *         Notes?, Complete? }
 *
 * Saves as the inspector walks round the car, so a tablet that loses Wi-Fi
 * mid-sheet has not lost the points already done. Completing is explicit and
 * does NOT require every point to be confirmed — owner's decision: record
 * only, never block.
 */
exports.saveResults = async (req, res) => {
    try {
        const inspectionId = parseInt(req.params.inspectionId);
        const b = req.body || {};
        const pool = await getPool();

        const head = (await pool.request().input('id', sql.Int, inspectionId).query(
            'SELECT InspectionID, Status FROM dms_QCInspections WHERE InspectionID = @id')).recordset[0];
        if (!head) return res.status(404).json({ error: 'That checksheet no longer exists.' });
        if (head.Status === 'Completed') {
            return res.status(423).json({
                error: 'This checksheet is completed and is kept as the record of what was checked.' });
        }

        const rows = Array.isArray(b.Results) ? b.Results : [];
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            for (const row of rows) {
                const resultId = parseInt(row.ResultID);
                if (!Number.isInteger(resultId)) continue;
                // undefined and null both mean "not looked at yet"; only true
                // and false are answers.
                const confirmed = row.Confirmed === null || row.Confirmed === undefined
                    ? null : (row.Confirmed ? 1 : 0);
                await new sql.Request(tx)
                    .input('rid',  sql.Int,           resultId)
                    .input('insp', sql.Int,           inspectionId)
                    .input('c',    sql.Bit,           confirmed)
                    .input('rem',  sql.NVarChar(300), row.Remarks ? String(row.Remarks).slice(0, 300) : null)
                    .query(`UPDATE dms_QCInspectionResults
                            SET    Confirmed = @c, Remarks = @rem,
                                   CheckedAt = CASE WHEN @c IS NULL THEN NULL ELSE GETDATE() END
                            WHERE  ResultID = @rid AND InspectionID = @insp`);
            }

            await new sql.Request(tx)
                .input('id',    sql.Int,            inspectionId)
                .input('notes', sql.NVarChar(1000), b.Notes === undefined ? null : (b.Notes ? String(b.Notes).slice(0, 1000) : null))
                .input('done',  sql.Bit,            b.Complete ? 1 : 0)
                .input('uid',   sql.Int,            req.user?.userId || null)
                .input('uname', sql.NVarChar(100),  req.user?.userName || null)
                .query(`UPDATE dms_QCInspections
                        SET    Notes = ISNULL(@notes, Notes),
                               Status = CASE WHEN @done = 1 THEN 'Completed' ELSE Status END,
                               CompletedAt = CASE WHEN @done = 1 THEN GETDATE() ELSE CompletedAt END,
                               InspectedByUserID = ISNULL(@uid, InspectedByUserID),
                               InspectedByName = ISNULL(@uname, InspectedByName)
                        WHERE  InspectionID = @id`);
            await tx.commit();
        } catch (err) {
            try { await tx.rollback(); } catch { /* already gone */ }
            throw err;
        }
        res.json(await loadInspection(pool, inspectionId));
    } catch (err) { fail(res, err, 'saveResults'); }
};

/** GET /api/workshop/qc/:inspectionId — one sheet, for the screen or the print. */
exports.getInspection = async (req, res) => {
    try {
        const pool = await getPool();
        const sheet = await loadInspection(pool, parseInt(req.params.inspectionId));
        if (!sheet) return res.status(404).json({ error: 'That checksheet no longer exists.' });
        res.json(sheet);
    } catch (err) { fail(res, err, 'getInspection'); }
};
