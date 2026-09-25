const { sql, getPool } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const { computeLineDiscAmt, validateDiscountCap } = require('../utils/careOffUtils');
const { getEffectiveCapForJC } = require('./careOffElevationController');
const { resolveRate } = require('./taxRatesController');
const { assertEnoughStock } = require('../services/stockBalanceService');

// snapshotTax and parseWallDateTime moved to services/jobCardSaveService.js,
// shared with the service tablet (plan 2026-09-14, Phase 2).
const {
    snapshotTax, parseWallDateTime, insertLabourLine, floorFieldCarrier, createJobCardInTx,
} = require('../services/jobCardSaveService');
const { issuePartsInTx } = require('../services/partsIssueService');

// ============== CUSTOMERS ==============
exports.getCustomers = async (req, res) => {
    try {
        const { search } = req.query;
        // Owner report 2026-07-18: this endpoint used to return every row in
        // vw_WorkshopCustomers (~9k rows) on every open — took ~15s and grew
        // linearly with new customers. Cap server-side and return a total
        // count so the UI can nudge users to refine when the cap bites.
        const limit = Math.min(parseInt(req.query.limit) || 200, 500);

        const pool = await getPool();
        const request = pool.request();
        request.input('lim', sql.Int, limit);
        let where = '';
        if (search && search.trim()) {
            request.input('search', sql.NVarChar(200), `%${search.trim()}%`);
            where = ` WHERE CustomerName LIKE @search
                          OR PhoneNo         LIKE @search
                          OR CNIC            LIKE @search
                          OR CustomerCode    LIKE @search
                          OR RegistrationNo  LIKE @search
                          OR ChasisNo        LIKE @search`;
        }
        const [rowsRes, countRes] = await Promise.all([
            request.query(`SELECT TOP (@lim) * FROM vw_WorkshopCustomers${where} ORDER BY ProfileID DESC`),
            pool.request()
                .input('search', sql.NVarChar(200), search?.trim() ? `%${search.trim()}%` : null)
                .query(`SELECT COUNT(*) AS Total FROM vw_WorkshopCustomers
                        WHERE @search IS NULL OR (
                             CustomerName    LIKE @search
                          OR PhoneNo         LIKE @search
                          OR CNIC            LIKE @search
                          OR CustomerCode    LIKE @search
                          OR RegistrationNo  LIKE @search
                          OR ChasisNo        LIKE @search)`),
        ]);
        res.json({
            rows: rowsRes.recordset,
            total: countRes.recordset[0].Total,
            limit,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getCustomerById = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM vw_WorkshopCustomers WHERE ProfileID = @id');
        if (result.recordset.length === 0) return res.status(404).json({ error: 'Customer not found' });
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveCustomer = async (req, res) => {
    try {
        const { ProfileID, CustomerName, PhoneNo, Email, CNIC, Address, DOB,
                ChasisNo, EngineNo, RegistrationNo, BrandName, VehicleModel } = req.body;
        const pool = await getPool();
        const dobVal = DOB ? new Date(DOB) : null;

        if (ProfileID) {
            await pool.request()
                .input('id', sql.Int, ProfileID)
                .input('name', sql.NVarChar(150), CustomerName)
                .input('phone', sql.NVarChar(150), PhoneNo)
                .input('email', sql.NVarChar(150), Email)
                .input('cnic', sql.NVarChar(150), CNIC)
                .input('address', sql.NVarChar(150), Address)
                .input('dob', sql.Date, dobVal)
                .query(`UPDATE addata_CustomerInfo SET
                    endUserName=@name, PhoneNo=@phone, Email=@email, CNIC=@cnic, Address=@address,
                    DOB=@dob, ModifyUserDateTime=GETDATE() WHERE ProfileID=@id`);
            res.json({ message: 'Customer updated' });
        } else {
            const result = await pool.request()
                .input('name', sql.NVarChar(150), CustomerName)
                .input('phone', sql.NVarChar(150), PhoneNo)
                .input('email', sql.NVarChar(150), Email)
                .input('cnic', sql.NVarChar(150), CNIC)
                .input('address', sql.NVarChar(150), Address)
                .input('dob', sql.Date, dobVal)
                .input('companyId', sql.Int, 1)
                .query(`INSERT INTO addata_CustomerInfo
                    (endUserName, PhoneNo, Email, CNIC, Address, DOB, CompanyID, EntryUserDateTime)
                    OUTPUT INSERTED.ProfileID
                    VALUES (@name, @phone, @email, @cnic, @address, @dob, @companyId, GETDATE())`);
            res.status(201).json({ message: 'Customer created', ProfileID: result.recordset[0].ProfileID });
        }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== CUSTOMER VEHICLES ==============
exports.getCustomerVehicles = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM WorkshopVehicles WHERE EndUserID = @id ORDER BY VehicleID DESC');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.addCustomerVehicle = async (req, res) => {
    try {
        const { RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel, VehicleColor } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.params.id)
            .input('regNo', sql.NVarChar(150), RegistrationNo)
            .input('chassis', sql.NVarChar(150), ChasisNo)
            .input('engine', sql.NVarChar(150), EngineNo)
            .input('brand', sql.NVarChar(150), BrandName)
            .input('model', sql.NVarChar(150), VehicleModel)
            .input('color', sql.NVarChar(100), VehicleColor || null)
            .query(`INSERT INTO WorkshopVehicles (EndUserID, RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel, VehicleColor)
                    OUTPUT INSERTED.*
                    VALUES (@userId, @regNo, @chassis, @engine, @brand, @model, @color)`);
        res.status(201).json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.updateCustomerVehicle = async (req, res) => {
    try {
        const { RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel, VehicleColor } = req.body;
        const pool = await getPool();
        const r = await pool.request()
            .input('vid',     sql.Int,          parseInt(req.params.vehicleId))
            .input('userId',  sql.Int,          parseInt(req.params.id))
            .input('regNo',   sql.NVarChar(150), RegistrationNo)
            .input('chassis', sql.NVarChar(150), ChasisNo)
            .input('engine',  sql.NVarChar(150), EngineNo)
            .input('brand',   sql.NVarChar(150), BrandName)
            .input('model',   sql.NVarChar(150), VehicleModel)
            .input('color',   sql.NVarChar(100), VehicleColor || null)
            .query(`UPDATE WorkshopVehicles
                       SET RegistrationNo = @regNo,
                           ChasisNo       = @chassis,
                           EngineNo       = @engine,
                           BrandName      = @brand,
                           VehicleModel   = @model,
                           VehicleColor   = @color
                     OUTPUT INSERTED.*
                     WHERE VehicleID = @vid AND EndUserID = @userId`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Vehicle not found for this customer' });
        res.json(r.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== PARTIES (Credit) ==============
exports.getParties = async (req, res) => {
    try {
        const { business } = req.query;
        const pool = await getPool();
        const r = pool.request();
        let where = '';
        if (business) {
            r.input('biz', sql.NVarChar(20), business);
            where = `WHERE EXISTS (SELECT 1 FROM dms_PartyBusinessAccess pba
                                   WHERE pba.PartyID = p.PartyID AND pba.BusinessKey = @biz)`;
        }
        const result = await r.query(`SELECT p.PartyID, p.PartyName, p.PhoneOne, p.CNIC
                                       FROM vw_ActiveParties p ${where}
                                       ORDER BY p.PartyName`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============== BUSINESS TYPES (Job Types) ==============
// PATCH /api/workshop/job-types/:id/manager — set the L0 escalation manager for a business type
exports.setJobCardTypeManager = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .input('emp', sql.Int, req.body.ManagerEmployeeID ? parseInt(req.body.ManagerEmployeeID) : null)
            .query('UPDATE gen_JobCardType SET ManagerEmployeeID=@emp WHERE JobCardTypeId=@id');
        res.json({ message: 'Business-type manager updated' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.getJobCardTypes = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT t.JobCardTypeId, t.CardCode, t.Title,
                   t.ManagerEmployeeID,
                   e.EmployeeName AS ManagerEmployeeName,
                   t.JobRevenueAccount,   rev.GLCode AS JobRevenueCode,   rev.GLTitle AS JobRevenueTitle,
                   t.PartsRevenueAccount, prt.GLCode AS PartsRevenueCode, prt.GLTitle AS PartsRevenueTitle,
                   t.ReceivableAccount,   rcv.GLCode AS ReceivableCode,   rcv.GLTitle AS ReceivableTitle
            FROM gen_JobCardType t
            LEFT JOIN gen_EmployeeInfo e   ON t.ManagerEmployeeID = e.EmployeeID
            LEFT JOIN GLChartOFAccount rev ON t.JobRevenueAccount   = rev.GLCAID
            LEFT JOIN GLChartOFAccount prt ON t.PartsRevenueAccount = prt.GLCAID
            LEFT JOIN GLChartOFAccount rcv ON t.ReceivableAccount   = rcv.GLCAID
            WHERE t.Status = 1 ORDER BY t.SNo
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * PATCH /api/workshop/job-types/:id/gl  body: { JobRevenueAccount, PartsRevenueAccount, ReceivableAccount }
 * Sets the GL accounts that JCs of this business unit post against. NULL is allowed
 * (means "fall back to the system-default Service / Parts / Trade Debtors role").
 */
exports.setJobCardTypeGL = async (req, res) => {
    try {
        const pool = await getPool();
        const id = parseInt(req.params.id);
        const norm = (v) => (v === '' || v == null) ? null : parseInt(v);

        await pool.request()
            .input('id',  sql.Int, id)
            .input('rev', sql.Int, norm(req.body.JobRevenueAccount))
            .input('prt', sql.Int, norm(req.body.PartsRevenueAccount))
            .input('rcv', sql.Int, norm(req.body.ReceivableAccount))
            .query(`UPDATE gen_JobCardType
                    SET JobRevenueAccount = @rev,
                        PartsRevenueAccount = @prt,
                        ReceivableAccount = @rcv
                    WHERE JobCardTypeId = @id`);
        res.json({ message: 'GL mapping saved' });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
};

exports.saveJobCardType = async (req, res) => {
    try {
        const { JobCardTypeId, CardCode, Title } = req.body;
        const pool = await getPool();
        if (JobCardTypeId) {
            await pool.request()
                .input('id', sql.Int, JobCardTypeId)
                .input('code', sql.NVarChar(50), CardCode)
                .input('title', sql.NVarChar(150), Title)
                .query('UPDATE gen_JobCardType SET CardCode=@code, Title=@title WHERE JobCardTypeId=@id');
        } else {
            await pool.request()
                .input('code', sql.NVarChar(50), CardCode)
                .input('title', sql.NVarChar(150), Title)
                .query('INSERT INTO gen_JobCardType (CardCode, Title, Status, SNo) VALUES (@code, @title, 1, 0)');
            await pool.request()
                .input('code', sql.NVarChar(10), CardCode.toUpperCase())
                .query('IF NOT EXISTS (SELECT 1 FROM dms_ROCounters WHERE CardCode=@code) INSERT INTO dms_ROCounters (CardCode, CurrentCounter) VALUES (@code, 0)');
        }
        res.json({ message: 'Saved successfully' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteJobCardType = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().input('id', sql.Int, req.params.id).query('UPDATE gen_JobCardType SET Status=0 WHERE JobCardTypeId=@id');
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== ORDER TYPES ==============
exports.getOrderTypes = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT * FROM gen_OrderType WHERE Status = 1 ORDER BY OrderTypeId DESC');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveOrderType = async (req, res) => {
    try {
        const { OrderTypeId, OrderTypeName } = req.body;
        const pool = await getPool();
        if (OrderTypeId) {
            await pool.request()
                .input('id', sql.Int, OrderTypeId)
                .input('name', sql.NVarChar(150), OrderTypeName)
                .query('UPDATE gen_OrderType SET OrderTypeName=@name WHERE OrderTypeId=@id');
        } else {
            await pool.request()
                .input('name', sql.NVarChar(150), OrderTypeName)
                .query('INSERT INTO gen_OrderType (OrderTypeName, Status) VALUES (@name, 1)');
        }
        res.json({ message: 'Saved successfully' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteOrderType = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().input('id', sql.Int, req.params.id).query('UPDATE gen_OrderType SET Status=0 WHERE OrderTypeId=@id');
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== JOB CARDS ==============
// GET /api/workshop/vehicle-history?chassis=...&engine=...&regNo=...
// Owner ask 2026-07-03: given a vehicle's identifiers, return every JC ever
// posted against it (matched by ChasisNo OR EngineNo OR VehicleRegNo).
// Used by the Vehicle History page and by a link on the JC form so the
// operator can quickly see prior service on the same vehicle.
exports.getVehicleHistory = async (req, res) => {
    try {
        const { chassis, engine, regNo, excludeJc } = req.query;
        const norm = (v) => (v || '').trim();
        const c = norm(chassis), e = norm(engine), r = norm(regNo);
        if (!c && !e && !r) {
            return res.status(400).json({ error: 'Provide at least one of chassis / engine / regNo.' });
        }
        const pool = await getPool();
        const request = pool.request();
        const preds = [];
        if (c) { request.input('c', sql.NVarChar(200), c); preds.push('j.ChasisNo = @c'); }
        if (e) { request.input('e', sql.NVarChar(200), e); preds.push('j.EngineNo = @e'); }
        if (r) { request.input('r', sql.NVarChar(200), r); preds.push('j.VehicleRegNo = @r'); }
        let where = '(' + preds.join(' OR ') + ')';
        if (excludeJc) { request.input('ex', sql.Int, parseInt(excludeJc)); where += ' AND j.JobCardId <> @ex'; }
        // Legacy shadow tables (from ssMasterVehicle import) are optional —
        // presence is detected at query time so this endpoint works on any
        // environment where migration 091 hasn't been applied yet.
        const legacyCheck = await pool.request().query(
            `SELECT CASE WHEN OBJECT_ID('dbo.Legacy_JobCards','U') IS NULL THEN 0 ELSE 1 END AS HasLegacy`);
        const hasLegacy = legacyCheck.recordset[0].HasLegacy === 1;
        const q = await request.query(`
            SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.JobCardDate, j.IsFinalized,
                   j.VehicleRegNo, j.ChasisNo, j.EngineNo, j.KiloMeter AS Odometer,
                   j.Status AS PaymentType, j.CustomerType, j.ServiceAdvisor,
                   t.CardCode AS JobTypeCode, t.Title AS JobTypeName,
                   c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone,
                   p.PartyName,
                   ISNULL((SELECT SUM(ISNULL(d.Price,0)*ISNULL(d.Quantity,1) - ISNULL(d.DiscAmt,0)
                                    + ISNULL(d.TaxAmount,0))
                           FROM Addata_JobCardInfoDetail d WHERE d.JobCardId = j.JobCardId), 0) AS LabourAmount,
                   ISNULL((SELECT SUM(ISNULL(s.IssueQuantity,0) * ISNULL(s.ItemRate,0)
                                    + ISNULL(s.TaxAmount,0))
                           FROM data_StockIssuetoJobCardDetail s WHERE s.JobCardId = j.JobCardId), 0) AS PartsAmount,
                   ISNULL((SELECT SUM(ISNULL(b.PayableAmount,0) + ISNULL(b.TaxAmount,0))
                           FROM Addata_JobCardInfoSubletJobDetail b WHERE b.JobCardId = j.JobCardId), 0) AS SubletAmount
            FROM Addata_JobCardInfo j
            LEFT JOIN gen_JobCardType    t ON j.JobTypeId = t.JobCardTypeId
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            LEFT JOIN gen_PartiesInfo     p ON j.PartyID   = p.PartyID
            WHERE ${where}
            ORDER BY j.JobCardDate DESC, j.JobCardId DESC`);
        const rows = q.recordset.map(x => ({
            ...x,
            TotalAmount: +(Number(x.LabourAmount) + Number(x.PartsAmount) + Number(x.SubletAmount)).toFixed(2),
        }));

        // Owner ask 2026-07-03: also return each JC's line items so the
        // history page can show what was actually done, not just the
        // grand totals. One extra round trip pulls labour + sublet +
        // parts scoped to the JCs we just found.
        if (rows.length > 0) {
            const jcIds = rows.map(r => r.JobCardId);
            const jcIdList = jcIds.join(',');
            const [labourRes, subletRes, partsRes] = await Promise.all([
                pool.request().query(`
                    SELECT JobCardId, DetailId, Remarks AS Description,
                           Price, Quantity, DiscAmt, TaxAmount
                    FROM Addata_JobCardInfoDetail
                    WHERE JobCardId IN (${jcIdList})
                    ORDER BY JobCardId DESC, DetailId`),
                pool.request().query(`
                    SELECT JobCardId, SubletJobDetailID AS SubletDetailID, Remarks AS Description,
                           InvoiceAmount, PayableAmount, TaxAmount
                    FROM Addata_JobCardInfoSubletJobDetail
                    WHERE JobCardId IN (${jcIdList})
                    ORDER BY JobCardId DESC, SubletJobDetailID`),
                pool.request().query(`
                    SELECT sid.JobCardId, sid.StockIssueDetailID, sid.ItemId,
                           sid.IssueQuantity, sid.ItemRate, sid.TaxAmount,
                           i.ItenName AS ItemName,
                           COALESCE(CAST(i.ItemNumber AS NVARCHAR(50)), i.ManualNumber) AS ItemNumber
                    FROM data_StockIssuetoJobCardDetail sid
                    LEFT JOIN InventItems i ON sid.ItemId = i.ItemId
                    WHERE sid.JobCardId IN (${jcIdList})
                    ORDER BY sid.JobCardId DESC, sid.StockIssueDetailID`),
            ]);
            const bucket = (recs, keyFn = () => null) => {
                const m = {};
                for (const r of recs) {
                    if (!m[r.JobCardId]) m[r.JobCardId] = [];
                    m[r.JobCardId].push(r);
                }
                return m;
            };
            const labourByJc = bucket(labourRes.recordset);
            const subletByJc = bucket(subletRes.recordset);
            const partsByJc  = bucket(partsRes.recordset);
            for (const row of rows) {
                row.LabourLines = labourByJc[row.JobCardId] || [];
                row.SubletLines = subletByJc[row.JobCardId] || [];
                row.PartsLines  = partsByJc[row.JobCardId]  || [];
            }
        }

        // Legacy history — imported from the old FIS "ssMasterVehicle" DB
        // into shadow tables (Legacy_JobCards etc.). Fields are remapped to
        // the same shape as the current-JC rows so the frontend does not
        // need any legacy-specific branch. Legacy rows are flagged with
        // IsLegacy=1 and use synthetic JobCardId "LEG-<LegacyID>".
        if (hasLegacy) {
            const lgRequest = pool.request();
            const lgPreds = [];
            if (c) { lgRequest.input('lc', sql.NVarChar(200), c); lgPreds.push('l.ChassisNumber = @lc'); }
            if (e) { lgRequest.input('le', sql.NVarChar(200), e); lgPreds.push('l.EngineNumber  = @le'); }
            if (r) { lgRequest.input('lr', sql.NVarChar(200), r); lgPreds.push('l.RegistrationNumber = @lr'); }
            const lgWhere = '(' + lgPreds.join(' OR ') + ')';
            const lgHeaders = await lgRequest.query(`
                SELECT l.LegacyID, l.WorkOrderNo, l.JobCardDate, l.IsFinal,
                       l.RegistrationNumber AS VehicleRegNo, l.ChassisNumber AS ChasisNo,
                       l.EngineNumber AS EngineNo, l.OdMeter AS Odometer,
                       l.ServiceType AS JobTypeCode, l.ServiceType AS JobTypeName,
                       l.AdvisorName AS ServiceAdvisor,
                       COALESCE(NULLIF(l.PartyName,''), l.CustomerName) AS CustomerName,
                       l.PartyName,
                       l.Mobile1 AS CustomerPhone,
                       ISNULL(l.LabourAmount,0)       AS LabourAmount,
                       ISNULL(l.SparesAmount,0)
                         + ISNULL(l.LubricantsAmount,0) AS PartsAmount,
                       ISNULL(l.SubletRepairAmount,0) AS SubletAmount,
                       ISNULL(l.NetAmount,0)          AS NetAmount
                FROM Legacy_JobCards l
                WHERE ${lgWhere}
                ORDER BY l.JobCardDate DESC, l.LegacyID DESC`);
            if (lgHeaders.recordset.length > 0) {
                const legacyIds = lgHeaders.recordset.map(x => x.LegacyID);
                const legacyIdList = legacyIds.join(',');
                const [lgLab, lgSub, lgPar] = await Promise.all([
                    pool.request().query(`
                        SELECT LegacyJobCardID, JobDescription AS Description,
                               Rate AS Price, Qty AS Quantity,
                               ISNULL(DiscountedAmount,0) AS DiscAmt,
                               ISNULL(PST,0) AS TaxAmount
                        FROM Legacy_JobCardLabour
                        WHERE LegacyJobCardID IN (${legacyIdList})
                        ORDER BY LegacyJobCardID DESC, LegacyDetailID`),
                    pool.request().query(`
                        SELECT LegacyJobCardID, RepairDescription AS Description,
                               ISNULL(BillAmount,0) AS InvoiceAmount,
                               ISNULL(BillAmount,0) AS PayableAmount,
                               ISNULL(Pst,0)        AS TaxAmount
                        FROM Legacy_JobCardSublets
                        WHERE LegacyJobCardID IN (${legacyIdList})
                        ORDER BY LegacyJobCardID DESC, SubletRepairDetailId`),
                    pool.request().query(`
                        SELECT LegacyJobCardID, ItemNumber, ItemDescription AS ItemName,
                               Qty AS IssueQuantity, NetUnitRate AS ItemRate,
                               ISNULL(SaleTaxAmount,0) AS TaxAmount
                        FROM Legacy_JobCardParts
                        WHERE LegacyJobCardID IN (${legacyIdList})
                        ORDER BY LegacyJobCardID DESC, SIRDetailId`),
                ]);
                const lgBucket = (recs) => {
                    const m = {};
                    for (const rec of recs) {
                        const id = rec.LegacyJobCardID;
                        if (!m[id]) m[id] = [];
                        m[id].push(rec);
                    }
                    return m;
                };
                const lgLabByJc = lgBucket(lgLab.recordset);
                const lgSubByJc = lgBucket(lgSub.recordset);
                const lgParByJc = lgBucket(lgPar.recordset);
                for (const lh of lgHeaders.recordset) {
                    const total = Number(lh.LabourAmount) + Number(lh.PartsAmount) + Number(lh.SubletAmount);
                    rows.push({
                        JobCardId: `LEG-${lh.LegacyID}`,
                        JobCardNo: lh.WorkOrderNo,
                        JobCardDate: lh.JobCardDate,
                        IsFinalized: lh.IsFinal ? 1 : 0,
                        IsLegacy: 1,
                        VehicleRegNo: lh.VehicleRegNo,
                        ChasisNo: lh.ChasisNo,
                        EngineNo: lh.EngineNo,
                        Odometer: lh.Odometer,
                        JobTypeCode: lh.JobTypeCode,
                        JobTypeName: lh.JobTypeName,
                        CustomerName: lh.CustomerName,
                        CustomerPhone: lh.CustomerPhone,
                        PartyName: lh.PartyName,
                        ServiceAdvisor: lh.ServiceAdvisor,
                        LabourAmount: Number(lh.LabourAmount),
                        PartsAmount: Number(lh.PartsAmount),
                        SubletAmount: Number(lh.SubletAmount),
                        TotalAmount: +total.toFixed(2),
                        LabourLines: lgLabByJc[lh.LegacyID] || [],
                        SubletLines: lgSubByJc[lh.LegacyID] || [],
                        PartsLines:  lgParByJc[lh.LegacyID] || [],
                    });
                }
                // Re-sort combined rows newest-first now that legacy has been folded in.
                rows.sort((a, b) => new Date(b.JobCardDate) - new Date(a.JobCardDate));
            }
        }

        res.json({
            count: rows.length,
            rows,
            totals: {
                labour: +rows.reduce((s, x) => s + Number(x.LabourAmount), 0).toFixed(2),
                parts:  +rows.reduce((s, x) => s + Number(x.PartsAmount),  0).toFixed(2),
                sublet: +rows.reduce((s, x) => s + Number(x.SubletAmount), 0).toFixed(2),
                total:  +rows.reduce((s, x) => s + Number(x.TotalAmount),  0).toFixed(2),
            },
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getJobCards = async (req, res) => {
    try {
        const { search, status, finalized, businessType } = req.query;
        const pool = await getPool();
        const request = pool.request();
        // Owner report 2026-08-19: the list page took 3-4s to load. Root
        // cause: no cap on this query — an unfiltered load returned every
        // job card (1600+ rows through vw_WorkshopJobCards' 4-way join,
        // SELECT *) to the browser at once. Cap to the most recent 300;
        // search/filters narrow further for anything older. Typeahead
        // callers (SubletRepair, PartsIssue) always pass a specific search
        // term, so the cap doesn't affect them.
        request.input('cap', sql.Int, 300);
        let query = 'SELECT TOP (@cap) * FROM vw_WorkshopJobCards';
        const conditions = [];
        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            conditions.push('(JobCardNo LIKE @search OR jobCode LIKE @search OR CustomerName LIKE @search OR VehicleRegNo LIKE @search OR ChasisNo LIKE @search)');
        }
        // Owner ask 2026-07-01: the list should filter by Finalized / Not
        // Finalized only (workflow JobStatus removed from UI). Legacy status
        // param kept for any external caller still passing 0-4.
        if (finalized === 'finalized')          conditions.push('IsFinalized = 1');
        else if (finalized === 'not_finalized') conditions.push('(IsFinalized IS NULL OR IsFinalized = 0)');
        else if (status !== undefined && status !== '') {
            request.input('status', sql.Int, parseInt(status));
            conditions.push('JobStatus = @status');
        }
        // Owner ask 2026-07-03: filter by Business Unit (JC Type).
        if (businessType) {
            request.input('bt', sql.Int, parseInt(businessType));
            conditions.push('JobTypeId = @bt');
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY JobCardId DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/workshop/job-cards/counts?search=&businessType=
// True Draft/Finalized totals for the list page's filter chip badges,
// computed separately from getJobCards so they stay accurate now that the
// main listing is capped (a COUNT/GROUP BY over the view is far cheaper
// than pulling every column of every row just to tally two numbers
// client-side). Deliberately ignores `finalized` — both badges should
// reflect the full set under the current search/business-unit filter
// regardless of which one is currently toggled on.
exports.getJobCardCounts = async (req, res) => {
    try {
        const { search, businessType } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = `SELECT
                        SUM(CASE WHEN IsFinalized = 1 THEN 1 ELSE 0 END) AS Finalized,
                        SUM(CASE WHEN IsFinalized IS NULL OR IsFinalized = 0 THEN 1 ELSE 0 END) AS Draft
                      FROM vw_WorkshopJobCards`;
        const conditions = [];
        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            conditions.push('(JobCardNo LIKE @search OR jobCode LIKE @search OR CustomerName LIKE @search OR VehicleRegNo LIKE @search OR ChasisNo LIKE @search)');
        }
        if (businessType) {
            request.input('bt', sql.Int, parseInt(businessType));
            conditions.push('JobTypeId = @bt');
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        const result = await request.query(query);
        const row = result.recordset[0] || {};
        res.json({ draft: Number(row.Draft) || 0, finalized: Number(row.Finalized) || 0 });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/workshop/job-cards/resolve-ro?cardCode=CT&number=0042
// Resolves a Job Card by its RO format (CardCode + number). Used by Receive Payment walk-in flow.
// Number can be raw "42" or already-padded "0042"; both are normalised.
exports.resolveByRO = async (req, res) => {
    try {
        const cardCode = (req.query.cardCode || '').toUpperCase();
        const numRaw = String(req.query.number || '').trim();
        if (!cardCode || !numRaw) return res.status(400).json({ error: 'cardCode and number are required.' });
        const num = parseInt(numRaw);
        if (isNaN(num)) return res.status(400).json({ error: 'number must be numeric.' });
        const padded = String(num).padStart(4, '0');
        const ro = `${cardCode}-${padded}`;

        const pool = await getPool();
        const r = await pool.request()
            .input('ro', sql.NVarChar(50), ro)
            .query(`SELECT TOP 1 JobCardId, JobCardNo, jobCode, IsFinalized
                    FROM Addata_JobCardInfo WHERE JobCardNo = @ro`);

        if (!r.recordset.length) {
            return res.status(404).json({ error: `Job Card ${ro} not found.` });
        }
        res.json(r.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// GET /api/workshop/job-cards/:id/print-data
// Same payload as getJobCardById, but refuses if the JC is not finalized.
// Backstops the frontend gate — a curl call cannot bypass the IsFinalized check.
exports.getJobCardPrintData = async (req, res) => {
    try {
        const pool = await getPool();
        const head = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@id');
        if (!head.recordset.length) return res.status(404).json({ error: 'Job Card not found' });
        // Drafts CAN be printed — advisors hand the printout to the customer
        // at the counter as a work-order slip before the JC finalizes.
        // The print page shows a DRAFT watermark for non-finalized JCs so
        // the paper is never mistaken for a final invoice. Owner ask
        // 2026-07-25.
        return exports.getJobCardById(req, res);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// Focused endpoint for the GST/PST invoice prints (owner ask 2026-07-05).
// Returns exactly what the old-format tax invoices need:
//  - Job Card header (jobCode → invoice number)
//  - Recipient block (insurance company > party > customer, with address/NTN
//    fields taken from whichever wins) — nothing is invented; empty is empty.
//  - Parts lines (item name, qty, rate, GST amount) for the GST invoice
//  - Labour lines (description, net amount, PST amount) for the PST invoice
//  - Current tax rates so the totals header ("Total 18% GST", "Total 16% PST")
//    matches the config.
//
// 409 when JC is not finalized — matches the print-data gating convention.
exports.getJobCardInvoiceData = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();

        // Pull the same fields jobCardPostingService uses to resolve the
        // billed party — TypeReceivableGL is the JC type's fallback claim
        // receivable (used when the JC has no explicit PartyID).
        const head = await pool.request().input('id', sql.Int, id)
            .query(`SELECT jc.JobCardId, jc.JobCardNo, jc.jobCode, jc.IsFinalized,
                           jc.Remarks, jc.VOCRemarks, jc.EstimatedRONo, jc.IsEstimatedRO,
                           jc.EndUserID, jc.PartyID,
                           jc.VehicleRegNo, jc.FinalizedAt,
                           t.ReceivableAccount AS TypeReceivableGL,
                           -- Party creation form fields (owner ask 2026-07-05):
                           -- pull the FULL party record so the tax invoice
                           -- carries whatever the accountant typed in on
                           -- party creation.
                           p.PartyName,
                           p.AddressOne         AS PartyAddress1,
                           p.AddressTwo         AS PartyAddress2,
                           p.PhoneOne           AS PartyPhone1,
                           p.PhoneTwo           AS PartyPhone2,
                           p.Fax                AS PartyFax,
                           p.Email              AS PartyEmail,
                           p.NTNNO              AS PartyNTN,
                           p.SaleTaxRegNo       AS PartyGST,
                           p.CNIC               AS PartyCNIC,
                           p.ContactPerson      AS PartyContactPerson,
                           p.ContactPersonMobile AS PartyContactMobile,
                           cust.endUserName     AS CustomerName,
                           cust.Address         AS CustomerAddress,
                           cust.PhoneNo         AS CustomerPhone,
                           cust.CNIC            AS CustomerCNIC
                    FROM Addata_JobCardInfo jc
                    LEFT JOIN gen_JobCardType t ON jc.JobTypeId = t.JobCardTypeId
                    LEFT JOIN gen_PartiesInfo p ON jc.PartyID = p.PartyID
                    LEFT JOIN addata_CustomerInfo cust ON jc.EndUserID = cust.ProfileID
                    WHERE jc.JobCardId=@id`);
        if (!head.recordset.length) return res.status(404).json({ error: 'Job Card not found' });
        const jc = head.recordset[0];
        if (!jc.IsFinalized) return res.status(409).json({ error: 'Job Card must be finalized before printing an invoice.' });

        // MCML-claim JC fallback (mirrors jobCardPostingService §2): when
        // PartyID is null but the JC type has a ReceivableAccount, the party
        // being charged is the one that owns that receivable GL.
        let claimParty = null;
        if (!jc.PartyID && jc.TypeReceivableGL) {
            const cp = await pool.request().input('gl', sql.Int, jc.TypeReceivableGL)
                .query(`SELECT TOP 1 p.PartyID, p.PartyName,
                               p.AddressOne, p.AddressTwo,
                               p.PhoneOne, p.PhoneTwo, p.Email,
                               p.NTNNO, p.SaleTaxRegNo, p.CNIC
                        FROM gen_PartiesInfo p
                        WHERE p.PartyGLID = @gl
                        ORDER BY p.PartyID`);
            claimParty = cp.recordset[0] || null;
        }

        // Parts issued to the JC (for the GST invoice). Snapshotted TaxAmount
        // is the GST because parts snapshot the configured GST rate at issue.
        const parts = await pool.request().input('id', sql.Int, id).query(`
            SELECT sid.StockIssueDetailID AS LineID,
                   COALESCE(CAST(i.ItemNumber AS NVARCHAR(50)), i.ManualNumber) AS ItemCode,
                   i.ItenName AS ItemName,
                   sid.IssueQuantity AS Qty,
                   sid.ItemRate       AS UnitRate,
                   (sid.IssueQuantity * sid.ItemRate) AS Amount,
                   ISNULL(sid.TaxRate, 0)   AS TaxRate,
                   ISNULL(sid.TaxAmount, 0) AS TaxAmount
            FROM data_StockIssuetoJobCardDetail sid
            LEFT JOIN InventItems i ON sid.ItemId = i.ItemId
            WHERE sid.JobCardId = @id
            ORDER BY sid.StockIssueDetailID`);

        // Labour lines net of discount (for the PST invoice). TaxAmount there
        // is the PST snapshotted at save time from the configured PST rate.
        const labour = await pool.request().input('id', sql.Int, id).query(`
            SELECT l.DetailId AS LineID,
                   l.Remarks  AS Description,
                   l.Price    AS GrossAmount,
                   ISNULL(l.DiscAmt, 0) AS DiscountAmt,
                   (l.Price - ISNULL(l.DiscAmt, 0)) AS Amount,
                   ISNULL(l.TaxRate, 0)   AS TaxRate,
                   ISNULL(l.TaxAmount, 0) AS TaxAmount
            FROM Addata_JobCardInfoDetail l
            WHERE l.JobCardId = @id
            ORDER BY l.DetailId`);

        // Current tax rates (used for the headline "Total NN% GST" line).
        let gstRate = 0, pstRate = 0;
        try { gstRate = await resolveRate('GST'); } catch (_) {}
        try { pstRate = await resolveRate('PST'); } catch (_) {}

        // Recipient = the party actually being charged in the ledger.
        // Owner ask 2026-07-05: match the exact resolution
        // jobCardPostingService uses at finalize time so the invoice
        // recipient equals the ledger debit party.
        //
        // Order:
        //   1. jc.PartyID → gen_PartiesInfo.PartyName (the JC's named payer;
        //      corporate customer or insurer)
        //   2. MCML-claim JCs (no PartyID): party that owns the JC type's
        //      ReceivableAccount (mirrors loadPartyForReceivableGL).
        //   3. Walk-in (no PartyID and no type receivable): the end-user
        //      customer name/address (billed against Gen-Cust bucket).
        // The full party-form field set gets exposed here so the print
        // pages can show whatever the accountant captured on party
        // creation (address / phone / email / NTN / GST / CNIC).
        let recipient;
        if (jc.PartyID) {
            recipient = {
                source:  'PARTY',
                name:    jc.PartyName || '',
                address: [jc.PartyAddress1, jc.PartyAddress2].filter(Boolean).join(', '),
                phone:   [jc.PartyPhone1, jc.PartyPhone2].filter(Boolean).join(' / '),
                email:   jc.PartyEmail || '',
                ntn:     jc.PartyNTN   || '',
                gst:     jc.PartyGST   || '',
                cnic:    jc.PartyCNIC  || '',
                contactPerson: jc.PartyContactPerson || '',
                contactMobile: jc.PartyContactMobile || '',
            };
        } else if (claimParty) {
            recipient = {
                source:  'CLAIM_PARTY',
                name:    claimParty.PartyName || '',
                address: [claimParty.AddressOne, claimParty.AddressTwo].filter(Boolean).join(', '),
                phone:   [claimParty.PhoneOne, claimParty.PhoneTwo].filter(Boolean).join(' / '),
                email:   claimParty.Email || '',
                ntn:     claimParty.NTNNO || '',
                gst:     claimParty.SaleTaxRegNo || '',
                cnic:    claimParty.CNIC || '',
                contactPerson: '',
                contactMobile: '',
            };
        } else {
            recipient = {
                source:  'CUSTOMER',
                name:    jc.CustomerName || '',
                address: jc.CustomerAddress || '',
                phone:   jc.CustomerPhone || '',
                email:   '',
                ntn:     '',
                gst:     '',
                cnic:    jc.CustomerCNIC || '',
                contactPerson: '',
                contactMobile: '',
            };
        }

        // Job description fallback used ONLY when the JC has no labour
        // lines at all (rare). The primary source is the labour line's
        // own Remarks — see JobCardPSTPrint. VOCRemarks is skipped because
        // it's the WAC checklist JSON, not a job description.
        let jobDescription = (jc.Remarks || '').trim();
        if (!jobDescription && jc.IsEstimatedRO && jc.EstimatedRONo) {
            jobDescription = `AS PER ESTIMATE # ${jc.EstimatedRONo}`;
        }

        res.json({
            JobCardId:       jc.JobCardId,
            InvoiceNo:       jc.jobCode || jc.JobCardNo || '',
            IsFinalized:     !!jc.IsFinalized,
            FinalizedAt:     jc.FinalizedAt,
            VehicleRegNo:    jc.VehicleRegNo || '',
            Recipient:       recipient,
            JobDescription:  jobDescription,
            Parts:           parts.recordset,
            Labour:          labour.recordset,
            TaxRates:        { GSTRate: Number(gstRate) || 0, PSTRate: Number(pstRate) || 0 },
        });
    } catch (err) {
        console.error('getJobCardInvoiceData:', err);
        res.status(500).json({ error: err.message });
    }
};

exports.getJobCardById = async (req, res) => {
    try {
        const pool = await getPool();
        const jc = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM vw_WorkshopJobCards WHERE JobCardId = @id');
        if (jc.recordset.length === 0) return res.status(404).json({ error: 'Job Card not found' });

        const labour = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Addata_JobCardInfoDetail WHERE JobCardId = @id');

        const parts = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT sid.StockIssueDetailID, sid.ItemId, sid.Quantity, sid.StockRate, sid.ItemRate, sid.IssueQuantity,
                    sid.TaxRate, sid.TaxAmount, sid.Discount, sid.DiscAmt,
                    i.ItenName AS ItemName, i.ItemNumber, i.ManualNumber, si.IssueDate, si.IssueNo
                    FROM data_StockIssuetoJobCardDetail sid
                    JOIN data_StockIssuetoJobCard si ON sid.StockIssueID = si.StockIssueID
                    LEFT JOIN InventItems i ON sid.ItemId = i.ItemId
                    WHERE sid.JobCardId = @id`);

        const sublets = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId = @id');

        const accessories = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT m.AccessoryID, m.Title, m.SortOrder,
                       ISNULL(j.IsChecked, 0) AS IsChecked,
                       ISNULL(j.Qty, 0) AS Qty
                FROM dms_AccessoriesMaster m
                LEFT JOIN dms_JobCardAccessories j
                    ON m.AccessoryID = j.AccessoryID AND j.JobCardID = @id
                WHERE m.IsActive = 1
                ORDER BY m.SortOrder, m.Title
            `);

        const damageMarks = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('SELECT * FROM dms_DamageMarks WHERE JobCardID = @id ORDER BY MarkID');

        // Active campaign application — surfaces on the Work Order print so
        // the printed slip shows the same benefit banner the JC form does
        // (owner ask 2026-07-18).
        const campaign = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`
                SELECT a.ApplicationID, a.BenefitAmount, a.AppliedLines, a.Remarks AS ApplicationRemarks,
                       c.CampaignCode, c.CampaignName, c.BorneBy, c.BenefitType,
                       c.BenefitPercent, c.BenefitDescription,
                       gl.GLCode, gl.GLTitle AS GLAccountTitle
                FROM   dms_ServiceCampaignApplications a
                JOIN   dms_ServiceCampaigns c ON a.CampaignID = c.CampaignID
                LEFT   JOIN GLChartOFAccount gl ON c.GLAccountID = gl.GLCAID
                WHERE  a.JobCardId = @id AND a.Status = 'Active'`);

        // What the customer authorised at the vehicle, if this job card came
        // from a tablet estimate (owner ask 2026-09-25). The job card print has
        // carried the authorisation paragraph and an empty signature box for
        // years; when the work was authorised on a tablet, that box is filled
        // in from here instead of by hand.
        //
        // All of them, not just the first: additional work found during the
        // repair is a new revision with its own signature, and the paper has
        // to show each thing the customer agreed to separately.
        const signatures = await pool.request().input('id', sql.Int, req.params.id).query(`
            SELECT s.SignatureID, s.EstimateID, e.EstimateNo, s.RevisionNo,
                   s.SignerName, s.SignerMobile, s.SignedAt, s.GrandTotal,
                   s.BayName, s.CapturedByName
            FROM   dms_ServiceEstimateSignatures s
            LEFT   JOIN dms_ServiceEstimates e ON e.EstimateID = s.EstimateID
            WHERE  s.JobCardID = @id
            ORDER  BY s.RevisionNo, s.SignatureID`);

        // Walk-around videos and photos taken at reception. Names and sizes
        // only — the file itself is fetched through its own ticketed route.
        const media = await pool.request().input('id', sql.Int, req.params.id).query(`
            SELECT MediaID, MediaType, OriginalName, MimeType, SizeBytes,
                   CapturedAt, CapturedByName, EstimateID
            FROM   dms_ServiceMedia
            WHERE  JobCardID = @id AND DeletedAt IS NULL
            ORDER  BY CapturedAt, MediaID`);

        res.json({
            ...jc.recordset[0],
            Signatures: signatures.recordset,
            Media: media.recordset,
            LabourItems: labour.recordset,
            PartsItems: parts.recordset,
            SubletItems: sublets.recordset,
            Accessories: accessories.recordset,
            DamageMarks: damageMarks.recordset,
            Campaign: campaign.recordset[0] || null,
        });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveJobCard = async (req, res) => {
    try {
        const { JobCardId, jobCode, DMSJobCardNo, JobTypeId, OrderTypeId, EndUserID, VehicleRegNo, ChasisNo, EngineNo,
                BrandCode, VersionCode, VehicleCode, KiloMeter, Millage,
                ReceiptDate, PromisedDate, Remarks, PaymentType, PaymentCO, PaymentBankID,
                FuelLevel, VOCRemarks, CustomerType, PartyID,
                PMType, ServiceAdvisor, ServiceAdvisorID, RepeatROID, BatteryNo, VehicleColor,
                IsEstimatedRO, EstimatedRONo, ApprovedBy, RevisedDelivery,
                JobResult, IsFIR, BringByType, BringByName, BringByMobile,
                DeliveredTo, DeliveryMobile, DeliveredAt,
                CareOffID, CareOffName,
                DQIRNo, CheckedByID, CheckedByName, ConfirmByID, ConfirmByName, WACResults,
                Accessories, DamageMarks,
                LabourItems } = req.body;

        if (!jobCode) return res.status(400).json({ error: 'Job Number is required.' });

        const pool = await getPool();

        // Owner report 2026-09-14: an over-long field made the save fail with
        // "String or binary data would be truncated". SQL Server 2017 on the
        // live server never says WHICH field, so check against the real
        // column widths first and name it. See services/jobCardFieldLimits.js.
        const { findOverlongFields, describeOverlong } = require('../services/jobCardFieldLimits');
        const overlong = await findOverlongFields(pool, req.body);
        if (overlong.length) {
            return res.status(400).json({ error: describeOverlong(overlong), fields: overlong });
        }

        if (CareOffID && LabourItems?.length > 0) {
            const coRes = await pool.request()
                .input('coId', sql.Int, CareOffID)
                .query('SELECT MaxDiscountPct FROM dms_CareOff WHERE CareOffID=@coId AND IsActive=1');
            if (!coRes.recordset.length)
                return res.status(400).json({ error: 'Selected Care-Off is inactive or not found.' });
            // If an admin has APPROVED a cap-elevation request for this JC,
            // use the higher cap. Otherwise the care-off's normal cap applies.
            const baseCap = Number(coRes.recordset[0].MaxDiscountPct) || 0;
            const effCap  = JobCardId ? await getEffectiveCapForJC(JobCardId, baseCap, CareOffID) : baseCap;
            const cap = validateDiscountCap(LabourItems, effCap);
            if (!cap.valid)
                return res.status(422).json({
                    error: `Discount cap exceeded. Total: PKR ${cap.totalDiscount}, max allowed: PKR ${cap.maxAllowed}.`,
                    capOverrun: true,
                    baseCapPct: baseCap,
                    effectiveCapPct: effCap,
                });
        }

        // Resolve current PST rate once for tax snapshot per §14.4
        let pstRate = 0;
        try { pstRate = await resolveRate('PST'); } catch (e) {
            // If PST not configured, save proceeds with 0% (finalize will fail clearly)
            console.warn('PST rate not configured at save time:', e.message);
        }

        const effectiveItems = CareOffID
            ? (LabourItems || [])
            : (LabourItems || []).map(i => ({ ...i, Discount: 0, DiscAmt: 0, DiscType: null }));

        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            if (JobCardId) {
                const finCheck = await transaction.request()
                    .input('fid', sql.Int, JobCardId)
                    .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@fid');
                if (finCheck.recordset[0]?.IsFinalized) {
                    await transaction.rollback();
                    return res.status(423).json({ error: 'Job Card is finalized. Request unfinalize to make changes.' });
                }
                await transaction.request()
                    .input('id', sql.Int, JobCardId)
                    .input('jobCode', sql.NVarChar(50), jobCode)
                    .input('dmsJobCardNo', sql.NVarChar(50), DMSJobCardNo || null)
                    .input('endUserId', sql.Int, EndUserID || null)
                    .input('jobTypeId', sql.Int, JobTypeId)
                    .input('orderTypeId', sql.Int, OrderTypeId || null)
                    .input('regNo', sql.NVarChar(150), VehicleRegNo)
                    .input('chassis', sql.NVarChar(150), ChasisNo)
                    .input('engine', sql.NVarChar(150), EngineNo)
                    .input('brand', sql.Int, BrandCode || null)
                    .input('version', sql.NVarChar(300), VersionCode || null)
                    .input('vehicle', sql.NVarChar(150), VehicleCode || null)
                    .input('km', sql.Decimal(18,2), KiloMeter || 0)
                    .input('millage', sql.Decimal(18,2), Millage || 0)
                    .input('promised', sql.DateTime, parseWallDateTime(PromisedDate))
                    .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                    .input('payType', sql.NVarChar(50), PaymentType)
                    .input('payCO', sql.NVarChar(100), PaymentCO || null)
                    .input('payBankId', sql.Int, PaymentBankID || null)
                    .input('fuel', sql.NVarChar(20), FuelLevel)
                    .input('voc', sql.NVarChar(sql.MAX), VOCRemarks)
                    .input('custType', sql.NVarChar(20), CustomerType)
                    // Only a credit job card carries a party — see the same
                    // guard in jobCardSaveService (owner report 2026-09-21).
                    .input('partyId', sql.Int, PaymentType === 'Credit' ? (PartyID || null) : null)
                    .input('pmType', sql.NVarChar(50), PMType || 'None')
                    .input('advisor', sql.NVarChar(100), ServiceAdvisor || null)
                    .input('advisorId', sql.Int, ServiceAdvisorID ? parseInt(ServiceAdvisorID) : null)
                    .input('repeatROID', sql.Int, RepeatROID || null)
                    .input('batteryNo', sql.NVarChar(50), BatteryNo || null)
                    .input('color', sql.NVarChar(100), VehicleColor || null)
                    .input('isEst', sql.Bit, IsEstimatedRO ? 1 : 0)
                    .input('estRONo', sql.NVarChar(50), EstimatedRONo || null)
                    .input('approvedBy', sql.NVarChar(100), ApprovedBy || null)
                    .input('revisedDel', sql.DateTime, parseWallDateTime(RevisedDelivery))
                    .input('jobResult', sql.NVarChar(20), JobResult || null)
                    .input('isFIR', sql.Bit, IsFIR ? 1 : 0)
                    .input('bringByType', sql.NVarChar(50), BringByType || 'Self')
                    .input('bringByName', sql.NVarChar(100), BringByName || null)
                    .input('bringByMobile', sql.NVarChar(20), BringByMobile || null)
                    .input('deliveredTo', sql.NVarChar(100), DeliveredTo || null)
                    .input('delivMobile', sql.NVarChar(20), DeliveryMobile || null)
                    .input('deliveredAt', sql.DateTime, parseWallDateTime(DeliveredAt))
                    .input('careOffId', sql.Int, CareOffID || null)
                    .input('careOffName', sql.NVarChar(100), CareOffName || null)
                    .input('dqirNo', sql.NVarChar(50), DQIRNo || null)
                    .input('checkedById', sql.Int, CheckedByID || null)
                    .input('checkedByName', sql.NVarChar(100), CheckedByName || null)
                    .input('confirmById', sql.Int, ConfirmByID || null)
                    .input('confirmByName', sql.NVarChar(100), ConfirmByName || null)
                    .input('wacResults', sql.NVarChar(sql.MAX), WACResults || null)
                    .query(`UPDATE Addata_JobCardInfo SET
                        jobCode=@jobCode, DMSJobCardNo=@dmsJobCardNo, EndUserID=@endUserId, JobTypeId=@jobTypeId, OrderTypeId=@orderTypeId, VehicleRegNo=@regNo, ChasisNo=@chassis, EngineNo=@engine,
                        BrandCode=@brand, VersionCode=@version, VehicleCode=@vehicle,
                        KiloMeter=@km, Millage=@millage, PromisedDate=@promised, Remarks=@remarks, Status=@payType, PaymentCO=@payCO, PaymentBankID=@payBankId,
                        FuelLevel=@fuel, VOCRemarks=@voc, CustomerType=@custType, PartyID=@partyId,
                        PMType=@pmType, ServiceAdvisor=@advisor, ServiceAdvisorID=@advisorId, RepeatROID=@repeatROID, BatteryNo=@batteryNo, VehicleColor=@color,
                        IsEstimatedRO=@isEst, EstimatedRONo=@estRONo, ApprovedBy=@approvedBy, RevisedDelivery=@revisedDel,
                        JobResult=@jobResult, IsFIR=@isFIR, BringByType=@bringByType, BringByName=@bringByName, BringByMobile=@bringByMobile,
                        DeliveredTo=@deliveredTo, DeliveryMobile=@delivMobile, DeliveredAt=@deliveredAt,
                        CareOffID=@careOffId, CareOffName=@careOffName,
                        DQIRNo=@dqirNo, CheckedByID=@checkedById, CheckedByName=@checkedByName,
                        ConfirmByID=@confirmById, ConfirmByName=@confirmByName, WACResults=@wacResults,
                        ModifyDate=GETDATE() WHERE JobCardId=@id`);

                // Same orphaning risk as the parts-issue delete fix above, via a
                // different path: this wipes and re-inserts EVERY labour line on
                // every save (not just changed ones), so any labour-tied
                // depreciation row would be orphaned by the very next save,
                // even without anyone actually deleting a line.
                await transaction.request().input('id', sql.Int, JobCardId)
                    .query('DELETE FROM dms_JobCardPartsDepreciation WHERE JobCardId = @id AND LabourDetailID IS NOT NULL');

                // Every labour line is deleted and re-inserted below, and the
                // form never sends bay, technician or start/finish times — so
                // read them first and put them back on the matching lines.
                // Without this a desk save erased what the Job Controller or a
                // bay screen had recorded (plan 2026-09-14, Phase 3).
                const carryFloorFields = await floorFieldCarrier(transaction, JobCardId);

                await transaction.request().input('id', sql.Int, JobCardId)
                    .query('DELETE FROM Addata_JobCardInfoDetail WHERE JobCardId = @id');

                for (const item of effectiveItems) {
                    await insertLabourLine(transaction, JobCardId, carryFloorFields(item), pstRate);
                }

                if (Accessories && Array.isArray(Accessories)) {
                    await new sql.Request(transaction).input('jcId', sql.Int, JobCardId)
                        .query('DELETE FROM dms_JobCardAccessories WHERE JobCardID=@jcId');
                    for (const acc of Accessories) {
                        await new sql.Request(transaction)
                            .input('jcId', sql.Int, JobCardId)
                            .input('accId', sql.Int, acc.AccessoryID)
                            .input('chk', sql.Bit, acc.IsChecked ? 1 : 0)
                            .input('qty', sql.Int, acc.Qty || 0)
                            .query('INSERT INTO dms_JobCardAccessories (JobCardID,AccessoryID,IsChecked,Qty) VALUES (@jcId,@accId,@chk,@qty)');
                    }
                }

                if (DamageMarks && Array.isArray(DamageMarks)) {
                    await new sql.Request(transaction).input('jcId', sql.Int, JobCardId)
                        .query('DELETE FROM dms_DamageMarks WHERE JobCardID=@jcId');
                    for (const mark of DamageMarks) {
                        await new sql.Request(transaction)
                            .input('jcId', sql.Int, JobCardId)
                            .input('x', sql.Decimal(6,3), mark.XPct)
                            .input('y', sql.Decimal(6,3), mark.YPct)
                            .input('note', sql.NVarChar(200), mark.Note || null)
                            .input('by', sql.Int, req.user?.userId || null)
                            .query('INSERT INTO dms_DamageMarks (JobCardID, XPct, YPct, Note, CreatedBy) VALUES (@jcId, @x, @y, @note, @by)');
                    }
                }

                await transaction.commit();
                pool.request()
                    .input('jcId', sql.Int, JobCardId)
                    .input('action', sql.NVarChar(50), CareOffID ? 'CAREOFF_SET' : 'CAREOFF_REMOVED')
                    .input('coId', sql.Int, CareOffID || null)
                    .input('newVal', sql.NVarChar(200), CareOffID ? (CareOffName || '') : null)
                    .input('by', sql.Int, req.user?.userId || null)
                    .input('byName', sql.NVarChar(100), req.user?.userName || '')
                    .query('INSERT INTO dms_CareOffAudit (JobCardID, Action, CareOffID, NewValue, ChangedBy, ChangedByName) VALUES (@jcId, @action, @coId, @newVal, @by, @byName)')
                    .catch(e => console.error('Audit log error:', e));
                res.json({ message: 'Job Card updated', JobCardId });
            } else {
                // Numbering, header, labour lines, accessories and damage marks
                // are written by services/jobCardSaveService.js, shared with the
                // service tablet's signature step (plan 2026-09-14, Phase 2).
                const { JobCardId: newId, JobCardNo: generatedRoNumber } = await createJobCardInTx(
                    transaction, { ...req.body, LabourItems: effectiveItems }, req.user, pstRate);

                await transaction.commit();
                if (CareOffID) {
                    pool.request()
                        .input('jcId', sql.Int, newId)
                        .input('action', sql.NVarChar(50), 'CAREOFF_SET')
                        .input('coId', sql.Int, CareOffID)
                        .input('newVal', sql.NVarChar(200), CareOffName || '')
                        .input('by', sql.Int, req.user?.userId || null)
                        .input('byName', sql.NVarChar(100), req.user?.userName || '')
                        .query('INSERT INTO dms_CareOffAudit (JobCardID, Action, CareOffID, NewValue, ChangedBy, ChangedByName) VALUES (@jcId, @action, @coId, @newVal, @by, @byName)')
                        .catch(e => console.error('Audit log error:', e));
                }
                res.status(201).json({ message: 'Job Card created', JobCardId: newId, JobCardNo: generatedRoNumber });
            }
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) {
        // Refusals from jobCardSaveService (duplicate Job Number, missing RO
        // counter) carry a statusCode and are not logged, as before the move.
        if (!err.statusCode) console.error(err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

exports.updateJobStatus = async (req, res) => {
    try {
        const { status } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.Int, status)
            .query('UPDATE Addata_JobCardInfo SET JobStatus = @status, ModifyDate = GETDATE() WHERE JobCardId = @id');
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== SUBLET REPAIRS ==============
exports.getSublets = async (req, res) => {
    try {
        const { jobCardId, search } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = `SELECT s.*, j.VehicleRegNo, j.JobCardNo, j.IsFinalized, c.endUserName AS CustomerName
            FROM Addata_JobCardInfoSubletJobDetail s
            LEFT JOIN Addata_JobCardInfo j ON s.JobCardId = j.JobCardId
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID`;
        const conditions = [];
        if (jobCardId) {
            request.input('jcId', sql.Int, parseInt(jobCardId));
            conditions.push('s.JobCardId = @jcId');
        }
        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            conditions.push('(s.Remarks LIKE @search OR j.VehicleRegNo LIKE @search OR CAST(j.JobCardNo AS NVARCHAR) LIKE @search OR c.endUserName LIKE @search)');
        }
        if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY s.SubletJobDetailID DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveSublet = async (req, res) => {
    try {
        const { SubletJobDetailID, JobCardId, VendorID, Remarks, InvoiceAmount, PayableAmount, SubletJobDate, PaymentType } = req.body;
        const payType = PaymentType === 'Credit' ? 'Credit' : 'Cash';
        if (payType === 'Credit' && !VendorID) {
            return res.status(400).json({ error: 'Credit sublet requires a Vendor party. Pick a vendor or switch to Cash.' });
        }
        const pool = await getPool();

        if (!SubletJobDetailID) {
            const finCheck = await pool.request()
                .input('jcId', sql.Int, JobCardId)
                .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@jcId');
            if (finCheck.recordset[0]?.IsFinalized) {
                return res.status(423).json({ error: 'Job Card is finalized. Cannot add sublet.' });
            }
        }

        // Snapshot PST on the sublet revenue (per §14.4) — applies to PayableAmount (what we charge customer)
        let pstRate = 0;
        try { pstRate = await resolveRate('PST'); } catch (e) { console.warn('PST rate not configured at save time:', e.message); }
        const tax = snapshotTax(PayableAmount || 0, 0, pstRate);

        if (SubletJobDetailID) {
            const finCheck = await pool.request()
                .input('sid', sql.Int, SubletJobDetailID)
                .query(`SELECT j.IsFinalized FROM Addata_JobCardInfoSubletJobDetail s
                    JOIN Addata_JobCardInfo j ON s.JobCardId = j.JobCardId
                    WHERE s.SubletJobDetailID = @sid`);
            if (finCheck.recordset[0]?.IsFinalized) {
                return res.status(423).json({ error: 'Job Card is finalized. Cannot edit sublet.' });
            }
            await pool.request()
                .input('id', sql.Int, SubletJobDetailID)
                .input('vendor', sql.Int, VendorID || null)
                .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('invoice', sql.Decimal(18,2), InvoiceAmount || 0)
                .input('payable', sql.Decimal(18,2), PayableAmount || 0)
                .input('date', sql.DateTime, parseWallDateTime(SubletJobDate) || new Date())
                .input('taxRate', sql.Decimal(8,4), tax.taxRate)
                .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
                .input('payType', sql.NVarChar(20), payType)
                .query(`UPDATE Addata_JobCardInfoSubletJobDetail SET
                    VendorID=@vendor, Remarks=@remarks, InvoiceAmount=@invoice, PayableAmount=@payable, SubletJobDate=@date,
                    TaxRate=@taxRate, TaxAmount=@taxAmount, PaymentType=@payType
                    WHERE SubletJobDetailID=@id`);
            res.json({ message: 'Sublet updated' });
        } else {
            const result = await pool.request()
                .input('jcId', sql.Int, JobCardId)
                .input('vendor', sql.Int, VendorID || null)
                .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('invoice', sql.Decimal(18,2), InvoiceAmount || 0)
                .input('payable', sql.Decimal(18,2), PayableAmount || 0)
                .input('date', sql.DateTime, parseWallDateTime(SubletJobDate) || new Date())
                .input('taxRate', sql.Decimal(8,4), tax.taxRate)
                .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
                .input('payType', sql.NVarChar(20), payType)
                .query(`INSERT INTO Addata_JobCardInfoSubletJobDetail
                    (JobCardId, VendorID, Remarks, InvoiceAmount, PayableAmount, SubletJobDate, TaxRate, TaxAmount, PaymentType)
                    OUTPUT INSERTED.SubletJobDetailID
                    VALUES (@jcId, @vendor, @remarks, @invoice, @payable, @date, @taxRate, @taxAmount, @payType)`);
            res.status(201).json({ message: 'Sublet created', SubletJobDetailID: result.recordset[0].SubletJobDetailID });
        }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteSublet = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request().input('id', sql.Int, req.params.id)
            .query('DELETE FROM Addata_JobCardInfoSubletJobDetail WHERE SubletJobDetailID = @id');
        res.json({ message: 'Sublet deleted' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== PARTS ISSUE ==============
exports.getPartsIssues = async (req, res) => {
    try {
        const { jobCardId } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = 'SELECT * FROM vw_PartsIssueToJobCard';
        if (jobCardId) {
            request.input('jcId', sql.Int, parseInt(jobCardId));
            query += ' WHERE JobCardId = @jcId';
        }
        query += ' ORDER BY StockIssueID DESC';
        const result = await request.query(query);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

/**
 * GET /api/workshop/parts-issue/list
 * Owner ask 2026-07-03: a Store-Sale-style "Recent Issues" list across
 * ALL job cards, filterable by Job No / Part No / Item Name / customer.
 * Uses the same view for consistency.
 */
exports.getPartsIssueList = async (req, res) => {
    try {
        const { search } = req.query;
        const pool = await getPool();
        const rq = pool.request();
        let q = `
            SELECT TOP 200 v.*, c.endUserName AS CustomerName
            FROM vw_PartsIssueToJobCard v
            LEFT JOIN Addata_JobCardInfo   j ON v.JobCardId  = j.JobCardId
            LEFT JOIN addata_CustomerInfo  c ON j.EndUserID  = c.ProfileID
        `;
        if (search) {
            rq.input('s', sql.NVarChar(200), `%${search}%`);
            q += ` WHERE (
                v.JobCardNo    LIKE @s
                OR v.ItemName  LIKE @s
                OR v.ManualNumber LIKE @s
                OR CAST(v.ItemNumber AS NVARCHAR(50)) LIKE @s
                OR c.endUserName LIKE @s
            )`;
        }
        q += ' ORDER BY v.IssueDate DESC, v.StockIssueID DESC, v.StockIssueDetailID DESC';
        res.json((await rq.query(q)).recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.issuePartsToJobCard = async (req, res) => {
    try {
        const { JobCardId, JobCardNo, Items, Remarks } = req.body;
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            // Body moved to services/partsIssueService.js (plan 2026-09-14,
            // Phase 3) so the parts counter's requisition queue issues parts
            // through exactly the same stock, tax and COGS logic.
            const result = await issuePartsInTx(transaction, { JobCardId, JobCardNo, Items, Remarks });
            await transaction.commit();
            res.status(201).json({ message: 'Parts issued successfully', StockIssueID: result.StockIssueID });
        } catch (err) {
            await transaction.rollback();
            if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
            throw err;
        }
    } catch (err) { console.error(err); res.status(400).json({ error: err.message }); }
};

/**
 * DELETE /api/workshop/parts-issue/line/:detailId
 *
 * Removes one issued line and reverses just that line's stock-out. Refuses
 * if the underlying Job Card is finalized — once a JC is finalized, parts
 * costs have flowed into the GL via the JC posting, so silently nuking a
 * line here would leave the books wrong. (Unfinalize the JC via the approval
 * workflow if a posted line genuinely needs to come back.)
 *
 * If the line was the only one in its parent issue, the issue header + the
 * stock-out header are deleted too so we don't leave empty parents.
 */
/**
 * PATCH /api/workshop/parts-issue/line/:detailId
 * Owner ask 2026-09-10: "when i issue part if the job card is not finalized it
 * should be able to edit it". Until now a wrong quantity or rate could only be
 * deleted and re-issued, which burns a new slip line and loses the original.
 *
 * Accepts any of { Quantity, ItemRate, Discount, DiscAmt, IsGST }.
 *
 * Quantity is the delicate one: the issue already moved stock, so a change has
 * to move the difference too. data_StockInOutDetail holds ONE signed row per
 * (issue, item) — negative for an issue — so the edit adjusts that row rather
 * than writing a second movement, keeping one row per issued part exactly as
 * the original issue and deletePartsIssueLine both assume.
 *
 * Tax is always recomputed rather than trusted from the client, so the line's
 * GST can never drift from its own quantity, rate and discount.
 */
exports.updatePartsIssueLine = async (req, res) => {
    const detailId = parseInt(req.params.detailId);
    if (!detailId) return res.status(400).json({ error: 'Invalid id.' });

    try {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const lineRes = await new sql.Request(tx)
                .input('did', sql.Int, detailId)
                .query(`SELECT d.StockIssueDetailID, d.StockIssueID, d.ItemId,
                               d.Quantity, d.IssueQuantity, d.ItemRate,
                               d.Discount, d.DiscAmt, d.TaxRate, d.TaxAmount,
                               i.JobCardId, ISNULL(jc.IsFinalized, 0) AS IsFinalized,
                               it.ItenName
                        FROM data_StockIssuetoJobCardDetail d
                        INNER JOIN data_StockIssuetoJobCard i ON i.StockIssueID = d.StockIssueID
                        LEFT  JOIN Addata_JobCardInfo jc      ON jc.JobCardId   = i.JobCardId
                        LEFT  JOIN InventItems it             ON it.ItemId      = d.ItemId
                        WHERE d.StockIssueDetailID = @did`);
            if (!lineRes.recordset.length) throw new Error('Issued line not found.');
            const line = lineRes.recordset[0];
            if (line.IsFinalized) {
                const e = new Error('Job Card is finalized — cannot edit this line. Unfinalize the JC first.');
                e.statusCode = 423; throw e;
            }

            const oldQty = Number(line.IssueQuantity ?? line.Quantity ?? 0);
            const newQty = req.body.Quantity !== undefined ? Number(req.body.Quantity) : oldQty;
            const newRate = req.body.ItemRate !== undefined ? Number(req.body.ItemRate) : Number(line.ItemRate || 0);
            const newDiscPct = req.body.Discount !== undefined ? Number(req.body.Discount) : Number(line.Discount || 0);
            const newDiscAmt = req.body.DiscAmt !== undefined ? Number(req.body.DiscAmt) : Number(line.DiscAmt || 0);

            if (!(newQty > 0)) throw new Error('Quantity must be greater than zero. Delete the line instead.');
            if (newRate < 0)   throw new Error('Rate cannot be negative.');
            if (newDiscAmt < 0) throw new Error('Discount cannot be negative.');
            if (newDiscAmt > newQty * newRate) {
                throw new Error(`Discount (${newDiscAmt.toFixed(2)}) cannot exceed the line value (${(newQty * newRate).toFixed(2)}).`);
            }

            // Only an INCREASE needs a stock check, and only for the delta —
            // the units already on this line are ours to keep.
            const delta = newQty - oldQty;
            if (delta > 0) {
                await assertEnoughStock(tx, [{ ItemId: line.ItemId, Quantity: delta, ItenName: line.ItenName }]);
            }

            if (delta !== 0) {
                // Issues are stored as NEGATIVE quantities in the in/out ledger,
                // so issuing more makes the row more negative.
                const ioRes = await new sql.Request(tx)
                    .input('iid', sql.Int, line.StockIssueID)
                    .query('SELECT StockIOID FROM data_StockInOutInfo WHERE IssuanceID=@iid');
                let adjusted = 0;
                for (const r of ioRes.recordset) {
                    const upd = await new sql.Request(tx)
                        .input('ioId', sql.Int, r.StockIOID)
                        .input('itemId', sql.Int, line.ItemId)
                        .input('delta', sql.Numeric(18, 2), delta)
                        .query(`UPDATE data_StockInOutDetail
                                SET Quantity = Quantity - @delta
                                WHERE StockIOID=@ioId AND ItemId=@itemId`);
                    adjusted += upd.rowsAffected[0] || 0;
                }
                if (adjusted === 0) {
                    // No movement row to adjust means stock would silently drift.
                    throw new Error('Could not find the stock movement for this line, so the quantity was not changed. Delete the line and re-issue it instead.');
                }
            }

            let gstRate = 0;
            try { gstRate = await resolveRate('GST'); } catch (e) { console.warn('GST rate not configured:', e.message); }
            const isTaxable = req.body.IsGST === undefined
                ? Number(line.TaxRate || 0) > 0
                : !!req.body.IsGST;
            const tax = isTaxable
                ? snapshotTax(newRate * newQty, newDiscAmt, gstRate)
                : { taxRate: 0, taxAmount: 0 };

            await new sql.Request(tx)
                .input('did',  sql.Int,            detailId)
                .input('qty',  sql.Numeric(18, 2), newQty)
                .input('rate', sql.Numeric(18, 2), newRate)
                .input('disc', sql.Decimal(18, 3), newDiscPct)
                .input('da',   sql.Decimal(18, 3), newDiscAmt)
                .input('tr',   sql.Decimal(8, 4),  tax.taxRate)
                .input('ta',   sql.Decimal(18, 2), tax.taxAmount)
                .query(`UPDATE data_StockIssuetoJobCardDetail
                        SET Quantity=@qty, IssueQuantity=@qty,
                            ItemRate=@rate, StockRate=@rate,
                            Discount=@disc, DiscAmt=@da,
                            TaxRate=@tr, TaxAmount=@ta
                        WHERE StockIssueDetailID=@did`);

            await tx.commit();
            res.json({
                message: 'Line updated',
                StockIssueDetailID: detailId,
                Quantity: newQty, ItemRate: newRate,
                DiscAmt: newDiscAmt, TaxAmount: tax.taxAmount,
            });
        } catch (inner) {
            await tx.rollback();
            throw inner;
        }
    } catch (err) {
        console.error('updatePartsIssueLine:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

exports.deletePartsIssueLine = async (req, res) => {
    const detailId = parseInt(req.params.detailId);
    if (!detailId) return res.status(400).json({ error: 'Invalid id.' });

    try {
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // Find the line + parent issue + check the JC isn't finalized.
            const lineRes = await new sql.Request(tx)
                .input('did', sql.Int, detailId)
                .query(`SELECT d.StockIssueID, d.ItemId, d.Quantity,
                               i.JobCardId, ISNULL(jc.IsFinalized,0) AS IsFinalized
                        FROM data_StockIssuetoJobCardDetail d
                        INNER JOIN data_StockIssuetoJobCard i ON i.StockIssueID = d.StockIssueID
                        LEFT JOIN Addata_JobCardInfo jc       ON jc.JobCardId   = i.JobCardId
                        WHERE d.StockIssueDetailID = @did`);
            if (!lineRes.recordset.length) throw new Error('Issued line not found.');
            const line = lineRes.recordset[0];
            if (line.IsFinalized) {
                const e = new Error('Job Card is finalized — cannot delete this line. Unfinalize the JC first.');
                e.statusCode = 423; throw e;
            }

            // Reverse this line's stock-out. The parts-issue flow writes one
            // data_StockInOutInfo per issue with one detail row per ItemId, so
            // find the StockIOID for this issue and remove the matching ItemId
            // detail row.
            const ioRes = await new sql.Request(tx)
                .input('iid', sql.Int, line.StockIssueID)
                .query('SELECT StockIOID FROM data_StockInOutInfo WHERE IssuanceID=@iid');
            for (const r of ioRes.recordset) {
                await new sql.Request(tx)
                    .input('ioId', sql.Int, r.StockIOID)
                    .input('itemId', sql.Int, line.ItemId)
                    .query('DELETE FROM data_StockInOutDetail WHERE StockIOID=@ioId AND ItemId=@itemId');
            }

            // Drop any insurance depreciation tagged to this line first — owner
            // report 2026-08-18 (JC B&P-1102): deleting a part left its
            // dms_JobCardPartsDepreciation row orphaned (no FK enforces this),
            // and finalize sums that table directly without checking the part
            // still exists, silently over-billing the customer for a part no
            // longer on the invoice.
            await new sql.Request(tx).input('did', sql.Int, detailId)
                .query('DELETE FROM dms_JobCardPartsDepreciation WHERE StockIssueDetailID=@did');

            // Drop the detail row itself.
            await new sql.Request(tx).input('did', sql.Int, detailId)
                .query('DELETE FROM data_StockIssuetoJobCardDetail WHERE StockIssueDetailID=@did');

            // If the issue is now empty, clean up its header + the stock-out
            // header (so we don't leave orphans).
            const remaining = await new sql.Request(tx)
                .input('iid', sql.Int, line.StockIssueID)
                .query('SELECT COUNT(*) AS n FROM data_StockIssuetoJobCardDetail WHERE StockIssueID=@iid');
            if (remaining.recordset[0].n === 0) {
                for (const r of ioRes.recordset) {
                    await new sql.Request(tx).input('ioId', sql.Int, r.StockIOID)
                        .query('DELETE FROM data_StockInOutInfo WHERE StockIOID=@ioId');
                }
                await new sql.Request(tx).input('iid', sql.Int, line.StockIssueID)
                    .query('DELETE FROM data_StockIssuetoJobCard WHERE StockIssueID=@iid');
            }

            await tx.commit();
            res.json({ message: 'Line deleted; stock restored.' });
        } catch (e) {
            try { await tx.rollback(); } catch {}
            throw e;
        }
    } catch (err) {
        console.error('deletePartsIssueLine:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

// ============== RO COUNTERS (Admin) ==============
exports.getROCounters = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT r.CardCode, r.CurrentCounter, t.Title
            FROM dms_ROCounters r
            LEFT JOIN gen_JobCardType t ON r.CardCode = t.CardCode AND t.Status = 1
            ORDER BY r.CardCode
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateROCounter = async (req, res) => {
    const { CardCode } = req.params;
    const { CurrentCounter } = req.body;
    if (!Number.isInteger(Number(CurrentCounter)) || Number(CurrentCounter) < 0)
        return res.status(400).json({ error: 'Counter must be a non-negative integer' });
    try {
        const pool = await getPool();
        await pool.request()
            .input('code', sql.NVarChar(10), CardCode)
            .input('counter', sql.Int, Number(CurrentCounter))
            .query('UPDATE dms_ROCounters SET CurrentCounter=@counter WHERE CardCode=@code');
        res.json({ message: 'Counter updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== DOC COUNTERS (Admin) ==============
exports.getDocCounters = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT DocType, CurrentCounter FROM dms_DocCounters ORDER BY DocType');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateDocCounter = async (req, res) => {
    const { DocType } = req.params;
    const { CurrentCounter } = req.body;
    if (!['GRN','GRTN'].includes(DocType.toUpperCase()))
        return res.status(400).json({ error: 'Invalid DocType' });
    if (!Number.isInteger(Number(CurrentCounter)) || Number(CurrentCounter) < 0)
        return res.status(400).json({ error: 'Counter must be a non-negative integer' });
    try {
        const pool = await getPool();
        await pool.request()
            .input('type', sql.NVarChar(10), DocType.toUpperCase())
            .input('counter', sql.Int, Number(CurrentCounter))
            .query('UPDATE dms_DocCounters SET CurrentCounter=@counter WHERE DocType=@type');
        res.json({ message: 'Counter updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== NAVIGATION ==============
exports.getNavigation = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, id)
            .query(`SELECT
                (SELECT TOP 1 JobCardId FROM Addata_JobCardInfo ORDER BY JobCardId ASC)  AS firstId,
                (SELECT TOP 1 JobCardId FROM Addata_JobCardInfo WHERE JobCardId < @id ORDER BY JobCardId DESC) AS prevId,
                (SELECT TOP 1 JobCardId FROM Addata_JobCardInfo WHERE JobCardId > @id ORDER BY JobCardId ASC)  AS nextId,
                (SELECT TOP 1 JobCardId FROM Addata_JobCardInfo ORDER BY JobCardId DESC) AS lastId`);
        res.json(result.recordset[0]);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============== BIRTHDAYS ==============
exports.getBirthdays = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT ProfileID, CustomerName, PhoneNo, DOB,
                CASE WHEN MONTH(DOB)=MONTH(GETDATE()) AND DAY(DOB)=DAY(GETDATE()) THEN 1 ELSE 0 END AS IsToday
            FROM vw_WorkshopCustomers
            WHERE DOB IS NOT NULL
              AND (
                DATEADD(YEAR, YEAR(GETDATE()) - YEAR(DOB), DOB)
                    BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
                OR
                DATEADD(YEAR, YEAR(GETDATE()) + 1 - YEAR(DOB), DOB)
                    BETWEEN CAST(GETDATE() AS DATE) AND DATEADD(DAY, 7, CAST(GETDATE() AS DATE))
              )
            ORDER BY
                CASE WHEN DATEADD(YEAR, YEAR(GETDATE()) - YEAR(DOB), DOB) >= CAST(GETDATE() AS DATE)
                     THEN DATEADD(YEAR, YEAR(GETDATE()) - YEAR(DOB), DOB)
                     ELSE DATEADD(YEAR, YEAR(GETDATE()) + 1 - YEAR(DOB), DOB) END
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// ============== JOB CONTROLLER ==============
exports.getTodayJobs = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.VehicleRegNo,
                   ISNULL(j.WorkshopStatus, 'Waiting For Service') AS WorkshopStatus,
                   j.JobCardDate, j.PromisedDate, j.EndUserID,
                   c.endUserName AS CustomerName, c.PhoneNo AS CustomerPhone,
                   c.Address AS CustomerAddress, c.ChasisNo, c.EngineNo,
                   j.VersionCode AS VehicleModel, j.VehicleCode AS VehicleYear, j.KiloMeter
            FROM Addata_JobCardInfo j
            LEFT JOIN addata_CustomerInfo c ON j.EndUserID = c.ProfileID
            WHERE CAST(j.JobCardDate AS DATE) = CAST(GETDATE() AS DATE)
            ORDER BY j.JobCardId DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getJobControllerDetail = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .input('id', sql.Int, req.params.id)
            .query(`SELECT DetailId, JobCardId, Remarks AS WorkDescription, Price,
                           BayNo, TechnicianId AS PerformedByID, PerformedByName,
                           JobStartTime, JobEndTime
                    FROM Addata_JobCardInfoDetail WHERE JobCardId = @id ORDER BY DetailId`);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.updateWorkshopStatus = async (req, res) => {
    try {
        const { WorkshopStatus } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .input('status', sql.NVarChar(50), WorkshopStatus)
            .query('UPDATE Addata_JobCardInfo SET WorkshopStatus=@status, ModifyDate=GETDATE() WHERE JobCardId=@id');
        res.json({ message: 'Status updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.updateLabourAssignment = async (req, res) => {
    try {
        const { BayNo, PerformedByID, PerformedByName, JobStartTime, JobEndTime } = req.body;
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.detailId)
            .input('bay', sql.NVarChar(20), BayNo || null)
            .input('perfById', sql.Int, PerformedByID || null)
            .input('perfByName', sql.NVarChar(100), PerformedByName || null)
            .input('startTime', sql.DateTime, parseWallDateTime(JobStartTime))
            .input('endTime', sql.DateTime, parseWallDateTime(JobEndTime))
            .query(`UPDATE Addata_JobCardInfoDetail SET
                BayNo=@bay, TechnicianId=@perfById, PerformedByName=@perfByName,
                JobStartTime=@startTime, JobEndTime=@endTime
                WHERE DetailId=@id`);
        res.json({ message: 'Assignment updated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.getBays = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT BayID, BayName FROM dms_Bays WHERE IsActive=1 ORDER BY BayID');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.getAllBays = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request()
            .query('SELECT BayID, BayName, IsActive FROM dms_Bays ORDER BY BayID');
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveBay = async (req, res) => {
    try {
        const { BayID, BayName } = req.body;
        if (!BayName || !BayName.trim()) return res.status(400).json({ error: 'BayName is required' });
        const pool = await getPool();
        if (BayID) {
            await pool.request()
                .input('id', sql.Int, BayID)
                .input('name', sql.NVarChar(50), BayName.trim())
                .query('UPDATE dms_Bays SET BayName=@name WHERE BayID=@id');
            res.json({ message: 'Bay updated' });
        } else {
            const r = await pool.request()
                .input('name', sql.NVarChar(50), BayName.trim())
                .query('INSERT INTO dms_Bays (BayName, IsActive) OUTPUT INSERTED.BayID VALUES (@name, 1)');
            res.json({ BayID: r.recordset[0].BayID });
        }
    } catch (err) { res.status(400).json({ error: err.message }); }
};

exports.deleteBay = async (req, res) => {
    try {
        const pool = await getPool();
        await pool.request()
            .input('id', sql.Int, req.params.id)
            .query('UPDATE dms_Bays SET IsActive=0 WHERE BayID=@id');
        res.json({ message: 'Bay deactivated' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== DAMAGE MARKS ==============
exports.saveDamageMarks = async (req, res) => {
    try {
        const jobCardId = parseInt(req.params.id);
        const { marks } = req.body;
        if (!Array.isArray(marks)) return res.status(400).json({ error: 'marks array required' });
        const pool = await getPool();
        await pool.request().input('jcId', sql.Int, jobCardId)
            .query('DELETE FROM dms_DamageMarks WHERE JobCardID=@jcId');
        for (const mark of marks) {
            await pool.request()
                .input('jcId', sql.Int, jobCardId)
                .input('x', sql.Decimal(6,3), mark.XPct)
                .input('y', sql.Decimal(6,3), mark.YPct)
                .input('note', sql.NVarChar(200), mark.Note || null)
                .input('by', sql.Int, req.user?.userId || null)
                .query('INSERT INTO dms_DamageMarks (JobCardID, XPct, YPct, Note, CreatedBy) VALUES (@jcId, @x, @y, @note, @by)');
        }
        res.json({ message: 'Damage marks saved' });
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// GET /workshop/job-cards/:id/insurance
// Returns { header, parts[], payments[], totals }. `parts` includes every part issued
// to the JC plus its per-row GST snapshot — Dep Amount is computed on the GST-inclusive
// total so the customer's depreciation share matches the invoiced amount.
exports.getJobCardInsurance = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        const hdr = await pool.request().input('id', sql.Int, id)
            .query(`SELECT CompanyName, SurveyorName, SurveyorMobile, SurveyorMobile2, InsClaimNo,
                           ISNULL(UnderInsurancePct, 0) AS UnderInsurancePct,
                           ISNULL(CV4Amount, 0) AS CV4Amount
                    FROM dms_JobCardInsurance WHERE JobCardId=@id`);
        const header = hdr.recordset[0] || { CompanyName:'', SurveyorName:'', SurveyorMobile:'', SurveyorMobile2:'', InsClaimNo:'', UnderInsurancePct: 0, CV4Amount: 0 };

        // Parts issued to the JC
        const partsRs = await pool.request().input('id', sql.Int, id).query(`
            SELECT 'Part' AS LineType,
                   sid.StockIssueDetailID AS LineRefID,
                   COALESCE(CAST(i.ItemNumber AS NVARCHAR(50)), i.ManualNumber) AS ItemNumber,
                   i.ItenName             AS ItemName,
                   sid.IssueQuantity      AS Qty,
                   sid.ItemRate           AS Rate,
                   (sid.IssueQuantity * sid.ItemRate) AS TotalAmount,
                   ISNULL(sid.TaxRate, 0)   AS TaxRate,
                   ISNULL(sid.TaxAmount, 0) AS TaxAmount,
                   ((sid.IssueQuantity * sid.ItemRate) + ISNULL(sid.TaxAmount, 0)) AS TotalWithTax,
                   ISNULL(d.DepreciationPct, 0) AS DepreciationPct,
                   ISNULL(d.DepAmount, 0)       AS DepAmount
            FROM data_StockIssuetoJobCardDetail sid
            LEFT JOIN InventItems i ON sid.ItemId = i.ItemId
            LEFT JOIN dms_JobCardPartsDepreciation d
                   ON d.JobCardId = sid.JobCardId AND d.StockIssueDetailID = sid.StockIssueDetailID
            WHERE sid.JobCardId = @id`);

        // Labour / Service lines (Addata_JobCardInfoDetail). Net of discount, plus PST.
        const labourRs = await pool.request().input('id', sql.Int, id).query(`
            SELECT 'Service' AS LineType,
                   l.DetailId  AS LineRefID,
                   CAST(NULL AS NVARCHAR(50)) AS ItemNumber,
                   l.Remarks   AS ItemName,
                   CAST(1 AS DECIMAL(18,3))  AS Qty,
                   (l.Price - ISNULL(l.DiscAmt, 0)) AS Rate,
                   (l.Price - ISNULL(l.DiscAmt, 0)) AS TotalAmount,
                   ISNULL(l.TaxRate, 0)   AS TaxRate,
                   ISNULL(l.TaxAmount, 0) AS TaxAmount,
                   ((l.Price - ISNULL(l.DiscAmt, 0)) + ISNULL(l.TaxAmount, 0)) AS TotalWithTax,
                   ISNULL(d.DepreciationPct, 0) AS DepreciationPct,
                   ISNULL(d.DepAmount, 0)       AS DepAmount
            FROM Addata_JobCardInfoDetail l
            LEFT JOIN dms_JobCardPartsDepreciation d
                   ON d.JobCardId = l.JobCardId AND d.LabourDetailID = l.DetailId
            WHERE l.JobCardId = @id`);

        // Combine — parts first, then services, both ordered by their ID
        const parts = { recordset: [
            ...partsRs.recordset.sort((a, b) => a.LineRefID - b.LineRefID),
            ...labourRs.recordset.sort((a, b) => a.LineRefID - b.LineRefID),
        ]};

        // Pull each payment WITH its linked voucher status so reversed
        // receipts are (a) surfaced to the UI so the row can be styled
        // and (b) excluded from the "Already Paid" sum. Without this the
        // reversal flips the GL back but the JC still looks fully paid.
        const pays = await pool.request().input('id', sql.Int, id).query(`
            SELECT p.DepPaymentID, p.PaidAmount, p.PaymentMode, p.BankAccountID,
                   p.ReferenceNo, p.Notes, p.ReceivedAt, p.ReceivedByName, p.VoucherID,
                   ISNULL(v.Status, 'Posted') AS VoucherStatus
            FROM dms_JobCardDepreciationPayments p
            LEFT JOIN data_FinanceVoucherInfo v ON p.VoucherID = v.VoucherID
            WHERE p.JobCardId = @id
            ORDER BY p.ReceivedAt DESC, p.DepPaymentID DESC`);

        const depreciationTotal = parts.recordset.reduce((s, p) => s + Number(p.DepAmount || 0), 0);
        const depreciationPaid  = pays.recordset
            .filter(p => (p.VoucherStatus || 'Posted') !== 'Reversed')
            .reduce((s, p) => s + Number(p.PaidAmount || 0), 0);

        // ── Under-insurance (owner ask 2026-07-08) ──
        // Percentage of the entire invoice (parts + service + sublet + all
        // taxes) minus depreciation. Same customer pool as dep — paid via
        // the same Depreciation Receive Payment flow.
        //
        // Owner spec 2026-07-08: base = whole invoice (part + service +
        // sublet + all taxes) − depreciation. Same three components that
        // getJobCardBalance computes when there's no SI voucher yet.
        const labourTot = await pool.request().input('id', sql.Int, id).query(
            `SELECT ISNULL(SUM((Price - ISNULL(DiscAmt,0)) + ISNULL(TaxAmount,0)), 0) AS T
             FROM Addata_JobCardInfoDetail WHERE JobCardId=@id`);
        const subletTot = await pool.request().input('id', sql.Int, id).query(
            `SELECT ISNULL(SUM(ISNULL(PayableAmount,0) + ISNULL(TaxAmount,0)), 0) AS T
             FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId=@id`);
        const partsTot = await pool.request().input('id', sql.Int, id).query(
            `SELECT ISNULL(SUM(IssueQuantity * ItemRate
                              - ISNULL(DiscAmt,0)
                              + ISNULL(TaxAmount,0)), 0) AS T
             FROM data_StockIssuetoJobCardDetail
             WHERE JobCardId=@id`);
        const invoiceTotal = Number(labourTot.recordset[0].T)
                           + Number(subletTot.recordset[0].T)
                           + Number(partsTot.recordset[0].T);

        const underInsurancePct = Number(header.UnderInsurancePct) || 0;
        const underInsuranceBase = Math.max(0, invoiceTotal - depreciationTotal);
        const underInsuranceAmount = +(underInsuranceBase * underInsurancePct / 100).toFixed(2);

        // CV4 — flat, manually-entered customer-owed amount (owner ask
        // 2026-08-07). Unlike under-insurance it isn't computed from a base;
        // the operator just types a figure on the Insurance tab. Rides the
        // same customer-share pool as depreciation / under-insurance.
        const cv4Amount = +(Number(header.CV4Amount) || 0).toFixed(2);

        // Customer's total share (paid via Depreciation Receive Payment) =
        // depreciation + under-insurance + CV4.
        const customerShareTotal = +(depreciationTotal + underInsuranceAmount + cv4Amount).toFixed(2);

        res.json({
            header,
            parts: parts.recordset,
            payments: pays.recordset,
            totals: {
                depreciationTotal:    +depreciationTotal.toFixed(2),
                depreciationPaid:     +depreciationPaid.toFixed(2),
                // depreciationBalance still called that for backward
                // compatibility with existing UI, but it's now
                // (dep + under-ins + CV4) − paid. Frontend / Receive Payment
                // treats it as the total customer share balance.
                depreciationBalance:  +(customerShareTotal - depreciationPaid).toFixed(2),
                // Extra fields so the Insurance tab can show a breakdown.
                invoiceTotal:         +invoiceTotal.toFixed(2),
                underInsurancePct:    +underInsurancePct.toFixed(2),
                underInsuranceBase:   +underInsuranceBase.toFixed(2),
                underInsuranceAmount: underInsuranceAmount,
                cv4Amount:            cv4Amount,
                customerShareTotal:   customerShareTotal,
            }
        });
    } catch (err) {
        console.error('getJobCardInsurance:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /workshop/job-cards/:id/insurance
// Body: { header: {...}, parts: [{ StockIssueDetailID, DepreciationPct }, ...] }
// Replaces the depreciation rows for this JC and upserts the insurance header in a transaction.
exports.saveJobCardInsurance = async (req, res) => {
    const id = parseInt(req.params.id);
    const { header = {}, parts = [] } = req.body || {};
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid JobCardId' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Block if finalized — match the existing JC-mutation pattern
        const fin = await new sql.Request(tx).input('id', sql.Int, id)
            .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@id');
        if (!fin.recordset.length) {
            await tx.rollback();
            return res.status(404).json({ error: 'Job Card not found' });
        }
        if (fin.recordset[0].IsFinalized) {
            await tx.rollback();
            return res.status(423).json({ error: 'Job Card is finalized. Request unfinalize to edit insurance info.' });
        }

        // Upsert header
        await new sql.Request(tx)
            .input('id', sql.Int, id)
            .input('co',  sql.NVarChar(200), header.CompanyName     || null)
            .input('sn',  sql.NVarChar(150), header.SurveyorName    || null)
            .input('sm',  sql.NVarChar(30),  header.SurveyorMobile  || null)
            .input('sm2', sql.NVarChar(30),  header.SurveyorMobile2 || null)
            .input('cn',  sql.NVarChar(80),  header.InsClaimNo      || null)
            .input('uip', sql.Decimal(5,2),  Number.isFinite(Number(header.UnderInsurancePct)) ? Number(header.UnderInsurancePct) : 0)
            .input('cv4', sql.Decimal(18,2), Number.isFinite(Number(header.CV4Amount)) ? Number(header.CV4Amount) : 0)
            .query(`
                IF EXISTS (SELECT 1 FROM dms_JobCardInsurance WHERE JobCardId=@id)
                    UPDATE dms_JobCardInsurance
                       SET CompanyName=@co, SurveyorName=@sn, SurveyorMobile=@sm,
                           SurveyorMobile2=@sm2, InsClaimNo=@cn, UnderInsurancePct=@uip,
                           CV4Amount=@cv4,
                           UpdatedAt=GETDATE()
                     WHERE JobCardId=@id;
                ELSE
                    INSERT INTO dms_JobCardInsurance
                        (JobCardId, CompanyName, SurveyorName, SurveyorMobile, SurveyorMobile2, InsClaimNo, UnderInsurancePct, CV4Amount)
                    VALUES (@id, @co, @sn, @sm, @sm2, @cn, @uip, @cv4);
            `);

        // Replace depreciation rows
        await new sql.Request(tx).input('id', sql.Int, id)
            .query('DELETE FROM dms_JobCardPartsDepreciation WHERE JobCardId=@id');

        for (const row of parts) {
            const pct = Number(row.DepreciationPct) || 0;
            if (pct < 0 || pct > 100) continue;
            const lineType = row.LineType === 'Service' ? 'Service' : 'Part';
            const refId = parseInt(row.LineRefID ?? row.StockIssueDetailID ?? row.LabourDetailID);
            if (!Number.isFinite(refId)) continue;

            // Authoritative server-side recompute on GST-inclusive total.
            let totalAmount = 0, taxAmount = 0;
            if (lineType === 'Part') {
                const t = await new sql.Request(tx)
                    .input('sid', sql.Int, refId)
                    .input('jc',  sql.Int, id)
                    .query(`SELECT (IssueQuantity * ItemRate) AS TotalAmount,
                                   ISNULL(TaxAmount, 0)       AS TaxAmount
                              FROM data_StockIssuetoJobCardDetail
                             WHERE StockIssueDetailID=@sid AND JobCardId=@jc`);
                if (!t.recordset.length) continue;
                totalAmount = Number(t.recordset[0].TotalAmount) || 0;
                taxAmount   = Number(t.recordset[0].TaxAmount)   || 0;
            } else {
                const t = await new sql.Request(tx)
                    .input('did', sql.Int, refId)
                    .input('jc',  sql.Int, id)
                    .query(`SELECT (Price - ISNULL(DiscAmt, 0)) AS TotalAmount,
                                   ISNULL(TaxAmount, 0)         AS TaxAmount
                              FROM Addata_JobCardInfoDetail
                             WHERE DetailId=@did AND JobCardId=@jc`);
                if (!t.recordset.length) continue;
                totalAmount = Number(t.recordset[0].TotalAmount) || 0;
                taxAmount   = Number(t.recordset[0].TaxAmount)   || 0;
            }

            const basis = totalAmount + taxAmount;
            const depAmount = +(basis * pct / 100).toFixed(2);

            const ins = new sql.Request(tx)
                .input('jc',  sql.Int, id)
                .input('pct', sql.Decimal(5,2), pct)
                .input('amt', sql.Decimal(18,2), depAmount);
            if (lineType === 'Part') {
                ins.input('sid', sql.Int, refId);
                await ins.query(`INSERT INTO dms_JobCardPartsDepreciation
                                    (JobCardId, StockIssueDetailID, DepreciationPct, DepAmount)
                                 VALUES (@jc, @sid, @pct, @amt)`);
            } else {
                ins.input('lid', sql.Int, refId);
                await ins.query(`INSERT INTO dms_JobCardPartsDepreciation
                                    (JobCardId, LabourDetailID, DepreciationPct, DepAmount)
                                 VALUES (@jc, @lid, @pct, @amt)`);
            }
        }

        // Total = sum of saved DepAmounts
        const tot = await new sql.Request(tx).input('id', sql.Int, id)
            .query(`SELECT ISNULL(SUM(DepAmount), 0) AS Total
                    FROM dms_JobCardPartsDepreciation WHERE JobCardId=@id`);

        await tx.commit();
        res.json({ message: 'Insurance info saved', depreciationTotal: Number(tot.recordset[0].Total) || 0 });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('saveJobCardInsurance:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /workshop/job-cards/:id/depreciation-payments
// Record a payment the END CUSTOMER made against their depreciation share.
// Body: { PaidAmount, PaymentMode, BankAccountID?, ReferenceNo?, Notes? }
// Stores the payment in dms_JobCardDepreciationPayments. The Insurance tab
// then shows total / paid / balance with this row included.
// GL posting against the JC's customer party is on the backlog (see memory).
exports.recordDepreciationPayment = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body || {};
        const amount = Number(b.PaidAmount);
        const mode = b.PaymentMode;
        if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ error: 'PaidAmount must be > 0' });
        if (!['Cash','BankTransfer','Cheque','POS','PayOrder'].includes(mode))
            return res.status(400).json({ error: 'Invalid PaymentMode' });
        // POS Dr is POS_CLEARING (settled by the POS Settlement screen later),
        // so no BankAccountID is needed. Cash needs no bank either. Everything
        // else must pick the destination bank up-front.
        if (mode !== 'Cash' && mode !== 'POS' && !b.BankAccountID)
            return res.status(400).json({ error: 'BankAccountID is required for non-cash modes' });
        if (mode === 'Cheque') {
            if (!b.ReferenceNo) return res.status(400).json({ error: 'Cheque # (ReferenceNo) is required for Cheque mode.' });
            if (!b.ChequeDate)  return res.status(400).json({ error: 'ChequeDate is required for Cheque mode.' });
        }

        const pool = await getPool();

        // Job Card must be finalized before depreciation can be received from the customer.
        const jcCheck = await pool.request().input('id', sql.Int, id)
            .query('SELECT IsFinalized, JobCardNo FROM Addata_JobCardInfo WHERE JobCardId=@id');
        if (!jcCheck.recordset.length) return res.status(404).json({ error: 'Job Card not found' });
        if (!jcCheck.recordset[0].IsFinalized) {
            return res.status(423).json({
                error: `Job Card ${jcCheck.recordset[0].JobCardNo} must be finalized before its depreciation can be received.`
            });
        }

        // Cap at outstanding balance to prevent overpayment. Balance =
        // depreciation + under-insurance + CV4 − paid. Excludes payments
        // whose linked voucher was later reversed — otherwise a reversed
        // receipt would still count against the cap and block re-recording.
        const totals = await pool.request().input('id', sql.Int, id).query(`
            SELECT
              (SELECT ISNULL(SUM(DepAmount), 0)
                 FROM dms_JobCardPartsDepreciation
                 WHERE JobCardId=@id) AS DepTotal,
              (SELECT ISNULL(UnderInsurancePct, 0)
                 FROM dms_JobCardInsurance
                 WHERE JobCardId=@id) AS UIPct,
              (SELECT ISNULL(CV4Amount, 0)
                 FROM dms_JobCardInsurance
                 WHERE JobCardId=@id) AS CV4Amount,
              (SELECT ISNULL(SUM((Price - ISNULL(DiscAmt,0)) + ISNULL(TaxAmount,0)), 0)
                 FROM Addata_JobCardInfoDetail WHERE JobCardId=@id) AS LabourTot,
              (SELECT ISNULL(SUM(ISNULL(PayableAmount,0) + ISNULL(TaxAmount,0)), 0)
                 FROM Addata_JobCardInfoSubletJobDetail WHERE JobCardId=@id) AS SubletTot,
              (SELECT ISNULL(SUM(IssueQuantity * ItemRate - ISNULL(DiscAmt,0) + ISNULL(TaxAmount,0)), 0)
                 FROM data_StockIssuetoJobCardDetail WHERE JobCardId=@id) AS PartsTot,
              (SELECT ISNULL(SUM(p.PaidAmount), 0)
                 FROM dms_JobCardDepreciationPayments p
                 LEFT JOIN data_FinanceVoucherInfo v ON p.VoucherID = v.VoucherID
                 WHERE p.JobCardId=@id
                   AND ISNULL(v.Status, 'Posted') <> 'Reversed') AS Paid`);
        const row = totals.recordset[0];
        const depTotal    = Number(row.DepTotal) || 0;
        const invoiceTot  = Number(row.LabourTot) + Number(row.SubletTot) + Number(row.PartsTot);
        const uiBase      = Math.max(0, invoiceTot - depTotal);
        const uiAmount    = +((uiBase * (Number(row.UIPct) || 0)) / 100).toFixed(2);
        const cv4Amount   = Number(row.CV4Amount) || 0;
        const total       = +(depTotal + uiAmount + cv4Amount).toFixed(2);
        const paid        = Number(row.Paid) || 0;
        const balance     = +(total - paid).toFixed(2);
        if (amount > balance + 0.005) {
            return res.status(400).json({ error: `Amount (${amount.toFixed(2)}) exceeds outstanding customer share (dep + under-ins + CV4) balance (${balance.toFixed(2)})` });
        }

        // Resolve GL accounts for the voucher:
        //   Dr  → CASH_BOOK (Cash) / chosen bank GLCAID (Bank/Cheque/POS/PayOrder)
        //   Cr  → depends on whether the finalize voucher split the AR leg:
        //         - SPLIT (new path): GENERAL_CUSTOMER tagged with JobCardID only —
        //           the customer's depreciation share already sits there, so paying
        //           it reduces that Gen-Cust-tagged-by-JC balance.
        //         - LEGACY (pre-split JCs): INSURER'S PartyGLID tagged with PartyID +
        //           JobCardID — the full AR was charged to the insurer, so reducing
        //           that insurer-tagged balance still nets correctly per-party.
        //         - Walk-in (no PartyID): GENERAL_CUSTOMER tagged with JobCardID.
        //
        // Detection: look for a Gen-Cust-tagged-by-JC Dr leg in the JC's finalize
        // voucher — if present, the AR was split; if not, it's a legacy JC.
        const { resolveRole } = require('./systemAccountsController');
        const isCash   = mode === 'Cash';
        const isCheque = mode === 'Cheque';
        const isPOS    = mode === 'POS';
        let drGL, depositBankGL = null;
        if (isCash) {
            drGL = await resolveRole('CASH_BOOK');
        } else if (isCheque) {
            // Cheque receipts go to CHEQUES_ON_HAND first; the chosen bank is the
            // intended deposit bank, stored on the dms_PendingCheques row and used
            // by the Cheque Clearance screen to post the eventual Dr Bank leg.
            const bkChk = await pool.request().input('id', sql.Int, parseInt(b.BankAccountID))
                .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1');
            if (!bkChk.recordset.length) return res.status(400).json({ error: 'Bank account not active or not registered.' });
            depositBankGL = bkChk.recordset[0].GLCAID;
            drGL = await resolveRole('CHEQUES_ON_HAND');
        } else if (isPOS) {
            // POS card payments sit in POS_CLEARING until the POS Settlement
            // screen moves the balance to the acquiring bank. Matches the
            // convention used by paymentJournalBuilder.js for standard
            // receive-payment flows.
            drGL = await resolveRole('POS_CLEARING');
        } else {
            const bkChk = await pool.request().input('id', sql.Int, parseInt(b.BankAccountID))
                .query('SELECT GLCAID FROM dms_BankAccounts WHERE GLCAID=@id AND IsActive=1');
            if (!bkChk.recordset.length) return res.status(400).json({ error: 'Bank account not active or not registered.' });
            drGL = bkChk.recordset[0].GLCAID;
        }

        const genCustGL = await resolveRole('GENERAL_CUSTOMER');

        // Did finalize split the AR? Look for a Gen-Cust-tagged-by-JC Dr leg.
        const splitChk = await pool.request()
            .input('id', sql.Int, id)
            .input('gc', sql.Int, genCustGL)
            .query(`SELECT TOP 1 1 AS HasSplit
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE v.SourceDocType='JOBCARD' AND v.SourceDocID=@id
                      AND v.Status='Posted'
                      AND d.GLCAID=@gc AND d.JobCardID=@id AND d.PartyID IS NULL
                      AND d.Debit > 0`);
        const isSplit = splitChk.recordset.length > 0;

        // Look up the JC's insurer party + their PartyGLID
        const jcParty = await pool.request().input('id', sql.Int, id).query(`
            SELECT j.PartyID, p.PartyName, p.PartyGLID
            FROM Addata_JobCardInfo j
            LEFT JOIN gen_PartiesInfo p ON j.PartyID = p.PartyID
            WHERE j.JobCardId = @id`);
        const partyRow = jcParty.recordset[0] || {};
        const insurerPartyID = partyRow.PartyID || null;
        let crGL, crPartyTag = null;
        if (isSplit) {
            // New split path — credit Gen Cust against the JC-tagged Dr leg.
            crGL = genCustGL;
        } else if (insurerPartyID && partyRow.PartyGLID) {
            crGL = partyRow.PartyGLID;
            crPartyTag = insurerPartyID;
        } else if (insurerPartyID && !partyRow.PartyGLID) {
            return res.status(400).json({ error: `Party "${partyRow.PartyName || '#' + insurerPartyID}" has no GL account set. Edit the party and assign one.` });
        } else {
            crGL = genCustGL;
        }

        // Pick voucher type — CRV (cash) or BRV (any bank-routed mode).
        // GLVoucherType has duplicate Title rows from legacy data — take the lowest Voucherid.
        const vtCode = isCash ? 'CRV' : 'BRV';
        const vtRes = await pool.request().input('t', sql.NVarChar(20), vtCode)
            .query('SELECT TOP 1 Voucherid FROM GLVoucherType WHERE Title=@t ORDER BY Voucherid');
        if (!vtRes.recordset.length) return res.status(400).json({ error: `Voucher type ${vtCode} not configured.` });
        const voucherTypeId = vtRes.recordset[0].Voucherid;

        const jcNo = jcCheck.recordset[0].JobCardNo;
        const narration = `Depreciation receipt for ${jcNo} — ${mode}${b.ReferenceNo ? ` (${b.ReferenceNo})` : ''}`;

        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            // 1. Insert the payment row
            const insPay = await new sql.Request(tx)
                .input('jc',   sql.Int,           id)
                .input('amt',  sql.Decimal(18,2), amount)
                .input('mode', sql.NVarChar(30),  mode)
                .input('bnk',  sql.Int,           b.BankAccountID ? parseInt(b.BankAccountID) : null)
                .input('ref',  sql.NVarChar(100), b.ReferenceNo || null)
                .input('nts',  sql.NVarChar(500), b.Notes || null)
                .input('by',   sql.Int,           req.user?.userId || null)
                .input('byN',  sql.NVarChar(100), req.user?.userName || null)
                .query(`INSERT INTO dms_JobCardDepreciationPayments
                            (JobCardId, PaidAmount, PaymentMode, BankAccountID, ReferenceNo, Notes,
                             ReceivedByUserID, ReceivedByName)
                        OUTPUT INSERTED.DepPaymentID
                        VALUES (@jc, @amt, @mode, @bnk, @ref, @nts, @by, @byN)`);
            const depPaymentId = insPay.recordset[0].DepPaymentID;

            // 2. Voucher header (Draft)
            const voucherNo = await nextVoucherNo(tx, vtCode);

            const hdrRes = await new sql.Request(tx)
                .input('vd',   sql.DateTime,     new Date())
                .input('vno',  sql.NVarChar(50), voucherNo)
                .input('vtId', sql.Int,          voucherTypeId)
                .input('rem',  sql.NVarChar(sql.MAX), narration)
                .input('tot',  sql.Decimal(18,2), amount)
                .input('src',  sql.NVarChar(20), 'JOBCARD')
                .input('srcId',sql.Int,          id)
                .input('cby',  sql.Int,          req.user?.userId || null)
                .input('cbyN', sql.NVarChar(100),req.user?.userName || null)
                .query(`INSERT INTO data_FinanceVoucherInfo
                            (VoucherDate, VoucherNo, VoucherTypeID, Remarks, TotalAmount,
                             Status, Posted, SourceDocType, SourceDocID, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.VoucherID
                        VALUES (@vd, @vno, @vtId, @rem, @tot,
                                'Draft', 0, @src, @srcId, @cby, @cbyN)`);
            const voucherId = hdrRes.recordset[0].VoucherID;

            // 3. Two balanced lines. The Cr leg also gets a PartyID tag (when the JC
            // has an insurance party) so subsidiary-ledger queries by party work.
            const insertLine = async (glcaid, dr, cr, lineNar, partyId) => {
                const r = await new sql.Request(tx)
                    .input('vid',  sql.Int,           voucherId)
                    .input('gl',   sql.Int,           glcaid)
                    .input('nar',  sql.NVarChar(sql.MAX), lineNar)
                    .input('dr',   sql.Decimal(18,2), dr || 0)
                    .input('cr',   sql.Decimal(18,2), cr || 0)
                    .input('pid',  sql.Int,           partyId || null)
                    .input('jcid', sql.Int,           id)
                    .query(`INSERT INTO data_FinanceVoucherDetail
                                (VoucherID, GLCAID, Narration, Debit, Credit, PartyID, JobCardID)
                            OUTPUT INSERTED.VoucherDetailID
                            VALUES (@vid, @gl, @nar, @dr, @cr, @pid, @jcid)`);
                return r.recordset[0].VoucherDetailID;
            };
            const drDetailId = await insertLine(drGL, amount, 0, `${mode} receipt — depreciation for ${jcNo}`, null);
            const crNar = crPartyTag
                ? `Insurer A/R reduced — customer paid depreciation portion for ${jcNo}`
                : `Customer A/R reduced — depreciation for ${jcNo}`;
            await insertLine(crGL, 0, amount, crNar, crPartyTag);

            // Subsidiary ledger — only the party-tagged Cr leg goes into dms_PartyLedger
            if (crPartyTag) {
                await new sql.Request(tx)
                    .input('pid', sql.Int, crPartyTag)
                    .input('jcid', sql.Int, id)
                    .input('vid', sql.Int, voucherId)
                    .input('gl',  sql.Int, crGL)
                    .input('cr',  sql.Decimal(18,2), amount)
                    .input('nar', sql.NVarChar(500), crNar)
                    .query(`INSERT INTO dms_PartyLedger
                                (PartyID, JobCardID, VoucherID, GLCAID, Debit, Credit, Narration)
                            VALUES (@pid, @jcid, @vid, @gl, 0, @cr, @nar)`);
            }

            // 4. Flip to Posted (balanced-entry trigger validates)
            await new sql.Request(tx)
                .input('vid', sql.Int, voucherId)
                .input('pby', sql.Int, req.user?.userId || null)
                .query(`UPDATE data_FinanceVoucherInfo
                        SET Status='Posted', Posted=1, PostedBy=@pby, PostedAt=GETDATE()
                        WHERE VoucherID=@vid`);

            // 5. Stamp the VoucherID back to the payment row
            await new sql.Request(tx)
                .input('id', sql.Int, depPaymentId)
                .input('vid', sql.Int, voucherId)
                .query('UPDATE dms_JobCardDepreciationPayments SET VoucherID=@vid WHERE DepPaymentID=@id');

            // 6. Cheque mode: register the pending cheque so the Cheque Clearance
            //    screen can later move it from Cheques on Hand to the deposit bank.
            if (isCheque) {
                await new sql.Request(tx)
                    .input('vid',  sql.Int,            voucherId)
                    .input('did',  sql.Int,            drDetailId)
                    .input('dir',  sql.NVarChar(20),   'Received')
                    .input('no',   sql.NVarChar(50),   b.ReferenceNo)
                    .input('dt',   sql.Date,           b.ChequeDate)
                    .input('amt',  sql.Decimal(18,2),  amount)
                    .input('db',   sql.NVarChar(150),  b.DrawerBank || null)
                    .input('dbg',  sql.Int,            depositBankGL)
                    .input('pid',  sql.Int,            insurerPartyID || null)
                    .input('jcid', sql.Int,            id)
                    .input('cby',  sql.Int,            req.user?.userId || null)
                    .input('cbyN', sql.NVarChar(100),  req.user?.userName || null)
                    .query(`INSERT INTO dms_PendingCheques
                                (ReceiptVoucherID, ReceiptDetailID, Direction,
                                 ChequeNo, ChequeDate, Amount,
                                 DrawerBank, DepositBankGLCAID, PartyID, JobCardID,
                                 CreatedBy, CreatedByName)
                            VALUES (@vid, @did, @dir,
                                    @no, @dt, @amt,
                                    @db, @dbg, @pid, @jcid,
                                    @cby, @cbyN)`);
            }

            await tx.commit();

            res.status(201).json({
                DepPaymentID: depPaymentId,
                VoucherID: voucherId,
                VoucherNo: voucherNo,
                message: 'Depreciation payment recorded and posted',
                totals: {
                    depreciationTotal: total,
                    depreciationPaid: +(paid + amount).toFixed(2),
                    depreciationBalance: +(balance - amount).toFixed(2)
                }
            });
        } catch (txErr) {
            try { await tx.rollback(); } catch {}
            throw txErr;
        }
    } catch (err) {
        console.error('recordDepreciationPayment:', err);
        res.status(500).json({ error: err.message });
    }
};
