const { sql } = require('../config/db');
const fail = message => { throw Object.assign(new Error(message), { status: 400 }); };
function normaliseCNIC(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') fail('CNIC must be text.');
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length !== 13) fail('CNIC must be exactly 13 digits.');
    return `${digits.slice(0, 5)}-${digits.slice(5, 12)}-${digits.slice(12)}`;
}
function normaliseNTN(value) {
    if (value == null || value === '') return null;
    if (typeof value !== 'string') fail('NTN must be text.');
    const digits = value.replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length < 7 || digits.length > 9) fail('NTN must be 7–9 digits.');
    return digits;
}
async function identityWarnings(request, { CNIC, NTNNO, excludeId = null }) {
    const cnic = normaliseCNIC(CNIC)?.replace(/-/g, '') || null, ntn = normaliseNTN(NTNNO);
    if (!cnic && !ntn) return [];
    const result = await request.input('identityCnic', sql.VarChar(50), cnic)
        .input('identityNtn', sql.VarChar(50), ntn).input('identityExclude', sql.Int, excludeId)
        .query(`SELECT p.PartyID,p.PartyName,
            CAST(CASE WHEN @identityCnic IS NOT NULL AND ids.CNIC=@identityCnic THEN 1 ELSE 0 END AS bit) AS CNICMatch,
            CAST(CASE WHEN @identityNtn IS NOT NULL AND ids.NTN=@identityNtn THEN 1 ELSE 0 END AS bit) AS NTNMatch
            FROM gen_PartiesInfo p CROSS APPLY (SELECT
                REPLACE(REPLACE(p.CNIC,'-',''),' ','') AS CNIC,
                REPLACE(REPLACE(p.NTNNO,'-',''),' ','') AS NTN) ids
            WHERE (@identityExclude IS NULL OR p.PartyID<>@identityExclude)
              AND ((@identityCnic IS NOT NULL AND ids.CNIC=@identityCnic)
                OR (@identityNtn IS NOT NULL AND ids.NTN=@identityNtn)) ORDER BY p.PartyID`);
    return result.recordset.map(row => {
        const fields = [row.CNICMatch && 'CNIC', row.NTNMatch && 'NTN'].filter(Boolean);
        return { PartyID: row.PartyID, PartyName: row.PartyName, fields,
            message: `${fields.join(' / ')} already used by "${row.PartyName}" (#${row.PartyID}). You can still save this customer.` };
    });
}
module.exports = { normaliseCNIC, normaliseNTN, identityWarnings };
