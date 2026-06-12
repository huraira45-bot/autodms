/**
 * Party (Customer / Supplier / Insurance) master.
 *
 * `gen_PartiesInfo.PartyGLID` points to the *control* GL account a party posts against:
 *   - Customer / Insurance / Both → Trade Debtors  (GLCode 101005)
 *   - Supplier                    → Trade Creditors (GLCode 201001)
 *
 * Per-party balances live in dms_PartyLedger (subsidiary ledger). No per-party
 * sub-account is created in the COA — control accounts are leaves and the system
 * is intentionally designed around the subsidiary-ledger pattern (see §14.2).
 *
 * The legacy `sp_InsertParty` only accepts 7 columns; we bypass it and INSERT directly
 * so the full 20+ field set is captured. We keep `sp_InsertParty` untouched so any
 * legacy callers continue to work (CLAUDE.md rule).
 */
const { sql, getPool } = require('../config/db');

const CONTROL_GLCODES = {
    Customer:  '101005',  // Trade Debtors
    Insurance: '101005',  // Trade Debtors (until §14.10 split-receivable lands)
    Both:      '101005',  // Default to Debtors; AR/AP both still go via subsidiary ledger
    Supplier:  '201001'   // Trade Creditors
};

async function resolveControlGLCAID(pool, partyType) {
    const code = CONTROL_GLCODES[partyType];
    if (!code) throw new Error(`Unknown PartyType "${partyType}". Expected one of: ${Object.keys(CONTROL_GLCODES).join(', ')}.`);
    const r = await pool.request()
        .input('c', sql.NVarChar(50), code)
        .query(`SELECT GLCAID, GLCode, GLTitle FROM GLChartOFAccount WHERE GLCode=@c AND Status=1`);
    if (!r.recordset.length) throw new Error(`Control account ${code} for ${partyType} not found in COA.`);
    return r.recordset[0];
}

// Lightweight client-side echo of the same logic so the UI can preview the GL link.
exports.previewControlAccount = async (req, res) => {
    try {
        const t = req.query.type;
        if (!CONTROL_GLCODES[t]) return res.status(400).json({ error: 'Invalid type' });
        const pool = await getPool();
        const acct = await resolveControlGLCAID(pool, t);
        res.json(acct);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

exports.getParties = async (req, res) => {
    try {
        const { type, search } = req.query;
        const pool = await getPool();
        const r = pool.request();
        let where = `1=1`;
        if (type)   { r.input('t', sql.NVarChar(20), type);     where += ` AND p.PartyType = @t`; }
        if (search) { r.input('q', sql.NVarChar(200), `%${search}%`);
                      where += ` AND (p.PartyName LIKE @q OR p.CNIC LIKE @q OR p.PhoneOne LIKE @q OR p.NTNNO LIKE @q)`; }

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

exports.createParty = async (req, res) => {
    try {
        const b = req.body;
        const PartyType = b.PartyType || 'Customer';
        if (!b.PartyName?.trim()) return res.status(400).json({ error: 'PartyName is required.' });
        if (!CONTROL_GLCODES[PartyType]) return res.status(400).json({ error: `Invalid PartyType "${PartyType}".` });

        const cnic = normaliseCNIC(b.CNIC);
        const ntn  = normaliseNTN(b.NTNNO);

        const pool = await getPool();
        const control = await resolveControlGLCAID(pool, PartyType);

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
        if (!CONTROL_GLCODES[PartyType]) return res.status(400).json({ error: `Invalid PartyType "${PartyType}".` });

        const cnic = normaliseCNIC(b.CNIC);
        const ntn  = normaliseNTN(b.NTNNO);

        const pool = await getPool();
        const control = await resolveControlGLCAID(pool, PartyType);

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
