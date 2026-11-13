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
module.exports = { parseStockStatus, parseAllocationType };
