/**
 * Sales (Vehicle) reports.
 *   - Booking Register             — every booking in the period, with status + paid
 *   - Vehicle Inventory            — vehicles in stock by status + cost
 *   - Executive Performance        — bookings/conversions per sales exec
 *   - Customer Advances Aging      — outstanding deposits bucketed by age
 */
const { sql, getPool } = require('../config/db');

function parseRange(req) {
    const today = new Date();
    const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const from = req.query.from ? new Date(req.query.from) : firstOfMonth;
    const to = req.query.to ? new Date(req.query.to) : today;
    to.setHours(23, 59, 59, 999);
    return { from, to };
}

/**
 * GET /reports/sales/booking-register
 */
exports.bookingRegister = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const rq = pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to);
        const conds = ['b.CreatedAt BETWEEN @from AND @to'];
        if (req.query.status) { rq.input('st', sql.NVarChar(30), req.query.status); conds.push('b.Status = @st'); }

        const r = await rq.query(`
            SELECT b.BookingID, b.BookingNo, b.CreatedAt AS BookedOn, b.Status,
                   b.StandardPrice, b.NegotiatedPrice, b.DiscountAmount,
                   b.AmountPaidToDate, b.DeliveredAt, b.CancelledAt,
                   p.PartyName AS CustomerName,
                   m.ModelCode + ' ' + ISNULL(v.VariantName, '') AS Vehicle,
                   b.CreatedByName AS ExecutiveName
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo p     ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleVariant v  ON b.VehicleVariantID = v.VariantID
            LEFT JOIN dms_VehicleModel m    ON v.ModelID = m.ModelID
            WHERE ${conds.join(' AND ')}
            ORDER BY b.CreatedAt DESC`);

        const rows = r.recordset.map(x => ({
            BookingNo:     x.BookingNo,
            BookedOn:      x.BookedOn?.toISOString().slice(0,10),
            Status:        x.Status,
            CustomerName:  x.CustomerName || '',
            Vehicle:       x.Vehicle?.trim() || '',
            ExecutiveName: x.ExecutiveName || '',
            StandardPrice: +Number(x.StandardPrice || 0).toFixed(2),
            Negotiated:    +Number(x.NegotiatedPrice || 0).toFixed(2),
            Discount:      +Number(x.DiscountAmount || 0).toFixed(2),
            Paid:          +Number(x.AmountPaidToDate || 0).toFixed(2),
            Outstanding:   +(Number(x.NegotiatedPrice || 0) - Number(x.AmountPaidToDate || 0)).toFixed(2),
            DeliveredAt:   x.DeliveredAt?.toISOString().slice(0,10) || null,
            CancelledAt:   x.CancelledAt?.toISOString().slice(0,10) || null,
        }));

        const totals = {
            count:       rows.length,
            standard:    +rows.reduce((s, x) => s + x.StandardPrice, 0).toFixed(2),
            negotiated:  +rows.reduce((s, x) => s + x.Negotiated, 0).toFixed(2),
            discount:    +rows.reduce((s, x) => s + x.Discount, 0).toFixed(2),
            paid:        +rows.reduce((s, x) => s + x.Paid, 0).toFixed(2),
            outstanding: +rows.reduce((s, x) => s + x.Outstanding, 0).toFixed(2),
            byStatus:    rows.reduce((m, x) => ((m[x.Status] = (m[x.Status] || 0) + 1), m), {}),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('bookingRegister:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/sales/vehicle-inventory
 * Vehicles currently in stock (Status != Sold/Delivered), with cost basis.
 */
exports.vehicleInventory = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT v.VehicleID, v.ChasisNo, v.EngineNo, v.Color, v.ManufactureYear,
                   v.Status, v.Location, v.AllocationType, v.ReceivedAt,
                   m.ModelCode, m.ModelName, m.BrandName,
                   vr.VariantName, vr.VariantCode,
                   vr.StandardPrice
            FROM dms_Vehicle v
            LEFT JOIN dms_VehicleVariant vr ON v.VariantID = vr.VariantID
            LEFT JOIN dms_VehicleModel m    ON vr.ModelID = m.ModelID
            ORDER BY v.ReceivedAt DESC, v.VehicleID DESC`);

        const rows = r.recordset.map(x => ({
            ChasisNo:        x.ChasisNo,
            EngineNo:        x.EngineNo || '',
            Color:           x.Color || '',
            Year:            x.ManufactureYear || '',
            Brand:           x.BrandName || '',
            Model:           x.ModelCode || '',
            ModelName:       x.ModelName || '',
            Variant:         x.VariantName || '',
            Status:          x.Status || '',
            Location:        x.Location || '',
            AllocationType:  x.AllocationType || '',
            StandardPrice:   +Number(x.StandardPrice || 0).toFixed(2),
            ReceivedAt:      x.ReceivedAt?.toISOString().slice(0,10) || null,
            DaysInStock:     x.ReceivedAt ? Math.floor((Date.now() - new Date(x.ReceivedAt).getTime()) / 86400000) : null,
        }));

        const inStock = rows.filter(r => r.Status !== 'Delivered' && r.Status !== 'Sold');
        const totals = {
            total:         rows.length,
            inStock:       inStock.length,
            valueInStock:  +inStock.reduce((s, x) => s + x.StandardPrice, 0).toFixed(2),
            byStatus:      rows.reduce((m, x) => ((m[x.Status || 'Unknown'] = (m[x.Status || 'Unknown'] || 0) + 1), m), {}),
            byModel:       rows.reduce((m, x) => ((m[x.ModelName || 'Unknown'] = (m[x.ModelName || 'Unknown'] || 0) + 1), m), {}),
        };

        res.json({ rows, totals });
    } catch (err) { console.error('vehicleInventory:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/sales/executive-performance
 * Per sales-executive: bookings created, confirmed, cancelled, total revenue.
 */
exports.executivePerformance = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from)
            .input('to',   sql.DateTime, to)
            .query(`
                SELECT b.CreatedBy_SalesExecutiveID AS ExeID,
                       MAX(b.CreatedByName) AS ExeName,
                       COUNT(*) AS Bookings,
                       SUM(CASE WHEN b.Status IN ('Confirmed','Delivered','Closed') THEN 1 ELSE 0 END) AS Confirmed,
                       SUM(CASE WHEN b.Status = 'Cancelled' THEN 1 ELSE 0 END) AS Cancelled,
                       SUM(ISNULL(b.NegotiatedPrice, 0)) AS NegotiatedRev,
                       SUM(ISNULL(b.AmountPaidToDate, 0)) AS Collected
                FROM dms_SalesBookings b
                WHERE b.CreatedAt BETWEEN @from AND @to
                GROUP BY b.CreatedBy_SalesExecutiveID
                ORDER BY Bookings DESC`);

        const rows = r.recordset.map(x => ({
            ExeID:        x.ExeID,
            ExeName:      x.ExeName || (x.ExeID ? `Employee #${x.ExeID}` : 'Unknown'),
            Bookings:     x.Bookings,
            Confirmed:    x.Confirmed,
            Cancelled:    x.Cancelled,
            ConversionPct: x.Bookings > 0 ? +(x.Confirmed * 100 / x.Bookings).toFixed(1) : 0,
            NegotiatedRev: +Number(x.NegotiatedRev || 0).toFixed(2),
            Collected:     +Number(x.Collected || 0).toFixed(2),
        }));

        const totals = {
            execs:        rows.length,
            bookings:     rows.reduce((s, x) => s + x.Bookings, 0),
            confirmed:    rows.reduce((s, x) => s + x.Confirmed, 0),
            cancelled:    rows.reduce((s, x) => s + x.Cancelled, 0),
            negotiated:   +rows.reduce((s, x) => s + x.NegotiatedRev, 0).toFixed(2),
            collected:    +rows.reduce((s, x) => s + x.Collected, 0).toFixed(2),
        };

        res.json({ from: from.toISOString().slice(0,10), to: to.toISOString().slice(0,10), rows, totals });
    } catch (err) { console.error('executivePerformance:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/sales/customer-advances-aging
 * Outstanding booking deposits (paid > 0, status != Cancelled and not Delivered)
 * bucketed by age. Each row = one booking.
 */
exports.customerAdvancesAging = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT b.BookingID, b.BookingNo, b.CreatedAt, b.Status,
                   p.PartyName AS Customer,
                   m.ModelCode + ' ' + ISNULL(vv.VariantName, '') AS Vehicle,
                   b.NegotiatedPrice, b.AmountPaidToDate,
                   DATEDIFF(DAY, b.CreatedAt, GETDATE()) AS AgeDays
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo p      ON b.PartyID = p.PartyID
            LEFT JOIN dms_VehicleVariant vv  ON b.VehicleVariantID = vv.VariantID
            LEFT JOIN dms_VehicleModel m     ON vv.ModelID = m.ModelID
            WHERE b.AmountPaidToDate > 0
              AND b.Status NOT IN ('Cancelled','Delivered','Closed')
            ORDER BY DATEDIFF(DAY, b.CreatedAt, GETDATE()) DESC`);

        const bucket = (age) => {
            if (age <= 30) return '0-30';
            if (age <= 60) return '31-60';
            if (age <= 90) return '61-90';
            return '90+';
        };

        const rows = r.recordset.map(x => ({
            BookingNo:    x.BookingNo,
            BookedOn:     x.CreatedAt?.toISOString().slice(0,10),
            Customer:     x.Customer || '',
            Vehicle:      x.Vehicle?.trim() || '',
            Status:       x.Status,
            Negotiated:   +Number(x.NegotiatedPrice || 0).toFixed(2),
            Paid:         +Number(x.AmountPaidToDate || 0).toFixed(2),
            AgeDays:      x.AgeDays,
            Bucket:       bucket(x.AgeDays),
        }));

        const totals = {
            bookings:  rows.length,
            paid:      +rows.reduce((s, x) => s + x.Paid, 0).toFixed(2),
            byBucket:  rows.reduce((m, x) => {
                m[x.Bucket] = (m[x.Bucket] || { count: 0, amount: 0 });
                m[x.Bucket].count++;
                m[x.Bucket].amount = +(m[x.Bucket].amount + x.Paid).toFixed(2);
                return m;
            }, {}),
        };

        res.json({ rows, totals });
    } catch (err) { console.error('customerAdvancesAging:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/sales/booking-pipeline
 * Funnel: inquiries → bookings → allocated → invoiced → delivered, with
 * per-stage counts and a leakage column (entered − exited stage).
 */
exports.bookingPipeline = async (req, res) => {
    try {
        const { from, to } = parseRange(req);
        const pool = await getPool();
        const r = await pool.request()
            .input('from', sql.DateTime, from).input('to', sql.DateTime, to)
            .query(`
                SELECT
                    (SELECT COUNT(*) FROM dms_CRO_Inquiries
                       WHERE CreatedAt BETWEEN @from AND @to)                                            AS Inquiries,
                    (SELECT COUNT(*) FROM dms_SalesBookings
                       WHERE CreatedAt BETWEEN @from AND @to AND Status <> 'Cancelled')                  AS Bookings,
                    (SELECT COUNT(*) FROM dms_SalesBookings
                       WHERE CreatedAt BETWEEN @from AND @to AND AllocatedVehicleID IS NOT NULL)         AS Allocated,
                    (SELECT COUNT(*) FROM dms_SalesBookings
                       WHERE CreatedAt BETWEEN @from AND @to AND Status IN ('MasterInvoicePosted','ReadyForDelivery','Closed','Delivered','GatePassIssued')) AS MasterInvoiced,
                    (SELECT COUNT(*) FROM dms_SalesBookings
                       WHERE GatePassIssuedAt BETWEEN @from AND @to)                                     AS Delivered,
                    (SELECT COUNT(*) FROM dms_SalesBookingCancellations
                       WHERE RequestedAt BETWEEN @from AND @to AND Status='Executed')                    AS Cancelled
            `);
        const k = r.recordset[0];
        const stages = [
            { stage: 'Inquiries',       count: k.Inquiries },
            { stage: 'Bookings',        count: k.Bookings,        conversion: pct(k.Bookings, k.Inquiries) },
            { stage: 'Allocated',       count: k.Allocated,       conversion: pct(k.Allocated, k.Bookings) },
            { stage: 'Master Invoiced', count: k.MasterInvoiced,  conversion: pct(k.MasterInvoiced, k.Allocated) },
            { stage: 'Delivered',       count: k.Delivered,       conversion: pct(k.Delivered, k.MasterInvoiced) },
        ];
        res.json({
            from: from.toISOString().slice(0, 10),
            to:   to.toISOString().slice(0, 10),
            stages,
            cancelled: k.Cancelled,
        });
    } catch (err) { console.error('bookingPipeline:', err); res.status(500).json({ error: err.message }); }
};

function pct(num, den) {
    if (!den) return null;
    return Math.round((Number(num) / Number(den)) * 1000) / 10;
}

/**
 * GET /reports/sales/master-invoice-aging
 * Bookings sitting in Allocated (waiting for Master Changan to invoice us).
 * Aging buckets help finance chase Master when invoices lag.
 */
exports.masterInvoiceAging = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT b.BookingID, b.BookingNo, p.PartyName, v.VariantName,
                   b.AllocatedChasisNo, b.AllocatedAt,
                   DATEDIFF(day, b.AllocatedAt, GETDATE()) AS DaysSinceAlloc,
                   b.NegotiatedPrice
            FROM dms_SalesBookings b
            LEFT JOIN gen_PartiesInfo p   ON p.PartyID   = b.PartyID
            LEFT JOIN dms_VehicleVariant v ON v.VariantID = b.VariantID
            WHERE b.Status = 'Allocated' AND b.AllocatedAt IS NOT NULL
            ORDER BY b.AllocatedAt ASC`);
        const rows = r.recordset.map(x => ({
            ...x,
            Bucket: x.DaysSinceAlloc <= 7 ? '0-7 days'
                  : x.DaysSinceAlloc <= 14 ? '8-14 days'
                  : x.DaysSinceAlloc <= 30 ? '15-30 days'
                  : '30+ days',
        }));
        const buckets = {};
        for (const x of rows) buckets[x.Bucket] = (buckets[x.Bucket] || 0) + 1;
        res.json({ rows, buckets, total: rows.length });
    } catch (err) { console.error('masterInvoiceAging:', err); res.status(500).json({ error: err.message }); }
};

/**
 * GET /reports/sales/incentive-receivable-aging
 * Master incentive accruals not yet received, bucketed by age from AccruedAt.
 */
exports.incentiveReceivableAging = async (req, res) => {
    try {
        const pool = await getPool();
        const r = await pool.request().query(`
            SELECT a.AccrualID, a.BookingID, b.BookingNo, a.IncentiveCategory,
                   a.AmountAccrued, a.DisbursedAmount,
                   a.AmountAccrued - a.DisbursedAmount AS Outstanding,
                   a.AccruedAt, DATEDIFF(day, a.AccruedAt, GETDATE()) AS DaysSinceAccrued,
                   v.ChasisNo
            FROM dms_SalesIncentiveAccruals a
            LEFT JOIN dms_SalesBookings b ON b.BookingID = a.BookingID
            LEFT JOIN dms_Vehicle       v ON v.VehicleID = a.VehicleID
            WHERE a.EarnerType='Master' AND a.Status IN ('Accrued','PartiallyDisbursed')
              AND (a.AmountAccrued - a.DisbursedAmount) > 0.01
            ORDER BY a.AccruedAt ASC`);
        const rows = r.recordset.map(x => ({
            ...x,
            Bucket: x.DaysSinceAccrued <= 30 ? '0-30 days'
                  : x.DaysSinceAccrued <= 60 ? '31-60 days'
                  : x.DaysSinceAccrued <= 90 ? '61-90 days'
                  : '90+ days',
        }));
        const buckets = {};
        let total = 0;
        for (const x of rows) {
            buckets[x.Bucket] = (buckets[x.Bucket] || 0) + Number(x.Outstanding);
            total += Number(x.Outstanding);
        }
        res.json({ rows, buckets, total: +total.toFixed(2) });
    } catch (err) { console.error('incentiveReceivableAging:', err); res.status(500).json({ error: err.message }); }
};
