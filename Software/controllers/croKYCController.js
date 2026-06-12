/**
 * CRO KYC Flags (cro-module-design.md §17).
 *
 * Tags chronic problem cases (chassis / engine / customer) so Service Advisors
 * see a banner the next time the vehicle hits a JC form. Resolution requires
 * an audited acknowledgment from the Advisor and a resolution note from CRO.
 *
 * Endpoints:
 *   GET  /api/cro/kyc-flags                     — list (filters: open, search)
 *   GET  /api/cro/kyc-flags/active-for-chassis/:chasis — used by JobCardForm banner
 *   POST /api/cro/kyc-flags                     — raise a flag
 *   POST /api/cro/kyc-flags/:id/acknowledge     — advisor confirms they saw it
 *   POST /api/cro/kyc-flags/:id/resolve         — cro_admin closes the flag
 */
const { sql, getPool } = require('../config/db');

const VALID_FLAG_TYPES = new Set(['Chronic', 'PaymentRisk', 'Aggressive', 'VIP', 'Other']);

// GET /api/cro/kyc-flags?open=1&search=&type=
exports.list = async (req, res) => {
    try {
        const pool = await getPool();
        const r = pool.request();
        const conds = [];
        if (req.query.open === '1') conds.push('ResolvedAt IS NULL');
        if (req.query.type)         { r.input('t', sql.NVarChar(30), req.query.type); conds.push('FlagType=@t'); }
        if (req.query.search) {
            r.input('q', sql.NVarChar(200), `%${req.query.search}%`);
            conds.push('(ChasisNo LIKE @q OR EngineNo LIKE @q OR Notes LIKE @q)');
        }
        const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
        const result = await r.query(`
            SELECT FlagID, OriginalCustomerProfileID, ChasisNo, EngineNo, FlagType, Notes,
                   FlaggedByEmployeeID, FlaggedByName, FlaggedAt,
                   ResolvedAt, ResolvedByName, ResolutionNotes,
                   (SELECT COUNT(*) FROM dms_CRO_KYCFlags_Acknowledgments WHERE FlagID = f.FlagID) AS AckCount
            FROM dms_CRO_KYCFlags f
            ${where}
            ORDER BY CASE WHEN ResolvedAt IS NULL THEN 0 ELSE 1 END, FlaggedAt DESC
        `);
        res.json(result.recordset);
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// GET /api/cro/kyc-flags/active-for-chassis/:chasis — used by JobCardForm banner
exports.activeForChassis = async (req, res) => {
    try {
        const ch = (req.params.chasis || '').trim();
        if (!ch) return res.json({ flags: [] });
        const pool = await getPool();
        const r = await pool.request().input('cn', sql.NVarChar(50), ch).query(`
            SELECT FlagID, ChasisNo, EngineNo, FlagType, Notes,
                   FlaggedByName, FlaggedAt
            FROM dms_CRO_KYCFlags
            WHERE ChasisNo = @cn AND ResolvedAt IS NULL
            ORDER BY FlaggedAt DESC
        `);
        res.json({ flags: r.recordset });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/kyc-flags { ChasisNo, EngineNo?, OriginalCustomerProfileID?, FlagType, Notes }
exports.create = async (req, res) => {
    try {
        const b = req.body || {};
        if (!b.ChasisNo && !b.EngineNo && !b.OriginalCustomerProfileID) {
            return res.status(400).json({ error: 'Provide at least one of ChasisNo / EngineNo / OriginalCustomerProfileID.' });
        }
        if (!VALID_FLAG_TYPES.has(b.FlagType)) {
            return res.status(400).json({ error: `FlagType must be one of: ${[...VALID_FLAG_TYPES].join(', ')}` });
        }
        if (!b.Notes?.trim()) return res.status(400).json({ error: 'Notes are required.' });

        const pool = await getPool();
        const r = await pool.request()
            .input('cust', sql.Int, b.OriginalCustomerProfileID || null)
            .input('cn',   sql.NVarChar(50), b.ChasisNo || null)
            .input('en',   sql.NVarChar(50), b.EngineNo || null)
            .input('t',    sql.NVarChar(30), b.FlagType)
            .input('n',    sql.NVarChar(sql.MAX), b.Notes.trim())
            .input('eby',  sql.Int, req.user?.employeeId || null)
            .input('ebyN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_CRO_KYCFlags
                        (OriginalCustomerProfileID, ChasisNo, EngineNo, FlagType, Notes,
                         FlaggedByEmployeeID, FlaggedByName, FlaggedAt)
                    OUTPUT INSERTED.FlagID
                    VALUES (@cust, @cn, @en, @t, @n, @eby, @ebyN, GETDATE())`);
        res.status(201).json({ message: 'Flag raised', FlagID: r.recordset[0].FlagID });
    } catch (err) {
        console.error('KYC create:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/cro/kyc-flags/:id/acknowledge { JobCardID? }
exports.acknowledge = async (req, res) => {
    try {
        const id  = parseInt(req.params.id);
        const jc  = req.body?.JobCardID ? parseInt(req.body.JobCardID) : null;
        const pool = await getPool();
        await pool.request()
            .input('fid', sql.Int, id)
            .input('jc',  sql.Int, jc)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .input('empN', sql.NVarChar(100), req.user?.userName || null)
            .query(`INSERT INTO dms_CRO_KYCFlags_Acknowledgments
                        (FlagID, JobCardID, AdvisorEmployeeID, AdvisorName, AcknowledgedAt)
                    VALUES (@fid, @jc, @emp, @empN, GETDATE())`);
        res.json({ message: 'Acknowledged' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// POST /api/cro/kyc-flags/:id/resolve { ResolutionNotes }
exports.resolve = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const notes = req.body?.ResolutionNotes?.trim();
        if (!notes) return res.status(400).json({ error: 'ResolutionNotes is required.' });
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, id)
            .input('emp', sql.Int, req.user?.employeeId || null)
            .input('empN', sql.NVarChar(100), req.user?.userName || null)
            .input('rn', sql.NVarChar(sql.MAX), notes)
            .query(`UPDATE dms_CRO_KYCFlags
                    SET ResolvedAt=GETDATE(), ResolvedByEmployeeID=@emp, ResolvedByName=@empN, ResolutionNotes=@rn
                    OUTPUT INSERTED.FlagID
                    WHERE FlagID=@id AND ResolvedAt IS NULL`);
        if (!r.recordset.length) return res.status(409).json({ error: 'Flag not found or already resolved.' });
        res.json({ message: 'Resolved' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};

// DELETE /api/cro/kyc-flags/:id
exports.remove = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const pool = await getPool();
        // Acknowledgments cascade-delete via FK if set; otherwise clear them
        await pool.request().input('id', sql.Int, id).query(`DELETE FROM dms_CRO_KYCFlags_Acknowledgments WHERE FlagID=@id`);
        const r = await pool.request().input('id', sql.Int, id)
            .query(`DELETE FROM dms_CRO_KYCFlags OUTPUT DELETED.FlagID WHERE FlagID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Flag not found' });
        res.json({ message: 'Deleted' });
    } catch (err) { res.status(500).json({ error: err.message }); }
};
