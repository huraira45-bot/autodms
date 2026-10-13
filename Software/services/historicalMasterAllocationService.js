const { sql } = require('../config/db');
const { historicalPayOrderSql, masterNetSql } = require('./masterPaymentPositionService');
const fail = (message, statusCode=409) => { throw Object.assign(new Error(message), { statusCode }); };
const cents = value => {
    const number=Number(value), result=Math.round(number*100);
    if (!Number.isFinite(number) || !Number.isSafeInteger(result)) fail('Enter a valid amount.',400);
    return result;
};

const GENERATED_SALES_SOURCES = ['PAY_MASTER','MASTER_INVOICE','SALES_PAYMENT','SALES_DELIVERY','SALES_INCENTIVE_ACCRUAL','SALES_INCENTIVE_DISB'];

const MASTER_AMOUNT_SQL = `(SELECT ISNULL(SUM(ISNULL(d.Debit,0)-ISNULL(d.Credit,0)),0)
    FROM data_FinanceVoucherDetail d
    WHERE d.VoucherID=v.VoucherID AND d.GLCAID=@gl AND d.BookingID IS NULL)`;
const MASTER_LINKED_SQL = `((SELECT ISNULL(SUM(a.Amount),0)
    FROM dms_HistoricalMasterAllocations a WHERE a.VoucherID=v.VoucherID AND a.GLCAID=@gl)
    + (SELECT ISNULL(SUM(po.Amount),0) FROM (${historicalPayOrderSql('@gl')}) po
        WHERE po.VoucherID=v.VoucherID AND po.GLCAID=@gl))`;

const MASTER_HEADER_LOCK_SQL = `SELECT VoucherID,VoucherNo,VoucherDate,Status,ReversesVoucherID,SourceDocType
    FROM data_FinanceVoucherInfo WITH (UPDLOCK,HOLDLOCK) WHERE VoucherID=@vid`;
const MASTER_CAPACITY_SQL = `SELECT ${MASTER_AMOUNT_SQL} AS MasterAmount, ${MASTER_LINKED_SQL} AS LinkedAmount,
    (SELECT ISNULL(SUM(po.Amount),0) FROM (${historicalPayOrderSql('@gl')}) po
        WHERE po.VoucherID=v.VoucherID AND po.BookingID=@bid) AS DirectPayOrderAmount
    FROM data_FinanceVoucherInfo v WHERE v.VoucherID=@vid`;
// Expressions are supplied by source code only, never by a request.
function historicalMasterPaidSql(bookingExpression, accountExpression) {
    return `(SELECT ISNULL(SUM(hm.Amount),0) FROM dms_HistoricalMasterAllocations hm
        JOIN data_FinanceVoucherInfo hv ON hv.VoucherID=hm.VoucherID
        WHERE hm.BookingID=${bookingExpression} AND hm.GLCAID=${accountExpression}
          AND hv.Status='Posted' AND hv.ReversesVoucherID IS NULL)`;
}

async function linkMasterVoucher(tx, booking, voucherId, amount, masterGL, user) {
    if (!booking.IsHistorical) fail('Only historical bookings can link an existing Master voucher.');
    if (!Number.isSafeInteger(voucherId) || voucherId<=0) fail('Pick a valid voucher.',400);
    const requested=cents(amount);
    if (requested<=0) fail('The booking allocation must be greater than zero.',400);
    // Complete the header lock before capacity reads so execution-plan ordering
    // cannot inspect allocation rows while another booking is still linking.
    const locked=await new sql.Request(tx).input('vid',sql.Int,voucherId).query(MASTER_HEADER_LOCK_SQL);
    const header=locked.recordset[0];
    if (!header) fail('That voucher does not exist.',404);
    if (header.Status!=='Posted' || header.ReversesVoucherID) fail('Select an original posted Master voucher.');
    if (GENERATED_SALES_SOURCES.includes(header.SourceDocType)) fail('Automatically created payments already belong to their booking and cannot be allocated again.');
    const capacity=await new sql.Request(tx).input('vid',sql.Int,voucherId).input('gl',sql.Int,masterGL).input('bid',sql.Int,booking.BookingID)
        .query(MASTER_CAPACITY_SQL);
    const voucher={...header,...capacity.recordset[0]};
    if (Number(voucher.DirectPayOrderAmount)>0) fail('This voucher is already counted as this booking\'s direct-to-Master pay order. No separate Master link is required.');
    const available=Math.max(0,cents(voucher.MasterAmount)-cents(voucher.LinkedAmount));
    if (requested>available) fail(`${voucher.VoucherNo} has only PKR ${(available/100).toLocaleString('en-PK')} available to allocate to Master.`);
    const duplicate=await new sql.Request(tx).input('b',sql.Int,booking.BookingID).input('v',sql.Int,voucherId).input('gl',sql.Int,masterGL)
        .query('SELECT AllocationID FROM dms_HistoricalMasterAllocations WHERE BookingID=@b AND VoucherID=@v AND GLCAID=@gl');
    if (duplicate.recordset.length) fail('This booking already has an allocation from that voucher. Unlink it before changing its amount.');
    const prior=await new sql.Request(tx).input('bid',sql.Int,booking.BookingID).input('gl',sql.Int,masterGL)
        .query(`SELECT ${masterNetSql('@bid','@gl')} AS Paid`);
    if (cents(prior.recordset[0]?.Paid||0)+requested>cents(booking.NegotiatedPrice||0)) {
        fail('The total linked to Master would exceed this historical bookingâ€™s agreed vehicle price.');
    }
    await new sql.Request(tx).input('b',sql.Int,booking.BookingID).input('v',sql.Int,voucherId)
        .input('gl',sql.Int,masterGL).input('a',sql.Decimal(18,2),requested/100)
        .input('emp',sql.Int,user?.employeeId||null).input('name',sql.NVarChar(100),user?.userName||null)
        .query(`INSERT INTO dms_HistoricalMasterAllocations
            (BookingID,VoucherID,GLCAID,Amount,LinkedByEmployeeID,LinkedByName)
            VALUES (@b,@v,@gl,@a,@emp,@name)`);
    return { ...voucher, Amount:requested/100, UnclaimedToMaster:(available-requested)/100 };
}

module.exports={GENERATED_SALES_SOURCES,MASTER_AMOUNT_SQL,MASTER_LINKED_SQL,MASTER_HEADER_LOCK_SQL,MASTER_CAPACITY_SQL,historicalMasterPaidSql,linkMasterVoucher};
