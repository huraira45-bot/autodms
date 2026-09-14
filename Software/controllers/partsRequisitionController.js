/**
 * Parts counter: requisitions from the service tablet — plan 2026-09-14,
 * Phase 3.
 *
 * When a customer signs, the parts on the estimate arrive here as a
 * requisition. The counter issues them — all at once or in part — through the
 * same parts issue code as the desk Parts Issue screen
 * (services/partsIssueService.js): the same stock check, GST snapshot and COGS
 * cost. Each issued line is linked back to the requisition line it fulfils.
 *
 * Issued quantity is always read from those linked Parts Issue lines, never
 * stored, so a line later edited or deleted on the Parts Issue screen can't
 * leave a requisition showing a stale figure.
 */
const { sql, getPool } = require('../config/db');
const { issuePartsInTx } = require('../services/partsIssueService');
const events = require('../services/serviceEvents');

const ISSUED_SQL = `ISNULL((SELECT SUM(ISNULL(d.IssueQuantity, d.Quantity))
                            FROM   dms_PartsRequisitionIssues pri
                            JOIN   data_StockIssuetoJobCardDetail d ON d.StockIssueDetailID = pri.StockIssueDetailID
                            WHERE  pri.RequisitionLineID = l.RequisitionLineID), 0)`;

const ON_HAND_SQL = `ISNULL((SELECT SUM(ISNULL(a.Quantity, 0))  FROM data_StockArrivalDetail a  WHERE a.ItemId  = l.ItemID), 0)
                   + ISNULL((SELECT SUM(ISNULL(io.Quantity, 0)) FROM data_StockInOutDetail   io WHERE io.ItemId = l.ItemID), 0)`;

const displayStatus = (status, qtyIssued, linesOpen) => (
    status === 'Cancelled' ? 'Cancelled'
        : Number(linesOpen) === 0 ? 'Issued'
            : Number(qtyIssued) > 0 ? 'Partially issued'
                : 'Pending');

const httpError = (statusCode, message) => Object.assign(new Error(message), { statusCode });

/** Header, lines with issued / remaining / on hand, and issue history. */
async function loadRequisition(executor, id) {
    const head = (await executor.request().input('id', sql.Int, id).query(`
        SELECT r.RequisitionID, r.RequisitionNo, r.JobCardID, r.JobCardNo, r.EstimateID, r.Status,
               r.RequestedByUserID, r.RequestedByName, r.RequestedAt, r.CancelledAt, r.CancelledByName, r.CancelReason,
               j.VehicleRegNo, j.VersionCode AS VehicleModel, j.ServiceAdvisor, ISNULL(j.IsFinalized, 0) AS JobCardFinalized,
               c.endUserName AS CustomerName, s.BayName, e.EstimateNo
        FROM   dms_PartsRequisitions r
        JOIN   Addata_JobCardInfo j ON j.JobCardId = r.JobCardID
        LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
        LEFT   JOIN dms_ServiceEstimateSignatures s ON s.SignatureID = r.SignatureID
        LEFT   JOIN dms_ServiceEstimates e ON e.EstimateID = r.EstimateID
        WHERE  r.RequisitionID = @id`)).recordset[0];
    if (!head) return null;

    const lines = (await executor.request().input('id', sql.Int, id).query(`
        SELECT l.RequisitionLineID, l.LineSeq, l.ItemID, l.Description, l.PartNumber, l.QtyRequested, l.Rate,
               ${ISSUED_SQL} AS QtyIssued,
               ${ON_HAND_SQL} AS OnHand
        FROM   dms_PartsRequisitionLines l
        WHERE  l.RequisitionID = @id
        ORDER  BY l.LineSeq`)).recordset.map(l => ({
            ...l,
            QtyRequested: Number(l.QtyRequested),
            QtyIssued: Number(l.QtyIssued),
            Remaining: Math.max(0, Math.round((Number(l.QtyRequested) - Number(l.QtyIssued)) * 100) / 100),
            OnHand: Number(l.OnHand),
            Rate: Number(l.Rate),
        }));

    const issues = (await executor.request().input('id', sql.Int, id).query(`
        SELECT pri.RequisitionLineID, pri.StockIssueDetailID, pri.QtyAtIssue, pri.IssuedByName, pri.IssuedAt,
               ISNULL(d.IssueQuantity, d.Quantity) AS QtyNow, si.IssueNo,
               CASE WHEN d.StockIssueDetailID IS NULL THEN 1 ELSE 0 END AS RemovedOnPartsIssue
        FROM   dms_PartsRequisitionIssues pri
        JOIN   dms_PartsRequisitionLines l ON l.RequisitionLineID = pri.RequisitionLineID
        LEFT   JOIN data_StockIssuetoJobCardDetail d ON d.StockIssueDetailID = pri.StockIssueDetailID
        LEFT   JOIN data_StockIssuetoJobCard si      ON si.StockIssueID      = d.StockIssueID
        WHERE  l.RequisitionID = @id
        ORDER  BY pri.IssuedAt, pri.StockIssueDetailID`)).recordset;

    const qtyIssued = lines.reduce((s, l) => s + l.QtyIssued, 0);
    const linesOpen = lines.filter(l => l.Remaining > 0).length;
    return {
        ...head,
        DisplayStatus: displayStatus(head.Status, qtyIssued, linesOpen),
        Lines: lines,
        Issues: issues,
    };
}

/** GET /api/service-intake/requisitions?status=open|all&search= */
exports.listRequisitions = async (req, res) => {
    try {
        const open = req.query.status !== 'all';
        const pool = await getPool();
        const rq = pool.request();
        const conds = [];
        if (open) conds.push(`r.Status = 'Open' AND agg.LinesOpen > 0 AND ISNULL(j.IsFinalized, 0) = 0`);
        const search = String(req.query.search || '').trim();
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            conds.push('(r.RequisitionNo LIKE @s OR r.JobCardNo LIKE @s OR j.VehicleRegNo LIKE @s OR c.endUserName LIKE @s)');
        }
        const r = await rq.query(`
            SELECT TOP 200
                   r.RequisitionID, r.RequisitionNo, r.JobCardID, r.JobCardNo, r.Status, r.RequestedByName, r.RequestedAt,
                   j.VehicleRegNo, j.VersionCode AS VehicleModel, j.ServiceAdvisor, ISNULL(j.IsFinalized, 0) AS JobCardFinalized,
                   c.endUserName AS CustomerName, s.BayName,
                   agg.LineCount, agg.QtyRequested, agg.QtyIssued, agg.LinesOpen
            FROM   dms_PartsRequisitions r
            JOIN   Addata_JobCardInfo j ON j.JobCardId = r.JobCardID
            LEFT   JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
            LEFT   JOIN dms_ServiceEstimateSignatures s ON s.SignatureID = r.SignatureID
            CROSS  APPLY (
                SELECT COUNT(*) AS LineCount,
                       SUM(x.QtyRequested) AS QtyRequested,
                       SUM(x.QtyIssued) AS QtyIssued,
                       SUM(CASE WHEN x.QtyIssued < x.QtyRequested THEN 1 ELSE 0 END) AS LinesOpen
                FROM  (SELECT l.QtyRequested, ${ISSUED_SQL} AS QtyIssued
                       FROM   dms_PartsRequisitionLines l
                       WHERE  l.RequisitionID = r.RequisitionID) x
            ) agg
            ${conds.length ? 'WHERE ' + conds.join(' AND ') : ''}
            ORDER  BY r.RequisitionID ${open ? 'ASC' : 'DESC'}`);
        res.json(r.recordset.map(x => ({
            ...x,
            QtyRequested: Number(x.QtyRequested) || 0,
            QtyIssued: Number(x.QtyIssued) || 0,
            DisplayStatus: displayStatus(x.Status, x.QtyIssued, x.LinesOpen),
        })));
    } catch (err) {
        console.error('listRequisitions:', err);
        res.status(500).json({ error: err.message });
    }
};

/** GET /api/service-intake/requisitions/:id */
exports.getRequisition = async (req, res) => {
    try {
        const pool = await getPool();
        const reqn = await loadRequisition(pool, parseInt(req.params.id));
        if (!reqn) return res.status(404).json({ error: 'Requisition not found.' });
        res.json(reqn);
    } catch (err) {
        console.error('getRequisition:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/requisitions/:id/issue
 * Body: { Lines: [{ RequisitionLineID, Quantity }], WHID? }
 * Issues the given quantities as one Parts Issue slip on the job card, at the
 * prices the customer signed for. A quantity may be less than what remains
 * (partial issue) but never more.
 */
exports.issueRequisition = async (req, res) => {
    const id = parseInt(req.params.id);
    try {
        const asked = (Array.isArray(req.body?.Lines) ? req.body.Lines : [])
            .map(w => ({ lineId: parseInt(w.RequisitionLineID), qty: Math.round(Number(w.Quantity) * 100) / 100 }))
            .filter(w => w.qty > 0);
        if (!asked.length) throw httpError(400, 'Enter a quantity to issue for at least one part.');
        if (new Set(asked.map(a => a.lineId)).size !== asked.length) throw httpError(400, 'Each part can appear only once in an issue.');
        const whid = req.body?.WHID ? parseInt(req.body.WHID) : null;

        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        let stockIssueId, head;
        try {
            head = (await new sql.Request(tx).input('id', sql.Int, id).query(`
                SELECT RequisitionID, RequisitionNo, Status, JobCardID, JobCardNo, RequestedByUserID
                FROM   dms_PartsRequisitions WITH (UPDLOCK, HOLDLOCK)
                WHERE  RequisitionID = @id`)).recordset[0];
            if (!head) throw httpError(404, 'Requisition not found.');
            if (head.Status === 'Cancelled') throw httpError(423, `${head.RequisitionNo} was cancelled.`);

            const current = await loadRequisition(tx, id);
            const items = asked.map((a) => {
                const line = current.Lines.find(l => l.RequisitionLineID === a.lineId);
                if (!line) throw httpError(400, 'A part in this issue is not on the requisition.');
                if (a.qty > line.Remaining) {
                    throw httpError(400, `${line.Description}: only ${line.Remaining} left to issue on this requisition.`);
                }
                return { line, item: {
                    ItemId: line.ItemID, Quantity: a.qty, Rate: line.Rate, Discount: 0, DiscAmt: 0, IsGST: true,
                    ...(whid ? { WHID: whid } : {}),
                } };
            });

            const result = await issuePartsInTx(tx, {
                JobCardId: head.JobCardID,
                JobCardNo: head.JobCardNo,
                Items: items.map(x => x.item),
                Remarks: `Parts requisition ${head.RequisitionNo}`,
            });
            stockIssueId = result.StockIssueID;

            for (let i = 0; i < items.length; i++) {
                await new sql.Request(tx)
                    .input('line',  sql.Int,            items[i].line.RequisitionLineID)
                    .input('det',   sql.Int,            result.lines[i].StockIssueDetailID)
                    .input('qty',   sql.Decimal(18, 2), items[i].item.Quantity)
                    .input('uid',   sql.Int,            req.user?.userId || null)
                    .input('uname', sql.NVarChar(100),  req.user?.userName || null)
                    .query(`INSERT INTO dms_PartsRequisitionIssues
                                (RequisitionLineID, StockIssueDetailID, QtyAtIssue, IssuedByUserID, IssuedByName)
                            VALUES (@line, @det, @qty, @uid, @uname)`);
            }
            await tx.commit();
        } catch (e) {
            try { await tx.rollback(); } catch { /* already rolled back */ }
            throw e;
        }

        events.requisitionsChanged({ RequisitionID: id });
        events.advisorJobCardChanged(head.RequestedByUserID, { JobCardId: head.JobCardID });
        res.status(201).json({ StockIssueID: stockIssueId, requisition: await loadRequisition(pool, id) });
    } catch (err) {
        if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
        console.error('issueRequisition:', err);
        res.status(500).json({ error: err.message });
    }
};

/**
 * POST /api/service-intake/requisitions/:id/cancel   { Reason }
 * Cancels what has not been issued yet. Parts already issued stay on the job
 * card; take them off on the Parts Issue screen if they are not needed.
 */
exports.cancelRequisition = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const reason = String(req.body?.Reason || '').trim().slice(0, 300);
        if (!reason) return res.status(400).json({ error: 'Give a reason for cancelling.' });
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('by', sql.NVarChar(100), req.user?.userName || null)
            .input('why', sql.NVarChar(300), reason)
            .query(`UPDATE dms_PartsRequisitions
                    SET Status = 'Cancelled', CancelledAt = GETDATE(), CancelledByName = @by, CancelReason = @why
                    OUTPUT INSERTED.JobCardID, INSERTED.RequestedByUserID
                    WHERE RequisitionID = @id AND Status = 'Open'`);
        if (!r.recordset.length) return res.status(409).json({ error: 'Only an open requisition can be cancelled.' });
        events.requisitionsChanged({ RequisitionID: id });
        events.advisorJobCardChanged(r.recordset[0].RequestedByUserID, { JobCardId: r.recordset[0].JobCardID });
        res.json(await loadRequisition(pool, id));
    } catch (err) {
        console.error('cancelRequisition:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.loadRequisition = loadRequisition;
