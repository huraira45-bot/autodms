const { sql } = require('../config/db');
// Natural account codes survive database moves; booking/variant IDs do not.
function legacyMasterCodeSql(vehicleText) {
    return `CASE
        WHEN ${vehicleText} LIKE '%DEEPAL%S05%' OR ${vehicleText} LIKE '%DEEPAL%SO5%' THEN '102001011'
        WHEN ${vehicleText} LIKE '%DEEPAL%L07%' OR ${vehicleText} LIKE '%DEEPAL%LO7%' THEN '102001008'
        WHEN ${vehicleText} LIKE '%OSHAN%' THEN '102001006'
        WHEN ${vehicleText} LIKE '%ALSVIN%' OR ${vehicleText} LIKE '%ASLVIN%' THEN '102001005'
        WHEN ${vehicleText} LIKE '%SHERPA%' THEN '102001002'
        WHEN ${vehicleText} LIKE '%HUNTER%' THEN '102001012'
        WHEN ${vehicleText} LIKE '%KARV%' OR ${vehicleText} LIKE '%KARW%' OR ${vehicleText} LIKE '%KAVAN%' THEN '102001001'
        ELSE NULL END`;
}
const VARIANT_TEXT_SQL = "UPPER(ISNULL(variant.VariantCode,'')+' '+ISNULL(variant.VariantName,''))";
async function historicalMasterAccount(executor, bookingId) {
    const result = await new sql.Request(executor).input('bid', sql.Int, bookingId).query(`
        SELECT coa.GLCAID FROM dms_VehicleVariant variant
        JOIN dms_SalesBookings booking ON booking.VehicleVariantID=variant.VariantID
        JOIN GLChartOFAccount coa ON coa.GLCode=${legacyMasterCodeSql(VARIANT_TEXT_SQL)}
        WHERE booking.BookingID=@bid AND booking.IsHistorical=1`);
    // Ambiguous or unrecognized account configuration must not infer a source.
    return result.recordset.length === 1 ? result.recordset[0].GLCAID : null;
}
module.exports = { legacyMasterCodeSql, VARIANT_TEXT_SQL, historicalMasterAccount };
