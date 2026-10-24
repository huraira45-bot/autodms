const { sql, getPool } = require('../config/db');

function calendarDate(value) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Delivery dates must be YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid delivery date.');
    return date;
}
function filters(query = {}) {
    const from = calendarDate(query.from), to = calendarDate(query.to);
    if (from && to && from > to) throw new Error('From date must not be after To date.');
    if (query.search !== undefined && (typeof query.search !== 'string' || query.search.length > 150))
        throw new Error('Search must contain at most 150 characters.');
    const search = (query.search || '').trim(), digits = search.replace(/[-\s]/g, '');
    return { from, to, search, cnic: /^\d+$/.test(digits) ? digits : null };
}
const like = value => `%${value.replace(/[~%_[\]]/g, '~$&')}%`;

// Only application-owned clauses are added here. Request values are SQL parameters.
function reportQuery(f) {
    const conditions = ["ISNULL(b.IsHistorical,0)=0", "b.Status<>'Cancelled'", 'dates.DeliveryAt IS NOT NULL',
        `NOT EXISTS (SELECT 1 FROM dms_BookingMasterInvoices invoice
            JOIN dms_SalesDocuments document ON document.DocumentID=invoice.DocumentID
                AND document.BookingID=b.BookingID AND document.DocType='MasterInvoice'
                AND document.DeletedAt IS NULL AND NULLIF(LTRIM(RTRIM(document.FilePath)),'') IS NOT NULL
            WHERE invoice.BookingID=b.BookingID)`];
    if (f.from) conditions.push('CAST(dates.DeliveryAt AS DATE)>=@from');
    if (f.to) conditions.push('CAST(dates.DeliveryAt AS DATE)<=@to');
    if (f.search) conditions.push(`(p.PartyName LIKE @search ESCAPE '~' OR p.CNIC LIKE @search ESCAPE '~'
        OR b.BookingNo LIKE @search ESCAPE '~' OR veh.ChasisNo LIKE @search ESCAPE '~'${f.cnic ? `
        OR REPLACE(REPLACE(ISNULL(p.CNIC,''),'-',''),' ','') LIKE @cnic
        OR REPLACE(REPLACE(p.PartyName,'-',''),' ','') LIKE @cnic` : ''})`);
    return `SELECT b.BookingID,b.BookingNo,b.Status,
        CONVERT(varchar(10),COALESCE(b.BookingDate,b.CreatedAt),23) AS BookingDate,
        CONVERT(varchar(10),dates.DeliveryAt,23) AS DeliveryDate,
        DATEDIFF(day,dates.DeliveryAt,GETDATE()) AS DaysSinceDelivery,
        p.PartyName AS CustomerName,p.CNIC,m.ModelName,v.VariantName,
        veh.ChasisNo,veh.EngineNo,pass.GatePassNo,e.EmployeeName AS SalespersonName
        FROM dms_SalesBookings b
        LEFT JOIN gen_PartiesInfo p ON p.PartyID=b.PartyID
        LEFT JOIN dms_VehicleModel m ON m.ModelID=b.VehicleModelID
        LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
        LEFT JOIN dms_Vehicle veh ON veh.VehicleID=b.AllocatedVehicleID
        LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
        OUTER APPLY (SELECT TOP(1) gp.GatePassNo,gp.IssuedAt FROM dms_GatePasses gp
            WHERE gp.DocType='BOOKING' AND gp.DocID=b.BookingID AND gp.RevokedAt IS NULL
            ORDER BY gp.IssuedAt DESC,gp.GatePassID DESC) pass
        CROSS APPLY (SELECT COALESCE(b.DeliveredAt,b.GatePassIssuedAt,pass.IssuedAt) AS DeliveryAt) dates
        WHERE ${conditions.join(' AND ')}
        ORDER BY dates.DeliveryAt,b.BookingID`;
}

exports.report = async (req, res) => {
    let f;
    try { f = filters(req.query); } catch (error) { return res.status(400).json({ error: error.message }); }
    try {
        const pool = await getPool(), request = pool.request();
        if (f.from) request.input('from', sql.Date, f.from);
        if (f.to) request.input('to', sql.Date, f.to);
        if (f.search) request.input('search', sql.NVarChar(302), like(f.search));
        if (f.cnic) request.input('cnic', sql.NVarChar(152), `%${f.cnic}%`);
        const result = await request.query(reportQuery(f));
        res.json({ rows: result.recordset, total: result.recordset.length,
            generatedAt: new Date().toISOString(),
            basis: 'Non-historical bookings with a recorded delivery or issued gate pass and no active uploaded Master invoice. Cancelled bookings excluded.' });
    } catch (error) {
        console.error('deliveredMasterInvoiceReport:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.filters = filters;
exports.reportQuery = reportQuery;
