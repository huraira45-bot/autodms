const { sql } = require('../config/db');
const fail = (message, status = 400) => { throw Object.assign(new Error(message), { status }); };
const canManageRates = user => user?.groupId === 1 || user?.modules?.includes('sales_admin_settings');
function rateDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1753-01-01') fail('Enter a valid date (YYYY-MM-DD).');
    const date = new Date(value + 'T00:00:00.000Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) fail('Enter a valid calendar date.');
    return date;
}
function validateRate(input) {
    const variantId = Number(input.VariantID), amount = Number(input.AmountPerBooking);
    if (!Number.isSafeInteger(variantId) || variantId <= 0 || variantId > 2147483647) fail('Select a vehicle variant.');
    const from = rateDate(input.EffectiveFrom), to = rateDate(input.EffectiveTo);
    if (from > to) fail('To date must be on or after From date.');
    if (!['number','string'].includes(typeof input.AmountPerBooking) || !/^\d+(\.\d{1,2})?$/.test(String(input.AmountPerBooking).trim())
        || !Number.isFinite(amount) || amount < 0 || amount > 999999999999.99) fail('Enter an incentive amount of zero or more, with at most two decimals.');
    if (input.Notes != null && (typeof input.Notes !== 'string' || input.Notes.trim().length > 500)) fail('Notes must be at most 500 characters.');
    return { variantId, amount, from, to, notes: input.Notes?.trim() || null };
}
async function createRate(tx, input, user) {
    if (!canManageRates(user)) fail('Master incentive rate setup requires a sales Administrator.', 403);
    if (!Number.isInteger(user.userId) || !user.userName) fail('An authenticated user is required.', 401);
    const rate = validateRate(input);
    const variant = (await new sql.Request(tx).input('variant', sql.Int, rate.variantId)
        .query('SELECT VariantID FROM dms_VehicleVariant WITH(HOLDLOCK) WHERE VariantID=@variant')).recordset[0];
    if (!variant) fail('Vehicle variant not found.', 404);
    const overlap = (await new sql.Request(tx).input('variant', sql.Int, rate.variantId)
        .input('from', sql.Date, rate.from).input('to', sql.Date, rate.to)
        .query(`SELECT TOP(1) RateID,EffectiveFrom,EffectiveTo FROM dms_MasterIncentiveRates WITH(UPDLOCK,HOLDLOCK)
                WHERE VariantID=@variant AND EffectiveFrom<=@to AND EffectiveTo>=@from`)).recordset[0];
    if (overlap) fail(`The dates overlap existing rate #${overlap.RateID}. Choose a separate date range; previous rates are retained.`, 409);
    const saved = (await new sql.Request(tx).input('variant', sql.Int, rate.variantId)
        .input('from', sql.Date, rate.from).input('to', sql.Date, rate.to).input('amount', sql.Decimal(18, 2), rate.amount)
        .input('notes', sql.NVarChar(500), rate.notes).input('uid', sql.Int, user.userId).input('name', sql.NVarChar(100), user.userName)
        .query(`INSERT INTO dms_MasterIncentiveRates(VariantID,EffectiveFrom,EffectiveTo,AmountPerBooking,Notes,CreatedByUserID,CreatedByName)
                OUTPUT INSERTED.RateID VALUES(@variant,@from,@to,@amount,@notes,@uid,@name)`)).recordset[0];
    await new sql.Request(tx).input('id', sql.Int, saved.RateID).input('uid', sql.Int, user.userId)
        .input('name', sql.NVarChar(100), user.userName).input('notes', sql.NVarChar(500), rate.notes)
        .input('next', sql.NVarChar(sql.MAX), JSON.stringify({ VariantID: rate.variantId, EffectiveFrom: input.EffectiveFrom,
            EffectiveTo: input.EffectiveTo, AmountPerBooking: rate.amount, Notes: rate.notes }))
        .query(`INSERT INTO dms_SalesAuditLog(EntityType,EntityID,Action,NewValue,ActorUserID,ActorName,Notes)
                VALUES('MasterIncentiveRate',@id,'MasterIncentiveRateCreated',@next,@uid,@name,@notes)`);
    return { RateID: saved.RateID, message: 'Master incentive rate saved. Previous rates are retained.' };
}
async function endRate(tx, id, input, user) {
    if (!canManageRates(user)) fail('Master incentive rate setup requires a sales Administrator.', 403);
    if (!Number.isInteger(user.userId) || !user.userName) fail('An authenticated user is required.', 401);
    if (!Number.isSafeInteger(id) || id <= 0 || id > 2147483647) fail('Invalid rate ID.');
    const end = rateDate(input.EffectiveTo), expected = rateDate(input.ExpectedTo);
    if (typeof input.Reason !== 'string' || input.Reason.trim().length < 5 || input.Reason.trim().length > 500) fail('Enter a reason of 5 to 500 characters.');
    const row = (await new sql.Request(tx).input('id', sql.Int, id).query('SELECT * FROM dms_MasterIncentiveRates WITH(UPDLOCK,HOLDLOCK) WHERE RateID=@id')).recordset[0];
    if (!row) fail('Rate not found.', 404);
    if (row.EffectiveTo.getTime() !== expected.getTime()) fail('The rate period changed. Refresh before saving.', 409);
    if (end < row.EffectiveFrom || end > row.EffectiveTo) fail('Choose an earlier end date within this rate period. The amount and start date are retained.');
    if (end.getTime() === expected.getTime()) return { changed: false };
    const used = (await new sql.Request(tx).input('id', sql.Int, id).query(`SELECT MAX(UsedDate) AS LastUsed FROM (
        SELECT MasterRateDate AS UsedDate FROM dms_SalesIncentiveAccruals WITH(HOLDLOCK) WHERE MasterRateID=@id
        UNION ALL SELECT CAST(COALESCE(BookingDate,CreatedAt) AS DATE) FROM dms_SalesBookings WITH(HOLDLOCK)
            WHERE MasterIncentiveRateID=@id AND MasterIncentiveAmount=0) x`)).recordset[0].LastUsed;
    if (used && end < used) fail('Bookings already used this rate after the selected date. Their recorded rate cannot be changed.', 409);
    await new sql.Request(tx).input('id', sql.Int, id).input('end', sql.Date, end)
        .query('UPDATE dms_MasterIncentiveRates SET EffectiveTo=@end WHERE RateID=@id');
    await new sql.Request(tx).input('id', sql.Int, id).input('uid', sql.Int, user.userId).input('name', sql.NVarChar(100), user.userName)
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify(row)).input('next', sql.NVarChar(sql.MAX), JSON.stringify({ ...row, EffectiveTo: end }))
        .input('reason', sql.NVarChar(500), input.Reason.trim()).query(`INSERT INTO dms_SalesAuditLog(EntityType,EntityID,Action,OldValue,NewValue,ActorUserID,ActorName,Notes)
            VALUES('MasterIncentiveRate',@id,'MasterIncentiveRateEnded',@old,@next,@uid,@name,@reason)`);
    return { changed: true, message: 'Rate end date saved. Its original amount and previous date are retained in history.' };
}
module.exports = { canManageRates, rateDate, validateRate, createRate, endRate };
