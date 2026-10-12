const { sql } = require('../config/db');
const { getDownstreamRefs } = require('./downstreamRefsService');

const LOCKED_BOOKINGS = ['Closed', 'Delivered', 'GatePassIssued'];
const fail = (message, statusCode = 409, extra = {}) => {
    throw Object.assign(new Error(message), { statusCode, ...extra });
};

async function voidMasterPayment(tx, { bookingId, voucherId, reason, user }) {
    if (!Number.isSafeInteger(bookingId) || bookingId <= 0 ||
        !Number.isSafeInteger(voucherId) || voucherId <= 0) {
        fail('A valid booking and voucher are required.', 400);
    }
    if (typeof reason !== 'string' || reason.trim().length < 5) {
        fail('Please give a reason of at least 5 characters.', 400);
    }
    reason = reason.trim();

    // Lock in the same order as Pay Master so replacement payments cannot race.
    const booking = await new sql.Request(tx).input('bid', sql.Int, bookingId)
        .query(`SELECT BookingID, Status FROM dms_SalesBookings WITH (UPDLOCK, HOLDLOCK)
                WHERE BookingID=@bid`);
    if (!booking.recordset.length) fail('Booking not found.', 404);
    if (LOCKED_BOOKINGS.includes(booking.recordset[0].Status)) {
        fail('This vehicle has reached delivery. Correct its Master payment through Accounting.');
    }
    const found = await new sql.Request(tx)
        .input('vid', sql.Int, voucherId).input('bid', sql.Int, bookingId)
        .query(`SELECT VoucherID, VoucherNo, TotalAmount, Status, ReversesVoucherID
                FROM data_FinanceVoucherInfo WITH (UPDLOCK, HOLDLOCK)
                WHERE VoucherID=@vid AND SourceDocType='PAY_MASTER' AND SourceDocID=@bid`);
    const voucher = found.recordset[0];
    if (!voucher) fail('Master payment not found on this booking.', 404);
    if (voucher.ReversesVoucherID || !['Draft', 'Posted'].includes(voucher.Status)) {
        fail('Only an original draft or posted Master payment can be voided.');
    }

    let requestId = null;
    if (voucher.Status === 'Posted') {
        const pending = await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query(`SELECT RequestID FROM dms_UnfinalizeRequests WITH (UPDLOCK, HOLDLOCK)
                    WHERE EntityType='VOUCHER' AND EntityID=@vid
                      AND Status IN ('PENDING','AM_APPROVED')`);
        if (pending.recordset.length) fail('A void approval request is already open for this Master payment.');
        const blockers = await getDownstreamRefs('VOUCHER', voucherId, tx);
        if (blockers.length) fail('This Master payment has downstream allocations. Reverse them first.', 409, { blockers });
        const inserted = await new sql.Request(tx)
            .input('vid', sql.Int, voucherId)
            .input('ref', sql.NVarChar(50), voucher.VoucherNo)
            .input('uid', sql.Int, user.userId)
            .input('name', sql.NVarChar(100), user.userName)
            .input('reason', sql.NVarChar(sql.MAX), reason)
            .query(`INSERT INTO dms_UnfinalizeRequests
                        (EntityType, EntityID, EntityRef, RequestedBy, RequestedByName, Reason)
                    OUTPUT INSERTED.RequestID
                    VALUES ('VOUCHER', @vid, @ref, @uid, @name, @reason)`);
        requestId = inserted.recordset[0].RequestID;
    } else {
        const refs = await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query(`SELECT TOP 1 VoucherID FROM data_FinanceVoucherDetail
                    WHERE AllocatedToVoucherID=@vid AND VoucherID<>@vid
                    UNION ALL
                    SELECT TOP 1 VoucherID FROM dms_PartyLedger
                    WHERE AllocatedToVoucherID=@vid AND VoucherID<>@vid`);
        if (refs.recordset.length) fail('Another voucher refers to this draft. Remove that allocation first.');
        await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query('DELETE FROM dms_PartyLedger WHERE VoucherID=@vid');
        await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query('DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@vid');
        await new sql.Request(tx).input('vid', sql.Int, voucherId)
            .query("DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@vid AND Status='Draft'");
    }

    // Unlike best-effort activity logging, a financial void requires its audit row.
    await new sql.Request(tx)
        .input('bid', sql.Int, bookingId).input('vid', sql.Int, voucherId)
        .input('act', sql.NVarChar(60), requestId ? 'RequestVoidMasterPayment' : 'VoidMasterPayment')
        .input('old', sql.NVarChar(sql.MAX), JSON.stringify(voucher))
        .input('new', sql.NVarChar(sql.MAX), JSON.stringify({ requestId, status: requestId ? 'PENDING' : 'Voided', reason }))
        .input('emp', sql.Int, user.employeeId || null)
        .input('name', sql.NVarChar(100), user.userName)
        .input('uid', sql.Int, user.userId)
        .input('notes', sql.NVarChar(500), reason.slice(0, 500))
        .query(`INSERT INTO dms_SalesAuditLog
                    (BookingID, EntityType, EntityID, Action, OldValue, NewValue,
                     ActorEmployeeID, ActorName, ActorUserID, Notes)
                VALUES (@bid, 'MasterPayment', @vid, @act, @old, @new, @emp, @name, @uid, @notes)`);

    return {
        requiresApproval: Boolean(requestId), RequestID: requestId, VoucherNo: voucher.VoucherNo,
        message: requestId
            ? 'Void requested. The Accounts Manager must approve it and an admin completes it under Workflow > Unfinalize Requests. The payment stays paid until then.'
            : 'Master payment voided. You can make the payment again.',
    };
}

module.exports = { voidMasterPayment, LOCKED_BOOKINGS };
