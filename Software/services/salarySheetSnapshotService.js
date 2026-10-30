const { sql } = require('../config/db');

function validateMonth(monthId) {
    if (typeof monthId !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(monthId) || monthId < '1753-01') {
        const error = new Error('MonthID must be a valid YYYY-MM from 1753 onwards.');
        error.status = 400; throw error;
    }
    return monthId;
}

async function lockMonth(tx, monthId) {
    validateMonth(monthId);
    await new sql.Request(tx).input('resource', sql.NVarChar(255), `salary-sheet:${monthId}`).query(`
        DECLARE @result INT;
        EXEC @result = sys.sp_getapplock @Resource=@resource, @LockMode='Exclusive',
            @LockOwner='Transaction', @LockTimeout=15000;
        IF @result < 0 THROW 51069,'This salary month is busy. Please try again.',1;`);
}

async function getSnapshot(context, monthId) {
    validateMonth(monthId);
    const result = await new sql.Request(context).input('m', sql.Char(7), monthId)
        .query('SELECT * FROM hr_SalarySheetSnapshots WHERE MonthID=@m');
    const saved = result.recordset[0];
    if (!saved) return null;
    const sheet = JSON.parse(saved.SheetJSON);
    if (saved.SnapshotVersion !== 1 || sheet.monthId !== monthId || !Array.isArray(sheet.rows))
        throw new Error('The saved salary sheet is invalid. Please contact the administrator.');
    return { ...sheet, isFrozen: true, legacyPosted: saved.SnapshotBasis === 'LEGACY_CURRENT',
        snapshot: { basis: saved.SnapshotBasis, capturedAt: saved.CapturedAtUtc,
            capturedBy: saved.CapturedByName, firstVoucherId: saved.FirstVoucherID } };
}

async function getPostings(context, monthId) {
    validateMonth(monthId);
    const result = await new sql.Request(context).input('m', sql.Char(7), monthId).query(`
        SELECT p.PostingID,p.PostingType,p.VoucherID,p.PostedAt,v.Status AS VoucherStatus
        FROM hr_SalaryPostings p LEFT JOIN data_FinanceVoucherInfo v ON v.VoucherID=p.VoucherID
        WHERE p.MonthID=@m ORDER BY p.PostingID`);
    return result.recordset;
}

// Caller holds lockMonth and commits this insert together with the vouchers.
async function freezeSnapshot(tx, sheet, user, basis, voucherId) {
    const existing = await getSnapshot(tx, sheet.monthId);
    if (existing) return existing;
    const { isFrozen, snapshot, legacyPosted, ...payload } = sheet;
    await new sql.Request(tx).input('m', sql.Char(7), validateMonth(sheet.monthId))
        .input('json', sql.NVarChar(sql.MAX), JSON.stringify(payload))
        .input('basis', sql.NVarChar(24), basis).input('voucher', sql.Int, voucherId || null)
        .input('actor', sql.Int, user?.userId || null).input('name', sql.NVarChar(100), user?.userName || null)
        .query(`INSERT hr_SalarySheetSnapshots(MonthID,SheetJSON,SnapshotBasis,FirstVoucherID,CapturedByUserID,CapturedByName)
            VALUES(@m,@json,@basis,@voucher,@actor,@name)`);
    return getSnapshot(tx, sheet.monthId);
}

async function assertEditable(tx, monthId) {
    if (await getSnapshot(tx, monthId) || (await getPostings(tx, monthId)).length) {
        const error = new Error('Salary for this month has been posted and is read-only. Its saved sheet cannot be changed.');
        error.status = 423; throw error;
    }
}

module.exports = { validateMonth, lockMonth, getSnapshot, getPostings, freezeSnapshot, assertEditable };
