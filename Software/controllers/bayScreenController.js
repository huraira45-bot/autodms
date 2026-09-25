/**
 * Bay screens — service tablet app, Phase 3 (plan 2026-09-14).
 *
 * Device admin (signed-in user with workshop_bay_screen):
 *   list, register (issues the device token), unregister.
 *
 * The screen itself (device token, see services/bayDevices.js):
 *   the job lines on its bay, and Start / Finish / Undo on them. Times are
 *   always the server's GETDATE(), never the device clock, so the Job
 *   Controller, the lobby kiosk and the reports all see the same times.
 */
const { sql, getPool } = require('../config/db');
const { newTokenId, signDeviceToken } = require('../services/bayDevices');
const events = require('../services/serviceEvents');

// A mistaken tap can be undone from the screen for this long.
const UNDO_SECONDS = 300;

// ---------------------------------------------------------------------------
// Device admin
// ---------------------------------------------------------------------------

/** GET /api/service-intake/bay-devices */
exports.listDevices = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT d.DeviceID, d.DeviceName, d.BayID, b.BayName, d.RegisteredByName, d.RegisteredAt,
                   d.LastSeenAt, d.RevokedAt, d.RevokedByName
            FROM   dms_BayScreenDevices d
            JOIN   dms_Bays b ON b.BayID = d.BayID
            ORDER  BY CASE WHEN d.RevokedAt IS NULL THEN 0 ELSE 1 END, b.BayName, d.DeviceID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('listDevices:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/bay-devices   { BayID, DeviceName }
 * Registers the screen the request comes from and returns its device token.
 * The token is shown once and kept only on that screen.
 */
exports.registerDevice = async (req, res) => {
    try {
        const bayId = parseInt(req.body?.BayID);
        if (!Number.isInteger(bayId)) return res.status(400).json({ error: 'Pick the bay this screen is at.' });
        const pool = await getPool();
        const bay = (await pool.request().input('b', sql.Int, bayId)
            .query('SELECT BayID, BayName FROM dms_Bays WHERE BayID = @b AND IsActive = 1')).recordset[0];
        if (!bay) return res.status(400).json({ error: 'That bay is not active.' });

        const deviceName = (String(req.body?.DeviceName || '').trim() || `${bay.BayName} screen`).slice(0, 100);
        const tokenId = newTokenId();
        const ins = await pool.request()
            .input('bay',   sql.Int,              bay.BayID)
            .input('name',  sql.NVarChar(100),    deviceName)
            .input('tok',   sql.UniqueIdentifier, tokenId)
            .input('uid',   sql.Int,              req.user?.userId || null)
            .input('uname', sql.NVarChar(100),    req.user?.userName || null)
            .query(`INSERT INTO dms_BayScreenDevices (BayID, DeviceName, TokenID, RegisteredByUserID, RegisteredByName)
                    OUTPUT INSERTED.DeviceID
                    VALUES (@bay, @name, @tok, @uid, @uname)`);
        const deviceId = ins.recordset[0].DeviceID;
        res.status(201).json({
            token: signDeviceToken(deviceId, tokenId),
            device: { DeviceID: deviceId, DeviceName: deviceName, BayID: bay.BayID, BayName: bay.BayName },
        });
    } catch (err) {
        console.error('registerDevice:', err);
        res.status(500).json({ error: err.message });
    }
};

/** POST /api/service-intake/bay-devices/:id/revoke */
exports.revokeDevice = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .input('by', sql.NVarChar(100), req.user?.userName || null)
            .query(`UPDATE dms_BayScreenDevices SET RevokedAt = GETDATE(), RevokedByName = @by
                    OUTPUT INSERTED.DeviceID
                    WHERE DeviceID = @id AND RevokedAt IS NULL`);
        if (!r.recordset.length) return res.status(404).json({ error: 'No active screen with that id.' });
        res.json({ ok: true });
    } catch (err) {
        console.error('revokeDevice:', err);
        res.status(500).json({ error: err.message });
    }
};

// ---------------------------------------------------------------------------
// The screen
// ---------------------------------------------------------------------------

/**
 * GET /api/bay-screen/jobs
 * Job lines on this bay for job cards that are open and not delivered: every
 * unfinished line, plus lines finished today. Clock text comes from SQL
 * Server so it is the server's wall clock whatever the screen's time zone.
 */
exports.getBayJobs = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('bay', sql.NVarChar(20), req.device.BayName)
            .input('undo', sql.Int, UNDO_SECONDS)
            .query(`
                SELECT j.JobCardId, j.JobCardNo, j.VehicleRegNo, j.VersionCode AS VehicleModel, j.ServiceAdvisor,
                       c.endUserName AS CustomerName,
                       ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                       FORMAT(j.PromisedDate, 'dd MMM, hh:mm tt') AS PromisedText,
                       d.DetailId, d.Remarks AS Job, d.PerformedByName,
                       FORMAT(d.JobStartTime, 'hh:mm tt') AS StartText,
                       FORMAT(d.JobEndTime,   'hh:mm tt') AS EndText,
                       CASE WHEN d.JobStartTime IS NULL THEN NULL
                            ELSE DATEDIFF(MINUTE, d.JobStartTime, ISNULL(d.JobEndTime, GETDATE())) END AS Minutes,
                       CASE WHEN d.JobEndTime IS NOT NULL THEN 'done'
                            WHEN d.JobStartTime IS NOT NULL THEN 'working'
                            ELSE 'waiting' END AS State,
                       CASE WHEN d.JobEndTime IS NOT NULL AND DATEDIFF(SECOND, d.JobEndTime, GETDATE()) <= @undo THEN 1
                            WHEN d.JobEndTime IS NULL AND d.JobStartTime IS NOT NULL
                                 AND DATEDIFF(SECOND, d.JobStartTime, GETDATE()) <= @undo THEN 1
                            ELSE 0 END AS CanUndo
                FROM   Addata_JobCardInfoDetail d
                JOIN   Addata_JobCardInfo j ON j.JobCardId = d.JobCardId
                LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
                WHERE  d.BayNo = @bay
                  AND  ISNULL(j.IsFinalized, 0) = 0
                  AND  ISNULL(j.WorkshopStatus, '') <> 'Delivered'
                  AND  (d.JobEndTime IS NULL OR CAST(d.JobEndTime AS DATE) = CAST(GETDATE() AS DATE))
                ORDER  BY j.JobCardId, d.DetailId`);
        const now = (await pool.request().query(
            `SELECT FORMAT(GETDATE(), 'hh:mm tt') AS TimeText, FORMAT(GETDATE(), 'ddd d MMM') AS DateText`)).recordset[0];

        const cards = [];
        const byId = new Map();
        for (const row of r.recordset) {
            let card = byId.get(row.JobCardId);
            if (!card) {
                card = {
                    JobCardId: row.JobCardId, JobCardNo: row.JobCardNo, VehicleRegNo: row.VehicleRegNo,
                    VehicleModel: row.VehicleModel, CustomerName: row.CustomerName, ServiceAdvisor: row.ServiceAdvisor,
                    WorkshopStatus: row.WorkshopStatus, PromisedText: row.PromisedText, Lines: [],
                };
                byId.set(row.JobCardId, card);
                cards.push(card);
            }
            card.Lines.push({
                DetailId: row.DetailId, Job: row.Job, PerformedByName: row.PerformedByName,
                State: row.State, StartText: row.StartText, EndText: row.EndText, Minutes: row.Minutes,
                CanUndo: !!row.CanUndo,
            });
        }
        // Parts already issued against these job cards, so the technician can
        // see what has been sent out to the bay (owner ask 2026-09-25).
        //
        // NAME AND QUANTITY ONLY. The rate, landed cost, discount and tax
        // columns are deliberately not selected: a bay screen is an unattended
        // device on the workshop floor holding a device token rather than a
        // user login, and what a part cost is none of its business. Leaving
        // them out of the query means they cannot leak through the API even if
        // the screen is later changed to show more.
        if (cards.length) {
            const ids = cards.map(c => c.JobCardId).join(',');
            const partsRes = await pool.request().query(`
                SELECT d.JobCardId,
                       ISNULL(i.ItenName, 'Part #' + CAST(d.ItemId AS VARCHAR(20))) AS PartName,
                       SUM(ISNULL(d.IssueQuantity, 0)) AS Qty
                FROM   data_StockIssuetoJobCardDetail d
                LEFT   JOIN InventItems i ON i.ItemId = d.ItemId
                WHERE  d.JobCardId IN (${ids})
                GROUP  BY d.JobCardId, i.ItenName, d.ItemId
                HAVING SUM(ISNULL(d.IssueQuantity, 0)) > 0
                ORDER  BY d.JobCardId, PartName`);
            for (const card of cards) card.Parts = [];
            for (const row of partsRes.recordset) {
                byId.get(row.JobCardId)?.Parts.push({ PartName: row.PartName, Qty: Number(row.Qty) });
            }
        }

        // Cards with work in progress first, then waiting, then all-done.
        const rank = (card) => (card.Lines.some(l => l.State === 'working') ? 0 : card.Lines.some(l => l.State === 'waiting') ? 1 : 2);
        cards.sort((a, b) => rank(a) - rank(b));

        res.set('Cache-Control', 'no-store');
        res.json({
            bay: { BayID: req.device.BayID, BayName: req.device.BayName },
            device: req.device.DeviceName,
            server: now,
            jobCards: cards,
        });
    } catch (err) {
        console.error('getBayJobs:', err);
        res.status(500).json({ error: err.message });
    }
};

async function changeLine(req, res, action) {
    const detailId = parseInt(req.params.detailId);
    const bayName = req.device.BayName;
    try {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        let line;
        try {
            line = (await new sql.Request(tx).input('id', sql.Int, detailId).query(`
                SELECT d.DetailId, d.BayNo, d.JobStartTime, d.JobEndTime,
                       j.JobCardId, j.JobCardNo, j.CreatedBy, ISNULL(j.IsFinalized, 0) AS IsFinalized,
                       DATEDIFF(SECOND, d.JobStartTime, GETDATE()) AS SecsSinceStart,
                       DATEDIFF(SECOND, d.JobEndTime,   GETDATE()) AS SecsSinceEnd
                FROM   Addata_JobCardInfoDetail d WITH (UPDLOCK)
                JOIN   Addata_JobCardInfo j ON j.JobCardId = d.JobCardId
                WHERE  d.DetailId = @id`)).recordset[0];

            const undoable = line && (line.JobEndTime
                ? line.SecsSinceEnd <= UNDO_SECONDS
                : !!line.JobStartTime && line.SecsSinceStart <= UNDO_SECONDS);
            const refusal =
                  !line                                       ? [404, 'That job is no longer on the job card.']
                : line.BayNo !== bayName                      ? [403, `That job is not on ${bayName}.`]
                : line.IsFinalized                            ? [423, `${line.JobCardNo} is finalized.`]
                : action === 'start'  && line.JobStartTime    ? [409, 'That job has already been started.']
                : action === 'finish' && !line.JobStartTime   ? [409, 'Start the job before finishing it.']
                : action === 'finish' && line.JobEndTime      ? [409, 'That job is already finished.']
                : action === 'undo'   && !undoable            ? [409, 'Only a tap in the last 5 minutes can be undone. The Job Controller can correct older times.']
                : null;
            if (refusal) {
                await tx.rollback();
                return res.status(refusal[0]).json({ error: refusal[1] });
            }

            const rq = new sql.Request(tx).input('id', sql.Int, detailId).input('jc', sql.Int, line.JobCardId);
            if (action === 'start') {
                // The first job started moves the car to Being Serviced.
                await rq.query(`
                    UPDATE Addata_JobCardInfoDetail SET JobStartTime = GETDATE() WHERE DetailId = @id;
                    UPDATE Addata_JobCardInfo SET WorkshopStatus = 'Being Serviced', ModifyDate = GETDATE()
                    WHERE  JobCardId = @jc AND ISNULL(WorkshopStatus, 'Waiting For Service') = 'Waiting For Service';`);
            } else if (action === 'finish') {
                // The last job finished moves the car on to Final Inspection.
                await rq.query(`
                    UPDATE Addata_JobCardInfoDetail SET JobEndTime = GETDATE() WHERE DetailId = @id;
                    UPDATE Addata_JobCardInfo SET WorkshopStatus = 'Final Inspection', ModifyDate = GETDATE()
                    WHERE  JobCardId = @jc
                      AND  ISNULL(WorkshopStatus, 'Waiting For Service') IN ('Waiting For Service', 'Being Serviced')
                      AND  NOT EXISTS (SELECT 1 FROM Addata_JobCardInfoDetail WHERE JobCardId = @jc AND JobEndTime IS NULL);`);
            } else {
                await rq.query(line.JobEndTime
                    ? 'UPDATE Addata_JobCardInfoDetail SET JobEndTime = NULL WHERE DetailId = @id'
                    : 'UPDATE Addata_JobCardInfoDetail SET JobStartTime = NULL WHERE DetailId = @id');
            }
            await tx.commit();
        } catch (e) {
            try { await tx.rollback(); } catch { /* already rolled back */ }
            throw e;
        }

        events.bayJobsChanged({ JobCardId: line.JobCardId });
        events.advisorJobCardChanged(line.CreatedBy, { JobCardId: line.JobCardId });
        res.json({ ok: true });
    } catch (err) {
        console.error(`bay screen ${action}:`, err);
        res.status(500).json({ error: err.message });
    }
}

/** POST /api/bay-screen/lines/:detailId/start */
exports.startLine = (req, res) => changeLine(req, res, 'start');
/** POST /api/bay-screen/lines/:detailId/finish */
exports.finishLine = (req, res) => changeLine(req, res, 'finish');
/** POST /api/bay-screen/lines/:detailId/undo — the last tap, within 5 minutes */
exports.undoLine = (req, res) => changeLine(req, res, 'undo');
