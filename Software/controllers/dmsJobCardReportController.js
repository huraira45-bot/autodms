const { sql, getPool } = require('../config/db');

function dateFilter(value, label) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value))
        throw new Error(`${label} must be a valid date (YYYY-MM-DD).`);
    const day = new Date(`${value}T00:00:00.000Z`);
    if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== value || value < '1753-01-01')
        throw new Error(`${label} must be a valid date from 1753 onwards.`);
    return day;
}

exports.report = async (req, res) => {
    const query = req.query || {};
    let number, match, finalized, from, to;
    try {
        if (query.number !== undefined && (typeof query.number !== 'string' || query.number.length > 50))
            throw new Error('Enter a DMS job card number of at most 50 characters.');
        number = (query.number || '').trim();
        match = query.match === undefined ? 'contains' : query.match;
        finalized = query.finalized === undefined ? 'all' : query.finalized;
        if (!['contains', 'exact'].includes(match)) throw new Error('Choose contains or exact number matching.');
        if (!['all', 'draft', 'finalized'].includes(finalized)) throw new Error('Choose All, Draft or Finalized.');
        from = dateFilter(query.from, 'From');
        to = dateFilter(query.to, 'To');
        if (from && to && from > to) throw new Error('From date cannot be after To date.');
    } catch (error) {
        return res.status(400).json({ error: error.message });
    }
    const filters = { number, match, finalized, from: query.from || '', to: query.to || '' };
    // A date-only report includes all cards with a recorded DMS number.
    // Require a complete range when no number is supplied to avoid an initial full-register load.
    if (!number && !(from && to)) return res.json({ ...filters, searchRequired: true, rows: [], count: 0 });
    try {
        const pool = await getPool();
        const request = pool.request();
        const where = ["NULLIF(LTRIM(RTRIM(REPLACE(REPLACE(REPLACE(REPLACE(j.DMSJobCardNo, NCHAR(9), N' '), NCHAR(10), N' '), NCHAR(13), N' '), NCHAR(160), N' '))), N'') IS NOT NULL"];
        if (number) {
            request.input('exact', sql.NVarChar(50), number);
            if (match === 'exact') where.push('j.DMSJobCardNo = @exact');
            else {
                request.input('number', sql.NVarChar(102), `%${number.replace(/[~%_[\]]/g, '~$&')}%`);
                where.push("j.DMSJobCardNo LIKE @number ESCAPE '~'");
            }
        }
        if (from) {
            request.input('from', sql.DateTime, from);
            where.push('j.JobCardDate >= @from');
        }
        if (to) {
            // JobCardDate is SQL datetime: .997 is its final representable tick of the day.
            to.setUTCHours(23, 59, 59, 997);
            request.input('to', sql.DateTime, to);
            where.push('j.JobCardDate <= @to');
        }
        if (finalized === 'finalized') where.push('j.IsFinalized = 1');
        else if (finalized === 'draft') where.push('(j.IsFinalized = 0 OR j.IsFinalized IS NULL)');
        const result = await request.query(`
            SELECT j.JobCardId, j.JobCardNo, j.jobCode, j.DMSJobCardNo,
                CONVERT(varchar(10),j.JobCardDate,23) AS JobCardDate,
                c.endUserName AS CustomerName, c.PhoneNo, c.CNIC,
                p.PartyName AS CreditPartyName, j.VehicleRegNo, j.ChasisNo,
                j.VersionCode AS VehicleModel, t.Title AS JobTypeName,
                j.ServiceAdvisor, j.Status AS PaymentType, j.IsFinalized,
                CASE j.JobStatus WHEN 0 THEN 'Open' WHEN 1 THEN 'In Progress'
                    WHEN 2 THEN 'Ready' WHEN 3 THEN 'Invoiced' WHEN 4 THEN 'Closed'
                    ELSE 'Unknown' END AS JobStatusText
            FROM Addata_JobCardInfo j
            LEFT JOIN addata_CustomerInfo c ON c.ProfileID = j.EndUserID
            LEFT JOIN gen_PartiesInfo p ON p.PartyID = j.PartyID
            LEFT JOIN gen_JobCardType t ON t.JobCardTypeId = j.JobTypeId
            WHERE ${where.join(' AND ')}
            ORDER BY ${number ? 'CASE WHEN j.DMSJobCardNo = @exact THEN 0 ELSE 1 END,' : ''}
                j.JobCardDate DESC, j.JobCardId DESC`);
        return res.json({ ...filters, searchRequired: false, rows: result.recordset, count: result.recordset.length });
    } catch (error) {
        console.error('dmsJobCardReport:', error);
        return res.status(500).json({ error: error.message });
    }
};
