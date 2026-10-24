const { sql, getPool } = require('../config/db');

const emptyTotals = () => ({ accounts: 0, linkedAccounts: 0, unlinkedAccounts: 0, bookings: 0 });
const like = value => `%${value.replace(/[~%_[\]]/g, '~$&')}%`;
const reportQuery = `SELECT a.GLCAID AS AccountID,a.GLCode AS AccountCode,a.GLTitle AS AccountName,
    p.PartyID,p.PartyName AS CustomerName,p.CNIC,
    b.BookingID,b.BookingNo,b.Status,b.IsHistorical,
    CONVERT(varchar(10),COALESCE(b.BookingDate,b.CreatedAt),23) AS BookingDate,
    CONVERT(varchar(7),b.PromisedDeliveryMonth,23) AS PromisedDeliveryMonth,
    m.ModelName,v.VariantName,veh.ChasisNo,e.EmployeeName AS SalespersonName
    FROM GLChartOFAccount a
    LEFT JOIN gen_PartiesInfo p ON p.PartyGLID=a.GLCAID
    LEFT JOIN dms_SalesBookings b ON b.PartyID=p.PartyID
    LEFT JOIN dms_VehicleModel m ON m.ModelID=b.VehicleModelID
    LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
    LEFT JOIN dms_Vehicle veh ON veh.VehicleID=b.AllocatedVehicleID
    LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
    WHERE a.GLCode LIKE @search ESCAPE '~' OR a.GLTitle LIKE @search ESCAPE '~'
    ORDER BY CASE WHEN a.GLCode=@exact THEN 0 WHEN a.GLTitle=@exact THEN 1 ELSE 2 END,
        a.GLCode,a.GLCAID,COALESCE(b.BookingDate,b.CreatedAt) DESC,b.BookingID DESC,p.PartyID`;

exports.report = async (req, res) => {
    const input = req.query?.search;
    if (input !== undefined && (typeof input !== 'string' || input.length > 150))
        return res.status(400).json({ error: 'Enter an account code or name of at most 150 characters.' });
    const search = (input || '').trim();
    if (!search) return res.json({ rows: [], totals: emptyTotals(), searchRequired: true, search: '' });
    try {
        const pool = await getPool();
        const result = await pool.request().input('search', sql.NVarChar(302), like(search))
            .input('exact', sql.NVarChar(150), search).query(reportQuery);
        const rows = result.recordset;
        const accounts = new Set(rows.map(row => row.AccountID));
        const linked = new Set(rows.filter(row => row.BookingID != null).map(row => row.AccountID));
        const bookings = new Set(rows.filter(row => row.BookingID != null).map(row => row.BookingID));
        res.json({ rows, totals: { accounts: accounts.size, linkedAccounts: linked.size,
            unlinkedAccounts: accounts.size - linked.size, bookings: bookings.size }, searchRequired: false, search,
            generatedAt: new Date().toISOString(),
            basis: 'Current customer account links. All linked bookings are included, with their status and historical flag.' });
    } catch (error) {
        console.error('accountBookingReport:', error);
        res.status(500).json({ error: error.message });
    }
};
exports.reportQuery = reportQuery;
