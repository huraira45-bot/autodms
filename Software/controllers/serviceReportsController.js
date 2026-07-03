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

        // Owner ask 2026-07-03: the register's date is the Gate Pass IssuedAt
        // (the day the vehicle physically leaves), not the JC creation date.
        // Filter on the same column so the period lines up with what actually
        // moved out of the workshop. JOBCARDs without an ACTIVE gate pass
        // (RevokedAt IS NULL) are excluded — they haven't been delivered yet.
        const conds = ['gp.IssuedAt BETWEEN @from AND @to'];
        if (req.query.status)    { rq.input('st', sql.NVarChar(30), req.query.status); conds.push('j.Status = @st'); }
        if (req.query.advisorId) { rq.input('ad', sql.Int, parseInt(req.query.advisorId)); conds.push('j.ServiceAdvisorID = @ad'); }

        // Business Type filter — owner's terminology for gen_JobCardType
        // (WR, FFS, SFS, PDS, PPM, B&P, GR, CT). Frontend passes the numeric
        // JobCardTypeId picked from the dropdown.
        if (req.query.businessType) {
            rq.input('bt', sql.Int, parseInt(req.query.businessType));
            conds.push('j.JobTypeId = @bt');
        }

        // Payment mode filter — Cash includes POS and Bank Transfer (owner
        // treats them as same-day settled cash, not receivables). Credit
        // stays separate.
        if (req.query.paymentMode === 'cash') {
            conds.push("j.Status IN ('Cash','POS','Bank Transfer')");
        } else if (req.query.paymentMode === 'credit') {
            conds.push("j.Status = 'Credit'");
        }

        // Finalized filter — default is 'finalized' so the report shows
        // billing-quality rows only. Owner request 2026-07-01 (revenue reports
        // should exclude open/draft JCs to avoid double-counting when the
        // amounts settle at finalize).
        const finalized = req.query.finalized || 'finalized';
        if (finalized === 'finalized')       conds.push('j.IsFinalized = 1');
        else if (finalized === 'draft')      conds.push('(j.IsFinalized IS NULL OR j.IsFinalized = 0)');
        // finalized === 'all' → no filter

        // Owner ask 2026-07-03: break labour, parts, sublet, PST, GST out as
        // separate columns instead of one mashed-together total. PST is
        // snapshotted on each labour + sublet line's TaxAmount; GST is on
        // each parts line's TaxAmount. Convention (already used by the
        // credit-invoice print):
        //   Labour (gross)  = Σ (Price × Qty − DiscAmt)  on labour lines
        //   Sublet (gross)  = Σ PayableAmount            on sublet lines
        //   PST             = Σ TaxAmount                on labour + sublet lines
        //   Parts (gross)   = Σ (IssueQty × ItemRate)    on parts lines
        //   GST             = Σ TaxAmount                on parts lines
        //   Grand Total     = Labour + Sublet + Parts + PST + GST
        const r = await rq.query(`
            SELECT j.JobCardId, j.JobCardNo, j.JobCardDate, j.Status,
                   j.VehicleRegNo, j.ChasisNo, j.EngineNo, j.KiloMeter,
                   j.ReceiptDate, j.PromisedDate, j.DeliveryDate,
                   j.ServiceAdvisor, j.JobResult, j.IsFinalized,
                   gp.IssuedAt   AS GatePassDate,
                   gp.GatePassNo AS GatePassNo,
                   c.endUserName AS CustomerName, c.PhoneNo, c.CustomerCode,
                   t.Title AS JobType,
                   ISNULL((SELECT SUM(ISNULL(d.Price,0) * ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0))
                           FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0) AS LabourGross,
                   ISNULL((SELECT SUM(ISNULL(d.TaxAmount,0))
                           FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0) AS LabourTax,
                   ISNULL((SELECT SUM(ISNULL(b.PayableAmount,0))
                           FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS SubletGross,
                   ISNULL((SELECT SUM(ISNULL(b.TaxAmount,0))
                           FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS SubletTax,
                   ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0))
                           FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsGross,
                   ISNULL((SELECT SUM(ISNULL(s.TaxAmount,0))
                           FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsTax
            FROM Addata_JobCardInfo j
            INNER JOIN dms_GatePasses gp
                    ON gp.DocType = 'JOBCARD' AND gp.DocID = j.JobCardId AND gp.RevokedAt IS NULL
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT JOIN gen_JobCardType t      ON j.JobTypeId = t.JobCardTypeId
            WHERE ${conds.join(' AND ')}
            ORDER BY gp.IssuedAt DESC, j.JobCardId DESC`);

        const rows = r.recordset.map(x => {
            const labour = Number(x.LabourGross) || 0;
            const sublet = Number(x.SubletGross) || 0;
            const parts  = Number(x.PartsGross)  || 0;
            const pst    = (Number(x.LabourTax) || 0) + (Number(x.SubletTax) || 0);
            const gst    = Number(x.PartsTax) || 0;
            return {
                JobCardId:    x.JobCardId,
                JobCardNo:    x.JobCardNo,
                JobCardDate:  x.JobCardDate?.toISOString().slice(0,10),
                GatePassDate: x.GatePassDate?.toISOString().slice(0,10) || null,
                GatePassNo:   x.GatePassNo || null,
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
                // Broken-out amounts (owner ask 2026-07-03)
                LabourAmount: +labour.toFixed(2),
                SubletAmount: +sublet.toFixed(2),
                PartsAmount:  +parts.toFixed(2),
                PSTAmount:    +pst.toFixed(2),
                GSTAmount:    +gst.toFixed(2),
                TotalAmount:  +(labour + sublet + parts + pst + gst).toFixed(2),
                IsFinalized:  !!x.IsFinalized,
            };
        });

        const totals = {
            count:  rows.length,
            labour: +rows.reduce((s, x) => s + x.LabourAmount, 0).toFixed(2),
            sublet: +rows.reduce((s, x) => s + x.SubletAmount, 0).toFixed(2),
            parts:  +rows.reduce((s, x) => s + x.PartsAmount,  0).toFixed(2),
            pst:    +rows.reduce((s, x) => s + x.PSTAmount,    0).toFixed(2),
            gst:    +rows.reduce((s, x) => s + x.GSTAmount,    0).toFixed(2),
            total:  +rows.reduce((s, x) => s + x.TotalAmount,  0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('jobCardRegister:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/service/advisor-performance
 *
 * Work delivered by each Service Advisor across the period, optionally
 * scoped to one Business Type (JobCardTypeId) and/or Payment mode.
 * Group by advisor, sum labour/parts/sublet, count job cards.
 * Owner request 2026-07-01.
 *
 * Filters: from, to, businessType (=JobCardTypeId), paymentMode (cash|credit),
 * finalized (finalized|draft|all, default 'finalized').
 */
exports.advisorPerformance = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        const conds = ['j.JobCardDate BETWEEN @from AND @to'];
        if (req.query.businessType) {
            rq.input('bt', sql.Int, parseInt(req.query.businessType));
            conds.push('j.JobTypeId = @bt');
        }
        if (req.query.paymentMode === 'cash') {
            conds.push("j.Status IN ('Cash','POS','Bank Transfer')");
        } else if (req.query.paymentMode === 'credit') {
            conds.push("j.Status = 'Credit'");
        }
        const finalized = req.query.finalized || 'finalized';
        if (finalized === 'finalized')  conds.push('j.IsFinalized = 1');
        else if (finalized === 'draft') conds.push('(j.IsFinalized IS NULL OR j.IsFinalized = 0)');

        const r = await rq.query(`
            SELECT ISNULL(NULLIF(LTRIM(RTRIM(j.ServiceAdvisor)), ''), '(Unassigned)') AS Advisor,
                   j.ServiceAdvisorID,
                   COUNT(j.JobCardId) AS Cards,
                   ISNULL(SUM(L.Lab),   0) AS Labour,
                   ISNULL(SUM(P.Parts), 0) AS Parts,
                   ISNULL(SUM(B.Sublet),0) AS Sublet
            FROM Addata_JobCardInfo j
            OUTER APPLY (SELECT SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0) + ISNULL(d.TaxAmount,0)) AS Lab
                         FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId) L
            OUTER APPLY (SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0)) AS Parts
                         FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId) P
            OUTER APPLY (SELECT SUM(ISNULL(b.PayableAmount,0)) AS Sublet
                         FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId) B
            WHERE ${conds.join(' AND ')}
            GROUP BY j.ServiceAdvisorID, LTRIM(RTRIM(j.ServiceAdvisor))
            ORDER BY (ISNULL(SUM(L.Lab),0) + ISNULL(SUM(P.Parts),0) + ISNULL(SUM(B.Sublet),0)) DESC`);

        const rows = r.recordset.map(x => ({
            ServiceAdvisorID: x.ServiceAdvisorID,
            Advisor:          x.Advisor,
            Cards:            Number(x.Cards),
            Labour:           +Number(x.Labour).toFixed(2),
            Parts:            +Number(x.Parts).toFixed(2),
            Sublet:           +Number(x.Sublet).toFixed(2),
            Total:            +(Number(x.Labour) + Number(x.Parts) + Number(x.Sublet)).toFixed(2),
        }));

        const totals = {
            advisors: rows.length,
            cards:    rows.reduce((s, x) => s + x.Cards,  0),
            labour:   +rows.reduce((s, x) => s + x.Labour, 0).toFixed(2),
            parts:    +rows.reduce((s, x) => s + x.Parts,  0).toFixed(2),
            sublet:   +rows.reduce((s, x) => s + x.Sublet, 0).toFixed(2),
            total:    +rows.reduce((s, x) => s + x.Total,  0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('advisorPerformance:', err); res.status(500).json({ error: err.message }); }
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
