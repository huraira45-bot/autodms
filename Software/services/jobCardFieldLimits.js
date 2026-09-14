/**
 * Field-length guard for job card saves.
 *
 * Owner report 2026-09-14: creating a job card failed with "String or binary
 * data would be truncated". SQL Server 2017 — the live server — reports an
 * over-long value with exactly that sentence and nothing more: no column, no
 * value. So when any one of the job card's many text fields is too long, the
 * advisor gets an error with no way of knowing which box to shorten.
 *
 * This checks the payload against the real column widths before the INSERT
 * and names the field. The widths are read from the database once per process
 * rather than copied into code, so the check always matches the schema of the
 * database it is actually running against (local and live differ in history).
 */

// payload key -> [table, column, label shown on the form]
const FIELDS = {
    jobCode:        ['Addata_JobCardInfo', 'jobCode',        'Job Number'],
    DMSJobCardNo:   ['Addata_JobCardInfo', 'DMSJobCardNo',   'DMS Job Card No'],
    VehicleRegNo:   ['Addata_JobCardInfo', 'VehicleRegNo',   'Registration No'],
    ChasisNo:       ['Addata_JobCardInfo', 'ChasisNo',       'Chassis No'],
    EngineNo:       ['Addata_JobCardInfo', 'EngineNo',       'Engine No'],
    VersionCode:    ['Addata_JobCardInfo', 'VersionCode',    'Vehicle Type / Model'],
    VehicleCode:    ['Addata_JobCardInfo', 'VehicleCode',    'Year / Variant'],
    PaymentType:    ['Addata_JobCardInfo', 'Status',         'Payment Type'],
    PaymentCO:      ['Addata_JobCardInfo', 'PaymentCO',      'Payment C/O'],
    FuelLevel:      ['Addata_JobCardInfo', 'FuelLevel',      'Fuel Level'],
    CustomerType:   ['Addata_JobCardInfo', 'CustomerType',   'Customer Type'],
    PMType:         ['Addata_JobCardInfo', 'PMType',         'PM Type'],
    ServiceAdvisor: ['Addata_JobCardInfo', 'ServiceAdvisor', 'Service Advisor'],
    BatteryNo:      ['Addata_JobCardInfo', 'BatteryNo',      'Battery No'],
    VehicleColor:   ['Addata_JobCardInfo', 'VehicleColor',   'Color'],
    EstimatedRONo:  ['Addata_JobCardInfo', 'EstimatedRONo',  'Estimated RO No'],
    ApprovedBy:     ['Addata_JobCardInfo', 'ApprovedBy',     'Approved By'],
    JobResult:      ['Addata_JobCardInfo', 'JobResult',      'Job Result'],
    BringByType:    ['Addata_JobCardInfo', 'BringByType',    'Brought By'],
    BringByName:    ['Addata_JobCardInfo', 'BringByName',    'Brought By — Name'],
    BringByMobile:  ['Addata_JobCardInfo', 'BringByMobile',  'Brought By — Mobile'],
    DeliveredTo:    ['Addata_JobCardInfo', 'DeliveredTo',    'Delivered To'],
    DeliveryMobile: ['Addata_JobCardInfo', 'DeliveryMobile', 'Delivery Mobile'],
    CareOffName:    ['Addata_JobCardInfo', 'CareOffName',    'Care Off'],
    DQIRNo:         ['Addata_JobCardInfo', 'DQIRNo',         'DQIR No'],
    CheckedByName:  ['Addata_JobCardInfo', 'CheckedByName',  'Checked By'],
    ConfirmByName:  ['Addata_JobCardInfo', 'ConfirmByName',  'Confirmed By'],
};

let widthCache = null;   // 'table.column' (lowercase) -> max length; -1 = MAX

async function loadWidths(pool) {
    if (widthCache) return widthCache;
    const r = await pool.request().query(`
        SELECT TABLE_NAME, COLUMN_NAME, CHARACTER_MAXIMUM_LENGTH
        FROM   INFORMATION_SCHEMA.COLUMNS
        WHERE  TABLE_NAME IN ('Addata_JobCardInfo', 'Addata_JobCardInfoDetail', 'dms_DamageMarks')
          AND  CHARACTER_MAXIMUM_LENGTH IS NOT NULL`);
    const map = {};
    for (const row of r.recordset) {
        map[`${row.TABLE_NAME}.${row.COLUMN_NAME}`.toLowerCase()] = Number(row.CHARACTER_MAXIMUM_LENGTH);
    }
    widthCache = map;
    return map;
}

function tooLong(widths, table, column, value) {
    if (value === undefined || value === null) return null;
    const max = widths[`${table}.${column}`.toLowerCase()];
    const len = String(value).length;
    return (max > 0 && len > max) ? { length: len, max } : null;
}

/**
 * Returns [] when every field fits, otherwise one entry per over-long field:
 *   { field, label, length, max }
 */
async function findOverlongFields(pool, body) {
    const widths = await loadWidths(pool);
    const problems = [];

    for (const [key, [table, column, label]] of Object.entries(FIELDS)) {
        const hit = tooLong(widths, table, column, body[key]);
        if (hit) problems.push({ field: key, label, ...hit });
    }

    (Array.isArray(body.LabourItems) ? body.LabourItems : []).forEach((item, i) => {
        const hit = tooLong(widths, 'Addata_JobCardInfoDetail', 'Remarks', item?.WorkDescription);
        if (hit) problems.push({ field: `LabourItems[${i}]`, label: `Job line ${i + 1} description`, ...hit });
    });

    (Array.isArray(body.DamageMarks) ? body.DamageMarks : []).forEach((mark, i) => {
        const hit = tooLong(widths, 'dms_DamageMarks', 'Note', mark?.Note);
        if (hit) problems.push({ field: `DamageMarks[${i}]`, label: `Damage mark ${i + 1} note`, ...hit });
    });

    return problems;
}

/** Human-readable message naming every over-long field. */
function describeOverlong(problems) {
    return 'These fields are too long to save: '
        + problems.map(p => `${p.label} (${p.length} characters, limit ${p.max})`).join('; ')
        + '. Shorten them and save again.';
}

module.exports = { findOverlongFields, describeOverlong };
