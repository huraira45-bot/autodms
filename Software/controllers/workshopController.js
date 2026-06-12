const { sql, getPool } = require('../config/db');
const { computeLineDiscAmt, validateDiscountCap } = require('../utils/careOffUtils');
const { resolveRate } = require('./taxRatesController');

// Pure helper: snapshot tax for a labour/sublet line per §14.4 (discount before tax).
// Returns { taxRate, taxAmount }.
const snapshotTax = (gross, discAmt, rate) => {
    const net = Math.max(0, (Number(gross) || 0) - (Number(discAmt) || 0));
    const taxAmount = Math.round((net * (rate / 100)) * 100) / 100;
    return { taxRate: rate, taxAmount };
};

// ============== CUSTOMERS ==============
exports.getCustomers = async (req, res) => {
    try {
        const { search } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = 'SELECT * FROM vw_WorkshopCustomers';
        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            query += ' WHERE CustomerName LIKE @search OR PhoneNo LIKE @search OR RegistrationNo LIKE @search OR ChasisNo LIKE @search';
        }
        query += ' ORDER BY ProfileID DESC';
        const result = await request.query(query);
        res.json(result.recordset);
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
        const { RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel } = req.body;
        const pool = await getPool();
        const result = await pool.request()
            .input('userId', sql.Int, req.params.id)
            .input('regNo', sql.NVarChar(150), RegistrationNo)
            .input('chassis', sql.NVarChar(150), ChasisNo)
            .input('engine', sql.NVarChar(150), EngineNo)
            .input('brand', sql.NVarChar(150), BrandName)
            .input('model', sql.NVarChar(150), VehicleModel)
            .query(`INSERT INTO WorkshopVehicles (EndUserID, RegistrationNo, ChasisNo, EngineNo, BrandName, VehicleModel)
                    OUTPUT INSERTED.*
                    VALUES (@userId, @regNo, @chassis, @engine, @brand, @model)`);
        res.status(201).json(result.recordset[0]);
    } catch (err) { res.status(400).json({ error: err.message }); }
};

// ============== PARTIES (Credit) ==============
exports.getParties = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query('SELECT PartyID, PartyName, PhoneOne, CNIC FROM vw_ActiveParties ORDER BY PartyName');
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
                   e.EmployeeName AS ManagerEmployeeName
            FROM gen_JobCardType t
            LEFT JOIN gen_EmployeeInfo e ON t.ManagerEmployeeID = e.EmployeeID
            WHERE t.Status = 1 ORDER BY t.SNo
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
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
exports.getJobCards = async (req, res) => {
    try {
        const { search, status } = req.query;
        const pool = await getPool();
        const request = pool.request();
        let query = 'SELECT * FROM vw_WorkshopJobCards';
        const conditions = [];
        if (search) {
            request.input('search', sql.NVarChar(200), `%${search}%`);
            conditions.push('(JobCardNo LIKE @search OR jobCode LIKE @search OR CustomerName LIKE @search OR VehicleRegNo LIKE @search OR ChasisNo LIKE @search)');
        }
        if (status !== undefined && status !== '') {
            request.input('status', sql.Int, parseInt(status));
            conditions.push('JobStatus = @status');
        }
        if (conditions.length > 0) query += ' WHERE ' + conditions.join(' AND ');
        query += ' ORDER BY JobCardId DESC';
        const result = await request.query(query);
        res.json(result.recordset);
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
                    i.ItenName AS ItemName, i.ItemNumber, si.IssueDate, si.IssueNo
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

        res.json({ ...jc.recordset[0], LabourItems: labour.recordset, PartsItems: parts.recordset, SubletItems: sublets.recordset, Accessories: accessories.recordset, DamageMarks: damageMarks.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

exports.saveJobCard = async (req, res) => {
    try {
        const { JobCardId, jobCode, JobTypeId, OrderTypeId, EndUserID, VehicleRegNo, ChasisNo, EngineNo,
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

        if (CareOffID && LabourItems?.length > 0) {
            const coRes = await pool.request()
                .input('coId', sql.Int, CareOffID)
                .query('SELECT MaxDiscountPct FROM dms_CareOff WHERE CareOffID=@coId AND IsActive=1');
            if (!coRes.recordset.length)
                return res.status(400).json({ error: 'Selected Care-Off is inactive or not found.' });
            const cap = validateDiscountCap(LabourItems, coRes.recordset[0].MaxDiscountPct);
            if (!cap.valid)
                return res.status(422).json({ error: `Discount cap exceeded. Total: PKR ${cap.totalDiscount}, max allowed: PKR ${cap.maxAllowed}.` });
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
                    .input('jobTypeId', sql.Int, JobTypeId)
                    .input('orderTypeId', sql.Int, OrderTypeId || null)
                    .input('regNo', sql.NVarChar(150), VehicleRegNo)
                    .input('chassis', sql.NVarChar(150), ChasisNo)
                    .input('engine', sql.NVarChar(150), EngineNo)
                    .input('km', sql.Decimal(18,2), KiloMeter || 0)
                    .input('millage', sql.Decimal(18,2), Millage || 0)
                    .input('promised', sql.DateTime, PromisedDate || null)
                    .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                    .input('payType', sql.NVarChar(50), PaymentType)
                    .input('payCO', sql.NVarChar(100), PaymentCO || null)
                    .input('payBankId', sql.Int, PaymentBankID || null)
                    .input('fuel', sql.NVarChar(20), FuelLevel)
                    .input('voc', sql.NVarChar(sql.MAX), VOCRemarks)
                    .input('custType', sql.NVarChar(20), CustomerType)
                    .input('partyId', sql.Int, PartyID || null)
                    .input('pmType', sql.NVarChar(50), PMType || 'None')
                    .input('advisor', sql.NVarChar(100), ServiceAdvisor || null)
                    .input('advisorId', sql.Int, ServiceAdvisorID ? parseInt(ServiceAdvisorID) : null)
                    .input('repeatROID', sql.Int, RepeatROID || null)
                    .input('batteryNo', sql.NVarChar(50), BatteryNo || null)
                    .input('color', sql.NVarChar(100), VehicleColor || null)
                    .input('isEst', sql.Bit, IsEstimatedRO ? 1 : 0)
                    .input('estRONo', sql.NVarChar(50), EstimatedRONo || null)
                    .input('approvedBy', sql.NVarChar(100), ApprovedBy || null)
                    .input('revisedDel', sql.DateTime, RevisedDelivery || null)
                    .input('jobResult', sql.NVarChar(20), JobResult || null)
                    .input('isFIR', sql.Bit, IsFIR ? 1 : 0)
                    .input('bringByType', sql.NVarChar(50), BringByType || 'Self')
                    .input('bringByName', sql.NVarChar(100), BringByName || null)
                    .input('bringByMobile', sql.NVarChar(20), BringByMobile || null)
                    .input('deliveredTo', sql.NVarChar(100), DeliveredTo || null)
                    .input('delivMobile', sql.NVarChar(20), DeliveryMobile || null)
                    .input('deliveredAt', sql.DateTime, DeliveredAt || null)
                    .input('careOffId', sql.Int, CareOffID || null)
                    .input('careOffName', sql.NVarChar(100), CareOffName || null)
                    .input('dqirNo', sql.NVarChar(50), DQIRNo || null)
                    .input('checkedById', sql.Int, CheckedByID || null)
                    .input('checkedByName', sql.NVarChar(100), CheckedByName || null)
                    .input('confirmById', sql.Int, ConfirmByID || null)
                    .input('confirmByName', sql.NVarChar(100), ConfirmByName || null)
                    .input('wacResults', sql.NVarChar(sql.MAX), WACResults || null)
                    .query(`UPDATE Addata_JobCardInfo SET
                        jobCode=@jobCode, JobTypeId=@jobTypeId, OrderTypeId=@orderTypeId, VehicleRegNo=@regNo, ChasisNo=@chassis, EngineNo=@engine,
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

                await transaction.request().input('id', sql.Int, JobCardId)
                    .query('DELETE FROM Addata_JobCardInfoDetail WHERE JobCardId = @id');

                for (const item of effectiveItems) {
                    const discAmtVal = computeLineDiscAmt(item);
                    const tax = snapshotTax(item.Price, discAmtVal, pstRate);
                    await new sql.Request(transaction)
                        .input('jcId', sql.Int, JobCardId)
                        .input('remarks', sql.NVarChar(sql.MAX), item.WorkDescription)
                        .input('price', sql.Decimal(18, 2), item.Price || 0)
                        .input('discount', sql.Decimal(18, 3), Number(item.Discount) || 0)
                        .input('discAmt', sql.Decimal(18, 3), discAmtVal)
                        .input('discType', sql.NVarChar(10), item.DiscType || null)
                        .input('taxRate', sql.Decimal(8, 4), tax.taxRate)
                        .input('taxAmount', sql.Decimal(18, 2), tax.taxAmount)
                        .query('INSERT INTO Addata_JobCardInfoDetail (JobCardId, Remarks, Price, Discount, DiscAmt, DiscType, TaxRate, TaxAmount) VALUES (@jcId, @remarks, @price, @discount, @discAmt, @discType, @taxRate, @taxAmount)');
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
                const typeRes = await transaction.request()
                    .input('jobTypeId', sql.Int, JobTypeId)
                    .query('SELECT CardCode FROM gen_JobCardType WHERE JobCardTypeId = @jobTypeId');
                const cardCode = typeRes.recordset.length > 0 ? typeRes.recordset[0].CardCode : 'JC';

                const checkRes = await transaction.request()
                    .input('jobCode', sql.NVarChar(50), jobCode)
                    .query('SELECT JobCardId FROM Addata_JobCardInfo WHERE jobCode = @jobCode');

                if (checkRes.recordset.length > 0) {
                    await transaction.rollback();
                    return res.status(400).json({ error: 'Job Number already exists. Please use a unique Job Number.' });
                }

                const counterRes = await transaction.request()
                    .input('cardCode', sql.NVarChar(10), cardCode)
                    .query('UPDATE dms_ROCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter WHERE CardCode = @cardCode');
                if (!counterRes.recordset.length) {
                    await transaction.rollback();
                    return res.status(400).json({ error: `No RO counter found for type "${cardCode}". Check Workshop Settings.` });
                }
                const counter = counterRes.recordset[0].CurrentCounter;
                const generatedRoNumber = `${cardCode}-${String(counter).padStart(4, '0')}`;

                const receiptDt = ReceiptDate || new Date();

                const insertRes = await transaction.request()
                    .input('no', sql.NVarChar(100), generatedRoNumber)
                    .input('jobCode', sql.NVarChar(50), jobCode)
                    .input('jobCardDate', sql.DateTime, receiptDt)
                    .input('createdBy', sql.Int, req.user?.userId || null)
                    .input('createdByName', sql.NVarChar(100), req.user?.userName || '')
                    .input('jobTypeId', sql.Int, JobTypeId)
                    .input('orderTypeId', sql.Int, OrderTypeId || null)
                    .input('endUserId', sql.Int, EndUserID)
                    .input('regNo', sql.NVarChar(150), VehicleRegNo)
                    .input('chassis', sql.NVarChar(150), ChasisNo)
                    .input('engine', sql.NVarChar(150), EngineNo)
                    .input('brand', sql.Int, BrandCode || null)
                    .input('version', sql.NVarChar(150), VersionCode)
                    .input('vehicle', sql.NVarChar(150), VehicleCode)
                    .input('km', sql.Decimal(18,2), KiloMeter || 0)
                    .input('millage', sql.Decimal(18,2), Millage || 0)
                    .input('receipt', sql.DateTime, receiptDt)
                    .input('promised', sql.DateTime, PromisedDate || null)
                    .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                    .input('payType', sql.NVarChar(50), PaymentType || 'Cash')
                    .input('payCO', sql.NVarChar(100), PaymentCO || null)
                    .input('payBankId', sql.Int, PaymentBankID || null)
                    .input('fuel', sql.NVarChar(20), FuelLevel || '')
                    .input('voc', sql.NVarChar(sql.MAX), VOCRemarks || '')
                    .input('custType', sql.NVarChar(20), CustomerType || 'Walk-in')
                    .input('partyId', sql.Int, PartyID || null)
                    .input('companyId', sql.Int, 1)
                    .input('pmType', sql.NVarChar(50), PMType || 'None')
                    .input('advisor', sql.NVarChar(100), ServiceAdvisor || null)
                    .input('advisorId', sql.Int, ServiceAdvisorID ? parseInt(ServiceAdvisorID) : null)
                    .input('repeatROID', sql.Int, RepeatROID || null)
                    .input('batteryNo', sql.NVarChar(50), BatteryNo || null)
                    .input('color', sql.NVarChar(100), VehicleColor || null)
                    .input('isEst', sql.Bit, IsEstimatedRO ? 1 : 0)
                    .input('estRONo', sql.NVarChar(50), EstimatedRONo || null)
                    .input('approvedBy', sql.NVarChar(100), ApprovedBy || null)
                    .input('revisedDel', sql.DateTime, RevisedDelivery || null)
                    .input('jobResult', sql.NVarChar(20), JobResult || 'No Fixed')
                    .input('isFIR', sql.Bit, IsFIR ? 1 : 0)
                    .input('bringByType', sql.NVarChar(50), BringByType || 'Self')
                    .input('bringByName', sql.NVarChar(100), BringByName || null)
                    .input('bringByMobile', sql.NVarChar(20), BringByMobile || null)
                    .input('deliveredTo', sql.NVarChar(100), DeliveredTo || null)
                    .input('delivMobile', sql.NVarChar(20), DeliveryMobile || null)
                    .input('deliveredAt', sql.DateTime, DeliveredAt || null)
                    .input('careOffId', sql.Int, CareOffID || null)
                    .input('careOffName', sql.NVarChar(100), CareOffName || null)
                    .input('dqirNo', sql.NVarChar(50), DQIRNo || null)
                    .input('checkedById', sql.Int, CheckedByID || null)
                    .input('checkedByName', sql.NVarChar(100), CheckedByName || null)
                    .input('confirmById', sql.Int, ConfirmByID || null)
                    .input('confirmByName', sql.NVarChar(100), ConfirmByName || null)
                    .input('wacResults', sql.NVarChar(sql.MAX), WACResults || null)
                    .query(`INSERT INTO Addata_JobCardInfo
                        (JobCardNo, jobCode, JobCardDate, JobTypeId, OrderTypeId, EndUserID, VehicleRegNo, ChasisNo, EngineNo,
                         BrandCode, VersionCode, VehicleCode, KiloMeter, Millage,
                         ReceiptDate, PromisedDate, Remarks, Status, JobStatus,
                         FuelLevel, VOCRemarks, CustomerType, PartyID, PaymentCO, PaymentBankID,
                         PMType, ServiceAdvisor, ServiceAdvisorID, RepeatROID, BatteryNo, VehicleColor,
                         IsEstimatedRO, EstimatedRONo, ApprovedBy, RevisedDelivery,
                         JobResult, IsFIR, BringByType, BringByName, BringByMobile,
                         DeliveredTo, DeliveryMobile, DeliveredAt,
                         CareOffID, CareOffName,
                         DQIRNo, CheckedByID, CheckedByName, ConfirmByID, ConfirmByName, WACResults,
                         CompanyID, EntryUserDateTime, CreatedBy, CreatedByName)
                        OUTPUT INSERTED.JobCardId
                        VALUES (@no, @jobCode, @jobCardDate, @jobTypeId, @orderTypeId, @endUserId, @regNo, @chassis, @engine,
                                @brand, @version, @vehicle, @km, @millage,
                                @receipt, @promised, @remarks, @payType, 0,
                                @fuel, @voc, @custType, @partyId, @payCO, @payBankId,
                                @pmType, @advisor, @advisorId, @repeatROID, @batteryNo, @color,
                                @isEst, @estRONo, @approvedBy, @revisedDel,
                                @jobResult, @isFIR, @bringByType, @bringByName, @bringByMobile,
                                @deliveredTo, @delivMobile, @deliveredAt,
                                @careOffId, @careOffName,
                                @dqirNo, @checkedById, @checkedByName, @confirmById, @confirmByName, @wacResults,
                                @companyId, GETDATE(), @createdBy, @createdByName)`);

                const newId = insertRes.recordset[0].JobCardId;

                for (const item of effectiveItems) {
                    const discAmtVal = computeLineDiscAmt(item);
                    const tax = snapshotTax(item.Price, discAmtVal, pstRate);
                    await new sql.Request(transaction)
                        .input('jcId', sql.Int, newId)
                        .input('remarks', sql.NVarChar(sql.MAX), item.WorkDescription)
                        .input('price', sql.Decimal(18, 2), item.Price || 0)
                        .input('discount', sql.Decimal(18, 3), Number(item.Discount) || 0)
                        .input('discAmt', sql.Decimal(18, 3), discAmtVal)
                        .input('discType', sql.NVarChar(10), item.DiscType || null)
                        .input('taxRate', sql.Decimal(8, 4), tax.taxRate)
                        .input('taxAmount', sql.Decimal(18, 2), tax.taxAmount)
                        .query('INSERT INTO Addata_JobCardInfoDetail (JobCardId, Remarks, Price, Discount, DiscAmt, DiscType, TaxRate, TaxAmount) VALUES (@jcId, @remarks, @price, @discount, @discAmt, @discType, @taxRate, @taxAmount)');
                }

                if (Accessories && Array.isArray(Accessories)) {
                    for (const acc of Accessories) {
                        await new sql.Request(transaction)
                            .input('jcId', sql.Int, newId)
                            .input('accId', sql.Int, acc.AccessoryID)
                            .input('chk', sql.Bit, acc.IsChecked ? 1 : 0)
                            .input('qty', sql.Int, acc.Qty || 0)
                            .query('INSERT INTO dms_JobCardAccessories (JobCardID,AccessoryID,IsChecked,Qty) VALUES (@jcId,@accId,@chk,@qty)');
                    }
                }

                if (DamageMarks && Array.isArray(DamageMarks)) {
                    for (const mark of DamageMarks) {
                        await new sql.Request(transaction)
                            .input('jcId', sql.Int, newId)
                            .input('x', sql.Decimal(6,3), mark.XPct)
                            .input('y', sql.Decimal(6,3), mark.YPct)
                            .input('note', sql.NVarChar(200), mark.Note || null)
                            .input('by', sql.Int, req.user?.userId || null)
                            .query('INSERT INTO dms_DamageMarks (JobCardID, XPct, YPct, Note, CreatedBy) VALUES (@jcId, @x, @y, @note, @by)');
                    }
                }

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
    } catch (err) { console.error(err); res.status(400).json({ error: err.message }); }
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
        const { SubletJobDetailID, JobCardId, VendorID, Remarks, InvoiceAmount, PayableAmount, SubletJobDate } = req.body;
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
                .input('date', sql.DateTime, SubletJobDate || new Date())
                .input('taxRate', sql.Decimal(8,4), tax.taxRate)
                .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
                .query(`UPDATE Addata_JobCardInfoSubletJobDetail SET
                    VendorID=@vendor, Remarks=@remarks, InvoiceAmount=@invoice, PayableAmount=@payable, SubletJobDate=@date,
                    TaxRate=@taxRate, TaxAmount=@taxAmount
                    WHERE SubletJobDetailID=@id`);
            res.json({ message: 'Sublet updated' });
        } else {
            const result = await pool.request()
                .input('jcId', sql.Int, JobCardId)
                .input('vendor', sql.Int, VendorID || null)
                .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('invoice', sql.Decimal(18,2), InvoiceAmount || 0)
                .input('payable', sql.Decimal(18,2), PayableAmount || 0)
                .input('date', sql.DateTime, SubletJobDate || new Date())
                .input('taxRate', sql.Decimal(8,4), tax.taxRate)
                .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
                .query(`INSERT INTO Addata_JobCardInfoSubletJobDetail
                    (JobCardId, VendorID, Remarks, InvoiceAmount, PayableAmount, SubletJobDate, TaxRate, TaxAmount)
                    OUTPUT INSERTED.SubletJobDetailID
                    VALUES (@jcId, @vendor, @remarks, @invoice, @payable, @date, @taxRate, @taxAmount)`);
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

exports.issuePartsToJobCard = async (req, res) => {
    try {
        const { JobCardId, JobCardNo, Items, Remarks } = req.body;
        const pool = await getPool();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        try {
            const finCheck = await transaction.request()
                .input('jcId', sql.Int, JobCardId)
                .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@jcId');
            if (finCheck.recordset[0]?.IsFinalized) {
                await transaction.rollback();
                return res.status(423).json({ error: 'Job Card is finalized. Cannot issue parts.' });
            }

            // 1. Create issue header
            const countRes = await transaction.request().query('SELECT ISNULL(MAX(IssueNo), 0) + 1 AS NextNo FROM data_StockIssuetoJobCard');
            const nextNo = countRes.recordset[0].NextNo;

            const insertRes = await transaction.request()
                .input('issueNo', sql.Int, nextNo)
                .input('issueDate', sql.Date, new Date())
                .input('jobCardId', sql.Int, JobCardId)
                .input('jobCardNo', sql.NVarChar(50), JobCardNo)
                .input('remarks', sql.NVarChar(sql.MAX), Remarks)
                .input('companyId', sql.Int, 1)
                .query(`INSERT INTO data_StockIssuetoJobCard
                    (IssueNo, IssueDate, JobCardId, JobCardNo, Remarks, CompanyID, EntryUserDateTime)
                    OUTPUT INSERTED.StockIssueID
                    VALUES (@issueNo, @issueDate, @jobCardId, @jobCardNo, @remarks, @companyId, GETDATE())`);

            const issueId = insertRes.recordset[0].StockIssueID;

            // 2. Insert issue detail lines (with GST + landed cost snapshot per §14.4 / §14.6)
            let gstRate = 0;
            try { gstRate = await resolveRate('GST'); } catch (e) { console.warn('GST rate not configured:', e.message); }

            for (const item of Items) {
                // Resolve unit landed cost from InventItems (WeightedRate fallback to ItemPurchasePrice)
                const costRes = await new sql.Request(transaction)
                    .input('iid', sql.Int, item.ItemId)
                    .query('SELECT ISNULL(WeightedRate, ItemPurchasePrice) AS cost FROM InventItems WHERE ItemId=@iid');
                const unitCost = costRes.recordset[0]?.cost ?? 0;

                const qty = Number(item.Quantity) || 0;
                const rate = Number(item.Rate) || 0;
                const discAmtVal = Number(item.DiscAmt) || 0;
                const gross = rate * qty;
                const tax = snapshotTax(gross, discAmtVal, gstRate);

                await new sql.Request(transaction)
                    .input('issueId', sql.Int, issueId)
                    .input('itemId', sql.Int, item.ItemId)
                    .input('qty', sql.Numeric(18,2), qty)
                    .input('rate', sql.Numeric(18,2), rate)
                    .input('issueQty', sql.Numeric(18,2), qty)
                    .input('jobCardId', sql.Int, JobCardId)
                    .input('taxRate', sql.Decimal(8,4), tax.taxRate)
                    .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
                    .input('unitCost', sql.Decimal(18,4), unitCost)
                    .input('discount', sql.Decimal(18,3), Number(item.Discount) || 0)
                    .input('discAmt', sql.Decimal(18,3), discAmtVal)
                    .query(`INSERT INTO data_StockIssuetoJobCardDetail
                        (StockIssueID, ItemId, Quantity, StockRate, ItemRate, IssueQuantity, JobCardId,
                         TaxRate, TaxAmount, UnitLandedCost, Discount, DiscAmt)
                        VALUES (@issueId, @itemId, @qty, @rate, @rate, @issueQty, @jobCardId,
                                @taxRate, @taxAmount, @unitCost, @discount, @discAmt)`);
            }

            // 3. Deduct stock in inventory ledger
            const ioNoRes = await transaction.request().query('SELECT ISNULL(MAX(StockIONo), 0) + 1 AS NextNo FROM data_StockInOutInfo');
            const ioNo = ioNoRes.recordset[0].NextNo;

            const ioRes = await transaction.request()
                .input('ioNo', sql.Int, ioNo)
                .input('ioDate', sql.Date, new Date())
                .input('issueId', sql.Int, issueId)
                .input('companyId', sql.Int, 1)
                .query(`INSERT INTO data_StockInOutInfo
                    (StockIONo, StockIODate, StockType, IssuanceID, CompanyID, EntryUserDateTime, IsTaxable, ReadOnly)
                    OUTPUT INSERTED.StockIOID
                    VALUES (@ioNo, @ioDate, 'Issue', @issueId, @companyId, GETDATE(), 0, 0)`);

            const ioId = ioRes.recordset[0].StockIOID;

            for (const item of Items) {
                await transaction.request()
                    .input('ioId', sql.Int, ioId)
                    .input('itemId', sql.Int, item.ItemId)
                    .input('qty', sql.Numeric(18,2), -Math.abs(item.Quantity))
                    .input('rate', sql.Numeric(18,2), item.Rate)
                    .query(`INSERT INTO data_StockInOutDetail (StockIOID, ItemId, Quantity, StockRate)
                            VALUES (@ioId, @itemId, @qty, @rate)`);
            }

            await transaction.commit();
            res.status(201).json({ message: 'Parts issued successfully', StockIssueID: issueId });
        } catch (err) { await transaction.rollback(); throw err; }
    } catch (err) { console.error(err); res.status(400).json({ error: err.message }); }
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
            .input('startTime', sql.DateTime, JobStartTime ? new Date(JobStartTime) : null)
            .input('endTime', sql.DateTime, JobEndTime ? new Date(JobEndTime) : null)
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
