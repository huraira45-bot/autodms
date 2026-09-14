/**
 * Job cards opened on the service tablet — plan 2026-09-14, Phase 4.
 *
 * What the advisor follows once the customer has signed: jobs on the bay
 * screens, parts at the counter, additional work (a new estimate the customer
 * signs again), finalizing, and the final print.
 *
 * Only job cards opened from a signed tablet estimate are reachable here, so
 * the tablet permission does not open up every job card in the system.
 * Finalizing goes through the desk's own finalize handler, after two checks
 * of its own: no parts still waiting at the counter, and no additional work
 * left unsigned.
 */
const { sql, getPool } = require('../config/db');
const finalizeController = require('./finalizeController');
const { loadRequisition } = require('./partsRequisitionController');
const events = require('../services/serviceEvents');

// Issued quantity of a requisition line, read live from its Parts Issue lines
// (same rule as partsRequisitionController).
const ISSUED_SQL = `ISNULL((SELECT SUM(ISNULL(d.IssueQuantity, d.Quantity))
                            FROM   dms_PartsRequisitionIssues pri
                            JOIN   data_StockIssuetoJobCardDetail d ON d.StockIssueDetailID = pri.StockIssueDetailID
                            WHERE  pri.RequisitionLineID = l.RequisitionLineID), 0)`;

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Route middleware: 404 unless the job card came from a tablet estimate. */
exports.tabletJobCardOnly = async (req, res, next) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, parseInt(req.params.id)).query(`
            SELECT j.JobCardId, j.JobCardNo, ISNULL(j.IsFinalized, 0) AS IsFinalized
            FROM   Addata_JobCardInfo j
            WHERE  j.JobCardId = @id
              AND  EXISTS (SELECT 1 FROM dms_ServiceEstimates e WHERE e.JobCardID = j.JobCardId)`);
        if (!r.recordset.length) {
            return res.status(404).json({ error: 'No job card with that number was opened on the tablet.' });
        }
        req.tabletJobCard = r.recordset[0];
        return next();
    } catch (err) {
        console.error('tabletJobCardOnly:', err);
        return res.status(500).json({ error: err.message });
    }
};

async function tabletBlockers(executor, jobCardId) {
    // Only requisitions still Open count: one the parts counter has cancelled
    // no longer holds the job card up.
    const waiting = (await executor.request().input('id', sql.Int, jobCardId).query(`
        SELECT r.RequisitionNo, l.Description, l.QtyRequested - ${ISSUED_SQL} AS Waiting
        FROM   dms_PartsRequisitions r
        JOIN   dms_PartsRequisitionLines l ON l.RequisitionID = r.RequisitionID
        WHERE  r.JobCardID = @id AND r.Status = 'Open' AND ${ISSUED_SQL} < l.QtyRequested
        ORDER  BY r.RequisitionID, l.LineSeq`)).recordset;
    const unsigned = (await executor.request().input('id', sql.Int, jobCardId).query(`
        SELECT EstimateNo FROM dms_ServiceEstimates
        WHERE  JobCardID = @id AND Status = 'Draft'
        ORDER  BY EstimateID`)).recordset.map(x => x.EstimateNo);

    const blockers = [];
    if (waiting.length) {
        const list = waiting.map(w => `${w.Description} × ${+Number(w.Waiting).toFixed(2)} (${w.RequisitionNo})`).join(', ');
        blockers.push(`Not issued yet: ${list}. The parts counter has to issue ${waiting.length === 1 ? 'it' : 'them'}, or cancel the request if ${waiting.length === 1 ? "it isn't" : "they aren't"} needed.`);
    }
    if (unsigned.length) {
        blockers.push(`Additional work ${unsigned.join(', ')} has not been signed. Get it signed or cancel it.`);
    }
    return blockers;
}

/** GET /api/service-intake/job-cards?scope=mine|all&status=open|all&search= */
exports.listJobCards = async (req, res) => {
    try {
        const pool = await getPool();
        const rq = pool.request();
        const conds = ['EXISTS (SELECT 1 FROM dms_ServiceEstimates e WHERE e.JobCardID = j.JobCardId)'];
        if (req.query.scope !== 'all') {
            rq.input('uid', sql.Int, req.user?.userId || -1);
            conds.push(`(j.CreatedBy = @uid OR EXISTS (SELECT 1 FROM dms_ServiceEstimates e2
                                                     WHERE e2.JobCardID = j.JobCardId AND e2.AdvisorUserID = @uid))`);
        }
        if (req.query.status !== 'all') {
            conds.push(`ISNULL(j.IsFinalized, 0) = 0 AND ISNULL(j.WorkshopStatus, '') <> 'Delivered'`);
        }
        const search = String(req.query.search || '').trim();
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            conds.push('(j.JobCardNo LIKE @s OR j.jobCode LIKE @s OR j.VehicleRegNo LIKE @s OR c.endUserName LIKE @s OR c.PhoneNo LIKE @s)');
        }
        const r = await rq.query(`
            SELECT TOP 100
                   j.JobCardId, j.JobCardNo, j.jobCode, j.VehicleRegNo, j.VersionCode AS VehicleModel,
                   ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                   ISNULL(j.IsFinalized, 0) AS IsFinalized,
                   j.EntryUserDateTime AS OpenedAt, j.PromisedDate, j.ServiceAdvisor,
                   c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone,
                   ISNULL(lb.JobsTotal, 0) AS JobsTotal, ISNULL(lb.JobsDone, 0) AS JobsDone, ISNULL(lb.JobsWorking, 0) AS JobsWorking,
                   ISNULL(pr.QtyRequested, 0) AS PartsRequested, ISNULL(pr.QtyIssued, 0) AS PartsIssued,
                   ISNULL(pr.LinesWaiting, 0) AS PartsLinesWaiting,
                   (SELECT TOP 1 e.EstimateNo FROM dms_ServiceEstimates e
                    WHERE e.JobCardID = j.JobCardId AND e.Status = 'Draft' ORDER BY e.EstimateID DESC) AS UnsignedWorkNo
            FROM   Addata_JobCardInfo j
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
            OUTER  APPLY (
                SELECT COUNT(*) AS JobsTotal,
                       SUM(CASE WHEN d.JobEndTime IS NOT NULL THEN 1 ELSE 0 END) AS JobsDone,
                       SUM(CASE WHEN d.JobStartTime IS NOT NULL AND d.JobEndTime IS NULL THEN 1 ELSE 0 END) AS JobsWorking
                FROM   Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId
            ) lb
            OUTER  APPLY (
                SELECT SUM(x.QtyRequested) AS QtyRequested, SUM(x.QtyIssued) AS QtyIssued,
                       SUM(CASE WHEN x.Status = 'Open' AND x.QtyIssued < x.QtyRequested THEN 1 ELSE 0 END) AS LinesWaiting
                FROM  (SELECT l.QtyRequested, r.Status, ${ISSUED_SQL} AS QtyIssued
                       FROM   dms_PartsRequisitionLines l
                       JOIN   dms_PartsRequisitions r ON r.RequisitionID = l.RequisitionID
                       WHERE  r.JobCardID = j.JobCardId) x
            ) pr
            WHERE  ${conds.join(' AND ')}
            ORDER  BY j.JobCardId DESC`);
        res.json(r.recordset.map(x => ({ ...x, PartsRequested: Number(x.PartsRequested), PartsIssued: Number(x.PartsIssued) })));
    } catch (err) {
        console.error('listJobCards:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/job-cards/:id */
exports.getJobCard = async (req, res) => {
    try {
        const id = req.tabletJobCard.JobCardId;
        const pool = await getPool();
        const head = (await pool.request().input('id', sql.Int, id).query(`
            SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.DMSJobCardNo, j.EndUserID AS CustomerID,
                   j.VehicleRegNo, j.ChasisNo, j.VersionCode AS VehicleModel,
                   j.KiloMeter, ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                   ISNULL(j.IsFinalized, 0) AS IsFinalized, j.FinalizedAt, j.FinalizedByName,
                   j.EntryUserDateTime AS OpenedAt, j.PromisedDate, j.ServiceAdvisor, j.CreatedByName, j.VOCRemarks,
                   c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone,
                   CASE WHEN ISNULL(c.CNIC, '') <> '' THEN 1 ELSE 0 END AS HasCNIC,
                   CASE WHEN c.DOB IS NOT NULL THEN 1 ELSE 0 END AS HasDOB,
                   t.Title AS JobTypeName
            FROM   Addata_JobCardInfo j
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
            LEFT   JOIN gen_JobCardType t     ON t.JobCardTypeId = j.JobTypeId
            WHERE  j.JobCardId = @id`)).recordset[0];

        const labour = (await pool.request().input('id', sql.Int, id).query(`
            SELECT d.DetailId, d.Remarks AS Job, d.Price, d.DiscAmt, d.TaxRate, d.TaxAmount, d.BayNo, d.PerformedByName,
                   FORMAT(d.JobStartTime, 'hh:mm tt') AS StartText,
                   FORMAT(d.JobEndTime,   'hh:mm tt') AS EndText,
                   CASE WHEN d.JobStartTime IS NULL THEN NULL
                        ELSE DATEDIFF(MINUTE, d.JobStartTime, ISNULL(d.JobEndTime, GETDATE())) END AS Minutes,
                   CASE WHEN d.JobEndTime IS NOT NULL THEN 'done'
                        WHEN d.JobStartTime IS NOT NULL THEN 'working'
                        ELSE 'waiting' END AS State
            FROM   Addata_JobCardInfoDetail d
            WHERE  d.JobCardId = @id
            ORDER  BY d.DetailId`)).recordset;

        const parts = (await pool.request().input('id', sql.Int, id).query(`
            SELECT sid.StockIssueDetailID, i.ItenName AS ItemName, i.ManualNumber AS PartNumber,
                   ISNULL(sid.IssueQuantity, sid.Quantity) AS Quantity, sid.ItemRate, sid.DiscAmt, sid.TaxRate, sid.TaxAmount,
                   si.IssueNo, si.IssueDate
            FROM   data_StockIssuetoJobCardDetail sid
            JOIN   data_StockIssuetoJobCard si ON si.StockIssueID = sid.StockIssueID
            LEFT   JOIN InventItems i ON i.ItemId = sid.ItemId
            WHERE  sid.JobCardId = @id
            ORDER  BY sid.StockIssueDetailID`)).recordset;

        const requisitionIds = (await pool.request().input('id', sql.Int, id)
            .query('SELECT RequisitionID FROM dms_PartsRequisitions WHERE JobCardID = @id ORDER BY RequisitionID')).recordset;
        const requisitions = [];
        for (const row of requisitionIds) requisitions.push(await loadRequisition(pool, row.RequisitionID));

        const estimates = (await pool.request().input('id', sql.Int, id).query(`
            SELECT e.EstimateID, e.EstimateNo, e.RevisionNo, e.Status, e.GrandTotal, e.CreatedAt, e.AdvisorName,
                   s.SignerName, s.SignedAt, s.BayName,
                   (SELECT COUNT(*) FROM dms_ServiceEstimateLines l WHERE l.EstimateID = e.EstimateID) AS LineCount
            FROM   dms_ServiceEstimates e
            LEFT   JOIN dms_ServiceEstimateSignatures s ON s.EstimateID = e.EstimateID
            WHERE  e.JobCardID = @id
            ORDER  BY e.RevisionNo, e.EstimateID`)).recordset;

        const labourNet = r2(labour.reduce((s, l) => s + (Number(l.Price) || 0) - (Number(l.DiscAmt) || 0), 0));
        const labourTax = r2(labour.reduce((s, l) => s + (Number(l.TaxAmount) || 0), 0));
        const partsNet = r2(parts.reduce((s, p) => s + (Number(p.Quantity) || 0) * (Number(p.ItemRate) || 0) - (Number(p.DiscAmt) || 0), 0));
        const partsTax = r2(parts.reduce((s, p) => s + (Number(p.TaxAmount) || 0), 0));

        const blockers = head.IsFinalized ? [] : await tabletBlockers(pool, id);
        const warnings = [];
        // Missing CNIC / date of birth and an empty DMS number are things the
        // advisor can fix on the tablet, so they are reported separately and
        // the screen shows a form for each instead of a message.
        let customerMissing = [];
        if (!head.IsFinalized) {
            customerMissing = [!head.HasCNIC && 'CNIC', !head.HasDOB && 'date of birth'].filter(Boolean);
            const open = labour.filter(l => l.State !== 'done').length;
            if (open) warnings.push(`${open} job${open === 1 ? ' is' : 's are'} not marked finished on the bay screen.`);
        }

        res.json({
            ...head,
            Labour: labour,
            Parts: parts,
            Requisitions: requisitions,
            Estimates: estimates,
            Totals: { labourNet, labourTax, partsNet, partsTax, total: r2(labourNet + labourTax + partsNet + partsTax) },
            Finalize: { blockers, warnings, customerMissing, dmsMissing: !head.IsFinalized && !head.DMSJobCardNo },
        });
    } catch (err) {
        console.error('getJobCard:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/job-cards/:id/additional-work
 * Opens a new estimate revision for work found after signing. Its lines are
 * only the additions; the customer signs it before anything reaches the job
 * card. If unsigned additional work is already open, that one is returned
 * instead of starting a second.
 */
exports.startAdditionalWork = async (req, res) => {
    try {
        const jc = req.tabletJobCard;
        if (jc.IsFinalized) return res.status(423).json({ error: `${jc.JobCardNo} is finalized, so work can no longer be added to it.` });

        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        let estimateId, existing = false;
        try {
            const open = (await new sql.Request(tx).input('jc', sql.Int, jc.JobCardId).query(`
                SELECT TOP 1 EstimateID FROM dms_ServiceEstimates WITH (UPDLOCK, HOLDLOCK)
                WHERE  JobCardID = @jc AND Status = 'Draft'
                ORDER  BY EstimateID DESC`)).recordset[0];
            if (open) {
                estimateId = open.EstimateID;
                existing = true;
            } else {
                const base = (await new sql.Request(tx).input('jc', sql.Int, jc.JobCardId).query(`
                    SELECT TOP 1 * FROM dms_ServiceEstimates
                    WHERE  JobCardID = @jc AND Status = 'Converted'
                    ORDER  BY RevisionNo DESC, EstimateID DESC`)).recordset[0];
                if (!base) throw Object.assign(new Error('This job card has no signed estimate to add work to.'), { statusCode: 409 });
                const root = (await new sql.Request(tx).input('jc', sql.Int, jc.JobCardId).query(`
                    SELECT TOP 1 EstimateID, (SELECT MAX(RevisionNo) FROM dms_ServiceEstimates WHERE JobCardID = @jc) AS MaxRev
                    FROM   dms_ServiceEstimates WHERE JobCardID = @jc
                    ORDER  BY RevisionNo, EstimateID`)).recordset[0];
                const n = (await new sql.Request(tx).query('SELECT NEXT VALUE FOR dbo.seq_ServiceEstimateNo AS n')).recordset[0].n;
                const ins = await new sql.Request(tx)
                    .input('no',     sql.NVarChar(20),  'EST-' + String(n).padStart(5, '0'))
                    .input('rev',    sql.Int,           (root.MaxRev || 1) + 1)
                    .input('root',   sql.Int,           root.EstimateID)
                    .input('base',   sql.Int,           base.EstimateID)
                    .input('uid',    sql.Int,           req.user?.userId || null)
                    .input('uname',  sql.NVarChar(100), req.user?.userName || null)
                    .query(`INSERT INTO dms_ServiceEstimates
                                (EstimateNo, Status, RevisionNo, ParentEstimateID, JobCardID, EndUserID, VehicleID,
                                 VehicleRegNo, ChasisNo, EngineNo, VehicleModel, KiloMeter, JobTypeId, BayID,
                                 AdvisorUserID, AdvisorName)
                            OUTPUT INSERTED.EstimateID
                            SELECT @no, 'Draft', @rev, @root, JobCardID, EndUserID, VehicleID,
                                   VehicleRegNo, ChasisNo, EngineNo, VehicleModel, KiloMeter, JobTypeId, BayID,
                                   @uid, @uname
                            FROM   dms_ServiceEstimates WHERE EstimateID = @base`);
                estimateId = ins.recordset[0].EstimateID;
            }
            await tx.commit();
        } catch (e) {
            try { await tx.rollback(); } catch { /* already rolled back */ }
            throw e;
        }
        if (!existing) events.advisorJobCardChanged(req.user?.userId, { JobCardId: jc.JobCardId });
        res.status(existing ? 200 : 201).json({ EstimateID: estimateId, existing });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        console.error('startAdditionalWork:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/job-cards/:id/dms-number   { DMSJobCardNo }
 * Lets the advisor enter the DMS job card number on the tablet instead of
 * finalizing without it. Refused once the job card is finalized.
 */
exports.setDmsNumber = async (req, res) => {
    try {
        const jc = req.tabletJobCard;
        const value = String(req.body?.DMSJobCardNo ?? '').trim();
        if (!value) return res.status(400).json({ error: 'Enter the DMS job card number.' });
        if (value.length > 50) return res.status(400).json({ error: 'The DMS job card number can be at most 50 characters.' });
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, jc.JobCardId)
            .input('v', sql.NVarChar(50), value)
            .query(`UPDATE Addata_JobCardInfo SET DMSJobCardNo = @v, ModifyDate = GETDATE()
                    WHERE JobCardId = @id AND ISNULL(IsFinalized, 0) = 0`);
        if (!r.rowsAffected[0]) return res.status(423).json({ error: `${jc.JobCardNo} is finalized.` });
        events.advisorJobCardChanged(req.user?.userId, { JobCardId: jc.JobCardId });
        res.json({ DMSJobCardNo: value });
    } catch (err) {
        console.error('setDmsNumber:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/job-cards/:id/finalize   { skipDmsWarning }
 * The tablet's own checks first, then the desk finalize handler with all of
 * its rules and postings (CNIC/DOB, the DMS-number warning as 428, vouchers).
 */
exports.finalizeJobCard = async (req, res) => {
    try {
        const jc = req.tabletJobCard;
        const pool = await getPool();
        const blockers = await tabletBlockers(pool, jc.JobCardId);
        if (blockers.length) return res.status(409).json({ error: blockers.join(' '), code: 'tablet_blockers', blockers });

        res.on('finish', () => {
            if (res.statusCode === 200) {
                events.bayJobsChanged({ JobCardId: jc.JobCardId });
                events.advisorJobCardChanged(req.user?.userId, { JobCardId: jc.JobCardId });
            }
        });
        req.params = { entity: 'JOBCARD', id: String(jc.JobCardId) };
        return finalizeController.finalize(req, res);
    } catch (err) {
        console.error('finalizeJobCard:', err);
        return res.status(500).json({ error: err.message });
    }
};
