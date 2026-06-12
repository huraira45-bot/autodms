/**
 * CRO Reports — v1 priority (cro-module-design.md §13).
 *
 * Buildable today:
 *   1. Open Complaints Dashboard   — breakdowns by status / age bucket / severity / dept
 *   2. Aged / SLA-Breach           — open complaints with hours-since-open vs next-level threshold
 *   3. Resolution Time by Dept     — avg/p90/max hours for closed complaints, per dept, in date range
 *
 * Deferred to Phase 5 (need data that doesn't exist yet):
 *   4. Survey Scores by Advisor    — needs survey responses
 *   5. Service-Reminder Conversion — needs reminders
 */
const { sql, getPool } = require('../config/db');

// Severity threshold multipliers — mirrors escalationEngine semantics.
// Levels follow rows in dms_CRO_EscalationRules (Normal: L1=72h, L2=96h).
const SEVERITY_MULT = { Low: 2, Normal: 1, High: 1, Critical: 0.5 };

// GET /api/cro/reports/open-dashboard?from=&to=
exports.openDashboard = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [`Status NOT IN ('Closed')`];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push(`OpenedAt >= @df`); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push(`OpenedAt <= @dt`); }
        const where = `WHERE ${conds.join(' AND ')}`;

        // 4 parallel-friendly aggregations, one round-trip via batch
        const result = await r.query(`
            ;WITH src AS (SELECT * FROM dms_CRO_Complaints ${where})

            SELECT 'byStatus' AS kind, Status AS k, COUNT(*) AS n FROM src GROUP BY Status
            UNION ALL
            SELECT 'bySeverity', Severity, COUNT(*) FROM src GROUP BY Severity
            UNION ALL
            SELECT 'byLevel',    CAST(CurrentEscalationLevel AS NVARCHAR(10)), COUNT(*) FROM src GROUP BY CurrentEscalationLevel
            UNION ALL
            SELECT 'byAge',
                   CASE
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  24  THEN '0-24h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  72  THEN '24-72h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  96  THEN '72-96h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) < 168  THEN '96h-7d'
                     ELSE '7d+'
                   END,
                   COUNT(*)
            FROM src
            GROUP BY CASE
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  24  THEN '0-24h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  72  THEN '24-72h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) <  96  THEN '72-96h'
                     WHEN DATEDIFF(HOUR, OpenedAt, GETDATE()) < 168  THEN '96h-7d'
                     ELSE '7d+'
                   END
            UNION ALL
            SELECT 'byDept',
                   COALESCE(d.DepartmentName, '(unassigned)'),
                   COUNT(*)
            FROM src s LEFT JOIN gen_DepartmentInfo d ON s.AssignedDepartmentID = d.DepartmentID
            GROUP BY COALESCE(d.DepartmentName, '(unassigned)')
            ;
        `);

        // Stuff every aggregation row into named buckets
        const buckets = { byStatus: [], bySeverity: [], byLevel: [], byAge: [], byDept: [] };
        for (const row of result.recordset) {
            buckets[row.kind].push({ key: row.k, count: row.n });
        }
        // Stable order for age + level
        const AGE_ORDER = ['0-24h', '24-72h', '72-96h', '96h-7d', '7d+'];
        buckets.byAge.sort((a, b) => AGE_ORDER.indexOf(a.key) - AGE_ORDER.indexOf(b.key));
        buckets.byLevel.sort((a, b) => Number(a.key) - Number(b.key));
        // Severity in display order
        const SEV_ORDER = ['Critical', 'High', 'Normal', 'Low'];
        buckets.bySeverity.sort((a, b) => SEV_ORDER.indexOf(a.key) - SEV_ORDER.indexOf(b.key));

        const total = (buckets.byStatus || []).reduce((s, x) => s + (x.count || 0), 0);
        res.json({ totalOpen: total, ...buckets });
    } catch (err) {
        console.error('CRO report openDashboard:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/aged?breachedOnly=1&minLevel=0
exports.aged = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT c.ComplaintID, c.ComplaintNo, c.Subject, c.Status, c.Severity,
                   c.CurrentEscalationLevel,
                   c.OpenedAt, c.LastEscalationAt,
                   DATEDIFF(HOUR, c.OpenedAt, GETDATE()) AS AgeHours,
                   c.JobCardID, j.JobCardNo,
                   c.AssignedEmployeeID, e.EmployeeName AS AssignedEmployeeName,
                   c.AssignedDepartmentID, d.DepartmentName AS AssignedDepartmentName,
                   c.ContactName, c.ContactPhone
            FROM dms_CRO_Complaints c
            LEFT JOIN Addata_JobCardInfo j ON c.JobCardID = j.JobCardId
            LEFT JOIN gen_EmployeeInfo   e ON c.AssignedEmployeeID = e.EmployeeID
            LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
            WHERE c.Status NOT IN ('Closed', 'PendingCROVerify')
              AND c.CurrentEscalationLevel < 2
        `);

        // Compute "hours until next-level escalation" against the seeded rules (in-JS, easier than parameter zoo)
        // Normal: 72/96; Critical: 36/48; Low: 144/192; default 72/96.
        const rows = result.recordset.map(r => {
            const mult = SEVERITY_MULT[r.Severity] ?? 1;
            const nextLevel = r.CurrentEscalationLevel + 1;
            const baseHrs = nextLevel === 1 ? 72 : 96;
            const thresholdHrs = Math.round(baseHrs * mult * 10) / 10;
            const hoursLeft = +(thresholdHrs - r.AgeHours).toFixed(1);
            return {
                ...r,
                NextLevel:    nextLevel,
                ThresholdHrs: thresholdHrs,
                HoursLeft:    hoursLeft,
                Breached:     hoursLeft <= 0,
            };
        });

        let out = rows;
        if (req.query.breachedOnly === '1') out = out.filter(x => x.Breached);
        if (req.query.minLevel) {
            const m = parseInt(req.query.minLevel);
            out = out.filter(x => x.CurrentEscalationLevel >= m);
        }
        out.sort((a, b) => a.HoursLeft - b.HoursLeft); // most-breached first

        res.json({
            totalOpen: rows.length,
            breachedCount: rows.filter(x => x.Breached).length,
            items: out,
        });
    } catch (err) {
        console.error('CRO report aged:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/survey-scores?from=&to=
// v1 #4 — survey-score aggregation: per-advisor + per-department averages, q4 "would recommend" ratio.
exports.surveyScores = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [`s.Status='Responded'`, `s.SurveyType='PostJobCard'`];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push('s.RespondedAt >= @df'); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push('s.RespondedAt <= @dt'); }
        const where = `WHERE ${conds.join(' AND ')}`;

        // Pull all responded PostJobCard surveys + their JC + advisor + dept.
        // We parse ResponsesJSON in JS (cheap; SQL Server JSON_VALUE is per-row).
        const result = await r.query(`
            SELECT s.SurveyID, s.OverallRating, s.ResponsesJSON,
                   sa.EmployeeID AS AdvisorID, sa.EmployeeName AS AdvisorName,
                   d.DepartmentID, d.DepartmentName
            FROM dms_CRO_Surveys s
            JOIN Addata_JobCardInfo j ON s.JobCardID = j.JobCardId
            LEFT JOIN gen_EmployeeInfo   sa ON j.ServiceAdvisorID = sa.EmployeeID
            LEFT JOIN gen_DepartmentInfo d  ON sa.DepartmentID = d.DepartmentID
            ${where}
        `);

        // Group in JS — per-advisor and per-dept simultaneously
        const advisors = new Map();  // key: AdvisorID|UNKNOWN
        const depts = new Map();
        let totalRecommend = 0, totalAnswered = 0;

        for (const row of result.recordset) {
            const aKey = row.AdvisorID ?? 'UNKNOWN';
            const aName = row.AdvisorName ? row.AdvisorName.trim() : '(unassigned)';
            const dKey = row.DepartmentID ?? 'UNKNOWN';
            const dName = row.DepartmentName || '(unassigned)';

            if (!advisors.has(aKey)) advisors.set(aKey, { AdvisorID: row.AdvisorID, AdvisorName: aName, n: 0, sumRating: 0, recommend: 0, q4Answered: 0 });
            if (!depts.has(dKey))    depts.set(dKey,    { DepartmentID: row.DepartmentID, DepartmentName: dName, n: 0, sumRating: 0, recommend: 0, q4Answered: 0 });

            const a = advisors.get(aKey);
            const dp = depts.get(dKey);
            a.n++; dp.n++;
            if (row.OverallRating != null) { a.sumRating += Number(row.OverallRating); dp.sumRating += Number(row.OverallRating); }

            let responses = [];
            try { responses = JSON.parse(row.ResponsesJSON || '[]'); } catch {}
            const q4 = responses.find(x => x.id === 'q4');
            if (q4) {
                a.q4Answered++; dp.q4Answered++;
                totalAnswered++;
                if (String(q4.answer).toLowerCase() === 'yes') { a.recommend++; dp.recommend++; totalRecommend++; }
            }
        }

        const toRow = (m) => Array.from(m.values()).map(g => ({
            ...g,
            AvgRating:      g.n > 0           ? +(g.sumRating / g.n).toFixed(2)            : null,
            RecommendRate:  g.q4Answered > 0  ? +(g.recommend / g.q4Answered * 100).toFixed(1) : null,
        })).sort((a, b) => (b.AvgRating ?? -1) - (a.AvgRating ?? -1));

        res.json({
            byAdvisor:    toRow(advisors),
            byDepartment: toRow(depts),
            overall: {
                Count:         result.recordset.length,
                NPSLike:       totalAnswered > 0 ? +(totalRecommend / totalAnswered * 100).toFixed(1) : null,
            },
        });
    } catch (err) {
        console.error('CRO report surveyScores:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/reminder-conversion?from=&to=
// v1 #5 — funnel of service reminders: Sent → Acknowledged → Booked → Ignored/Cancelled.
exports.reminderConversion = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push('CreatedAt >= @df'); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push('CreatedAt <= @dt'); }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';

        // Overall funnel
        const overall = await r.query(`
            SELECT
                COUNT(*) AS Total,
                SUM(CASE WHEN Status IN ('Sent','Acknowledged','Booked') THEN 1 ELSE 0 END) AS Sent,
                SUM(CASE WHEN Status IN ('Acknowledged','Booked') THEN 1 ELSE 0 END)         AS Acknowledged,
                SUM(CASE WHEN Status='Booked' THEN 1 ELSE 0 END)                              AS Booked,
                SUM(CASE WHEN Status='Cancelled' THEN 1 ELSE 0 END)                           AS Cancelled,
                SUM(CASE WHEN Status='Sent' AND DueDate < DATEADD(DAY, -14, GETDATE()) THEN 1 ELSE 0 END) AS Ignored
            FROM dms_CRO_ServiceReminders
            ${where}
        `);

        // By type
        const byType = await r.query(`
            SELECT ReminderType,
                COUNT(*) AS Total,
                SUM(CASE WHEN Status='Booked' THEN 1 ELSE 0 END) AS Booked,
                SUM(CASE WHEN Status IN ('Sent','Acknowledged','Booked') THEN 1 ELSE 0 END) AS Sent
            FROM dms_CRO_ServiceReminders
            ${where}
            GROUP BY ReminderType
            ORDER BY Total DESC
        `);

        const ov = overall.recordset[0] || { Total: 0, Sent: 0, Acknowledged: 0, Booked: 0, Cancelled: 0, Ignored: 0 };
        const bookRate = ov.Sent > 0 ? +(ov.Booked / ov.Sent * 100).toFixed(1) : 0;

        res.json({
            overall: { ...ov, BookRate: bookRate },
            byType: byType.recordset.map(r => ({
                ...r,
                BookRate: r.Sent > 0 ? +(r.Booked / r.Sent * 100).toFixed(1) : 0,
            })),
        });
    } catch (err) {
        console.error('CRO report reminderConversion:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/kyc-flags
// v2 #9 — KYC flag register summary: open vs resolved counts by type, plus a top-N list of long-standing open flags.
exports.kycFlags = async (req, res) => {
    try {
        const pool = await getPool();
        const summary = await pool.request().query(`
            SELECT FlagType,
                SUM(CASE WHEN ResolvedAt IS NULL THEN 1 ELSE 0 END) AS OpenCount,
                SUM(CASE WHEN ResolvedAt IS NOT NULL THEN 1 ELSE 0 END) AS ResolvedCount,
                COUNT(*) AS TotalCount
            FROM dms_CRO_KYCFlags
            GROUP BY FlagType
            ORDER BY OpenCount DESC, TotalCount DESC
        `);
        const longstanding = await pool.request().query(`
            SELECT TOP 20 FlagID, FlagType, ChasisNo, EngineNo, Notes,
                   FlaggedByName, FlaggedAt,
                   DATEDIFF(DAY, FlaggedAt, GETDATE()) AS AgeDays,
                   (SELECT COUNT(*) FROM dms_CRO_KYCFlags_Acknowledgments WHERE FlagID=f.FlagID) AS AckCount
            FROM dms_CRO_KYCFlags f
            WHERE ResolvedAt IS NULL
            ORDER BY FlaggedAt
        `);
        const totalRow = await pool.request().query(`
            SELECT COUNT(*) AS Total,
                   SUM(CASE WHEN ResolvedAt IS NULL THEN 1 ELSE 0 END) AS OpenTotal
            FROM dms_CRO_KYCFlags
        `);
        const ackRow = await pool.request().query(`SELECT COUNT(*) AS AckTotal FROM dms_CRO_KYCFlags_Acknowledgments`);

        res.json({
            overall: { ...(totalRow.recordset[0] || {}), Acknowledgments: ackRow.recordset[0]?.AckTotal || 0 },
            byType: summary.recordset,
            oldestOpen: longstanding.recordset,
        });
    } catch (err) {
        console.error('CRO report kycFlags:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/customer-touchpoints?top=50&search=
// v3 #12 — per-customer view across JCs, complaints, surveys, campaigns, KYC flags.
// Heavy query — caps to top N customers by total touchpoints.
exports.customerTouchpoints = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const top = Math.min(parseInt(req.query.top) || 50, 500);
        r.input('top', sql.Int, top);
        const conds = [`c.endUserName IS NOT NULL`];
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push(`(c.endUserName LIKE @q OR c.PhoneNo LIKE @q OR c.ChasisNo LIKE @q OR c.RegistrationNo LIKE @q)`);
        }
        const where = `WHERE ${conds.join(' AND ')}`;

        // Pre-aggregate each touchpoint type per CustomerProfileID, then join.
        const result = await r.query(`
            ;WITH jc AS (
                SELECT EndUserID AS ProfileID,
                       COUNT(*) AS TotalJCs,
                       SUM(CASE WHEN IsFinalized=1 THEN 1 ELSE 0 END) AS FinalizedJCs,
                       MIN(JobCardDate) AS FirstJCDate,
                       MAX(JobCardDate) AS LastJCDate
                FROM Addata_JobCardInfo
                WHERE EndUserID IS NOT NULL
                GROUP BY EndUserID
            ),
            cmp AS (
                SELECT CustomerProfileID AS ProfileID,
                       COUNT(*) AS TotalComplaints,
                       SUM(CASE WHEN Status='Closed' THEN 1 ELSE 0 END) AS ClosedComplaints,
                       SUM(CASE WHEN Status NOT IN ('Closed') THEN 1 ELSE 0 END) AS OpenComplaints,
                       SUM(CASE WHEN Severity='Critical' THEN 1 ELSE 0 END) AS CriticalComplaints,
                       SUM(CASE WHEN CurrentEscalationLevel >= 1 THEN 1 ELSE 0 END) AS EscalatedComplaints
                FROM dms_CRO_Complaints
                WHERE CustomerProfileID IS NOT NULL
                GROUP BY CustomerProfileID
            ),
            sv AS (
                SELECT CustomerProfileID AS ProfileID,
                       COUNT(*) AS TotalSurveys,
                       SUM(CASE WHEN Status='Responded' THEN 1 ELSE 0 END) AS RespondedSurveys,
                       AVG(CAST(OverallRating AS FLOAT)) AS AvgRating
                FROM dms_CRO_Surveys
                WHERE CustomerProfileID IS NOT NULL
                GROUP BY CustomerProfileID
            ),
            cs AS (
                SELECT CustomerProfileID AS ProfileID,
                       COUNT(*) AS CampaignsReceived,
                       SUM(CASE WHEN RespondedAt IS NOT NULL THEN 1 ELSE 0 END) AS CampaignsResponded
                FROM dms_CRO_CampaignSends
                WHERE CustomerProfileID IS NOT NULL
                GROUP BY CustomerProfileID
            ),
            kf AS (
                SELECT OriginalCustomerProfileID AS ProfileID,
                       SUM(CASE WHEN ResolvedAt IS NULL THEN 1 ELSE 0 END) AS OpenFlags,
                       COUNT(*) AS TotalFlags
                FROM dms_CRO_KYCFlags
                WHERE OriginalCustomerProfileID IS NOT NULL
                GROUP BY OriginalCustomerProfileID
            ),
            rm AS (
                SELECT CustomerProfileID AS ProfileID,
                       COUNT(*) AS TotalReminders,
                       SUM(CASE WHEN Status='Booked' THEN 1 ELSE 0 END) AS BookedReminders
                FROM dms_CRO_ServiceReminders
                WHERE CustomerProfileID IS NOT NULL
                GROUP BY CustomerProfileID
            )
            SELECT TOP (@top)
                c.ProfileID, c.endUserName AS CustomerName, c.PhoneNo, c.ChasisNo, c.RegistrationNo, c.BrandName,
                ISNULL(jc.TotalJCs, 0)                  AS TotalJCs,
                ISNULL(jc.FinalizedJCs, 0)              AS FinalizedJCs,
                jc.FirstJCDate, jc.LastJCDate,
                ISNULL(cmp.TotalComplaints, 0)          AS TotalComplaints,
                ISNULL(cmp.OpenComplaints, 0)           AS OpenComplaints,
                ISNULL(cmp.ClosedComplaints, 0)         AS ClosedComplaints,
                ISNULL(cmp.CriticalComplaints, 0)       AS CriticalComplaints,
                ISNULL(cmp.EscalatedComplaints, 0)      AS EscalatedComplaints,
                ISNULL(sv.TotalSurveys, 0)              AS TotalSurveys,
                ISNULL(sv.RespondedSurveys, 0)          AS RespondedSurveys,
                sv.AvgRating,
                ISNULL(cs.CampaignsReceived, 0)         AS CampaignsReceived,
                ISNULL(cs.CampaignsResponded, 0)        AS CampaignsResponded,
                ISNULL(kf.OpenFlags, 0)                 AS OpenKYCFlags,
                ISNULL(kf.TotalFlags, 0)                AS TotalKYCFlags,
                ISNULL(rm.TotalReminders, 0)            AS TotalReminders,
                ISNULL(rm.BookedReminders, 0)           AS BookedReminders,
                (ISNULL(jc.TotalJCs,0) + ISNULL(cmp.TotalComplaints,0) + ISNULL(sv.TotalSurveys,0)
                 + ISNULL(cs.CampaignsReceived,0) + ISNULL(kf.TotalFlags,0) + ISNULL(rm.TotalReminders,0)) AS TotalTouchpoints
            FROM addata_CustomerInfo c
            LEFT JOIN jc  ON jc.ProfileID  = c.ProfileID
            LEFT JOIN cmp ON cmp.ProfileID = c.ProfileID
            LEFT JOIN sv  ON sv.ProfileID  = c.ProfileID
            LEFT JOIN cs  ON cs.ProfileID  = c.ProfileID
            LEFT JOIN kf  ON kf.ProfileID  = c.ProfileID
            LEFT JOIN rm  ON rm.ProfileID  = c.ProfileID
            ${where}
            ORDER BY TotalTouchpoints DESC
        `);

        res.json({ topCount: top, customers: result.recordset });
    } catch (err) {
        console.error('CRO report customerTouchpoints:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/service-ladder
// v3 #13 — per-chassis funnel: PDI → FFS → SFS → Regular. Conversion rates between stages.
// Cohorting: which chassis reached each stage. A chassis "reached FFS" if any JC with OrderTypeId=2 exists.
exports.serviceLadder = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            ;WITH stages AS (
                SELECT
                    j.ChasisNo,
                    MAX(CASE WHEN j.OrderTypeId = 4 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitPDI,
                    MAX(CASE WHEN j.OrderTypeId = 2 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitFFS,
                    MAX(CASE WHEN j.OrderTypeId = 3 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitSFS,
                    MAX(CASE WHEN j.OrderTypeId = 1 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitRegular,
                    COUNT(*) AS TotalJCs,
                    MIN(j.JobCardDate) AS FirstJCDate
                FROM Addata_JobCardInfo j
                WHERE j.ChasisNo IS NOT NULL AND LEN(LTRIM(RTRIM(j.ChasisNo))) > 0
                GROUP BY j.ChasisNo
            ),
            cohorts AS (
                SELECT
                    FORMAT(FirstJCDate, 'yyyy-MM') AS Cohort,
                    COUNT(*)                                                                    AS Total,
                    SUM(HitPDI)                                                                  AS HitPDI,
                    SUM(HitFFS)                                                                  AS HitFFS,
                    SUM(HitSFS)                                                                  AS HitSFS,
                    SUM(HitRegular)                                                              AS HitRegular,
                    SUM(CASE WHEN HitPDI=1 AND HitFFS=0 AND HitSFS=0 AND HitRegular=0 THEN 1 ELSE 0 END) AS OnlyPDI,
                    SUM(CASE WHEN HitFFS=1 AND HitSFS=0 AND HitRegular=0 THEN 1 ELSE 0 END)        AS StoppedAtFFS,
                    SUM(CASE WHEN HitSFS=1 AND HitRegular=0 THEN 1 ELSE 0 END)                     AS StoppedAtSFS,
                    SUM(CASE WHEN HitRegular=1 THEN 1 ELSE 0 END)                                  AS ReachedRegular
                FROM stages
                WHERE FirstJCDate IS NOT NULL
                GROUP BY FORMAT(FirstJCDate, 'yyyy-MM')
            )
            SELECT
                Cohort, Total,
                HitPDI, HitFFS, HitSFS, HitRegular,
                OnlyPDI, StoppedAtFFS, StoppedAtSFS, ReachedRegular
            FROM cohorts
            ORDER BY Cohort
        `);

        // Compute overall funnel + conversion rates
        const overall = await pool.request().query(`
            ;WITH stages AS (
                SELECT
                    j.ChasisNo,
                    MAX(CASE WHEN j.OrderTypeId = 4 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitPDI,
                    MAX(CASE WHEN j.OrderTypeId = 2 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitFFS,
                    MAX(CASE WHEN j.OrderTypeId = 3 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitSFS,
                    MAX(CASE WHEN j.OrderTypeId = 1 AND j.IsFinalized = 1 THEN 1 ELSE 0 END) AS HitRegular
                FROM Addata_JobCardInfo j
                WHERE j.ChasisNo IS NOT NULL AND LEN(LTRIM(RTRIM(j.ChasisNo))) > 0
                GROUP BY j.ChasisNo
            )
            SELECT
                COUNT(*)        AS TotalChassis,
                SUM(HitPDI)     AS HitPDI,
                SUM(HitFFS)     AS HitFFS,
                SUM(HitSFS)     AS HitSFS,
                SUM(HitRegular) AS HitRegular
            FROM stages
        `);
        const ov = overall.recordset[0] || { TotalChassis: 0, HitPDI: 0, HitFFS: 0, HitSFS: 0, HitRegular: 0 };

        // Conversion: of chassis that hit stage X, how many went on to stage X+1?
        const pdiToFFS = ov.HitPDI > 0 ? +(ov.HitFFS / ov.HitPDI * 100).toFixed(1) : null;
        const ffsToSFS = ov.HitFFS > 0 ? +(ov.HitSFS / ov.HitFFS * 100).toFixed(1) : null;
        const sfsToReg = ov.HitSFS > 0 ? +(ov.HitRegular / ov.HitSFS * 100).toFixed(1) : null;

        res.json({
            overall: { ...ov, PdiToFFSRate: pdiToFFS, FFSToSFSRate: ffsToSFS, SFSToRegularRate: sfsToReg },
            cohorts: result.recordset,
        });
    } catch (err) {
        console.error('CRO report serviceLadder:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/campaign-roi
// v3 #11 — per-campaign funnel: Recipients → Sent → Delivered → Responded → Booked-JCs.
// "Booked JCs" = customers in the campaign's send list who finalized a JC within 30 days of receiving the campaign.
exports.campaignROI = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT
                c.CampaignID, c.Name, c.Channel, c.Status,
                c.ExecutedAt, c.TotalRecipients,
                c.SentCount, c.RespondedCount,
                (SELECT COUNT(*) FROM dms_CRO_CampaignSends WHERE CampaignID=c.CampaignID AND DeliveryStatus IN ('delivered','read')) AS DeliveredCount,
                (SELECT COUNT(*) FROM dms_CRO_CampaignSends WHERE CampaignID=c.CampaignID AND DeliveryStatus='Failed') AS FailedCount,
                (
                    SELECT COUNT(DISTINCT s.CustomerProfileID)
                    FROM dms_CRO_CampaignSends s
                    JOIN Addata_JobCardInfo j ON j.EndUserID = s.CustomerProfileID
                    WHERE s.CampaignID = c.CampaignID
                      AND s.SentAt IS NOT NULL
                      AND j.IsFinalized = 1
                      AND j.JobCardDate BETWEEN s.SentAt AND DATEADD(DAY, 30, s.SentAt)
                ) AS BookedWithin30d
            FROM dms_CRO_Campaigns c
            WHERE c.Status IN ('Sending','Sent','Cancelled')
            ORDER BY c.ExecutedAt DESC
        `);
        const rows = result.recordset.map(r => {
            const sent = r.SentCount || 0;
            const conv = sent > 0 ? +(r.BookedWithin30d / sent * 100).toFixed(1) : 0;
            const respRate = sent > 0 ? +((r.RespondedCount || 0) / sent * 100).toFixed(1) : 0;
            const delRate  = sent > 0 ? +((r.DeliveredCount || 0) / sent * 100).toFixed(1) : 0;
            return { ...r, ConversionRate: conv, ResponseRate: respRate, DeliveryRate: delRate };
        });
        const totals = rows.reduce((a, r) => ({
            Recipients: a.Recipients + (r.TotalRecipients || 0),
            Sent:       a.Sent       + (r.SentCount || 0),
            Delivered:  a.Delivered  + (r.DeliveredCount || 0),
            Responded:  a.Responded  + (r.RespondedCount || 0),
            BookedWithin30d: a.BookedWithin30d + (r.BookedWithin30d || 0),
        }), { Recipients: 0, Sent: 0, Delivered: 0, Responded: 0, BookedWithin30d: 0 });
        const overallConv = totals.Sent > 0 ? +(totals.BookedWithin30d / totals.Sent * 100).toFixed(1) : 0;

        res.json({ campaigns: rows, overall: { ...totals, ConversionRate: overallConv } });
    } catch (err) {
        console.error('CRO report campaignROI:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/by-responder?from=&to=
// v2 #6 — performance review by-name across complaint volume + outcomes.
exports.byResponder = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = ['c.AssignedEmployeeID IS NOT NULL'];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push('c.OpenedAt >= @df'); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push('c.OpenedAt <= @dt'); }
        const where = `WHERE ${conds.join(' AND ')}`;

        const result = await r.query(`
            ;WITH ns AS (
                SELECT DISTINCT ComplaintID FROM dms_CRO_ComplaintActions
                WHERE ActionType='CustomerVerdict' AND CustomerVerdict='NotSatisfied'
            )
            SELECT
                c.AssignedEmployeeID,
                e.EmployeeName,
                d.DepartmentName,
                COUNT(*)                                                         AS TotalComplaints,
                SUM(CASE WHEN c.Status='Closed' THEN 1 ELSE 0 END)                AS ClosedCount,
                SUM(CASE WHEN c.Status NOT IN ('Closed') THEN 1 ELSE 0 END)       AS OpenCount,
                SUM(CASE WHEN c.CurrentEscalationLevel >= 1 THEN 1 ELSE 0 END)    AS EscalatedCount,
                AVG(CASE WHEN c.Status='Closed' AND c.ClosedAt IS NOT NULL
                         THEN CAST(DATEDIFF(HOUR, c.OpenedAt, c.ClosedAt) AS FLOAT) END) AS AvgCloseHours,
                SUM(CASE WHEN ns.ComplaintID IS NOT NULL THEN 1 ELSE 0 END)       AS NotSatisfiedCount
            FROM dms_CRO_Complaints c
            LEFT JOIN ns                 ON ns.ComplaintID = c.ComplaintID
            LEFT JOIN gen_EmployeeInfo   e ON c.AssignedEmployeeID = e.EmployeeID
            LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
            ${where}
            GROUP BY c.AssignedEmployeeID, e.EmployeeName, d.DepartmentName
            ORDER BY TotalComplaints DESC
        `);
        res.json({ rows: result.recordset });
    } catch (err) {
        console.error('CRO report byResponder:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/escalation-heatmap?from=&to=
// v2 #7 — which depts hit which escalation levels (process-improvement signal).
exports.escalationHeatmap = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [`a.ActionType = 'Escalated'`];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push('a.PerformedAt >= @df'); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push('a.PerformedAt <= @dt'); }
        const where = `WHERE ${conds.join(' AND ')}`;

        const result = await r.query(`
            SELECT
                COALESCE(d.DepartmentName, '(unassigned)') AS Department,
                SUM(CASE WHEN a.EscalationLevelAfter = 1 THEN 1 ELSE 0 END) AS L1Count,
                SUM(CASE WHEN a.EscalationLevelAfter = 2 THEN 1 ELSE 0 END) AS L2Count,
                SUM(CASE WHEN a.PerformedByName IS NULL OR a.PerformedByName='SYSTEM' THEN 1 ELSE 0 END) AS AutoCount,
                SUM(CASE WHEN a.PerformedByName IS NOT NULL AND a.PerformedByName<>'SYSTEM' THEN 1 ELSE 0 END) AS ManualCount,
                COUNT(*) AS TotalEscalations
            FROM dms_CRO_ComplaintActions a
            JOIN  dms_CRO_Complaints c ON a.ComplaintID = c.ComplaintID
            LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
            ${where}
            GROUP BY COALESCE(d.DepartmentName, '(unassigned)')
            ORDER BY TotalEscalations DESC
        `);
        res.json({ rows: result.recordset });
    } catch (err) {
        console.error('CRO report escalationHeatmap:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/repeats?windowDays=90
// v2 #8 — chassis / customers with ≥2 complaints in a rolling window.
exports.repeatComplaints = async (req, res) => {
    try {
        const days = Math.min(parseInt(req.query.windowDays) || 90, 365);
        const pool = await getPool();

        // Repeats keyed by ChasisNo when present, else CustomerProfileID, else PartyID.
        // We surface up to 5 ComplaintNos per group for at-a-glance scan.
        const result = await pool.request()
            .input('days', sql.Int, days)
            .query(`
                ;WITH recent AS (
                    SELECT c.ComplaintID, c.ComplaintNo, c.Subject, c.Status, c.Severity,
                           c.OpenedAt, c.ChasisNo, c.CustomerProfileID, c.PartyID, c.ContactName,
                           COALESCE(c.ChasisNo, CAST(c.CustomerProfileID AS NVARCHAR(50)), CAST(c.PartyID AS NVARCHAR(50)), 'UNKNOWN-' + CAST(c.ComplaintID AS NVARCHAR(50))) AS GroupKey
                    FROM dms_CRO_Complaints c
                    WHERE c.OpenedAt >= DATEADD(DAY, -@days, GETDATE())
                ),
                grp AS (
                    SELECT GroupKey, COUNT(*) AS ComplaintCount,
                           MIN(OpenedAt) AS FirstOpened, MAX(OpenedAt) AS LastOpened,
                           MAX(CASE WHEN ChasisNo IS NOT NULL THEN ChasisNo END) AS AnyChasis,
                           MAX(ContactName) AS AnyContactName,
                           MAX(CustomerProfileID) AS AnyProfileID
                    FROM recent
                    GROUP BY GroupKey
                    HAVING COUNT(*) >= 2
                )
                SELECT g.*,
                       (SELECT STRING_AGG(r.ComplaintNo, ', ') WITHIN GROUP (ORDER BY r.OpenedAt DESC)
                        FROM (SELECT TOP 5 ComplaintNo, OpenedAt FROM recent WHERE recent.GroupKey = g.GroupKey ORDER BY OpenedAt DESC) r) AS ComplaintNos
                FROM grp g
                ORDER BY g.ComplaintCount DESC, g.LastOpened DESC
            `);

        res.json({ windowDays: days, rows: result.recordset });
    } catch (err) {
        console.error('CRO report repeats:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/verdict-tracker?months=12
// v2 #10 — monthly NotSatisfied trend + kickback rate.
exports.verdictTracker = async (req, res) => {
    try {
        const months = Math.min(parseInt(req.query.months) || 12, 36);
        const pool = await getPool();
        const result = await pool.request()
            .input('m', sql.Int, months)
            .query(`
                ;WITH verdicts AS (
                    SELECT FORMAT(PerformedAt, 'yyyy-MM') AS Month,
                           CustomerVerdict
                    FROM dms_CRO_ComplaintActions
                    WHERE ActionType='CustomerVerdict'
                      AND CustomerVerdict IN ('Satisfied', 'NotSatisfied', 'NoResponse')
                      AND PerformedAt >= DATEADD(MONTH, -@m, GETDATE())
                )
                SELECT Month,
                       SUM(CASE WHEN CustomerVerdict='Satisfied'    THEN 1 ELSE 0 END) AS Satisfied,
                       SUM(CASE WHEN CustomerVerdict='NotSatisfied' THEN 1 ELSE 0 END) AS NotSatisfied,
                       SUM(CASE WHEN CustomerVerdict='NoResponse'   THEN 1 ELSE 0 END) AS NoResponse,
                       COUNT(*) AS Total
                FROM verdicts
                GROUP BY Month
                ORDER BY Month
            `);

        // Compute kickback rate per row (% NotSatisfied of {Satisfied + NotSatisfied})
        const rows = result.recordset.map(r => {
            const decided = (r.Satisfied || 0) + (r.NotSatisfied || 0);
            const kickbackRate = decided > 0 ? +(r.NotSatisfied / decided * 100).toFixed(1) : 0;
            return { ...r, KickbackRate: kickbackRate };
        });

        const grandTotal = rows.reduce((a, r) => ({
            Satisfied:    a.Satisfied    + r.Satisfied,
            NotSatisfied: a.NotSatisfied + r.NotSatisfied,
            NoResponse:   a.NoResponse   + r.NoResponse,
        }), { Satisfied: 0, NotSatisfied: 0, NoResponse: 0 });
        const decidedAll = grandTotal.Satisfied + grandTotal.NotSatisfied;
        const overallKickback = decidedAll > 0 ? +(grandTotal.NotSatisfied / decidedAll * 100).toFixed(1) : 0;

        res.json({ months, rows, overall: { ...grandTotal, KickbackRate: overallKickback } });
    } catch (err) {
        console.error('CRO report verdictTracker:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/cro/reports/resolution-time?from=&to=
exports.resolutionTime = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [`Status = 'Closed'`, `ClosedAt IS NOT NULL`];
        if (req.query.from) { r.input('df', sql.DateTime, new Date(req.query.from)); conds.push(`ClosedAt >= @df`); }
        if (req.query.to)   { r.input('dt', sql.DateTime, new Date(req.query.to));   conds.push(`ClosedAt <= @dt`); }
        const where = `WHERE ${conds.join(' AND ')}`;

        // PERCENTILE_CONT requires WITHIN GROUP; we use DISTINCT for one value per partition.
        const result = await r.query(`
            ;WITH closed AS (
                SELECT c.ComplaintID, c.Severity, c.AssignedDepartmentID,
                       d.DepartmentName,
                       DATEDIFF(HOUR, c.OpenedAt, c.ClosedAt) AS HoursToClose
                FROM dms_CRO_Complaints c
                LEFT JOIN gen_DepartmentInfo d ON c.AssignedDepartmentID = d.DepartmentID
                ${where}
            )
            SELECT
                COALESCE(DepartmentName, '(unassigned)') AS Department,
                COUNT(*) AS ClosedCount,
                AVG(CAST(HoursToClose AS FLOAT))         AS AvgHours,
                MAX(HoursToClose)                        AS MaxHours,
                MIN(HoursToClose)                        AS MinHours,
                -- p90 with PERCENTILE_CONT (continuous), distinct per group
                MAX(p90)                                 AS P90Hours
            FROM (
                SELECT *,
                       PERCENTILE_CONT(0.9) WITHIN GROUP (ORDER BY HoursToClose)
                           OVER (PARTITION BY DepartmentName) AS p90
                FROM closed
            ) x
            GROUP BY DepartmentName
            ORDER BY AvgHours DESC
        `);

        const overall = await r.query(`
            ;WITH closed AS (
                SELECT DATEDIFF(HOUR, OpenedAt, ClosedAt) AS HoursToClose
                FROM dms_CRO_Complaints
                ${where}
            )
            SELECT COUNT(*) AS ClosedCount,
                   AVG(CAST(HoursToClose AS FLOAT)) AS AvgHours,
                   MAX(HoursToClose) AS MaxHours
            FROM closed
        `);

        res.json({
            overall: overall.recordset[0] || { ClosedCount: 0, AvgHours: 0, MaxHours: 0 },
            byDepartment: result.recordset,
        });
    } catch (err) {
        console.error('CRO report resolutionTime:', err);
        res.status(500).json({ error: err.message });
    }
};
