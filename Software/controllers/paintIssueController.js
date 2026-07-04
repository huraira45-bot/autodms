/**
 * Paint Issue — controller (Phase 3).
 *
 * Internal paint issued to a Job Card. NOT billed to the customer — this
 * is a costing document only. GL impact is deferred until the linked JC
 * finalizes (see services/paintIssueConsumptionService.js).
 *
 * Rules:
 *  - Stock is reduced IMMEDIATELY at save/create (running qty + moving-avg
 *    on paint_Item). No draft state.
 *  - Each line pins IssueUnitCost = paint_Item.AvgCost at the moment of
 *    issue so edits/reverses use the exact same cost.
 *  - JC must have a JobCardType in paint_AllowedBusinessType.
 *  - JC must NOT be finalized (Addata_JobCardInfo.IsFinalized=0).
 *  - Once the JC finalizes, paint_Issue.Locked=1 and no more edits/deletes.
 *  - Editing = full-replace: restore each old line at its IssueUnitCost,
 *    then re-issue the new lines at current AvgCost.
 *  - Deleting a Paint Issue restores stock at the pinned IssueUnitCost.
 */
const { sql, getPool } = require('../config/db');

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const round4 = (n) => Math.round((Number(n) || 0) * 10000) / 10000;

// ─── List ────────────────────────────────────────────────────────
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['1=1'];
        if (req.query.search) {
            rq.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(pi.IssueNo LIKE @q OR jc.JobCardNo LIKE @q)');
        }
        if (req.query.jobCardId) {
            rq.input('jc', sql.Int, parseInt(req.query.jobCardId));
            conds.push('pi.JobCardID = @jc');
        }
        if (req.query.locked === '0' || req.query.locked === '1') {
            rq.input('lk', sql.Bit, req.query.locked === '1' ? 1 : 0);
            conds.push('pi.Locked = @lk');
        }
        if (req.query.from) { rq.input('df', sql.Date, req.query.from); conds.push('pi.IssueDate >= @df'); }
        if (req.query.to)   { rq.input('dt', sql.Date, req.query.to);   conds.push('pi.IssueDate <= @dt'); }
        const r = await rq.query(`
            SELECT pi.PaintIssueID, pi.IssueNo, pi.IssueDate,
                   pi.JobCardID, jc.JobCardNo, jc.IsFinalized AS JCFinalized,
                   pi.PaintWHID, w.WHDesc,
                   pi.TotalCost, pi.Locked, pi.CreatedByName, pi.CreatedAt
            FROM paint_Issue pi
            INNER JOIN Addata_JobCardInfo jc ON pi.JobCardID = jc.JobCardId
            LEFT JOIN paint_Warehouse w      ON pi.PaintWHID = w.PaintWHID
            WHERE ${conds.join(' AND ')}
            ORDER BY pi.PaintIssueID DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Get single ──────────────────────────────────────────────────
exports.get = async (req, res) => {
    try {
        const pool = await getPool();
        const [hdr, lines] = await Promise.all([
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT pi.*, jc.JobCardNo, jc.IsFinalized AS JCFinalized,
                       jc.VehicleRegNo, cust.endUserName AS CustomerName,
                       w.WHDesc, w.WHCode
                FROM paint_Issue pi
                INNER JOIN Addata_JobCardInfo jc ON pi.JobCardID = jc.JobCardId
                LEFT JOIN addata_CustomerInfo cust ON jc.EndUserID = cust.ProfileID
                LEFT JOIN paint_Warehouse w      ON pi.PaintWHID = w.PaintWHID
                WHERE pi.PaintIssueID = @id`),
            pool.request().input('id', sql.Int, req.params.id).query(`
                SELECT d.*, p.PaintCode, p.PaintName, u.UOMName
                FROM paint_IssueDetail d
                INNER JOIN paint_Item p ON d.PaintItemID = p.PaintItemID
                LEFT JOIN paint_UOM u   ON d.PaintUOMID  = u.PaintUOMID
                WHERE d.PaintIssueID = @id
                ORDER BY d.PaintIssueDetailID`),
        ]);
        if (!hdr.recordset.length) return res.status(404).json({ error: 'Paint Issue not found' });
        res.json({ ...hdr.recordset[0], Lines: lines.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ─── Eligible Job Cards — allowed business type + not finalized
exports.eligibleJobs = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['jc.IsFinalized = 0'];
        if (req.query.search) {
            rq.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(jc.JobCardNo LIKE @q OR jc.VehicleRegNo LIKE @q OR cust.endUserName LIKE @q)');
        }
        const r = await rq.query(`
            SELECT jc.JobCardId, jc.JobCardNo, jc.VehicleRegNo,
                   cust.endUserName AS CustomerName,
                   jt.CardCode, jt.Title AS JobTypeTitle
            FROM Addata_JobCardInfo jc
            INNER JOIN gen_JobCardType jt ON jc.JobCardTypeId = jt.JobCardTypeId
            INNER JOIN paint_AllowedBusinessType abt ON abt.JobCardTypeId = jt.JobCardTypeId
            LEFT JOIN addata_CustomerInfo cust ON jc.EndUserID = cust.ProfileID
            WHERE ${conds.join(' AND ')}
            ORDER BY jc.JobCardId DESC
        `);
        res.json(r.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Compensate — put a set of previously-issued lines back into stock at
// their pinned IssueUnitCost. Used by edit + delete. Runs inside the tx.
async function restoreLines(tx, issueId, paintWHID, note, userInfo) {
    const oldLines = (await new sql.Request(tx).input('id', sql.Int, issueId)
        .query(`SELECT * FROM paint_IssueDetail WHERE PaintIssueID=@id`)).recordset;

    for (const l of oldLines) {
        const itRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
            .query('SELECT StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
        const oldQty = Number(itRes.recordset[0].StockQty) || 0;
        const oldAvg = Number(itRes.recordset[0].AvgCost) || 0;
        const inQty  = Number(l.Quantity);
        const inVal  = round2(inQty * Number(l.IssueUnitCost));
        const newQty = round4(oldQty + inQty);
        const newVal = round2(oldQty * oldAvg + inVal);
        const newAvg = newQty > 0 ? round4(newVal / newQty) : 0;

        await new sql.Request(tx)
            .input('i', sql.Int,           l.PaintItemID)
            .input('q', sql.Decimal(18,4), newQty)
            .input('a', sql.Decimal(18,4), newAvg)
            .query('UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@i');

        await new sql.Request(tx)
            .input('it',  sql.Int,           l.PaintItemID)
            .input('wh',  sql.Int,           paintWHID)
            .input('src', sql.NVarChar(20),  'ISSUE_ADJ')
            .input('sid', sql.Int,           issueId)
            .input('did', sql.Int,           l.PaintIssueDetailID)
            .input('dq',  sql.Decimal(18,4), inQty)
            .input('uc',  sql.Decimal(18,4), l.IssueUnitCost)
            .input('dv',  sql.Decimal(18,2), inVal)
            .input('rq',  sql.Decimal(18,4), newQty)
            .input('ra',  sql.Decimal(18,4), newAvg)
            .input('nt',  sql.NVarChar(200), note)
            .input('cb',  sql.Int,           userInfo?.userId || null)
            .input('cbn', sql.NVarChar(100), userInfo?.userName || null)
            .query(`INSERT INTO paint_StockLedger
                        (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                         QuantityDelta, UnitCost, ValueDelta,
                         RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                    VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);
    }
    // Wipe old detail rows so the write path can re-insert cleanly.
    await new sql.Request(tx).input('id', sql.Int, issueId)
        .query(`DELETE FROM paint_IssueDetail WHERE PaintIssueID=@id`);
}

// Consume — deduct a set of new lines from stock. Pins IssueUnitCost at
// paint_Item.AvgCost right now. Returns [{ PaintIssueDetailID, LineTotal }]
// aggregated line totals for header TotalCost.
async function consumeLines(tx, issueId, paintWHID, lines, note, userInfo) {
    let totalCost = 0;
    for (const l of lines) {
        if (!l.PaintItemID) throw new Error('Every line needs PaintItemID');
        const qty = round4(l.Quantity);
        if (!(qty > 0)) throw new Error('Each line quantity must be > 0');

        const itRes = await new sql.Request(tx).input('i', sql.Int, l.PaintItemID)
            .query('SELECT PaintCode, PaintName, StockQty, AvgCost FROM paint_Item WITH (UPDLOCK, HOLDLOCK) WHERE PaintItemID=@i');
        if (!itRes.recordset.length) throw new Error(`Paint item ${l.PaintItemID} not found.`);
        const it = itRes.recordset[0];
        const oldQty = Number(it.StockQty) || 0;
        const oldAvg = Number(it.AvgCost) || 0;
        if (oldQty - qty < -0.0001) {
            throw new Error(`Insufficient stock for ${it.PaintName} (${it.PaintCode}). On hand: ${oldQty}, requested: ${qty}.`);
        }
        const unitCost = round4(oldAvg);
        const lineVal  = round2(qty * unitCost);
        const newQty   = round4(oldQty - qty);
        const newVal   = round2(oldQty * oldAvg - lineVal);
        const newAvg   = newQty > 0 ? round4(Math.max(0, newVal) / newQty) : 0;

        await new sql.Request(tx)
            .input('i', sql.Int,           l.PaintItemID)
            .input('q', sql.Decimal(18,4), newQty)
            .input('a', sql.Decimal(18,4), newAvg)
            .query('UPDATE paint_Item SET StockQty=@q, AvgCost=@a, UpdatedAt=GETDATE() WHERE PaintItemID=@i');

        const insRes = await new sql.Request(tx)
            .input('h',  sql.Int,           issueId)
            .input('it', sql.Int,           l.PaintItemID)
            .input('u',  sql.Int,           l.PaintUOMID || null)
            .input('q',  sql.Decimal(18,4), qty)
            .input('uc', sql.Decimal(18,4), unitCost)
            .input('lt', sql.Decimal(18,2), lineVal)
            .query(`INSERT INTO paint_IssueDetail
                        (PaintIssueID, PaintItemID, PaintUOMID, Quantity, IssueUnitCost, LineTotal)
                    OUTPUT INSERTED.PaintIssueDetailID
                    VALUES (@h, @it, @u, @q, @uc, @lt)`);

        await new sql.Request(tx)
            .input('it',  sql.Int,           l.PaintItemID)
            .input('wh',  sql.Int,           paintWHID)
            .input('src', sql.NVarChar(20),  'ISSUE')
            .input('sid', sql.Int,           issueId)
            .input('did', sql.Int,           insRes.recordset[0].PaintIssueDetailID)
            .input('dq',  sql.Decimal(18,4), -qty)
            .input('uc',  sql.Decimal(18,4), unitCost)
            .input('dv',  sql.Decimal(18,2), -lineVal)
            .input('rq',  sql.Decimal(18,4), newQty)
            .input('ra',  sql.Decimal(18,4), newAvg)
            .input('nt',  sql.NVarChar(200), note)
            .input('cb',  sql.Int,           userInfo?.userId || null)
            .input('cbn', sql.NVarChar(100), userInfo?.userName || null)
            .query(`INSERT INTO paint_StockLedger
                        (PaintItemID, PaintWHID, SourceType, SourceDocID, SourceDetailID,
                         QuantityDelta, UnitCost, ValueDelta,
                         RunningQty, RunningAvgCost, Note, CreatedBy, CreatedByName)
                    VALUES (@it, @wh, @src, @sid, @did, @dq, @uc, @dv, @rq, @ra, @nt, @cb, @cbn)`);

        totalCost = round2(totalCost + lineVal);
    }
    return totalCost;
}

// Guard: JC must exist, not be finalized, and be an allowed business type.
async function assertJCEligible(tx, jobCardId) {
    const r = await new sql.Request(tx).input('id', sql.Int, jobCardId)
        .query(`SELECT jc.JobCardId, jc.JobCardNo, jc.IsFinalized, jt.JobCardTypeId, jt.CardCode, jt.Title,
                       (SELECT COUNT(*) FROM paint_AllowedBusinessType abt WHERE abt.JobCardTypeId = jt.JobCardTypeId) AS allowed
                FROM Addata_JobCardInfo jc
                INNER JOIN gen_JobCardType jt ON jc.JobCardTypeId = jt.JobCardTypeId
                WHERE jc.JobCardId=@id`);
    if (!r.recordset.length) throw new Error('Job Card not found.');
    const jc = r.recordset[0];
    if (jc.IsFinalized) throw new Error(`Job Card ${jc.JobCardNo} is already finalized. Unfinalize it first to edit paint issues.`);
    if (!jc.allowed) throw new Error(`Job Card ${jc.JobCardNo} is business type ${jc.CardCode} which is not allowed for Paint Issue. Adjust "Allowed Business Types" in Paint Settings.`);
    return jc;
}

// ─── Create ──────────────────────────────────────────────────────
exports.create = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const { IssueDate, JobCardID, PaintWHID, Remarks, Lines = [] } = req.body;
        if (!IssueDate) throw new Error('IssueDate required');
        if (!JobCardID) throw new Error('JobCardID required');
        if (!PaintWHID) throw new Error('PaintWHID required');
        if (!Array.isArray(Lines) || Lines.length === 0) throw new Error('At least one line required');

        await assertJCEligible(tx, JobCardID);

        const seq = await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_PaintIssueNo AS n');
        const issueNo = `PI-${String(seq.recordset[0].n).padStart(4, '0')}`;
        const insRes = await new sql.Request(tx)
            .input('no',  sql.NVarChar(30), issueNo)
            .input('dt',  sql.Date, IssueDate)
            .input('jc',  sql.Int, JobCardID)
            .input('wh',  sql.Int, PaintWHID)
            .input('rm',  sql.NVarChar(500), Remarks || null)
            .input('cby', sql.Int, req.user?.userId || null)
            .input('cbn', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO paint_Issue
                        (IssueNo, IssueDate, JobCardID, PaintWHID, Remarks, TotalCost, Locked,
                         CreatedBy, CreatedByName)
                    OUTPUT INSERTED.PaintIssueID
                    VALUES (@no, @dt, @jc, @wh, @rm, 0, 0, @cby, @cbn)`);
        const id = insRes.recordset[0].PaintIssueID;

        const total = await consumeLines(tx, id, PaintWHID, Lines,
            `Issue ${issueNo} created`, req.user);
        await new sql.Request(tx).input('id', sql.Int, id).input('t', sql.Decimal(18,2), total)
            .query('UPDATE paint_Issue SET TotalCost=@t, UpdatedAt=GETDATE() WHERE PaintIssueID=@id');

        await tx.commit();
        res.status(201).json({ PaintIssueID: id, TotalCost: total });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

// ─── Update (full-replace, only if !Locked) ─────────────────────
exports.update = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const { IssueDate, JobCardID, PaintWHID, Remarks, Lines = [] } = req.body;

        const cur = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_Issue WITH (UPDLOCK, HOLDLOCK) WHERE PaintIssueID=@id');
        if (!cur.recordset.length) throw new Error('Paint Issue not found.');
        const c = cur.recordset[0];
        if (c.Locked) throw new Error('Paint Issue is Locked because its Job Card has been finalized. Unfinalize the JC to edit it.');
        if (!Array.isArray(Lines) || Lines.length === 0) throw new Error('At least one line required');
        if (Number(JobCardID) !== Number(c.JobCardID)) throw new Error('Job Card cannot be changed on an existing Paint Issue. Delete and create a new one instead.');

        await assertJCEligible(tx, JobCardID);

        // 1) Restore stock from existing lines at their IssueUnitCost.
        await restoreLines(tx, id, c.PaintWHID, `Issue ${c.IssueNo} — edit: restore prior`, req.user);

        // 2) Update header fields.
        await new sql.Request(tx)
            .input('id',  sql.Int, id)
            .input('dt',  sql.Date, IssueDate)
            .input('wh',  sql.Int, PaintWHID)
            .input('rm',  sql.NVarChar(500), Remarks || null)
            .query('UPDATE paint_Issue SET IssueDate=@dt, PaintWHID=@wh, Remarks=@rm WHERE PaintIssueID=@id');

        // 3) Consume new lines at current AvgCost (post-restore).
        const total = await consumeLines(tx, id, PaintWHID, Lines,
            `Issue ${c.IssueNo} — edit: re-issue`, req.user);
        await new sql.Request(tx).input('id', sql.Int, id).input('t', sql.Decimal(18,2), total)
            .query('UPDATE paint_Issue SET TotalCost=@t, UpdatedAt=GETDATE() WHERE PaintIssueID=@id');

        await tx.commit();
        res.json({ message: 'Paint Issue updated', TotalCost: total });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

// ─── Delete (restores stock at IssueUnitCost; only if !Locked) ──
exports.remove = async (req, res) => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const id = parseInt(req.params.id);
        const cur = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT * FROM paint_Issue WITH (UPDLOCK, HOLDLOCK) WHERE PaintIssueID=@id');
        if (!cur.recordset.length) throw new Error('Paint Issue not found.');
        const c = cur.recordset[0];
        if (c.Locked) throw new Error('Paint Issue is Locked because its Job Card has been finalized. Unfinalize the JC first.');

        await restoreLines(tx, id, c.PaintWHID, `Issue ${c.IssueNo} — deleted`, req.user);
        // detail rows were wiped by restoreLines; header can now go
        await new sql.Request(tx).input('id', sql.Int, id)
            .query('DELETE FROM paint_Issue WHERE PaintIssueID=@id');
        await tx.commit();
        res.json({ message: 'Paint Issue deleted and stock restored.' });
    } catch (err) {
        try { await tx.rollback(); } catch (_) {}
        res.status(400).json({ error: err.message });
    }
};

exports.printData = async (req, res) => exports.get(req, res);
