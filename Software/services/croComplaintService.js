/**
 * CRO complaint creation — shared service.
 *
 * Used by:
 *   - controllers/croComplaintController.create (Source=Phone/WalkIn/Online/etc, direct CRO Workspace)
 *   - controllers/crdController.update          (Source=CRO_OutboundCall, when a CRD follow-up turns into a complaint)
 *
 * Validates inputs, looks up JC snapshot, resolves initial routing (Service Advisor or BU Manager),
 * generates the next ComplaintNo, inserts the complaint + initial 'Routed' action row.
 *
 * Caller may supply an existing transaction (for cross-table atomicity, e.g. CRD ↔ CRO bridge).
 * If `transaction` is omitted, a fresh transaction is created and committed here.
 *
 * Returns: { ComplaintID, ComplaintNo, AssignedEmployeeID, AssignedDepartmentID }
 *
 * Throws on validation failure (err.code='VALIDATION') or DB error.
 */
const { sql, getPool } = require('../config/db');
const { emitNotifications } = require('./croNotificationService');

const VALID_TYPES      = new Set(['Product', 'Service']);
const VALID_SOURCES    = new Set(['Phone', 'WalkIn', 'Online', 'WhatsApp', 'Inquiry', 'PostJobSurvey', 'CRO_OutboundCall']);
const VALID_SEVERITIES = new Set(['Low', 'Normal', 'High', 'Critical']);

function validationError(msg) {
    const e = new Error(msg);
    e.code = 'VALIDATION';
    return e;
}

async function generateComplaintNo(transaction) {
    const y = new Date().getFullYear();
    const r = await new sql.Request(transaction).query(
        `SELECT ISNULL(MAX(CAST(SUBSTRING(ComplaintNo, 10, 10) AS INT)), 0) + 1 AS nextNo
         FROM dms_CRO_Complaints
         WHERE ComplaintNo LIKE 'CMP-${y}-%'`
    );
    return `CMP-${y}-${String(r.recordset[0].nextNo).padStart(4, '0')}`;
}

async function writeAction(tx, complaintId, type, payload = {}) {
    await new sql.Request(tx)
        .input('cid',   sql.Int,           complaintId)
        .input('type',  sql.NVarChar(30),  type)
        .input('emp',   sql.Int,           payload.employeeId || null)
        .input('empN',  sql.NVarChar(100), payload.employeeName || null)
        .input('notes', sql.NVarChar(sql.MAX), payload.notes || null)
        .input('elB',   sql.TinyInt,       payload.escalationLevelBefore ?? null)
        .input('elA',   sql.TinyInt,       payload.escalationLevelAfter ?? null)
        .input('vdct',  sql.NVarChar(20),  payload.customerVerdict || null)
        .query(`INSERT INTO dms_CRO_ComplaintActions
                    (ComplaintID, ActionType, PerformedByEmployeeID, PerformedByName, Notes,
                     EscalationLevelBefore, EscalationLevelAfter, CustomerVerdict)
                VALUES (@cid, @type, @emp, @empN, @notes, @elB, @elA, @vdct)`);
}

async function resolveInitialAssignment(executor, jobCardId, complaintType) {
    const r = await executor.request()
        .input('jc', sql.Int, jobCardId)
        .query(`SELECT j.ServiceAdvisorID, j.JobTypeId,
                       jt.ManagerEmployeeID AS BUManagerEmpID,
                       e.DepartmentID AS BUManagerDeptID
                FROM Addata_JobCardInfo j
                LEFT JOIN gen_JobCardType jt ON j.JobTypeId = jt.JobCardTypeId
                LEFT JOIN gen_EmployeeInfo e  ON jt.ManagerEmployeeID = e.EmployeeID
                WHERE j.JobCardId = @jc`);
    const row = r.recordset[0] || {};
    const assignedEmp = (complaintType === 'Service')
        ? (row.ServiceAdvisorID || row.BUManagerEmpID || null)
        : (row.BUManagerEmpID || row.ServiceAdvisorID || null);
    return {
        AssignedEmployeeID: assignedEmp,
        AssignedDepartmentID: row.BUManagerDeptID || null,
        ServiceAdvisorID: row.ServiceAdvisorID || null,
        BUManagerEmployeeID: row.BUManagerEmpID || null,
    };
}

/**
 * Insert a CRO complaint. See module header.
 *
 * input: {
 *   JobCardID            : int (required)
 *   ComplaintType        : 'Product'|'Service' (required)
 *   Source               : one of VALID_SOURCES (required)
 *   Subject              : non-empty string (required)
 *   Description          : optional
 *   ContactName, ContactPhone : required strings
 *   Severity             : optional, default 'Normal'
 *   OriginalItemID       : optional
 * }
 * user: { userId, userName } — for CreatedBy attribution.
 * transaction: optional sql.Transaction — when supplied, this function uses it
 *              and does NOT commit/rollback. Caller owns the lifecycle.
 */
async function createComplaint(input, user, transaction = null) {
    const b = input || {};
    const errors = [];
    if (!b.JobCardID)                                    errors.push('JobCardID is required.');
    if (!VALID_TYPES.has(b.ComplaintType))               errors.push('ComplaintType must be Product|Service.');
    if (!VALID_SOURCES.has(b.Source))                    errors.push('Invalid Source.');
    if (!b.Subject?.trim())                              errors.push('Subject is required.');
    if (!b.ContactName?.trim())                          errors.push('ContactName is required.');
    if (!b.ContactPhone?.trim())                         errors.push('ContactPhone is required.');
    if (b.Severity && !VALID_SEVERITIES.has(b.Severity)) errors.push('Invalid Severity.');
    if (errors.length) throw validationError(errors.join(' '));

    const jobCardId = parseInt(b.JobCardID);
    const pool = await getPool();
    const own = !transaction;
    const tx = transaction || new sql.Transaction(pool);
    if (own) await tx.begin();

    try {
        // JC snapshot — inside the tx so we have consistent reads
        const jcRow = await new sql.Request(tx)
            .input('id', sql.Int, jobCardId)
            .query(`SELECT j.JobCardId, j.EndUserID, j.PartyID, j.ChasisNo, j.EngineNo,
                           cust.endUserName, cust.PhoneNo
                    FROM Addata_JobCardInfo j
                    LEFT JOIN addata_CustomerInfo cust ON j.EndUserID = cust.ProfileID
                    WHERE j.JobCardId = @id`);
        if (!jcRow.recordset.length) {
            throw validationError(`JobCard #${jobCardId} not found.`);
        }
        const jc = jcRow.recordset[0];

        // Routing — uses the same tx so it sees in-transaction state if relevant
        const routing = await resolveInitialAssignment(tx, jobCardId, b.ComplaintType);

        const complaintNo = await generateComplaintNo(tx);

        const ins = await new sql.Request(tx)
            .input('no',     sql.NVarChar(20),  complaintNo)
            .input('type',   sql.NVarChar(20),  b.ComplaintType)
            .input('source', sql.NVarChar(30),  b.Source)
            .input('subj',   sql.NVarChar(500), b.Subject.trim())
            .input('desc',   sql.NVarChar(sql.MAX), b.Description || null)
            .input('jcId',   sql.Int,           jobCardId)
            .input('itemId', sql.Int,           b.OriginalItemID || null)
            .input('prof',   sql.Int,           jc.EndUserID || null)
            .input('party',  sql.Int,           jc.PartyID || null)
            .input('cname',  sql.NVarChar(200), b.ContactName.trim())
            .input('cphone', sql.NVarChar(50),  b.ContactPhone.trim())
            .input('chasis', sql.NVarChar(50),  jc.ChasisNo || null)
            .input('engine', sql.NVarChar(50),  jc.EngineNo || null)
            .input('dept',   sql.Int,           routing.AssignedDepartmentID)
            .input('emp',    sql.Int,           routing.AssignedEmployeeID)
            .input('sev',    sql.NVarChar(10),  b.Severity || 'Normal')
            .input('cby',    sql.Int,           user?.userId || null)
            .input('cbyN',   sql.NVarChar(100), user?.userName || null)
            .query(`INSERT INTO dms_CRO_Complaints
                        (ComplaintNo, ComplaintType, Source, Subject, Description,
                         JobCardID, OriginalItemID, CustomerProfileID, PartyID,
                         ContactName, ContactPhone, ChasisNo, EngineNo,
                         AssignedDepartmentID, AssignedEmployeeID,
                         Severity, Status, CreatedBy, CreatedByName)
                    OUTPUT INSERTED.ComplaintID
                    VALUES (@no, @type, @source, @subj, @desc,
                            @jcId, @itemId, @prof, @party,
                            @cname, @cphone, @chasis, @engine,
                            @dept, @emp,
                            @sev, 'Assigned', @cby, @cbyN)`);
        const complaintId = ins.recordset[0].ComplaintID;

        await writeAction(tx, complaintId, 'Routed', {
            // PerformedByEmployeeID FK to gen_EmployeeInfo — use employeeId, not userId.
            employeeId: user?.employeeId,
            employeeName: user?.userName,
            notes: `Complaint filed via ${b.Source}; routed to ${routing.AssignedEmployeeID ? `employee #${routing.AssignedEmployeeID}` : 'unassigned'}.`,
            escalationLevelAfter: 0,
        });

        // L0 in-app notifications: fan out to Service Advisor + BU Manager.
        // Cumulative-chain design (§9) — they stay in the loop through L1/L2 escalations.
        const sevTag = b.Severity && b.Severity !== 'Normal' ? ` [${b.Severity}]` : '';
        await emitNotifications(
            tx,
            { ComplaintID: complaintId },
            [routing.ServiceAdvisorID, routing.BUManagerEmployeeID],
            {
                subject: `New complaint ${complaintNo} assigned${sevTag}`,
                body:    `${b.Subject.trim()} — filed via ${b.Source} by ${user?.userName || 'system'}. Contact: ${b.ContactName.trim()} (${b.ContactPhone.trim()}).`,
                sourceType: 'ComplaintOpened',
            },
        );

        if (own) await tx.commit();

        return {
            ComplaintID: complaintId,
            ComplaintNo: complaintNo,
            AssignedEmployeeID: routing.AssignedEmployeeID,
            AssignedDepartmentID: routing.AssignedDepartmentID,
        };
    } catch (err) {
        if (own) {
            try { await tx.rollback(); } catch {}
        }
        throw err;
    }
}

module.exports = {
    createComplaint,
    writeAction,
    generateComplaintNo,
    resolveInitialAssignment,
    VALID_TYPES,
    VALID_SOURCES,
    VALID_SEVERITIES,
};
