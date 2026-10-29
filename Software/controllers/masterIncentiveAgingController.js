const { sql, getPool } = require('../config/db');
const { rateDate } = require('../services/masterIncentiveRateService');
const today = () => new Date(Date.now() + 300 * 60000).toISOString().slice(0, 10);
exports.options = async (req, res) => {
    try { res.json((await (await getPool()).request().query('SELECT VariantID,VariantName FROM dms_VehicleVariant ORDER BY VariantName')).recordset); }
    catch (error) { res.status(500).json({ error: error.message }); }
};
exports.report = async (req, res) => {
    try {
        const q = req.query || {}, asOf = q.asOf || today();
        const end = rateDate(asOf), from = q.from ? rateDate(q.from) : null, to = q.to ? rateDate(q.to) : null;
        if (from && to && from > to) return res.status(400).json({ error: 'From date must be on or before To date.' });
        const variant = q.variantId ? Number(q.variantId) : null;
        if (variant !== null && (!Number.isSafeInteger(variant) || variant <= 0 || variant > 2147483647)) return res.status(400).json({ error: 'Invalid variant.' });
        if (q.search && (typeof q.search !== 'string' || q.search.length > 150)) return res.status(400).json({ error: 'Search must be at most 150 characters.' });
        const pool = await getPool(), r = pool.request().input('asOf', sql.Date, end);
        const conds = ['b.IsHistorical=0', 'CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)<=@asOf'];
        if (from) { r.input('from', sql.Date, from); conds.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)>=@from'); }
        if (to) { r.input('to', sql.Date, to); conds.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)<=@to'); }
        if (variant) { r.input('variant', sql.Int, variant); conds.push('b.VehicleVariantID=@variant'); }
        if (q.search?.trim()) {
            r.input('search', sql.NVarChar(152), '%' + q.search.trim() + '%');
            conds.push('(b.BookingNo LIKE @search OR b.DMSBookingNumber LIKE @search OR p.PartyName LIKE @search OR p.CNIC LIKE @search OR vehicle.ChasisNo LIKE @search)');
        }
        const result = await r.query(`WITH Scope AS (
            SELECT b.BookingID,b.BookingNo,b.DMSBookingNumber,CONVERT(varchar(10),COALESCE(b.BookingDate,b.CreatedAt),23) AS BookingDate,
                b.Status AS BookingStatus,p.PartyName AS CustomerName,p.CNIC,v.VariantID,v.VariantName,m.ModelName,
                vehicle.ChasisNo,e.EmployeeName AS Salesperson,b.MasterIncentiveRateID,b.MasterIncentiveAmount
            FROM dms_SalesBookings b JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID
            JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID JOIN dms_VehicleModel m ON m.ModelID=v.ModelID
            LEFT JOIN dms_Vehicle vehicle ON vehicle.VehicleID=b.AllocatedVehicleID
            LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID WHERE ${conds.join(' AND ')}
        ), Receipts AS (
            SELECT mr.AccrualID,SUM(mr.GrossAmount) AS Received
            FROM dms_MasterIncentiveReceipts mr JOIN dms_SalesIncentiveAccruals a ON a.AccrualID=mr.AccrualID
            JOIN Scope s ON s.BookingID=a.BookingID
            JOIN data_FinanceVoucherInfo rv ON rv.VoucherID=mr.ReceiptVoucherID
            WHERE mr.ReceivedAt<DATEADD(day,1,@asOf) AND rv.VoucherDate<DATEADD(day,1,@asOf)
                AND rv.Status IN('Posted','Reversed') AND (rv.Status<>'Reversed' OR rv.ReversedAt>=DATEADD(day,1,@asOf))
            GROUP BY mr.AccrualID
        ), Position AS (
            SELECT a.BookingID,COUNT(*) AS AccrualCount,
                SUM(CASE WHEN a.Status='Reversed' AND a.ReversedAt<DATEADD(day,1,@asOf) THEN 0 ELSE a.AmountAccrued END) AS Accrued,
                SUM(CASE WHEN a.Status='Reversed' AND a.ReversedAt<DATEADD(day,1,@asOf) THEN a.AmountAccrued ELSE 0 END) AS Reversed,
                SUM(ISNULL(r.Received,0)) AS Received,
                SUM(CASE WHEN a.Status='Reversed' AND a.ReversedAt<DATEADD(day,1,@asOf) THEN 0
                    WHEN av.Status='Posted' AND av.VoucherDate<DATEADD(day,1,@asOf) THEN a.AmountAccrued
                    WHEN av.Status='Reversed' AND av.ReversedAt>=DATEADD(day,1,@asOf) AND av.VoucherDate<DATEADD(day,1,@asOf) THEN a.AmountAccrued ELSE 0 END) AS PostedAccrued,
                SUM(CASE WHEN av.Status='Draft' THEN 1 ELSE 0 END) AS DraftVouchers,
                STRING_AGG(CONVERT(nvarchar(max),ISNULL(av.VoucherNo,a.AccrualVoucherNo)),', ') AS VoucherNumbers
            FROM dms_SalesIncentiveAccruals a JOIN Scope s ON s.BookingID=a.BookingID
            LEFT JOIN data_FinanceVoucherInfo av ON av.VoucherID=a.AccrualVoucherID LEFT JOIN Receipts r ON r.AccrualID=a.AccrualID
            WHERE a.EarnerType='Master' AND a.AccruedAt<DATEADD(day,1,@asOf) GROUP BY a.BookingID
        ) SELECT s.*,ISNULL(a.AccrualCount,0) AS AccrualCount,ISNULL(a.Accrued,0) AS Accrued,ISNULL(a.Reversed,0) AS Reversed,
            ISNULL(a.Received,0) AS Received,ISNULL(a.PostedAccrued,0) AS PostedAccrued,ISNULL(a.DraftVouchers,0) AS DraftVouchers,
            a.VoucherNumbers,DATEDIFF(day,s.BookingDate,@asOf) AS AgeDays
            FROM Scope s LEFT JOIN Position a ON a.BookingID=s.BookingID
            WHERE a.AccrualCount>0 OR s.MasterIncentiveRateID IS NOT NULL ORDER BY s.BookingDate,s.BookingID`);
        let rows = result.recordset.map(x => {
            const balance = +(Number(x.Accrued) - Number(x.Received)).toFixed(2), age = Number(x.AgeDays);
            return { ...x, Accrued: Number(x.Accrued), Reversed: Number(x.Reversed), Received: Number(x.Received), PostedAccrued: Number(x.PostedAccrued),
                Outstanding: Math.max(0, balance), RefundDueToMaster: Math.max(0, -balance),
                Bucket: age <= 30 ? '0-30' : age <= 60 ? '31-60' : age <= 90 ? '61-90' : '91+',
                LedgerState: x.DraftVouchers > 0 ? 'Awaiting finalization' : Number(x.Accrued) > Number(x.PostedAccrued) ? 'Not fully posted'
                    : Number(x.Reversed) > 0 && Number(x.Accrued) === 0 ? 'Reversed' : Number(x.Accrued) === 0 ? 'No incentive' : 'Posted' };
        });
        if (q.show !== 'all') rows = rows.filter(x => x.Outstanding > 0.01 || x.RefundDueToMaster > 0.01);
        const totals = { bookings: rows.length, accrued: 0, posted: 0, received: 0, outstanding: 0, refundDue: 0, buckets: { '0-30': 0, '31-60': 0, '61-90': 0, '91+': 0 } };
        for (const x of rows) { totals.accrued += x.Accrued; totals.posted += x.PostedAccrued; totals.received += x.Received;
            totals.outstanding += x.Outstanding; totals.refundDue += x.RefundDueToMaster; totals.buckets[x.Bucket] += x.Outstanding; }
        for (const key of ['accrued', 'posted', 'received', 'outstanding', 'refundDue']) totals[key] = +totals[key].toFixed(2);
        for (const key of Object.keys(totals.buckets)) totals.buckets[key] = +totals.buckets[key].toFixed(2);
        res.json({ asOf, rows, totals });
    } catch (error) { res.status(error.status || (/date|calendar/.test(error.message) ? 400 : 500)).json({ error: error.message }); }
};
