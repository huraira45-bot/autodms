/**
 * Job card creation and labour lines, shared by the desk Job Card form
 * (workshopController.saveJobCard) and the service tablet's signature step
 * (serviceIntakeController.signEstimate) — plan 2026-09-14, Phase 2.
 *
 * Moved here from saveJobCard's create branch so both paths number, store
 * and tax a job card identically. Everything runs inside the caller's
 * transaction; the caller commits or rolls back.
 */
const { sql } = require('../config/db');
const { computeLineDiscAmt } = require('../utils/careOffUtils');

// Pure helper: snapshot tax for a labour/sublet line per §14.4 (discount before tax).
// Returns { taxRate, taxAmount }.
const snapshotTax = (gross, discAmt, rate) => {
    const net = Math.max(0, (Number(gross) || 0) - (Number(discAmt) || 0));
    const taxAmount = Math.round((net * (rate / 100)) * 100) / 100;
    return { taxRate: rate, taxAmount };
};

// Frontend datetime-local inputs send "YYYY-MM-DDTHH:MM" with no timezone.
// If we hand that raw string to mssql it gets re-interpreted as server-local
// (Asia/Karachi) and shifts -5h before storage — combined with the frontend's
// old toISOString() shift that gave rows a 10-hour drift (owner report
// 2026-07-27). Wrap the string in a Date whose UTC face matches the intended
// wall clock, so mssql writes the literal HH:MM the operator picked.
const parseWallDateTime = (v) => {
    if (v == null || v === '') return null;
    if (v instanceof Date) return v;
    const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(String(v));
    if (!m) return new Date(v);
    return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
};

/** A refusal the caller should return to the user with statusCode. */
class JobCardSaveError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

// Workshop-floor fields a labour line may carry. Only written when present,
// so a line without them is inserted exactly as before.
const FLOOR_FIELDS = [
    ['BayNo',           'bayNo',   () => sql.NVarChar(20)],
    ['TechnicianId',    'techId',  () => sql.Int],
    ['PerformedByName', 'perfBy',  () => sql.NVarChar(100)],
    ['JobStartTime',    'startAt', () => sql.DateTime],
    ['JobEndTime',      'endAt',   () => sql.DateTime],
];

/**
 * Inserts one labour line with its PST snapshot.
 * item: { JobInfoId, WorkDescription, Price, Discount, DiscAmt, DiscType,
 *         and optionally BayNo, TechnicianId, PerformedByName, JobStartTime, JobEndTime }
 */
async function insertLabourLine(transaction, jobCardId, item, pstRate) {
    const discAmtVal = computeLineDiscAmt(item);
    const tax = snapshotTax(item.Price, discAmtVal, pstRate);
    const rq = new sql.Request(transaction)
        .input('jcId', sql.Int, jobCardId)
        .input('remarks', sql.NVarChar(sql.MAX), item.WorkDescription)
        .input('price', sql.Decimal(18, 2), item.Price || 0)
        .input('discount', sql.Decimal(18, 3), Number(item.Discount) || 0)
        .input('discAmt', sql.Decimal(18, 3), discAmtVal)
        .input('discType', sql.NVarChar(10), item.DiscType || null)
        .input('taxRate', sql.Decimal(8, 4), tax.taxRate)
        .input('taxAmount', sql.Decimal(18, 2), tax.taxAmount)
        // JobInfoId = the InventItems.ItemId of the labour service
        // (the labour catalog lives in InventItems with ItemType='Service').
        // Stored so campaign matching can detect which labour services
        // are on this JC, and so service-history reports can group by code.
        .input('jobInfoId', sql.Int, item.JobInfoId ? parseInt(item.JobInfoId) : null);

    const cols = ['JobCardId', 'Remarks', 'Price', 'Discount', 'DiscAmt', 'DiscType', 'TaxRate', 'TaxAmount', 'JobInfoId'];
    const vals = ['@jcId', '@remarks', '@price', '@discount', '@discAmt', '@discType', '@taxRate', '@taxAmount', '@jobInfoId'];
    for (const [col, param, type] of FLOOR_FIELDS) {
        if (item[col] != null && item[col] !== '') {
            rq.input(param, type(), item[col]);
            cols.push(col);
            vals.push('@' + param);
        }
    }
    await rq.query(`INSERT INTO Addata_JobCardInfoDetail (${cols.join(', ')}) VALUES (${vals.join(', ')})`);
}

/**
 * Reads a job card's current labour lines that carry bay, technician or
 * start/finish data, and returns a function that hands those fields to the
 * matching line of a re-save.
 *
 * The desk form re-saves a job card by deleting and re-inserting every labour
 * line, and it never sends these fields — so without this, any desk save
 * erased what the Job Controller or a bay screen had recorded. A line matches
 * on the same catalog service (JobInfoId), or on the same description for a
 * line without one; each previous line is used once.
 */
async function floorFieldCarrier(transaction, jobCardId) {
    const prev = (await new sql.Request(transaction)
        .input('id', sql.Int, jobCardId)
        .query(`SELECT JobInfoId, Remarks, BayNo, TechnicianId, PerformedByName, JobStartTime, JobEndTime
                FROM   Addata_JobCardInfoDetail
                WHERE  JobCardId = @id
                ORDER  BY DetailId`)).recordset
        .filter(p => p.BayNo || p.TechnicianId || p.PerformedByName || p.JobStartTime || p.JobEndTime);

    return (item) => {
        const jobInfoId = item.JobInfoId ? parseInt(item.JobInfoId) : null;
        const i = prev.findIndex(p => (jobInfoId
            ? p.JobInfoId === jobInfoId
            : !p.JobInfoId && (p.Remarks || '') === (item.WorkDescription || '')));
        if (i < 0) return item;
        const [p] = prev.splice(i, 1);
        const carried = { ...item };
        for (const [col] of FLOOR_FIELDS) {
            if (carried[col] == null || carried[col] === '') carried[col] = p[col];
        }
        return carried;
    };
}

/**
 * Creates a job card: RO number from dms_ROCounters, header, labour lines,
 * accessories and damage marks. Returns { JobCardId, JobCardNo }.
 * Throws JobCardSaveError for a duplicate Job Number or a job type with no
 * RO counter.
 */
async function createJobCardInTx(transaction, body, user, pstRate) {
    const { jobCode, DMSJobCardNo, JobTypeId, OrderTypeId, EndUserID, VehicleRegNo, ChasisNo, EngineNo,
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
            LabourItems } = body;

    const typeRes = await transaction.request()
        .input('jobTypeId', sql.Int, JobTypeId)
        .query('SELECT CardCode FROM gen_JobCardType WHERE JobCardTypeId = @jobTypeId');
    const cardCode = typeRes.recordset.length > 0 ? typeRes.recordset[0].CardCode : 'JC';

    const checkRes = await transaction.request()
        .input('jobCode', sql.NVarChar(50), jobCode)
        .query('SELECT JobCardId FROM Addata_JobCardInfo WHERE jobCode = @jobCode');

    if (checkRes.recordset.length > 0) {
        throw new JobCardSaveError('Job Number already exists. Please use a unique Job Number.');
    }

    const counterRes = await transaction.request()
        .input('cardCode', sql.NVarChar(10), cardCode)
        .query('UPDATE dms_ROCounters SET CurrentCounter = CurrentCounter + 1 OUTPUT INSERTED.CurrentCounter WHERE CardCode = @cardCode');
    if (!counterRes.recordset.length) {
        throw new JobCardSaveError(`No RO counter found for type "${cardCode}". Check Workshop Settings.`);
    }
    const counter = counterRes.recordset[0].CurrentCounter;
    const generatedRoNumber = `${cardCode}-${String(counter).padStart(4, '0')}`;

    const receiptDt = parseWallDateTime(ReceiptDate) || new Date();

    const insertRes = await transaction.request()
        .input('no', sql.NVarChar(100), generatedRoNumber)
        .input('jobCode', sql.NVarChar(50), jobCode)
        .input('dmsJobCardNo', sql.NVarChar(50), DMSJobCardNo || null)
        .input('jobCardDate', sql.DateTime, receiptDt)
        .input('createdBy', sql.Int, user?.userId || null)
        .input('createdByName', sql.NVarChar(100), user?.userName || '')
        .input('jobTypeId', sql.Int, JobTypeId)
        .input('orderTypeId', sql.Int, OrderTypeId || null)
        .input('endUserId', sql.Int, EndUserID)
        .input('regNo', sql.NVarChar(150), VehicleRegNo)
        .input('chassis', sql.NVarChar(150), ChasisNo)
        .input('engine', sql.NVarChar(150), EngineNo)
        .input('brand', sql.Int, BrandCode || null)
        .input('version', sql.NVarChar(300), VersionCode)
        .input('vehicle', sql.NVarChar(150), VehicleCode)
        .input('km', sql.Decimal(18,2), KiloMeter || 0)
        .input('millage', sql.Decimal(18,2), Millage || 0)
        .input('receipt', sql.DateTime, receiptDt)
        .input('promised', sql.DateTime, parseWallDateTime(PromisedDate))
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
        .input('revisedDel', sql.DateTime, parseWallDateTime(RevisedDelivery))
        .input('jobResult', sql.NVarChar(20), JobResult || 'No Fixed')
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
        .query(`INSERT INTO Addata_JobCardInfo
            (JobCardNo, jobCode, DMSJobCardNo, JobCardDate, JobTypeId, OrderTypeId, EndUserID, VehicleRegNo, ChasisNo, EngineNo,
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
            VALUES (@no, @jobCode, @dmsJobCardNo, @jobCardDate, @jobTypeId, @orderTypeId, @endUserId, @regNo, @chassis, @engine,
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

    for (const item of (LabourItems || [])) {
        await insertLabourLine(transaction, newId, item, pstRate);
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
                .input('by', sql.Int, user?.userId || null)
                .query('INSERT INTO dms_DamageMarks (JobCardID, XPct, YPct, Note, CreatedBy) VALUES (@jcId, @x, @y, @note, @by)');
        }
    }

    return { JobCardId: newId, JobCardNo: generatedRoNumber };
}

module.exports = {
    snapshotTax,
    parseWallDateTime,
    JobCardSaveError,
    insertLabourLine,
    floorFieldCarrier,
    createJobCardInTx,
};
