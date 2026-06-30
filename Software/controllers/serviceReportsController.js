/**
 * Service (Workshop) reports.
 *
 * All endpoints accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (default: this month).
 * Some accept ?status=, ?advisorId=, ?branchId= etc. Each report returns
 *   { from, to, rows, totals } so the frontend can render uniformly.
 */
const { sql, getPool } = require('../config/db');

function parseRange(req) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const from = req.query.from ? new Date(req.query.from) : firstOfMonth;
    const to = req.query.to ? new Date(req.query.to) : today;
    // expand "to" to end of day so the inclusive range works
    to.setHours(23, 59, 59, 999);
    return { from, to };
}

/**
 * GET /reports/service/job-card-register
 *
 * One row per job card in the period. Joins customer, vehicle, advisor.
 * Filters: from, to, status, advisorId.
 */
exports.jobCardRegister = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        const conds = ['j.JobCardDate BETWEEN @from AND @to'];
        if (req.query.status)    { rq.input('st', sql.NVarChar(30), req.query.status); conds.push('j.Status = @st'); }
        if (req.query.advisorId) { rq.input('ad', sql.Int, parseInt(req.query.advisorId)); conds.push('j.ServiceAdvisorID = @ad'); }

        const r = await rq.query(`
            SELECT j.JobCardId, j.JobCardNo, j.JobCardDate, j.Status,
                   j.VehicleRegNo, j.ChasisNo, j.EngineNo, j.KiloMeter,
                   j.ReceiptDate, j.PromisedDate, j.DeliveryDate,
                   j.ServiceAdvisor, j.JobResult, j.IsFinalized,
                   c.endUserName AS CustomerName, c.PhoneNo, c.CustomerCode,
                   t.Title AS JobType,
                   ISNULL((SELECT SUM(ISNULL(d.Price,0) * ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0) + ISNULL(d.TaxAmount,0))
                           FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0) AS LabourAmount,
                   ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0))
                           FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsAmount,
                   ISNULL((SELECT SUM(ISNULL(b.PayableAmount,0))
                           FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS SubletAmount
            FROM Addata_JobCardInfo j
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT JOIN gen_JobCardType t      ON j.JobTypeId = t.JobCardTypeId
            WHERE ${conds.join(' AND ')}
            ORDER BY j.JobCardDate DESC, j.JobCardId DESC`);

        const rows = r.recordset.map(x => ({
            JobCardId:    x.JobCardId,
            JobCardNo:    x.JobCardNo,
            JobCardDate:  x.JobCardDate?.toISOString().slice(0,10),
            Status:       x.Status || (x.IsFinalized ? 'Finalized' : 'Open'),
            CustomerName: x.CustomerName || '',
            CustomerCode: x.CustomerCode || '',
            PhoneNo:      x.PhoneNo || '',
            VehicleRegNo: x.VehicleRegNo || '',
            ChasisNo:     x.ChasisNo || '',
            KiloMeter:    Number(x.KiloMeter || 0),
            JobType:      x.JobType || '',
            ServiceAdvisor: x.ServiceAdvisor || '',
            ReceiptDate:  x.ReceiptDate?.toISOString().slice(0,10) || null,
            PromisedDate: x.PromisedDate?.toISOString().slice(0,10) || null,
            DeliveryDate: x.DeliveryDate?.toISOString().slice(0,10) || null,
            LabourAmount: +Number(x.LabourAmount).toFixed(2),
            PartsAmount:  +Number(x.PartsAmount).toFixed(2),
            SubletAmount: +Number(x.SubletAmount).toFixed(2),
            TotalAmount:  +(Number(x.LabourAmount) + Number(x.PartsAmount) + Number(x.SubletAmount)).toFixed(2),
            IsFinalized:  !!x.IsFinalized,
        }));

        const totals = {
            count: rows.length,
            labour: +rows.reduce((s, x) => s + x.LabourAmount, 0).toFixed(2),
            parts:  +rows.reduce((s, x) => s + x.PartsAmount,  0).toFixed(2),
            sublet: +rows.reduce((s, x) => s + x.SubletAmount, 0).toFixed(2),
            total:  +rows.reduce((s, x) => s + x.TotalAmount,  0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('jobCardRegister:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/service/revenue-summary
 *
 * Service revenue by day in the period, split into Labour / Parts / Sublet.
 * Useful for daily revenue tracking.
 */
exports.revenueSummary = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT CAST(j.JobCardDate AS DATE) AS Day,
                       COUNT(j.JobCardId) AS Cards,
                       ISNULL(SUM(L.Lab), 0) AS Labour,
                       ISNULL(SUM(P.Parts), 0) AS Parts,
                       ISNULL(SUM(B.Sublet), 0) AS Sublet
                FROM Addata_JobCardInfo j
                OUTER APPLY (SELECT SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0) + ISNULL(d.TaxAmount,0)) AS Lab
                             FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId) L
                OUTER APPLY (SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0)) AS Parts
                             FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId) P
                OUTER APPLY (SELECT SUM(ISNULL(b.PayableAmount,0)) AS Sublet
                             FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId) B
                WHERE j.JobCardDate BETWEEN @from AND @to
                GROUP BY CAST(j.JobCardDate AS DATE)
                ORDER BY Day DESC`);

        const rows = r.recordset.map(x => ({
            Day:    x.Day?.toISOString().slice(0,10),
            Cards:  x.Cards,
            Labour: +Number(x.Labour).toFixed(2),
            Parts:  +Number(x.Parts).toFixed(2),
            Sublet: +Number(x.Sublet).toFixed(2),
            Total:  +(Number(x.Labour) + Number(x.Parts) + Number(x.Sublet)).toFixed(2),
        }));

        const totals = {
            days:   rows.length,
            cards:  rows.reduce((s, x) => s + x.Cards, 0),
            labour: +rows.reduce((s, x) => s + x.Labour, 0).toFixed(2),
            parts:  +rows.reduce((s, x) => s + x.Parts,  0).toFixed(2),
            sublet: +rows.reduce((s, x) => s + x.Sublet, 0).toFixed(2),
            total:  +rows.reduce((s, x) => s + x.Total,  0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('revenueSummary:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/service/insurance-claims
 *
 * Job cards routed to insurance customers (PartyGroupID matches AFTER SALE
 * insurance group) — used for tracking claim status.
 */
exports.insuranceClaims = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT j.JobCardId, j.JobCardNo, j.JobCardDate, j.Status,
                       j.VehicleRegNo, j.IsFinalized,
                       p.PartyName AS InsuranceCompany,
                       c.endUserName AS CustomerName,
                       j.DeliveryDate,
                       ISNULL((SELECT SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0) + ISNULL(d.TaxAmount,0))
                               FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0)
                     + ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0)*ISNULL(s.ItemRate,0))
                               FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0)
                     + ISNULL((SELECT SUM(ISNULL(b.PayableAmount,0))
                               FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS ClaimAmount
                FROM Addata_JobCardInfo j
                LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
                LEFT JOIN gen_PartyGroup g  ON p.PartyGroupID = g.PartyGroupID
                LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
                WHERE j.JobCardDate BETWEEN @from AND @to
                  AND (g.GroupName LIKE '%INSURANCE%' OR p.PartyType = 'Insurance')
                ORDER BY j.JobCardDate DESC`);

        const rows = r.recordset.map(x => ({
            JobCardNo:       x.JobCardNo,
            JobCardDate:     x.JobCardDate?.toISOString().slice(0,10),
            Status:          x.Status || '',
            VehicleRegNo:    x.VehicleRegNo || '',
            CustomerName:    x.CustomerName || '',
            InsuranceCompany:x.InsuranceCompany || '',
            DeliveryDate:    x.DeliveryDate?.toISOString().slice(0,10) || null,
            ClaimAmount:     +Number(x.ClaimAmount).toFixed(2),
            IsFinalized:     !!x.IsFinalized,
        }));

        const totals = {
            count: rows.length,
            claimAmount: +rows.reduce((s, x) => s + x.ClaimAmount, 0).toFixed(2),
            finalized:   rows.filter(r => r.IsFinalized).length,
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('insuranceClaims:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/service/mechanic-productivity
 *
 * Each technician's job-line count + total labour value in the period.
 * Pulled from JobCardInfoDetail.TechnicianId.
 */
exports.mechanicProductivity = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT d.TechnicianId,
                       e.EmployeeName AS TechnicianName,
                       COUNT(DISTINCT d.JobCardId) AS JobCards,
                       COUNT(*) AS JobLines,
                       ISNULL(SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1)), 0) AS GrossLabour,
                       ISNULL(SUM(ISNULL(d.DiscAmt,0)), 0) AS Discount,
                       ISNULL(SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0)), 0) AS NetLabour
                FROM Addata_JobCardInfoDetail d
                INNER JOIN Addata_JobCardInfo j ON d.JobCardId = j.JobCardId
                LEFT JOIN gen_EmployeeInfo e    ON d.TechnicianId = e.EmployeeID
                WHERE j.JobCardDate BETWEEN @from AND @to
                  AND d.TechnicianId IS NOT NULL
                GROUP BY d.TechnicianId, e.EmployeeName
                ORDER BY NetLabour DESC`);

        const rows = r.recordset.map(x => ({
            TechnicianId:   x.TechnicianId,
            TechnicianName: x.TechnicianName || `Employee #${x.TechnicianId}`,
            JobCards:       x.JobCards,
            JobLines:       x.JobLines,
            GrossLabour:    +Number(x.GrossLabour).toFixed(2),
            Discount:       +Number(x.Discount).toFixed(2),
            NetLabour:      +Number(x.NetLabour).toFixed(2),
        }));

        const totals = {
            techs:       rows.length,
            jobCards:    rows.reduce((s, x) => s + x.JobCards, 0),
            jobLines:    rows.reduce((s, x) => s + x.JobLines, 0),
            grossLabour: +rows.reduce((s, x) => s + x.GrossLabour, 0).toFixed(2),
            netLabour:   +rows.reduce((s, x) => s + x.NetLabour, 0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('mechanicProductivity:', err); res.status(500).json({ error: err.message }); }
};
