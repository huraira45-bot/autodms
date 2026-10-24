const { sql, getPool } = require('../config/db');
const { normaliseCNIC, normaliseNTN, identityWarnings } = require('../services/salesCustomerIdentityService');
const fields = ['PartyName', 'CNIC', 'NTNNO', 'PhoneOne', 'AddressOne'];
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const snapshot = row => Object.fromEntries(['PartyID', ...fields].map(key => [key, row[key] ?? null]));
const isCustomerAdmin = user => user?.groupId === 1 || user?.modules?.includes('sales_admin_settings');
exports.requireAdmin = (req, res, next) => isCustomerAdmin(req.user) ? next() : res.status(403).json({ error: 'Sales customer editing requires an admin.' });
const bookingId = req => {
    const id = Number(req.params.id);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) fail('Invalid booking ID.');
    return id;
};
async function customer(request, id, lock = false) {
    const result = await request.input('id', sql.Int, id).query(`
        SELECT b.BookingID,b.Status,p.PartyID,p.PartyName,p.CNIC,p.NTNNO,p.PhoneOne,p.AddressOne
        FROM dms_SalesBookings b ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''}
        JOIN gen_PartiesInfo p ${lock ? 'WITH (UPDLOCK,HOLDLOCK)' : ''} ON p.PartyID=b.PartyID WHERE b.BookingID=@id`);
    if (!result.recordset[0]) fail('Booking or customer not found.', 404);
    return result.recordset[0];
}
exports.warnings = async (req, res) => {
    try {
        const id = req.query.excludeId == null ? null : Number(req.query.excludeId);
        if (id !== null && (!Number.isSafeInteger(id) || id <= 0)) fail('Invalid customer ID.');
        const pool = await getPool();
        res.json({ warnings: await identityWarnings(pool.request(), { CNIC: req.query.CNIC, NTNNO: req.query.NTNNO, excludeId: id }) });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
};
exports.get = async (req, res) => {
    try {
        if (!isCustomerAdmin(req.user)) fail('Sales customer editing requires an admin.', 403);
        const pool = await getPool(), row = await customer(pool.request(), bookingId(req));
        const links = await pool.request().input('party', sql.Int, row.PartyID)
            .query('SELECT COUNT(*) AS N FROM dms_SalesBookings WHERE PartyID=@party');
        res.json({ customer: snapshot(row), linkedBookings: links.recordset[0].N });
    } catch (error) { res.status(error.status || 500).json({ error: error.message }); }
};
exports.update = async (req, res) => {
    let tx;
    try {
        if (!isCustomerAdmin(req.user)) fail('Sales customer editing requires an admin.', 403);
        if (!Number.isInteger(req.user?.userId) || !req.user.userName) fail('An authenticated admin is required.', 401);
        const id = bookingId(req), body = req.body || {};
        if (Object.keys(body).some(key => ![...fields, 'Expected', 'Reason'].includes(key))) fail('Only customer name, CNIC, NTN, phone and address can be edited here.');
        for (const field of fields) if (!Object.hasOwn(body, field) || (body[field] != null && typeof body[field] !== 'string')) fail(`Provide ${field} as text or blank.`);
        const next = Object.fromEntries(fields.map(key => [key, body[key]?.trim() || null]));
        if (!next.PartyName || next.PartyName.length > 100) fail('Customer name is required (up to 100 characters).');
        if ((next.PhoneOne?.length || 0) > 50 || (next.AddressOne?.length || 0) > 4000) fail('Phone must be at most 50 characters and address at most 4000.');
        next.CNIC = normaliseCNIC(next.CNIC); next.NTNNO = normaliseNTN(next.NTNNO);
        if (typeof body.Reason !== 'string' || body.Reason.trim().length < 3 || body.Reason.trim().length > 500) fail('Enter an edit reason of 3 to 500 characters.');
        if (!body.Expected || typeof body.Expected !== 'object') fail('Reload the customer details before saving.');
        const pool = await getPool(); tx = new sql.Transaction(pool); await tx.begin();
        const row = await customer(new sql.Request(tx), id, true), before = snapshot(row);
        if (Object.keys(before).some(key => before[key] !== (body.Expected[key] ?? null))) fail('The customer details or booking customer changed. Reload before saving.', 409);
        const warnings = await identityWarnings(new sql.Request(tx), { ...next, excludeId: row.PartyID });
        if (fields.every(key => before[key] === next[key])) {
            await tx.rollback(); tx = null;
            return res.json({ message: 'No customer details changed.', customer: before, warnings });
        }
        await new sql.Request(tx).input('party', sql.Int, row.PartyID)
            .input('name', sql.VarChar(100), next.PartyName).input('cnic', sql.VarChar(50), next.CNIC)
            .input('ntn', sql.VarChar(50), next.NTNNO).input('phone', sql.VarChar(50), next.PhoneOne)
            .input('address', sql.VarChar(sql.MAX), next.AddressOne)
            .query(`UPDATE gen_PartiesInfo SET PartyName=@name,CNIC=@cnic,NTNNO=@ntn,PhoneOne=@phone,AddressOne=@address WHERE PartyID=@party`);
        const after = snapshot(await customer(new sql.Request(tx), id));
        await new sql.Request(tx).input('booking', sql.Int, id).input('party', sql.Int, row.PartyID)
            .input('old', sql.NVarChar(sql.MAX), JSON.stringify(before)).input('next', sql.NVarChar(sql.MAX), JSON.stringify(after))
            .input('uid', sql.Int, req.user.userId).input('name', sql.NVarChar(100), req.user.userName)
            .input('emp', sql.Int, req.user.employeeId || null).input('reason', sql.NVarChar(500), body.Reason.trim())
            .query(`INSERT INTO dms_SalesAuditLog (BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorUserID,ActorName,ActorEmployeeID,Notes)
                VALUES (@booking,'Customer',@party,'CustomerDetailsEdited',@old,@next,@uid,@name,@emp,@reason)`);
        await tx.commit(); tx = null;
        res.json({ message: 'Customer details updated.', customer: after, warnings });
    } catch (error) {
        if (tx) { try { await tx.rollback(); } catch (_) {} }
        res.status(error.status || 500).json({ error: error.message });
    }
};
