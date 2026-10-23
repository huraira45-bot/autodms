const { sql, getPool } = require('../config/db');
const { resolveRole } = require('./systemAccountsController');
const { bookingPaymentReportQuery } = require('../services/bookingPaymentReportQuery');
const { masterAmountDue } = require('../services/salesMasterAmount');
const { effectiveMasterPaid } = require('../services/historicalMasterApprovalService');
const { deliveryMonthKey } = require('../services/bookingDeliveryMonthService');

const PAYMENT_FILTERS = ['complete', 'partial', 'unpaid', 'remaining', 'unpriced'];
function dateFilter(value) {
    if (!value) return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Booking dates must be YYYY-MM-DD.');
    const date = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid booking date.');
    return date;
}
function idFilter(value, label) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) > 2147483647) {
        throw new Error(`Invalid ${label}.`);
    }
    return Number(value);
}
function paymentFilter(value) {
    if (value === undefined || value === '') return null;
    if (!PAYMENT_FILTERS.includes(value)) throw new Error('Invalid payment status.');
    return value;
}
const cents = value => Math.round(Number(value || 0) * 100);
function position(due, paid) {
    const required = cents(due), received = cents(paid);
    return {
        due: required / 100, paid: received / 100,
        remaining: Math.max(0, required - received) / 100,
        overpaid: required > 0 ? Math.max(0, received - required) / 100 : 0,
        status: required <= 0 ? 'unpriced' : received >= required ? 'complete' : received > 0 ? 'partial' : 'unpaid',
    };
}
const matches = (filter, status) => !filter || (filter === 'remaining' ? ['partial', 'unpaid'].includes(status) : filter === status);

exports.report = async (req, res) => {
    try {
        let from, to, modelId, variantId, salespersonId, customerPayment, masterPayment;
        try {
            from = dateFilter(req.query.from); to = dateFilter(req.query.to);
            if (from && to && from > to) throw new Error('From date must not be after To date.');
            modelId = idFilter(req.query.modelId, 'model'); variantId = idFilter(req.query.variantId, 'variant');
            salespersonId = idFilter(req.query.salespersonId, 'salesperson');
            customerPayment = paymentFilter(req.query.customerPayment); masterPayment = paymentFilter(req.query.masterPayment);
        } catch (error) { return res.status(400).json({ error: error.message }); }
        const pool = await getPool();
        const coreGL = await resolveRole('BOOKING_VARIANT_RECEIVABLE');
        const request = pool.request().input('gl', sql.Int, coreGL);
        const conditions = ["b.Status<>'Cancelled'"];
        if (from) { request.input('from', sql.Date, from); conditions.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)>=@from'); }
        if (to) { request.input('to', sql.Date, to); conditions.push('CAST(COALESCE(b.BookingDate,b.CreatedAt) AS DATE)<=@to'); }
        for (const [key, value, column] of [['modelId', modelId, 'VehicleModelID'], ['variantId', variantId, 'VehicleVariantID'], ['salespersonId', salespersonId, 'CreatedBy_SalesExecutiveID']]) {
            if (value) { request.input(key, sql.Int, value); conditions.push(`b.${column}=@${key}`); }
        }
        const search = String(req.query.search || '').trim().slice(0, 150);
        if (search) {
            request.input('search', sql.NVarChar(302), `%${search}%`);
            conditions.push('(b.BookingNo LIKE @search OR p.PartyName LIKE @search OR veh.ChasisNo LIKE @search OR p.PhoneOne LIKE @search)');
        }
        // Exclude delivery settlements from remittance totals: clearing the
        // booking account at delivery does not undo the payment sent to Master.
        // Keep genuine reversals, direct pay orders and historical allocations.
        const result = await request.query(bookingPaymentReportQuery(conditions));
        const rows = result.recordset.map(row => {
            const customer = position(row.NegotiatedPrice, row.AmountPaidToDate);
            const master = position(masterAmountDue(row), effectiveMasterPaid(row, row.MasterLedgerRemitted));
            return {
                BookingID: row.BookingID, BookingNo: row.BookingNo, BookingDate: row.BookingDate?.toISOString().slice(0, 10) || null,
                PromisedDeliveryMonth: deliveryMonthKey(row.PromisedDeliveryMonth), Status: row.Status, IsHistorical: !!row.IsHistorical,
                VehicleModelID: row.VehicleModelID, VehicleVariantID: row.VehicleVariantID, SalespersonID: row.SalespersonID,
                CustomerName: row.CustomerName, Phone: row.Phone, ModelName: row.ModelName, VariantName: row.VariantName,
                ChasisNo: row.ChasisNo, SalespersonName: row.SalespersonName,
                VehiclePrice: customer.due, VehiclePaid: customer.paid, CustomerRemaining: customer.remaining,
                CustomerOverpaid: customer.overpaid, CustomerPaymentStatus: customer.status,
                MasterDue: master.due, MasterPaid: master.paid, MasterRemaining: master.remaining,
                MasterOverpaid: master.overpaid, MasterPaymentStatus: master.status,
                MasterLedgerRemitted: cents(row.MasterLedgerRemitted) / 100,
                HistoricalMasterApprovedAmount: row.IsHistorical ? cents(row.HistoricalMasterApprovedAmount) / 100 : 0,
                MasterApprovalUsed: !!row.IsHistorical && cents(row.HistoricalMasterApprovedAmount) > cents(row.MasterLedgerRemitted),
            };
        }).filter(row => matches(customerPayment, row.CustomerPaymentStatus) && matches(masterPayment, row.MasterPaymentStatus));
        const totals = { count: rows.length };
        for (const key of ['VehiclePrice', 'VehiclePaid', 'CustomerRemaining', 'CustomerOverpaid', 'MasterDue', 'MasterPaid', 'MasterRemaining', 'MasterOverpaid']) {
            totals[key] = rows.reduce((sum, row) => sum + cents(row[key]), 0) / 100;
        }
        res.json({ rows, totals, generatedAt: new Date().toISOString(),
            basis: 'Current vehicle payments; premium and cancelled bookings excluded. Master includes posted remittances net of reversals, linked historical payments and historical approvals; delivery settlements excluded.' });
    } catch (error) {
        if (error.code === 'SYSTEM_ACCOUNT_NOT_CONFIGURED') return res.status(409).json({ error: error.message });
        console.error('bookingPaymentReport:', error);
        res.status(500).json({ error: error.message });
    }
};

// Report-specific lookups use the same read permission as the report, including
// inactive models/variants and former employees still referenced by bookings.
exports.options = async (req, res) => {
    try {
        const pool = await getPool();
        const result = await pool.request().query(`
            SELECT DISTINCT b.VehicleModelID AS ModelID,m.ModelName
            FROM dms_SalesBookings b LEFT JOIN dms_VehicleModel m ON m.ModelID=b.VehicleModelID
            WHERE b.Status<>'Cancelled' ORDER BY m.ModelName;
            SELECT DISTINCT b.VehicleVariantID AS VariantID,b.VehicleModelID AS ModelID,v.VariantName
            FROM dms_SalesBookings b LEFT JOIN dms_VehicleVariant v ON v.VariantID=b.VehicleVariantID
            WHERE b.Status<>'Cancelled' ORDER BY v.VariantName;
            SELECT DISTINCT b.CreatedBy_SalesExecutiveID AS SalespersonID,e.EmployeeName AS SalespersonName
            FROM dms_SalesBookings b LEFT JOIN gen_EmployeeInfo e ON e.EmployeeID=b.CreatedBy_SalesExecutiveID
            WHERE b.Status<>'Cancelled' AND b.CreatedBy_SalesExecutiveID IS NOT NULL ORDER BY e.EmployeeName;`);
        res.json({ models: result.recordsets[0], variants: result.recordsets[1], salespeople: result.recordsets[2] });
    } catch (error) { res.status(500).json({ error: error.message }); }
};
