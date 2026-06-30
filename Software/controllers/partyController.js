/**
 * Party (Customer / Supplier / Insurance) master.
 *
 * `gen_PartiesInfo.PartyGLID` points to the GL leaf account this party posts
 * against. The user PICKS the account at creation time — they're the canonical
 * source of "which sub-account in COA is this party". Transactions against
 * the party (job-card invoice, payment, GRN, etc.) hit this GL account, so
 * the party ledger and the GL balance stay reconciled by design.
 *
 * Eligible GL leaves: any L4 detail under Current Assets (1020xx) or Current
 * Liabilities (2010xx). This covers receivables / payables / advances. The
 * UI groups them by L3 parent so picking is fast.
 */
const { sql, getPool } = require('../config/db');

const PICKABLE_PARENT_PREFIXES = ['102', '201'];   // Current Assets + Current Liabilities

/**
 * GET /api/parties/coa-pickable
 * Returns L4 leaf accounts under Current Assets / Current Liabilities, grouped
 * by L3 parent so the frontend can render a sensible dropdown.
 */
exports.listPickableAccounts = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT c.GLCAID, c.GLCode, c.GLTitle, c.GLNature,
                   LEFT(c.GLCode, 6) AS ParentCode,
                   p.GLTitle AS ParentTitle
            FROM GLChartOFAccount c
            LEFT JOIN GLChartOFAccount p
                ON p.GLCode = LEFT(c.GLCode, 6) AND p.GLLevel = 3
            WHERE c.GLLevel = 4
              AND c.Status = 1
              AND (LEFT(c.GLCode, 3) = '102' OR LEFT(c.GLCode, 3) = '201')
            ORDER BY c.GLCode`);

        const grouped = {};
        for (const row of r.recordset) {
            const key = `${row.ParentCode} ${row.ParentTitle || ''}`.trim();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push({
                GLCAID:  row.GLCAID,
                GLCode:  row.GLCode,
                GLTitle: row.GLTitle,
                Nature:  row.GLNature === 1 ? 'Debit' : 'Credit',
            });
        }
        res.json({ groups: grouped });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

/**
 * Validate that a user-supplied PartyGLID is a real, active L4 leaf under an
 * allowed parent. Returns the account row for echoing back in the response.
 */
async function validatePartyGLID(pool, partyGLID) {
    if (!partyGLID) throw new Error('PartyGLID is required — pick the GL account this party posts against.');
    const r = await pool.request()
        .input('id', sql.Int, parseInt(partyGLID))
        .query(`SELECT GLCAID, GLCode, GLTitle, GLLevel, isParent, Status
                FROM GLChartOFAccount WHERE GLCAID = @id`);
    if (!r.recordset.length) throw new Error(`GL account #${partyGLID} not found.`);
    const acct = r.recordset[0];
    if (!acct.Status) throw new Error(`GL account ${acct.GLCode} is inactive.`);
    if (acct.isParent) throw new Error(`GL account ${acct.GLCode} is a group, not a leaf — pick a detail account.`);
    const prefix = acct.GLCode.substring(0, 3);
    if (!PICKABLE_PARENT_PREFIXES.includes(prefix)) {
        throw new Error(`GL account ${acct.GLCode} is not under a Current Asset / Current Liability — parties must post against receivables, payables, or advances.`);
    }
    return acct;
}

exports.getParties = async (req, res) => {
    try {
        const { type, search, business } = req.query;
        const pool = await getPool();
        const r = pool.request();
        let where = `1=1`;
        if (type)   { r.input('t', sql.NVarChar(20), type);     where += ` AND p.PartyType = @t`; }
        if (search) { r.input('q', sql.NVarChar(200), `%${search}%`);
                      where += ` AND (p.PartyName LIKE @q OR p.CNIC LIKE @q OR p.PhoneOne LIKE @q OR p.NTNNO LIKE @q)`; }
        // Optional business filter (?business=WORKSHOP|SALES|PROCUREMENT|SUBLET):
        // only parties mapped to that business via dms_PartyBusinessAccess are returned.
        // No row in the access table → party is hidden from that picker (strict opt-in).
        if (business) {
            r.input('biz', sql.NVarChar(20), business);
            where += ` AND EXISTS (SELECT 1 FROM dms_PartyBusinessAccess pba
                                   WHERE pba.PartyID = p.PartyID AND pba.BusinessKey = @biz)`;
        }

        const result = await r.query(`
            SELECT p.PartyID, p.PartyName, p.PartyType, p.PhoneOne, p.Email, p.CNIC, p.NTNNO,
                   p.AddressOne, p.ContactPerson, p.CreditLimit, p.PartyGLID,
                   c.GLCode AS PartyGLCode, c.GLTitle AS PartyGLTitle,
                   pg.PartyGroupID, pg.GroupName AS PartyGroupName
            FROM gen_PartiesInfo p
            LEFT JOIN GLChartOFAccount c ON p.PartyGLID = c.GLCAID
            LEFT JOIN gen_PartyGroup pg ON p.PartyGroupID = pg.PartyGroupID
            WHERE ${where}
            ORDER BY p.PartyID DESC
        `);
        res.json(result.recordset);
    } catch (err) {
        res.status(500).json({ error: 'Server Error', details: err.message });
    }
};

// GET /api/parties/business-access
// Returns the full matrix: every party with an array of BusinessKeys they're mapped to.
exports.getBusinessAccessMatrix = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT p.PartyID, p.PartyName, p.PartyType, p.PhoneOne, p.CreditLimit,
                   (SELECT STUFF((SELECT ',' + pba.BusinessKey
                                  FROM dms_PartyBusinessAccess pba
                                  WHERE pba.PartyID = p.PartyID FOR XML PATH('')), 1, 1, '')) AS Businesses
            FROM gen_PartiesInfo p
            ORDER BY p.PartyName`);
        const rows = r.recordset.map(row => ({
            ...row,
            Businesses: row.Businesses ? row.Businesses.split(',') : []
        }));
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/parties/business-access
// Body: { PartyID, BusinessKeys: ['WORKSHOP', 'SALES', ...] }
// Replaces this party's full access set.
exports.savePartyBusinessAccess = async (req, res) => {
    try {
        const partyId = parseInt(req.body.PartyID);
        const keys = Array.isArray(req.body.BusinessKeys) ? req.body.BusinessKeys : [];
        if (!Number.isFinite(partyId)) return res.status(400).json({ error: 'PartyID required' });
        const valid = new Set(['WORKSHOP', 'SALES', 'PROCUREMENT', 'SUBLET']);
        for (const k of keys) {
            if (!valid.has(k)) return res.status(400).json({ error: `Invalid BusinessKey: ${k}` });
        }
        const pool = await getPool();
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            await new sql.Request(tx).input('id', sql.Int, partyId)
                .query('DELETE FROM dms_PartyBusinessAccess WHERE PartyID = @id');
            for (const k of keys) {
                await new sql.Request(tx)
                    .input('id', sql.Int, partyId)
                    .input('k',  sql.NVarChar(20), k)
                    .input('by', sql.Int, req.user?.userId || null)
                    .query(`INSERT INTO dms_PartyBusinessAccess (PartyID, BusinessKey, GrantedByUserID)
                            VALUES (@id, @k, @by)`);
            }
            await tx.commit();
            res.json({ message: 'Access updated', PartyID: partyId, BusinessKeys: keys });
        } catch (e) { try { await tx.rollback(); } catch {} throw e; }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// POST /api/parties/business-access/grant-all
// Bootstrap helper — grants ALL businesses to ALL parties. Used once when first
// enabling the access module so the existing party set isn't immediately hidden.
exports.grantAllPartyBusinessAccess = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().input('by', sql.Int, req.user?.userId || null).query(`
            INSERT INTO dms_PartyBusinessAccess (PartyID, BusinessKey, GrantedByUserID)
            SELECT p.PartyID, k.BusinessKey, @by
            FROM gen_PartiesInfo p
            CROSS JOIN (VALUES ('WORKSHOP'), ('SALES'), ('PROCUREMENT'), ('SUBLET')) k(BusinessKey)
            WHERE NOT EXISTS (
                SELECT 1 FROM dms_PartyBusinessAccess pba
                WHERE pba.PartyID = p.PartyID AND pba.BusinessKey = k.BusinessKey
            );
            SELECT @@ROWCOUNT AS Inserted;`);
        res.json({ message: 'Granted all access', inserted: r.recordset[0].Inserted });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getParty = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request()
            .input('id', sql.Int, parseInt(req.params.id))
            .query(`
                SELECT p.*, c.GLCode AS PartyGLCode, c.GLTitle AS PartyGLTitle,
                       pg.GroupName AS PartyGroupName
                FROM gen_PartiesInfo p
                LEFT JOIN GLChartOFAccount c ON p.PartyGLID = c.GLCAID
                LEFT JOIN gen_PartyGroup pg ON p.PartyGroupID = pg.PartyGroupID
                WHERE p.PartyID = @id`);
        if (!r.recordset.length) return res.status(404).json({ error: 'Party not found' });
        res.json(r.recordset[0]);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getPartyGroups = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(
            `SELECT PartyGroupID, GroupName FROM gen_PartyGroup ORDER BY GroupName`);
        res.json(r.recordset);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// --- Validation helpers (boundary checks; design doc favours pragmatic, not exhaustive) ---
function normaliseCNIC(s) {
    if (!s) return null;
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    if (digits.length !== 13) throw new Error('CNIC must be exactly 13 digits.');
    return `${digits.slice(0,5)}-${digits.slice(5,12)}-${digits.slice(12)}`;
}
function normaliseNTN(s) {
    if (!s) return null;
    const digits = s.replace(/[^\d]/g, '');
    if (!digits) return null;
    if (digits.length < 7 || digits.length > 9) throw new Error('NTN must be 7–9 digits.');
    return digits;
}

const VALID_PARTY_TYPES = new Set(['Customer', 'Supplier', 'Insurance', 'Both']);

exports.createParty = async (req, res) => {
    try {
        const b = req.body;
        const PartyType = b.PartyType || 'Customer';
        if (!b.PartyName?.trim()) return res.status(400).json({ error: 'PartyName is required.' });
        if (!VALID_PARTY_TYPES.has(PartyType)) return res.status(400).json({ error: `Invalid PartyType "${PartyType}".` });

        const cnic = normaliseCNIC(b.CNIC);
        const ntn  = normaliseNTN(b.NTNNO);

        const pool = await getPool();
        const control = await validatePartyGLID(pool, b.PartyGLID);

        // Duplicate checks — phone (legacy SP behavior), CNIC, NTN
        const dup = await pool.request()
            .input('ph',   sql.VarChar(50), b.PhoneOne || null)
            .input('cnic', sql.VarChar(50), cnic)
            .input('ntn',  sql.VarChar(50), ntn)
            .query(`
                SELECT TOP 1
                    CASE
                        WHEN PhoneOne = @ph AND @ph IS NOT NULL THEN 'phone'
                        WHEN CNIC = @cnic AND @cnic IS NOT NULL THEN 'cnic'
                        WHEN NTNNO = @ntn AND @ntn IS NOT NULL THEN 'ntn'
                    END AS Conflict, PartyName
                FROM gen_PartiesInfo
                WHERE (PhoneOne = @ph AND @ph IS NOT NULL)
                   OR (CNIC     = @cnic AND @cnic IS NOT NULL)
                   OR (NTNNO    = @ntn  AND @ntn  IS NOT NULL)`);
        if (dup.recordset.length) {
            const d = dup.recordset[0];
            return res.status(409).json({ error: `${d.Conflict.toUpperCase()} already used by "${d.PartyName}".` });
        }

        const r = await pool.request()
            .input('PartyName',           sql.VarChar(100),    b.PartyName.trim())
            .input('PartyType',           sql.NVarChar(20),    PartyType)
            .input('PhoneOne',            sql.VarChar(50),     b.PhoneOne || null)
            .input('PhoneTwo',            sql.VarChar(50),     b.PhoneTwo || null)
            .input('Email',               sql.NVarChar(100),   b.Email || null)
            .input('CNIC',                sql.VarChar(50),     cnic)
            .input('NTNNO',               sql.VarChar(50),     ntn)
            .input('SaleTaxRegNo',        sql.VarChar(50),     b.SaleTaxRegNo || null)
            .input('AddressOne',          sql.VarChar(sql.MAX),b.AddressOne || null)
            .input('AddressTwo',          sql.VarChar(sql.MAX),b.AddressTwo || null)
            .input('CityNameManual',      sql.NVarChar(100),   b.CityNameManual || null)
            .input('ContactPerson',       sql.VarChar(100),    b.ContactPerson || null)
            .input('ContactPersonMobile', sql.NVarChar(50),    b.ContactPersonMobile || null)
            .input('ContactPersonEmail',  sql.VarChar(100),    b.ContactPersonEmail || null)
            .input('CreditLimit',         sql.Decimal(18,2),   b.CreditLimit ? parseFloat(b.CreditLimit) : null)
            .input('LicenseNo',           sql.NVarChar(50),    b.LicenseNo || null)
            .input('LicenseExpiryDate',   sql.DateTime,        b.LicenseExpiryDate || null)
            .input('PartyGroupID',        sql.Int,             b.PartyGroupID ? parseInt(b.PartyGroupID) : null)
            .input('Remarks',             sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('PartyGLID',           sql.Int,             control.GLCAID)
            .input('ReadOnly',            sql.Bit,             0)
            .query(`
                INSERT INTO gen_PartiesInfo
                    (PartyName, PartyType, PhoneOne, PhoneTwo, Email,
                     CNIC, NTNNO, SaleTaxRegNo,
                     AddressOne, AddressTwo, CityNameManual,
                     ContactPerson, ContactPersonMobile, ContactPersonEmail,
                     CreditLimit, LicenseNo, LicenseExpiryDate,
                     PartyGroupID, Remarks, PartyGLID, ReadOnly)
                OUTPUT INSERTED.PartyID
                VALUES (@PartyName, @PartyType, @PhoneOne, @PhoneTwo, @Email,
                        @CNIC, @NTNNO, @SaleTaxRegNo,
                        @AddressOne, @AddressTwo, @CityNameManual,
                        @ContactPerson, @ContactPersonMobile, @ContactPersonEmail,
                        @CreditLimit, @LicenseNo, @LicenseExpiryDate,
                        @PartyGroupID, @Remarks, @PartyGLID, @ReadOnly)`);

        res.status(201).json({
            message: 'Party created',
            PartyID: r.recordset[0].PartyID,
            PartyGLID: control.GLCAID,
            PartyGLCode: control.GLCode,
            PartyGLTitle: control.GLTitle
        });
    } catch (err) {
        console.error('createParty:', err);
        res.status(400).json({ error: err.message });
    }
};

exports.updateParty = async (req, res) => {
    try {
        const id = parseInt(req.params.id);
        const b = req.body;
        const PartyType = b.PartyType || 'Customer';
        if (!b.PartyName?.trim()) return res.status(400).json({ error: 'PartyName is required.' });
        if (!VALID_PARTY_TYPES.has(PartyType)) return res.status(400).json({ error: `Invalid PartyType "${PartyType}".` });

        const cnic = normaliseCNIC(b.CNIC);
        const ntn  = normaliseNTN(b.NTNNO);

        const pool = await getPool();
        const control = await validatePartyGLID(pool, b.PartyGLID);

        // Duplicate checks against OTHER parties
        const dup = await pool.request()
            .input('id',   sql.Int,         id)
            .input('ph',   sql.VarChar(50), b.PhoneOne || null)
            .input('cnic', sql.VarChar(50), cnic)
            .input('ntn',  sql.VarChar(50), ntn)
            .query(`
                SELECT TOP 1
                    CASE
                        WHEN PhoneOne = @ph AND @ph IS NOT NULL THEN 'phone'
                        WHEN CNIC = @cnic AND @cnic IS NOT NULL THEN 'cnic'
                        WHEN NTNNO = @ntn AND @ntn IS NOT NULL THEN 'ntn'
                    END AS Conflict, PartyName
                FROM gen_PartiesInfo
                WHERE PartyID <> @id
                  AND ((PhoneOne = @ph AND @ph IS NOT NULL)
                    OR (CNIC     = @cnic AND @cnic IS NOT NULL)
                    OR (NTNNO    = @ntn  AND @ntn  IS NOT NULL))`);
        if (dup.recordset.length) {
            const d = dup.recordset[0];
            return res.status(409).json({ error: `${d.Conflict.toUpperCase()} already used by "${d.PartyName}".` });
        }

        await pool.request()
            .input('id',                  sql.Int,             id)
            .input('PartyName',           sql.VarChar(100),    b.PartyName.trim())
            .input('PartyType',           sql.NVarChar(20),    PartyType)
            .input('PhoneOne',            sql.VarChar(50),     b.PhoneOne || null)
            .input('PhoneTwo',            sql.VarChar(50),     b.PhoneTwo || null)
            .input('Email',               sql.NVarChar(100),   b.Email || null)
            .input('CNIC',                sql.VarChar(50),     cnic)
            .input('NTNNO',               sql.VarChar(50),     ntn)
            .input('SaleTaxRegNo',        sql.VarChar(50),     b.SaleTaxRegNo || null)
            .input('AddressOne',          sql.VarChar(sql.MAX),b.AddressOne || null)
            .input('AddressTwo',          sql.VarChar(sql.MAX),b.AddressTwo || null)
            .input('CityNameManual',      sql.NVarChar(100),   b.CityNameManual || null)
            .input('ContactPerson',       sql.VarChar(100),    b.ContactPerson || null)
            .input('ContactPersonMobile', sql.NVarChar(50),    b.ContactPersonMobile || null)
            .input('ContactPersonEmail',  sql.VarChar(100),    b.ContactPersonEmail || null)
            .input('CreditLimit',         sql.Decimal(18,2),   b.CreditLimit ? parseFloat(b.CreditLimit) : null)
            .input('LicenseNo',           sql.NVarChar(50),    b.LicenseNo || null)
            .input('LicenseExpiryDate',   sql.DateTime,        b.LicenseExpiryDate || null)
            .input('PartyGroupID',        sql.Int,             b.PartyGroupID ? parseInt(b.PartyGroupID) : null)
            .input('Remarks',             sql.NVarChar(sql.MAX), b.Remarks || null)
            .input('PartyGLID',           sql.Int,             control.GLCAID)
            .query(`
                UPDATE gen_PartiesInfo SET
                    PartyName = @PartyName, PartyType = @PartyType,
                    PhoneOne = @PhoneOne, PhoneTwo = @PhoneTwo, Email = @Email,
                    CNIC = @CNIC, NTNNO = @NTNNO, SaleTaxRegNo = @SaleTaxRegNo,
                    AddressOne = @AddressOne, AddressTwo = @AddressTwo, CityNameManual = @CityNameManual,
                    ContactPerson = @ContactPerson, ContactPersonMobile = @ContactPersonMobile, ContactPersonEmail = @ContactPersonEmail,
                    CreditLimit = @CreditLimit, LicenseNo = @LicenseNo, LicenseExpiryDate = @LicenseExpiryDate,
                    PartyGroupID = @PartyGroupID, Remarks = @Remarks, PartyGLID = @PartyGLID
                WHERE PartyID = @id`);
        res.json({ message: 'Party updated', PartyGLID: control.GLCAID });
    } catch (err) {
        console.error('updateParty:', err);
        res.status(400).json({ error: err.message });
    }
};
