/**
 * Customer ↔ COA leaf wiring for sales-side bookings.
 *
 * Every customer in gen_PartiesInfo should map to a unique GL leaf under
 * 201002 "Customer Advances - Vehicle Parties" via PartyGLID. The customer's
 * pre-payment for a vehicle is a liability on our books (we owe them the
 * car until delivery), so 201002 — Current Liabilities — is the correct
 * parent. Leaf goes Cr while customer is paying in; Dr at delivery to settle.
 *
 * Suffixes 900-999 are reserved for system accounts under this parent
 * (e.g. 201002999 BOOKING_ADVANCE fallback, 201002998 Premium Deferred).
 * Customer auto-numbering only allocates 001-899.
 *
 * Operations:
 *   - GET  /api/sales/parties/:id/coa-status      → current link + warning
 *   - GET  /api/sales/coa/vehicle-party-leaves    → pick-list under 201002
 *   - POST /api/sales/parties/:id/link-coa        → assign an existing leaf
 *   - POST /api/sales/parties/:id/create-coa-leaf → auto-create + assign
 */
const { sql, getPool } = require('../config/db');

const PARENT_GLCODE = '201002';   // Customer Advances - Vehicle Parties
const RESERVED_SUFFIX_FROM = 900; // 9xx range reserved for system accounts

async function loadParent(pool) {
    const r = await pool.request().query(
        `SELECT GLCAID, GLCode, GLTitle, Companyid, AccountLevelOne, AccountLevelTwo, AccountlevelThree, GLType, GLNature
         FROM GLChartOFAccount WHERE GLCode='${PARENT_GLCODE}'`);
    if (!r.recordset.length) throw new Error(`Parent COA ${PARENT_GLCODE} (vehicle-party receivables) not found.`);
    return r.recordset[0];
}

// GET /api/sales/parties/:id/coa-status
exports.coaStatus = async (req, res) => {
    try {
        const partyId = parseInt(req.params.id);
        if (!partyId) return res.status(400).json({ error: 'Party id required.' });
        const pool = await getPool();
        const r = await pool.request().input('id', sql.Int, partyId).query(`
            SELECT p.PartyID, p.PartyName, p.PartyType, p.PartyGLID,
                   c.GLCode, c.GLTitle
            FROM gen_PartiesInfo p
            LEFT JOIN GLChartOFAccount c ON c.GLCAID = p.PartyGLID
            WHERE p.PartyID=@id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Party not found.' });
        const row = r.recordset[0];
        res.json({
            PartyID: row.PartyID,
            PartyName: row.PartyName,
            PartyType: row.PartyType,
            linked: !!row.PartyGLID,
            PartyGLID: row.PartyGLID,
            GLCode: row.GLCode,
            GLTitle: row.GLTitle,
        });
    } catch (err) {
        console.error('coaStatus:', err);
        res.status(500).json({ error: err.message });
    }
};

// GET /api/sales/coa/vehicle-party-leaves
// All L4 leaves under PARENT_GLCODE, excluding the reserved 9xx range
// (system accounts: BOOKING_ADVANCE, PREMIUM_DEFERRED). Each row carries a
// LinkedPartyID flag so the picker can grey-out leaves already taken.
exports.vehiclePartyLeaves = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT c.GLCAID, c.GLCode, c.GLTitle,
                   p.PartyID AS LinkedPartyID, p.PartyName AS LinkedPartyName
            FROM GLChartOFAccount c
            LEFT JOIN gen_PartiesInfo p ON p.PartyGLID = c.GLCAID
            WHERE c.GLCode LIKE '${PARENT_GLCODE}%'
              AND c.GLCode <> '${PARENT_GLCODE}'
              AND c.Status = 1 AND c.isParent = 0
              AND TRY_CAST(SUBSTRING(c.GLCode, ${PARENT_GLCODE.length} + 1, 10) AS INT) < ${RESERVED_SUFFIX_FROM}
            ORDER BY c.GLCode`);
        res.json(r.recordset);
    } catch (err) {
        console.error('vehiclePartyLeaves:', err);
        res.status(500).json({ error: err.message });
    }
};

// POST /api/sales/parties/:id/link-coa   body: { GLCAID }
exports.linkCoa = async (req, res) => {
    const partyId = parseInt(req.params.id);
    const glcaid = parseInt(req.body?.GLCAID);
    if (!partyId || !glcaid) return res.status(400).json({ error: 'Party id and GLCAID required.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        // Verify the leaf exists, is a leaf (not parent), and is under 102009
        const leaf = await new sql.Request(tx).input('id', sql.Int, glcaid).query(`
            SELECT GLCAID, GLCode, GLTitle, isParent FROM GLChartOFAccount WHERE GLCAID=@id`);
        if (!leaf.recordset.length) throw new Error('GL leaf not found.');
        if (leaf.recordset[0].isParent) throw new Error('Target must be a leaf, not a parent.');
        if (!leaf.recordset[0].GLCode.startsWith(PARENT_GLCODE)) {
            throw new Error(`Leaf must sit under ${PARENT_GLCODE} (vehicle-party receivables).`);
        }

        // Block re-use: each leaf can be linked to at most one party
        const taken = await new sql.Request(tx)
            .input('gl', sql.Int, glcaid)
            .input('pid', sql.Int, partyId)
            .query(`SELECT PartyID, PartyName FROM gen_PartiesInfo
                    WHERE PartyGLID=@gl AND PartyID<>@pid`);
        if (taken.recordset.length) {
            throw new Error(`This leaf is already linked to ${taken.recordset[0].PartyName}.`);
        }

        await new sql.Request(tx)
            .input('id', sql.Int, partyId)
            .input('gl', sql.Int, glcaid)
            .query(`UPDATE gen_PartiesInfo SET PartyGLID=@gl WHERE PartyID=@id`);

        await tx.commit();
        res.json({
            message: 'Customer linked to COA leaf.',
            GLCAID: glcaid, GLCode: leaf.recordset[0].GLCode, GLTitle: leaf.recordset[0].GLTitle,
        });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('linkCoa:', err);
        res.status(400).json({ error: err.message });
    }
};

// POST /api/sales/parties/:id/create-coa-leaf   body: { Title? }
// Auto-creates a leaf under 102009 with the next sequential code (102009XXX)
// and links it to the party. Title defaults to the party name.
exports.createCoaLeaf = async (req, res) => {
    const partyId = parseInt(req.params.id);
    if (!partyId) return res.status(400).json({ error: 'Party id required.' });

    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const partyR = await new sql.Request(tx).input('id', sql.Int, partyId).query(`
            SELECT PartyID, PartyName, PartyGLID FROM gen_PartiesInfo WHERE PartyID=@id`);
        if (!partyR.recordset.length) throw new Error('Party not found.');
        const party = partyR.recordset[0];
        if (party.PartyGLID) throw new Error('Party already linked to a COA leaf.');

        const parent = await loadParent(pool);
        const title = (req.body?.Title || party.PartyName || `Customer ${partyId}`).trim().slice(0, 200);

        // Allocate next L4 code under the parent, 001-899 only (9xx reserved).
        // Retry on unique-index violation so a concurrent linker can't slip a
        // duplicate past us (migration 059 adds the unique index on GLCode).
        let newCode = '';
        let newGLCAID = 0;
        for (let attempt = 0; attempt < 20 && !newGLCAID; attempt++) {
            const lastR = await new sql.Request(tx).query(`
                SELECT MAX(TRY_CAST(SUBSTRING(GLCode, ${PARENT_GLCODE.length} + 1, 10) AS INT)) AS MaxSuffix
                FROM GLChartOFAccount
                WHERE GLCode LIKE '${PARENT_GLCODE}%' AND GLCode <> '${PARENT_GLCODE}'
                  AND LEN(GLCode) > ${PARENT_GLCODE.length}
                  AND TRY_CAST(SUBSTRING(GLCode, ${PARENT_GLCODE.length} + 1, 10) AS INT) < ${RESERVED_SUFFIX_FROM}`);
            const nextSuffix = (Number(lastR.recordset[0].MaxSuffix) || 0) + 1 + attempt;
            if (nextSuffix >= RESERVED_SUFFIX_FROM) {
                throw new Error(`No more customer slots under ${PARENT_GLCODE} (000-${RESERVED_SUFFIX_FROM - 1} exhausted).`);
            }
            newCode = `${PARENT_GLCODE}${String(nextSuffix).padStart(3, '0')}`;

            try {
                const ins = await new sql.Request(tx)
                    .input('code', sql.NVarChar(50),  newCode)
                    .input('ttl',  sql.NVarChar(200), title)
                    .input('typ',  sql.NVarChar(50),  parent.GLType)
                    .input('nat',  sql.NVarChar(50),  parent.GLNature)
                    .input('co',   sql.Int,           parent.Companyid)
                    .input('a1',   sql.NVarChar(50),  parent.AccountLevelOne)
                    .input('a2',   sql.NVarChar(50),  parent.AccountLevelTwo)
                    .input('a3',   sql.NVarChar(50),  parent.AccountlevelThree)
                    .query(`INSERT INTO GLChartOFAccount
                                (GLCode, GLTitle, GLType, isParent, GLNature, Status, GLLevel, ReadOnly,
                                 Companyid, AccountLevelOne, AccountLevelTwo, AccountlevelThree, AccountLevelFour)
                            OUTPUT INSERTED.GLCAID
                            VALUES (@code, @ttl, @typ, 0, @nat, 1, 4, 0,
                                    @co, @a1, @a2, @a3, @code)`);
                newGLCAID = ins.recordset[0].GLCAID;
            } catch (insErr) {
                if (insErr.number !== 2601 && insErr.number !== 2627) throw insErr;
            }
        }
        if (!newGLCAID) throw new Error(`Could not allocate a free GLCode under ${PARENT_GLCODE} after 20 attempts.`);

        await new sql.Request(tx)
            .input('id', sql.Int, partyId)
            .input('gl', sql.Int, newGLCAID)
            .query(`UPDATE gen_PartiesInfo SET PartyGLID=@gl WHERE PartyID=@id`);

        await tx.commit();
        res.json({
            message: 'COA leaf created and linked.',
            GLCAID: newGLCAID, GLCode: newCode, GLTitle: title,
        });
    } catch (err) {
        try { await tx.rollback(); } catch {}
        console.error('createCoaLeaf:', err);
        res.status(400).json({ error: err.message });
    }
};
