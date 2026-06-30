/**
 * Gate Pass controller — issue and audit gate passes for workshop JCs
 * and store sales. Rule logic lives in services/gatePassService.js.
 */
const { sql, getPool } = require('../config/db');
const { checkEligibility } = require('../services/gatePassService');

// Look up the internal id from the user-typed document number.
// JOBCARD     → Addata_JobCardInfo.JobCardNo  (e.g. "B&P-0001")
// STORE_SALE  → data_StoreSaleInfo.InvoiceNo
// Numeric input also accepted as a direct id fallback.
async function resolveDocId({ docType, docNo, docId }) {
    if (docId && Number.isFinite(Number(docId))) return Number(docId);
    if (!docNo) throw new Error('docNo is required.');
    const pool = await getPool();
    const trimmed = String(docNo).trim();
    if (docType === 'JOBCARD') {
        const r = await pool.request()
            .input('no', sql.NVarChar(50), trimmed)
            .query(`SELECT JobCardId FROM Addata_JobCardInfo WHERE JobCardNo=@no`);
        if (!r.recordset.length) throw new Error(`Job Card "${trimmed}" not found.`);
        return r.recordset[0].JobCardId;
    } else if (docType === 'STORE_SALE') {
        const r = await pool.request()
            .input('no', sql.NVarChar(50), trimmed)
            .query(`SELECT SaleID FROM data_StoreSaleInfo WHERE InvoiceNo=@no`);
        if (!r.recordset.length) throw new Error(`Store Sale invoice "${trimmed}" not found.`);
        return r.recordset[0].SaleID;
    }
    throw new Error("docType must be 'JOBCARD' or 'STORE_SALE'.");
}

// GET /api/gatepass/check?docType=JOBCARD&docNo=B%26P-0001  (docId still honored)
exports.check = async (req, res) => {
    try {
        const { docType, docNo, docId } = req.query;
        const resolvedId = await resolveDocId({ docType, docNo, docId });
        const report = await checkEligibility({ docType, docId: resolvedId });
        // Surface any existing active gate pass to discourage re-issuance
        const pool = await getPool();
        const existing = await pool.request()
            .input('dt', sql.NVarChar(20), docType)
            .input('di', sql.Int,           resolvedId)
            .query(`SELECT GatePassID, GatePassNo, IssuedAt, IssuedByName, PassReason
                    FROM dms_GatePasses
                    WHERE DocType=@dt AND DocID=@di AND RevokedAt IS NULL`);
        report.existingPass = existing.recordset[0] || null;
        res.json(report);
    } catch (err) {
        console.error('gatePass.check:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/gatepass/issue   body: { docType, docNo (or docId), notes? }
exports.issue = async (req, res) => {
    const { docType, docNo, docId, notes } = req.body || {};
    const resolvedId = await resolveDocId({ docType, docNo, docId });
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Re-run eligibility inside the transaction so concurrent payment posts
        // can't sneak past a check that has gone stale.
        const report = await checkEligibility({ docType, docId: resolvedId });
        if (!report.canIssue) {
            const err = new Error(report.blockers.map(b => b.message).join(' / '));
            err.statusCode = 409;
            throw err;
        }

        // Guard against duplicate active pass per (DocType, DocID).
        const dup = await new sql.Request(tx)
            .input('dt', sql.NVarChar(20), docType)
            .input('di', sql.Int, resolvedId)
            .query(`SELECT TOP 1 GatePassNo FROM dms_GatePasses
                    WHERE DocType=@dt AND DocID=@di AND RevokedAt IS NULL`);
        if (dup.recordset.length) {
            const err = new Error(`Active gate pass already exists: ${dup.recordset[0].GatePassNo}.`);
            err.statusCode = 409;
            throw err;
        }

        const seq = await new sql.Request(tx).query(
            `SELECT NEXT VALUE FOR dbo.seq_GatePassNo AS n`);
        const gpNo = `GP-${String(seq.recordset[0].n).padStart(4, '0')}`;

        const ins = await new sql.Request(tx)
            .input('gpNo',   sql.NVarChar(50),  gpNo)
            .input('dt',     sql.NVarChar(20),  docType)
            .input('di',     sql.Int,           resolvedId)
            .input('cust',   sql.NVarChar(200), report.doc.customerName || null)
            .input('reg',    sql.NVarChar(100), report.doc.vehicleRegNo || null)
            .input('chs',    sql.NVarChar(100), report.doc.vehicleChassis || null)
            .input('reason', sql.NVarChar(40),  report.passReason)
            .input('inv',    sql.Decimal(18,2), report.amountInvoiced)
            .input('rcv',    sql.Decimal(18,2), report.amountReceived)
            .input('modes',  sql.NVarChar(200), (report.paymentModes || []).join(', ') || null)
            .input('notes',  sql.NVarChar(500), notes || null)
            .input('iby',    sql.Int,           req.user?.userId || null)
            .input('ibyN',   sql.NVarChar(100), req.user?.userName || 'system')
            .query(`INSERT INTO dms_GatePasses
                        (GatePassNo, DocType, DocID, CustomerName, VehicleRegNo, VehicleChassis,
                         PassReason, AmountInvoiced, AmountReceived, PaymentModes, Notes,
                         IssuedBy, IssuedByName)
                    OUTPUT INSERTED.GatePassID
                    VALUES (@gpNo, @dt, @di, @cust, @reg, @chs,
                            @reason, @inv, @rcv, @modes, @notes,
                            @iby, @ibyN)`);
        await tx.commit();
        res.json({ message: 'Gate pass issued.', GatePassID: ins.recordset[0].GatePassID, GatePassNo: gpNo });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('gatePass.issue:', err);
        res.status(err.statusCode || 400).json({ error: err.message });
    }
};

// POST /api/gatepass/:id/revoke   body: { reason }
exports.revoke = async (req, res) => {
    const gpId = parseInt(req.params.id);
    const { reason } = req.body || {};
    if (!Number.isFinite(gpId)) return res.status(400).json({ error: 'Invalid gate pass id.' });
    if (!reason || !reason.trim()) return res.status(400).json({ error: 'reason is required to revoke.' });
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id',   sql.Int,           gpId)
            .input('uby',  sql.Int,           req.user?.userId || null)
            .input('ubyN', sql.NVarChar(100), req.user?.userName || 'system')
            .input('rsn',  sql.NVarChar(500), reason.trim())
            .query(`UPDATE dms_GatePasses
                    SET RevokedAt=GETDATE(), RevokedBy=@uby, RevokedByName=@ubyN, RevokeReason=@rsn
                    WHERE GatePassID=@id AND RevokedAt IS NULL;
                    SELECT @@ROWCOUNT AS affected;`);
        if (!r.recordset[0].affected) {
            return res.status(404).json({ error: 'Gate pass not found or already revoked.' });
        }
        res.json({ message: 'Gate pass revoked.' });
    } catch (err) {
        console.error('gatePass.revoke:', err);
        res.status(400).json({ error: err.message });
    }
};

// GET /api/gatepass?from=&to=&docType=&q=
exports.list = async (req, res) => {
    try {
        const { from, to, docType, q } = req.query || {};
        const pool = await getPool();
        const r = await pool.request()
            .input('from',  sql.Date,         from || null)
            .input('to',    sql.Date,         to   || null)
            .input('dt',    sql.NVarChar(20), docType || null)
            .input('q',     sql.NVarChar(100), q ? `%${q}%` : null)
            .query(`SELECT TOP 500 *
                    FROM dms_GatePasses
                    WHERE (@from IS NULL OR IssuedAt >= @from)
                      AND (@to   IS NULL OR IssuedAt <  DATEADD(day, 1, @to))
                      AND (@dt   IS NULL OR DocType   = @dt)
                      AND (@q    IS NULL OR GatePassNo LIKE @q OR CustomerName LIKE @q
                                          OR VehicleRegNo LIKE @q OR VehicleChassis LIKE @q)
                    ORDER BY IssuedAt DESC, GatePassID DESC`);
        res.json(r.recordset);
    } catch (err) {
        console.error('gatePass.list:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/gatepass/:id   (for the printed slip)
exports.getOne = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`SELECT * FROM dms_GatePasses WHERE GatePassID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Gate pass not found.' });
        res.json(r.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};
