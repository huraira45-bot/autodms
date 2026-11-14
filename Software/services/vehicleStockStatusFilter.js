const STOCK_STATUSES = ['AtDealer', 'InTransit', 'AtMaster', 'Allocated'];
function parseStockStatus(value) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !STOCK_STATUSES.includes(value)) throw Object.assign(new Error('Invalid vehicle stock status.'), { status: 400 });
    return value;
}
function parseAllocationType(value) {
    if (value === undefined || value === '') return null;
    if (typeof value !== 'string' || !['Booked', 'OpenAllocation'].includes(value)) throw Object.assign(new Error('Invalid vehicle stock type.'), { status: 400 });
    return value;
}
// Allocation is an assignment, not a physical location. Retain the last recorded
// physical position for allocated units; legacy units without history stay at dealer.
function allocatedStockPositionSql(alias = 'v') {
    return `CASE WHEN ${alias}.Status='Allocated' THEN COALESCE((
        SELECT TOP(1) locationHistory.ToStatus FROM dms_VehicleInventoryLedger locationHistory
        WHERE locationHistory.VehicleID=${alias}.VehicleID AND locationHistory.ToStatus IN ('AtDealer','InTransit','AtMaster')
        ORDER BY locationHistory.MovementID DESC),'AtDealer') ELSE ${alias}.Status END`;
}
function stockPosition(row) {
    const effective = row.ReportStatus || row.Status;
    if (effective !== 'Allocated') return effective;
    return row.RecordedStockPosition || 'AtDealer';
}
module.exports = { parseStockStatus, parseAllocationType, allocatedStockPositionSql, stockPosition };
