/**
 * Live on-hand stock helpers used by the parts-issue / store-sale guards.
 *
 *   on-hand = Σ data_StockArrivalDetail.Quantity (opening + manual arrivals)
 *           + Σ data_StockInOutDetail.Quantity   (signed: GRN +, issue/sale -)
 *
 * Same formula the Inventory Valuation report uses (see reportsController
 * line ~1084 after the 2026-06-29 sign fix). Run inside the same transaction
 * the caller is using so concurrent issues don't both pass the check.
 */
const { sql } = require('../config/db');

async function getOnHand(reqOrTx, itemId) {
    // Accepts either a fresh sql.Request OR an active transaction
    const r = (typeof reqOrTx.query === 'function')
        ? reqOrTx
        : new sql.Request(reqOrTx);
    const res = await r.input('iid', sql.Int, itemId).query(`
        SELECT
            ISNULL((SELECT SUM(Quantity) FROM data_StockArrivalDetail  WHERE ItemId = @iid), 0)
          + ISNULL((SELECT SUM(Quantity) FROM data_StockInOutDetail    WHERE ItemId = @iid), 0)
          AS OnHand
    `);
    return Number(res.recordset[0].OnHand) || 0;
}

/**
 * Throws an Error with a user-friendly message if any of the requested issues
 * would push on-hand stock negative.
 *   items: [{ ItemId, Quantity, ItenName? }, …]
 */
async function assertEnoughStock(reqOrTx, items) {
    // Aggregate by item — multiple lines of the same part need to be summed
    const need = new Map();
    for (const it of items) {
        const id = Number(it.ItemId);
        const qty = Number(it.Quantity || it.IssueQuantity || 0);
        if (!id || qty <= 0) continue;
        need.set(id, (need.get(id) || 0) + qty);
    }
    for (const [itemId, qty] of need) {
        const onHand = await getOnHand(reqOrTx, itemId);
        if (onHand < qty) {
            const nameLookup = await new sql.Request(typeof reqOrTx.query === 'function' ? undefined : reqOrTx)
                .input('iid', sql.Int, itemId)
                .query('SELECT TOP 1 ItenName, ItemNumber FROM InventItems WHERE ItemId=@iid');
            const n = nameLookup.recordset[0] || {};
            const name = `${n.ItemNumber || itemId} ${n.ItenName || ''}`.trim();
            throw new Error(
                `Insufficient stock for "${name}". On-hand: ${onHand}, requested: ${qty}.`
            );
        }
    }
}

module.exports = { getOnHand, assertEnoughStock };
