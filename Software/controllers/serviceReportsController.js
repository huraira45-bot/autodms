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

        // Owner ask 2026-07-03 (revised): the register's date is the
        // Finalized date (j.FinalizedAt) — that's when the JC is billed and
        // becomes revenue. Fall back to JobCardDate for draft rows so the
        // "draft" filter still returns results.
        const dateCol = 'COALESCE(j.FinalizedAt, j.JobCardDate)';
        const conds = [`${dateCol} BETWEEN @from AND @to`];
        if (req.query.status)    { rq.input('st', sql.NVarChar(30), req.query.status); conds.push('j.Status = @st'); }
        if (req.query.advisorId) { rq.input('ad', sql.Int, parseInt(req.query.advisorId)); conds.push('j.ServiceAdvisorID = @ad'); }

        // Business Type filter — owner's terminology for gen_JobCardType
        // (WR, FFS, SFS, PDS, PPM, B&P, GR, CT). Frontend passes one or many
        // numeric JobCardTypeIds as a comma-separated list (checkbox multi-
        // select, owner ask 2026-07-17). Empty / missing means no filter.
        if (req.query.businessType) {
            const btIds = String(req.query.businessType)
                .split(',').map(x => parseInt(x)).filter(n => Number.isFinite(n));
            if (btIds.length === 1) {
                rq.input('bt', sql.Int, btIds[0]);
                conds.push('j.JobTypeId = @bt');
            } else if (btIds.length > 1) {
                // Safe: parseInt filter above guarantees each element is a plain integer.
                conds.push(`j.JobTypeId IN (${btIds.join(',')})`);
            }
        }

        // Payment mode filter — Cash includes POS and Bank Transfer (owner
        // treats them as same-day settled cash, not receivables). Credit
        // stays separate.
        if (req.query.paymentMode === 'cash') {
            conds.push("j.Status IN ('Cash','POS','Bank Transfer')");
        } else if (req.query.paymentMode === 'credit') {
            conds.push("j.Status = 'Credit'");
        }

        // With / without parts filter — owner ask 2026-07-17. Uses EXISTS on
        // the parts-issue detail rows so it's cheaper than joining SUM > 0.
        if (req.query.hasParts === 'with') {
            conds.push(`EXISTS (SELECT 1 FROM data_StockIssuetoJobCardDetail sd
                                WHERE sd.JobCardId = j.JobCardId AND ISNULL(sd.IssueQuantity, 0) > 0)`);
        } else if (req.query.hasParts === 'without') {
            conds.push(`NOT EXISTS (SELECT 1 FROM data_StockIssuetoJobCardDetail sd
                                    WHERE sd.JobCardId = j.JobCardId AND ISNULL(sd.IssueQuantity, 0) > 0)`);
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
                   j.FinalizedAt      AS FinalizedAt,
                   j.FinalizedByName  AS FinalizedByName,
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
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT JOIN gen_JobCardType t      ON j.JobTypeId = t.JobCardTypeId
            WHERE ${conds.join(' AND ')}
            ORDER BY ${dateCol} DESC, j.JobCardId DESC`);

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
                FinalizedAt:  x.FinalizedAt?.toISOString().slice(0,10) || null,
                FinalizedByName: x.FinalizedByName || null,
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

/**
 * GET /reports/service/tax-invoice-tracker
 *
 * Same filter shape as jobCardRegister. Extra columns from dms_JCTaxInvoice
 * (GSTInvoiceNo, PSTInvoiceNo, GSTPaid, PSTPaid) — LEFT JOIN so JCs without
 * a tracker row still appear with empty invoice numbers and false flags.
 *
 * Owner ask 2026-07-17.
 */
exports.taxInvoiceTracker = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);

        const dateCol = 'COALESCE(j.FinalizedAt, j.JobCardDate)';
        const conds = [`${dateCol} BETWEEN @from AND @to`];

        if (req.query.businessType) {
            const btIds = String(req.query.businessType)
                .split(',').map(x => parseInt(x)).filter(n => Number.isFinite(n));
            if (btIds.length === 1) {
                rq.input('bt', sql.Int, btIds[0]);
                conds.push('j.JobTypeId = @bt');
            } else if (btIds.length > 1) {
                conds.push(`j.JobTypeId IN (${btIds.join(',')})`);
            }
        }
        if (req.query.paymentMode === 'cash') {
            conds.push("j.Status IN ('Cash','POS','Bank Transfer')");
        } else if (req.query.paymentMode === 'credit') {
            conds.push("j.Status = 'Credit'");
        }
        if (req.query.hasParts === 'with') {
            conds.push(`EXISTS (SELECT 1 FROM data_StockIssuetoJobCardDetail sd
                                WHERE sd.JobCardId = j.JobCardId AND ISNULL(sd.IssueQuantity, 0) > 0)`);
        } else if (req.query.hasParts === 'without') {
            conds.push(`NOT EXISTS (SELECT 1 FROM data_StockIssuetoJobCardDetail sd
                                    WHERE sd.JobCardId = j.JobCardId AND ISNULL(sd.IssueQuantity, 0) > 0)`);
        }
        const finalized = req.query.finalized || 'finalized';
        if (finalized === 'finalized')       conds.push('j.IsFinalized = 1');
        else if (finalized === 'draft')      conds.push('(j.IsFinalized IS NULL OR j.IsFinalized = 0)');

        const r = await rq.query(`
            SELECT j.JobCardId, j.JobCardNo, j.Status,
                   j.FinalizedAt, j.JobCardDate,
                   t.CardCode AS JobTypeCode, t.Title AS JobType,
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
                           FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsTax,
                   tx.GSTInvoiceNo, tx.PSTInvoiceNo,
                   ISNULL(tx.GSTPaid, 0) AS GSTPaid,
                   ISNULL(tx.PSTPaid, 0) AS PSTPaid,
                   tx.UpdatedByName AS TaxUpdatedByName, tx.UpdatedAt AS TaxUpdatedAt
            FROM Addata_JobCardInfo j
            LEFT JOIN gen_JobCardType t   ON j.JobTypeId = t.JobCardTypeId
            LEFT JOIN dms_JCTaxInvoice tx ON tx.JobCardId = j.JobCardId
            WHERE ${conds.join(' AND ')}
            ORDER BY ${dateCol} DESC, j.JobCardId DESC`);

        const rows = r.recordset.map(x => {
            const labour = Number(x.LabourGross) || 0;
            const sublet = Number(x.SubletGross) || 0;
            const parts  = Number(x.PartsGross)  || 0;
            const pst    = (Number(x.LabourTax) || 0) + (Number(x.SubletTax) || 0);
            const gst    = Number(x.PartsTax) || 0;
            return {
                JobCardId:      x.JobCardId,
                JobCardNo:      x.JobCardNo,
                FinalizedAt:    x.FinalizedAt?.toISOString().slice(0,10) || null,
                JobCardDate:    x.JobCardDate?.toISOString().slice(0,10) || null,
                Status:         x.Status || '',
                JobTypeCode:    x.JobTypeCode || '',
                JobType:        x.JobType || '',
                PartsAmount:    +parts.toFixed(2),
                LabourSublet:   +(labour + sublet).toFixed(2),
                PSTAmount:      +pst.toFixed(2),
                GSTAmount:      +gst.toFixed(2),
                GSTInvoiceNo:   x.GSTInvoiceNo || '',
                PSTInvoiceNo:   x.PSTInvoiceNo || '',
                GSTPaid:        !!x.GSTPaid,
                PSTPaid:        !!x.PSTPaid,
                TaxUpdatedByName: x.TaxUpdatedByName || null,
                TaxUpdatedAt:   x.TaxUpdatedAt?.toISOString().slice(0,16).replace('T',' ') || null,
            };
        });

        const totals = {
            count:        rows.length,
            partsAmount:  +rows.reduce((s, x) => s + x.PartsAmount, 0).toFixed(2),
            labourSublet: +rows.reduce((s, x) => s + x.LabourSublet, 0).toFixed(2),
            pstAmount:    +rows.reduce((s, x) => s + x.PSTAmount, 0).toFixed(2),
            gstAmount:    +rows.reduce((s, x) => s + x.GSTAmount, 0).toFixed(2),
            gstPaidCount: rows.filter(x => x.GSTPaid).length,
            pstPaidCount: rows.filter(x => x.PSTPaid).length,
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('taxInvoiceTracker:', err); res.status(500).json({ error: err.message }); }
};

/**
 * PATCH /reports/service/tax-invoice-tracker/:jobCardId
 * Body: { GSTInvoiceNo?, PSTInvoiceNo?, GSTPaid?, PSTPaid? }
 *
 * Upserts into dms_JCTaxInvoice. Rows are created lazily on first PATCH.
 * Owner ask 2026-07-17.
 */
exports.saveTaxInvoice = async (req, res) => {
    try {
        const jobCardId = parseInt(req.params.jobCardId);
        if (!Number.isFinite(jobCardId)) return res.status(400).json({ error: 'Invalid jobCardId' });

        const { GSTInvoiceNo, PSTInvoiceNo, GSTPaid, PSTPaid } = req.body || {};
        const clean = (v) => (v == null ? null : String(v).trim().slice(0, 50) || null);

        const pool = await getPool();
        const r = await pool.request()
            .input('id',   sql.Int,           jobCardId)
            .input('gst',  sql.NVarChar(50),  clean(GSTInvoiceNo))
            .input('pst',  sql.NVarChar(50),  clean(PSTInvoiceNo))
            .input('gp',   sql.Bit,           GSTPaid ? 1 : 0)
            .input('pp',   sql.Bit,           PSTPaid ? 1 : 0)
            .input('by',   sql.Int,           req.user?.userId || null)
            .input('byN',  sql.NVarChar(100), req.user?.userName || null)
            .query(`
                MERGE dbo.dms_JCTaxInvoice AS tgt
                USING (SELECT @id AS JobCardId) AS src
                ON tgt.JobCardId = src.JobCardId
                WHEN MATCHED THEN UPDATE SET
                    GSTInvoiceNo  = @gst,
                    PSTInvoiceNo  = @pst,
                    GSTPaid       = @gp,
                    PSTPaid       = @pp,
                    UpdatedBy     = @by,
                    UpdatedByName = @byN,
                    UpdatedAt     = GETDATE()
                WHEN NOT MATCHED THEN INSERT
                    (JobCardId, GSTInvoiceNo, PSTInvoiceNo, GSTPaid, PSTPaid,
                     UpdatedBy, UpdatedByName, UpdatedAt)
                    VALUES (@id, @gst, @pst, @gp, @pp, @by, @byN, GETDATE())
                OUTPUT INSERTED.JobCardId, INSERTED.GSTInvoiceNo, INSERTED.PSTInvoiceNo,
                       INSERTED.GSTPaid, INSERTED.PSTPaid,
                       INSERTED.UpdatedByName, INSERTED.UpdatedAt;
            `);

        const row = r.recordset[0];
        res.json({
            JobCardId:    row.JobCardId,
            GSTInvoiceNo: row.GSTInvoiceNo || '',
            PSTInvoiceNo: row.PSTInvoiceNo || '',
            GSTPaid:      !!row.GSTPaid,
            PSTPaid:      !!row.PSTPaid,
            TaxUpdatedByName: row.UpdatedByName || null,
            TaxUpdatedAt: row.UpdatedAt?.toISOString().slice(0,16).replace('T',' ') || null,
        });
    } catch (err) { console.error('saveTaxInvoice:', err); res.status(500).json({ error: err.message }); }
};
