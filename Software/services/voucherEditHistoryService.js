const { sql } = require('../config/db');

function failure(status, message) {
    return Object.assign(new Error(message), { status });
}

// Read actual persisted values, rather than treating the incoming request as
// evidence. Lock the header first to serialize all voucher edit endpoints.
async function snapshot(transaction, voucherId, lock = false) {
    const header = await new sql.Request(transaction).input('id', sql.Int, voucherId).query(`
        SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.VoucherTypeID,
               vt.Title AS VoucherTypeCode, v.Status, v.TotalAmount, v.Remarks,
               v.SourceDocType, v.SourceDocID, v.ReversesVoucherID
        FROM data_FinanceVoucherInfo v ${lock ? 'WITH (UPDLOCK, HOLDLOCK)' : ''}
        LEFT JOIN GLVoucherType vt ON vt.Voucherid=v.VoucherTypeID
        WHERE v.VoucherID=@id`);
    if (!header.recordset.length) throw failure(404, 'Voucher not found.');
    const lines = await new sql.Request(transaction).input('id', sql.Int, voucherId).query(`
        SELECT d.*, c.GLCode, c.GLTitle, dept.DepartmentName
        FROM data_FinanceVoucherDetail d
        LEFT JOIN GLChartOFAccount c ON c.GLCAID=d.GLCAID
        LEFT JOIN gen_DepartmentInfo dept ON dept.DepartmentID=d.DepartmentID
        WHERE d.VoucherID=@id ORDER BY d.VoucherDetailID`);
    const charity = await new sql.Request(transaction).input('id', sql.Int, voucherId).query(`
        SELECT VoucherAmount, CharityAmount FROM dms_CharityTracking
        WHERE VoucherID=@id AND SourceType='MANUAL_VOUCHER_1PCT' ORDER BY CharityID`);
    return { Header: header.recordset[0], Lines: lines.recordset, Charity: charity.recordset };
}

async function recordEdit(transaction, req, action, before, after) {
    if (!Number.isInteger(req.user?.userId) || !req.user?.userName) {
        throw failure(401, 'An authenticated user is required to record voucher edits.');
    }
    await new sql.Request(transaction)
        .input('vid', sql.Int, before.Header.VoucherID)
        .input('no', sql.NVarChar(50), before.Header.VoucherNo)
        .input('action', sql.NVarChar(40), action)
        .input('reason', sql.NVarChar(500), req.body?.Reason?.trim() || null)
        .input('by', sql.Int, req.user.userId)
        .input('name', sql.NVarChar(100), req.user.userName)
        .input('before', sql.NVarChar(sql.MAX), JSON.stringify(before))
        .input('after', sql.NVarChar(sql.MAX), JSON.stringify(after))
        .query(`INSERT INTO dms_VoucherEditHistory
                    (VoucherID, VoucherNo, Action, Reason, ChangedBy, ChangedByName, BeforeJSON, AfterJSON)
                VALUES (@vid, @no, @action, @reason, @by, @name, @before, @after)`);
}

async function withVoucherEditHistory(pool, req, voucherId, action, mutate) {
    const reason = req.body?.Reason;
    if (reason != null && (typeof reason !== 'string' || reason.trim().length > 500)) {
        throw failure(400, 'Edit reason must be text of at most 500 characters.');
    }
    const transaction = new sql.Transaction(pool);
    await transaction.begin();
    try {
        const before = await snapshot(transaction, voucherId, true);
        const result = await mutate(transaction, before);
        const after = await snapshot(transaction, voucherId);
        await recordEdit(transaction, req, action, before, after);
        await transaction.commit();
        return result;
    } catch (err) {
        try { await transaction.rollback(); } catch (_) { /* preserve original error */ }
        if (err.number === 208 && /dms_VoucherEditHistory/i.test(err.message)) {
            throw failure(503, 'Voucher edit history is not installed. Apply migration 158_voucher_edit_history.sql before editing.');
        }
        throw err;
    }
}

// The controller checks permissions before opening the transaction; reject if
// a competing edit/post/reversal changed the state used for that decision.
function requireUnchangedHeader(before, checked) {
    const h = before.Header;
    if (h.Status !== checked.Status || h.ReversesVoucherID !== checked.ReversesVoucherID
        || h.VoucherTypeCode !== checked.VoucherType
        || new Date(h.VoucherDate).getTime() !== new Date(checked.VoucherDate).getTime()) {
        throw failure(409, 'Voucher changed while you were editing. Refresh and try again.');
    }
}

module.exports = { withVoucherEditHistory, requireUnchangedHeader };
