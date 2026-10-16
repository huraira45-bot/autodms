const { sql, getPool } = require('../config/db');
const { parseDeliveryMonth, deliveryMonthKey } = require('../services/bookingDeliveryMonthService');

function calendarDate(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Booking dates must be YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid booking date.');
    return date;
}
exports.report = async (req, res) => {
    try {
        let from, to, month;
        try {
            from = calendarDate(req.query.from); to = calendarDate(req.query.to);
            month = parseDeliveryMonth(req.query.month);
            if (from && to && from > to) throw new Error('From date must not be after To date.');
            if (month && req.query.unpromised === '1') throw new Error('Choose a month or bookings without a promised month.');
        } catch (err) { return res.status(400).json({ error: err.message }); }
        const pool = await getPool(), rq = pool.request();
        const conditions = ["b.Status<>'Cancelled'", 'b.NegotiatedPrice > ISNULL(b.AmountPaidToDate,0)'];
        if (from) { rq.input('from', sql.Date, from); conditions.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)>=@from'); }
        if (to) { rq.input('to', sql.Date, to); conditions.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)<=@to'); }
        if (month) { rq.input('month', sql.Date, month); conditions.push('b.PromisedDeliveryMonth=@month'); }
        if (req.query.unpromised === '1') conditions.push('b.PromisedDeliveryMonth IS NULL');
        if (req.query.status) { rq.input('status', sql.NVarChar(30), String(req.query.status).slice(0,30)); conditions.push('b.Status=@status'); }
        const search = String(req.query.search || '').trim().slice(0, 150);
        if (search) {
            rq.input('search', sql.NVarChar(302), `%${search}%`);
            conditions.push('(b.BookingNo LIKE @search OR p.PartyName LIKE @search OR p.PhoneOne LIKE @search OR veh.ChasisNo LIKE @search)');
        }
        // AmountPaidToDate is vehicle money only: the payment trigger excludes
        // PremiumPortion and reversed payments. Historical recorded receipts
        // count even before their old voucher is linked. No Master balance or
        // general-party balance is substituted for this customer's car debt.
        const result = await rq.query(`SELECT b.BookingID,b.BookingNo,b.Status,b.IsHistorical,
                CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE) AS BookingDate,b.PromisedDeliveryMonth,
                p.PartyName AS CustomerName,p.PhoneOne AS Phone,
                m.ModelName,v.VariantName,veh.ChasisNo,e.EmployeeName AS ExecutiveName,
                b.NegotiatedPrice AS VehiclePrice,ISNULL(b.AmountPaidToDate,0) AS VehiclePaid,
                b.NegotiatedPrice-ISNULL(b.AmountPaidToDate,0) AS Outstanding
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID
            LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
            LEFT JOIN dms_VehicleModel m ON m.ModelID=b.VehicleModelID
            LEFT JOIN dms_Vehicle veh ON veh.VehicleID=b.AllocatedVehicleID
            LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
            WHERE ${conditions.join(' AND ')}
            ORDER BY CASE WHEN b.PromisedDeliveryMonth IS NULL THEN 1 ELSE 0 END,
                     b.PromisedDeliveryMonth,BookingDate,b.BookingID`);
        const rows = result.recordset.map(r => ({ ...r,
            BookingDate: r.BookingDate?.toISOString().slice(0,10) || null,
            PromisedDeliveryMonth: deliveryMonthKey(r.PromisedDeliveryMonth),
            VehiclePrice: Number(r.VehiclePrice), VehiclePaid: Number(r.VehiclePaid), Outstanding: Number(r.Outstanding),
        }));
        const sum = key => rows.reduce((total,r) => total + Math.round(r[key]*100), 0)/100;
        res.json({ rows, totals: { count: rows.length, price: sum('VehiclePrice'), paid: sum('VehiclePaid'), outstanding: sum('Outstanding') },
            basis: 'Current booking vehicle price less recorded vehicle payments; premium excluded. Cancelled and fully paid bookings excluded.',
            generatedAt: new Date().toISOString() });
    } catch (err) {
        console.error('customerVehicleBalance:', err);
        res.status(500).json({ error: err.message });
    }
};
