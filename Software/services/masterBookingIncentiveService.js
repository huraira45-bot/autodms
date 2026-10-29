const { sql } = require('../config/db');
const { nextVoucherNo } = require('../utils/voucherNumbering');
const { postReversalVoucher } = require('./voucherReversalService');
const SOURCE = 'MASTER_BOOKING_INC';
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };
async function audit(tx, bookingId, action, oldValue, newValue, user, reason) {
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('action', sql.NVarChar(60), action)
        .input('old', sql.NVarChar(sql.MAX), oldValue == null ? null : JSON.stringify(oldValue))
        .input('next', sql.NVarChar(sql.MAX), JSON.stringify(newValue)).input('uid', sql.Int, user?.userId || null)
        .input('name', sql.NVarChar(100), user?.userName || 'system').input('reason', sql.NVarChar(500), String(reason).slice(0, 500))
        .query(`INSERT INTO dms_SalesAuditLog(BookingID,EntityType,EntityID,Action,OldValue,NewValue,ActorUserID,ActorName,Notes)
                VALUES(@id,'Booking',@id,@action,@old,@next,@uid,@name,@reason)`);
}
async function accrueAtBooking(tx, bookingId, user) {
    const b = (await new sql.Request(tx).input('id', sql.Int, bookingId).query(`SELECT BookingID,BookingNo,DMSBookingNumber,VehicleVariantID,
            IsHistorical,Status,MasterIncentiveRateID,CONVERT(varchar(10),COALESCE(BookingDate,CreatedAt),23) AS RateDate
            FROM dms_SalesBookings WITH(UPDLOCK,HOLDLOCK) WHERE BookingID=@id`)).recordset[0];
    if (!b) fail('Booking not found.', 404);
    if (b.IsHistorical) return { skipped: 'historical' };
    if (b.MasterIncentiveRateID) return { skipped: 'already-recorded' };
    if (b.Status === 'Cancelled') fail('A cancelled booking cannot accrue incentives.');
    const rates = (await new sql.Request(tx).input('variant', sql.Int, b.VehicleVariantID).input('day', sql.Date, new Date(b.RateDate + 'T00:00:00Z'))
        .query(`SELECT RateID,VariantID,EffectiveFrom,EffectiveTo,AmountPerBooking FROM dms_MasterIncentiveRates WITH(HOLDLOCK)
                WHERE VariantID=@variant AND EffectiveFrom<=@day AND EffectiveTo>=@day`)).recordset;
    if (rates.length !== 1) fail(rates.length ? 'Overlapping Master incentive rates require correction.' : 'Set a Master incentive rate for this variant and booking date before saving (use zero if no incentive applies).');
    const rate = rates[0], amount = Number(rate.AmountPerBooking);
    let receivable, income, voucherId = null, voucherNo = null, accrualId = null;
    if (amount > 0) {
        const accounts = (await new sql.Request(tx).query(`SELECT a.RoleKey,c.GLCAID,c.GLCode,c.GLTitle,c.isParent
            FROM dms_SystemAccounts a JOIN GLChartOFAccount c ON c.GLCAID=a.GLCAID
            WHERE a.RoleKey IN('MASTER_INCENTIVE_RECEIVABLE','MASTER_INCENTIVE_INCOME')`)).recordset;
        receivable = accounts.find(a => a.RoleKey === 'MASTER_INCENTIVE_RECEIVABLE'); income = accounts.find(a => a.RoleKey === 'MASTER_INCENTIVE_INCOME');
        if (!receivable || !income || receivable.isParent || income.isParent || receivable.GLCAID === income.GLCAID)
            fail('Select two different posting accounts in Accounting Setup: Master Incentive Receivable (debit) and Master Incentive Income (credit).');
        const vt = (await new sql.Request(tx).query("SELECT Voucherid FROM GLVoucherType WHERE Title='JV'")).recordset[0];
        if (!vt) fail('JV voucher type is not configured.');
        voucherNo = await nextVoucherNo(tx, 'JV');
        const narrative = `Master incentive on booking ${b.BookingNo}; DMS ${b.DMSBookingNumber || '-'}; rate #${rate.RateID} effective ${b.RateDate}.`;
        voucherId = (await new sql.Request(tx).input('no', sql.NVarChar(50), voucherNo).input('type', sql.Int, vt.Voucherid)
            .input('date', sql.Date, new Date(b.RateDate + 'T00:00:00Z')).input('amount', sql.Decimal(18, 2), amount)
            .input('id', sql.Int, bookingId).input('source', sql.NVarChar(50), SOURCE).input('notes', sql.NVarChar(sql.MAX), narrative)
            .input('uid', sql.Int, user?.userId || null).input('name', sql.NVarChar(100), user?.userName || 'system')
            .query(`INSERT INTO data_FinanceVoucherInfo(VoucherNo,VoucherTypeID,VoucherDate,TotalAmount,Status,Posted,SourceDocType,SourceDocID,Remarks,CreatedBy,CreatedByName)
                    OUTPUT INSERTED.VoucherID VALUES(@no,@type,@date,@amount,'Draft',0,@source,@id,@notes,@uid,@name)`)).recordset[0].VoucherID;
        await new sql.Request(tx).input('vid', sql.Int, voucherId).input('id', sql.Int, bookingId).input('amount', sql.Decimal(18, 2), amount)
            .input('recv', sql.Int, receivable.GLCAID).input('income', sql.Int, income.GLCAID).input('notes', sql.NVarChar(sql.MAX), narrative)
            .query(`INSERT INTO data_FinanceVoucherDetail(VoucherID,GLCAID,BookingID,Debit,Credit,Narration)
                    VALUES(@vid,@recv,@id,@amount,0,@notes),(@vid,@income,@id,0,@amount,@notes)`);
        accrualId = (await new sql.Request(tx).input('id', sql.Int, bookingId).input('rate', sql.Int, rate.RateID)
            .input('day', sql.Date, new Date(b.RateDate + 'T00:00:00Z')).input('amount', sql.Decimal(18, 2), amount)
            .input('vid', sql.Int, voucherId).input('vno', sql.NVarChar(20), voucherNo).input('recv', sql.Int, receivable.GLCAID).input('income', sql.Int, income.GLCAID)
            .input('snapshot', sql.NVarChar(sql.MAX), JSON.stringify({ ...rate, RateDate: b.RateDate, Receivable: receivable, Income: income }))
            .query(`DECLARE @new TABLE(AccrualID INT);
                    INSERT INTO dms_SalesIncentiveAccruals(BookingID,EarnerType,IncentiveCategory,AmountAccrued,Status,AccrualVoucherID,AccrualVoucherNo,
                        MasterRateID,MasterRateDate,MasterReceivableGLCAID,MasterIncomeGLCAID,PolicySnapshotJSON)
                    OUTPUT INSERTED.AccrualID INTO @new
                    VALUES(@id,'Master','Standard',@amount,'Accrued',@vid,@vno,@rate,@day,@recv,@income,@snapshot);
                    SELECT AccrualID FROM @new;`)).recordset[0].AccrualID;
    }
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('rate', sql.Int, rate.RateID).input('amount', sql.Decimal(18, 2), amount)
        .query('UPDATE dms_SalesBookings SET MasterIncentiveRateID=@rate,MasterIncentiveAmount=@amount WHERE BookingID=@id');
    const result = { RateID: rate.RateID, RateDate: b.RateDate, Amount: amount, AccrualID: accrualId, VoucherID: voucherId, VoucherNo: voucherNo };
    await audit(tx, bookingId, 'MasterIncentiveAtBooking', null, result, user, 'Dated variant rate snapshotted at booking; voucher awaits Accounts finalization.');
    return result;
}
async function reverseOnCancellation(tx, bookingId, user, reason) {
    // Lock in the same booking -> accrual -> voucher order as booking creation.
    await new sql.Request(tx).input('id', sql.Int, bookingId).query('SELECT BookingID FROM dms_SalesBookings WITH(UPDLOCK,HOLDLOCK) WHERE BookingID=@id');
    const accruals = (await new sql.Request(tx).input('id', sql.Int, bookingId).query(`SELECT * FROM dms_SalesIncentiveAccruals WITH(UPDLOCK,HOLDLOCK)
            WHERE BookingID=@id AND EarnerType='Master' AND Status<>'Reversed'`)).recordset;
    if (!accruals.length) return { reversed: 0 };
    const vouchers = (await new sql.Request(tx).input('id', sql.Int, bookingId).query(`SELECT * FROM data_FinanceVoucherInfo WITH(UPDLOCK,HOLDLOCK)
            WHERE SourceDocID=@id AND SourceDocType IN('MASTER_INVOICE','MASTER_BOOKING_INC') AND ReversesVoucherID IS NULL`)).recordset;
    const results = [];
    for (const v of vouchers) {
        if (v.Status === 'Posted') {
            results.push({ VoucherID: v.VoucherID, ...await postReversalVoucher(v.VoucherID, user, tx) });
        } else if (v.Status === 'Draft') {
            const detail = (await new sql.Request(tx).input('vid', sql.Int, v.VoucherID).query('SELECT * FROM data_FinanceVoucherDetail WHERE VoucherID=@vid')).recordset;
            const linked = (await new sql.Request(tx).input('vid', sql.Int, v.VoucherID).query(`SELECT TOP(1) VoucherDetailID FROM data_FinanceVoucherDetail WHERE AllocatedToVoucherID=@vid AND VoucherID<>@vid`)).recordset;
            if (linked.length) fail(`Draft ${v.VoucherNo} is referenced by another voucher. Remove that allocation before cancellation.`);
            await audit(tx, bookingId, 'MasterIncentiveDraftVoided', { header: v, detail }, { VoucherNo: v.VoucherNo, Voided: true }, user, reason);
            await new sql.Request(tx).input('vid', sql.Int, v.VoucherID).query(`DELETE FROM dms_PartyLedger WHERE VoucherID=@vid;
                DELETE FROM data_FinanceVoucherDetail WHERE VoucherID=@vid;DELETE FROM data_FinanceVoucherInfo WHERE VoucherID=@vid`);
            results.push({ VoucherID: v.VoucherID, VoucherNo: v.VoucherNo, DraftVoided: true });
        }
    }
    await new sql.Request(tx).input('id', sql.Int, bookingId).input('reason', sql.NVarChar(sql.MAX), reason)
        .query(`UPDATE dms_SalesIncentiveAccruals SET Status='Reversed',ReversedAt=GETDATE(),ReversalReason=@reason
                WHERE BookingID=@id AND EarnerType='Master' AND Status<>'Reversed'`);
    await audit(tx, bookingId, 'MasterIncentiveCancelled', accruals, { vouchers: results, ReceiptsRetained: true }, user, reason);
    return { reversed: accruals.length, vouchers: results };
}
module.exports = { SOURCE, accrueAtBooking, reverseOnCancellation };
