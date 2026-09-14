/**
 * Issuing parts to a job card, shared by the desk Parts Issue screen
 * (workshopController.issuePartsToJobCard) and the parts counter's requisition
 * queue (serviceIntakeController) — plan 2026-09-14, Phase 3.
 *
 * Moved here from issuePartsToJobCard so both paths move stock, snapshot GST
 * and resolve the COGS cost identically. Runs inside the caller's
 * transaction; the caller commits or rolls back.
 */
const { sql } = require('../config/db');
const { resolveRate } = require('../controllers/taxRatesController');
const { assertEnoughStock } = require('./stockBalanceService');
const { snapshotTax } = require('./jobCardSaveService');

/** A refusal the caller should return to the user with statusCode. */
class PartsIssueError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/**
 * Items: [{ ItemId, Quantity, Rate, Discount, DiscAmt, IsGST, WHID }]
 * Returns { StockIssueID, lines: [{ ItemId, StockIssueDetailID }] } with
 * lines in the same order as Items.
 */
async function issuePartsInTx(transaction, { JobCardId, JobCardNo, Items, Remarks }) {
    const finCheck = await transaction.request()
        .input('jcId', sql.Int, JobCardId)
        .query('SELECT IsFinalized FROM Addata_JobCardInfo WHERE JobCardId=@jcId');
    if (finCheck.recordset[0]?.IsFinalized) {
        throw new PartsIssueError('Job Card is finalized. Cannot issue parts.', 423);
    }

    // Block over-issue: every line's quantity must be ≤ current on-hand
    // (computed inside this transaction so concurrent issues can't both pass).
    try { await assertEnoughStock(transaction, Items); }
    catch (e) {
        throw new PartsIssueError(e.message, 400);
    }

    // 1. Create issue header
    const countRes = await transaction.request().query('SELECT ISNULL(MAX(IssueNo), 0) + 1 AS NextNo FROM data_StockIssuetoJobCard');
    const nextNo = countRes.recordset[0].NextNo;

    const insertRes = await transaction.request()
        .input('issueNo', sql.Int, nextNo)
        .input('issueDate', sql.Date, new Date())
        .input('jobCardId', sql.Int, JobCardId)
        .input('jobCardNo', sql.NVarChar(50), JobCardNo)
        .input('remarks', sql.NVarChar(sql.MAX), Remarks)
        .input('companyId', sql.Int, 1)
        .query(`INSERT INTO data_StockIssuetoJobCard
            (IssueNo, IssueDate, JobCardId, JobCardNo, Remarks, CompanyID, EntryUserDateTime)
            OUTPUT INSERTED.StockIssueID
            VALUES (@issueNo, @issueDate, @jobCardId, @jobCardNo, @remarks, @companyId, GETDATE())`);

    const issueId = insertRes.recordset[0].StockIssueID;

    // 2. Insert issue detail lines (with GST + landed cost snapshot per §14.4 / §14.6)
    let gstRate = 0;
    try { gstRate = await resolveRate('GST'); } catch (e) { console.warn('GST rate not configured:', e.message); }

    for (const item of Items) {
        // Resolve unit landed cost for the COGS snapshot.
        //
        // This used to be ISNULL(WeightedRate, ItemPurchasePrice), which
        // had two failures found 2026-09-10: ISNULL only falls back on
        // NULL, so a WeightedRate of 0 returned 0 and never consulted
        // ItemPurchasePrice; and nothing in AutoDMS ever maintains
        // WeightedRate, so items created after the original import sit
        // at 0 forever. Result: 400 issue lines (PKR 10.1M of parts)
        // booked at zero cost, and because jobCardJournalBuilder only
        // emits COGS/Inventory lines when partsCOGS > 0, 251 finalized
        // job cards relieved no inventory at all.
        //
        // NULLIF(...,0) makes each step actually fall through, and the
        // last resort is the real purchase cost off the most recent GRN
        // line for the item (data_PurchaseDetail.UnitLandedCost, which
        // grnController writes from the received ItemRate).
        const costRes = await new sql.Request(transaction)
            .input('iid', sql.Int, item.ItemId)
            .query(`SELECT COALESCE(
                        NULLIF(i.WeightedRate, 0),
                        NULLIF(i.ItemPurchasePrice, 0),
                        NULLIF((SELECT TOP 1 pd.UnitLandedCost
                                FROM   data_PurchaseDetail pd
                                JOIN   data_PurchaseInfo   pi ON pi.PurchaseID = pd.PurchaseID
                                WHERE  pd.ItemId = @iid
                                  AND  ISNULL(pd.UnitLandedCost, 0) > 0
                                ORDER  BY pi.PurchaseDate DESC, pd.PurchaseDetailID DESC), 0),
                        0) AS cost
                    FROM InventItems i WHERE i.ItemId = @iid`);
        const unitCost = costRes.recordset[0]?.cost ?? 0;
        if (!(Number(unitCost) > 0)) {
            console.warn(`Parts issue: no cost could be resolved for ItemId=${item.ItemId} — ` +
                         `this line will post no COGS. Set a purchase price on the item.`);
        }

        const qty = Number(item.Quantity) || 0;
        const rate = Number(item.Rate) || 0;
        const discAmtVal = Number(item.DiscAmt) || 0;
        const gross = rate * qty;
        // Owner ask 2026-07-03: honour per-line IsGST toggle. Non-GST
        // items on the parts issue slip get zero tax; taxable ones use
        // the configured rate. Backward-compatible: if the caller
        // doesn't send IsGST we keep the old behaviour (default taxable).
        const isTaxable = item.IsGST === undefined ? true : !!item.IsGST;
        const tax = isTaxable
            ? snapshotTax(gross, discAmtVal, gstRate)
            : { taxRate: 0, taxAmount: 0 };

        await new sql.Request(transaction)
            .input('issueId', sql.Int, issueId)
            .input('itemId', sql.Int, item.ItemId)
            .input('qty', sql.Numeric(18,2), qty)
            .input('rate', sql.Numeric(18,2), rate)
            .input('issueQty', sql.Numeric(18,2), qty)
            .input('jobCardId', sql.Int, JobCardId)
            .input('taxRate', sql.Decimal(8,4), tax.taxRate)
            .input('taxAmount', sql.Decimal(18,2), tax.taxAmount)
            .input('unitCost', sql.Decimal(18,4), unitCost)
            .input('discount', sql.Decimal(18,3), Number(item.Discount) || 0)
            .input('discAmt', sql.Decimal(18,3), discAmtVal)
            .query(`INSERT INTO data_StockIssuetoJobCardDetail
                (StockIssueID, ItemId, Quantity, StockRate, ItemRate, IssueQuantity, JobCardId,
                 TaxRate, TaxAmount, UnitLandedCost, Discount, DiscAmt)
                VALUES (@issueId, @itemId, @qty, @rate, @rate, @issueQty, @jobCardId,
                        @taxRate, @taxAmount, @unitCost, @discount, @discAmt)`);
    }

    // The detail ids, in insertion order, so a caller can link each issued
    // line back to what it fulfils (the parts requisition queue does).
    const detailRes = await new sql.Request(transaction)
        .input('issueId', sql.Int, issueId)
        .query('SELECT StockIssueDetailID FROM data_StockIssuetoJobCardDetail WHERE StockIssueID = @issueId ORDER BY StockIssueDetailID');

    // 3. Deduct stock in inventory ledger
    const ioNoRes = await transaction.request().query('SELECT ISNULL(MAX(StockIONo), 0) + 1 AS NextNo FROM data_StockInOutInfo');
    const ioNo = ioNoRes.recordset[0].NextNo;

    // WHID is now NOT NULL on data_StockInOutInfo. Pick the warehouse
    // from the first issued line; fall back to any active warehouse.
    // (We can't assume WHID=1 exists — it was wiped in migration 050.)
    let issueWHID = Items.find(i => i.WHID)?.WHID;
    if (!issueWHID) {
        const whRes = await transaction.request().query(
            `SELECT TOP 1 WHID FROM InventWareHouse
             WHERE ISNULL(InActive, 0) = 0
             ORDER BY WHID`
        );
        if (!whRes.recordset.length) {
            throw new Error('No active warehouse exists. Create one in Parts Config first.');
        }
        issueWHID = whRes.recordset[0].WHID;
    } else {
        // Validate the supplied WHID exists — friendlier error than the FK conflict
        const check = await transaction.request()
            .input('w', sql.Int, issueWHID)
            .query('SELECT 1 AS ok FROM InventWareHouse WHERE WHID = @w');
        if (!check.recordset.length) {
            throw new Error(`Warehouse #${issueWHID} does not exist. Pick a valid warehouse on each parts line.`);
        }
    }

    const ioRes = await transaction.request()
        .input('ioNo', sql.Int, ioNo)
        .input('ioDate', sql.Date, new Date())
        .input('issueId', sql.Int, issueId)
        .input('companyId', sql.Int, 1)
        .input('whId', sql.Int, issueWHID)
        .query(`INSERT INTO data_StockInOutInfo
            (StockIONo, StockIODate, StockType, IssuanceID, CompanyID, WHID, EntryUserDateTime, IsTaxable, ReadOnly)
            OUTPUT INSERTED.StockIOID
            VALUES (@ioNo, @ioDate, 'Issue', @issueId, @companyId, @whId, GETDATE(), 0, 0)`);

    const ioId = ioRes.recordset[0].StockIOID;

    for (const item of Items) {
        await transaction.request()
            .input('ioId', sql.Int, ioId)
            .input('itemId', sql.Int, item.ItemId)
            .input('qty', sql.Numeric(18,2), -Math.abs(item.Quantity))
            .input('rate', sql.Numeric(18,2), item.Rate)
            .query(`INSERT INTO data_StockInOutDetail (StockIOID, ItemId, Quantity, StockRate)
                    VALUES (@ioId, @itemId, @qty, @rate)`);
    }

    return {
        StockIssueID: issueId,
        lines: Items.map((item, i) => ({
            ItemId: item.ItemId,
            StockIssueDetailID: detailRes.recordset[i]?.StockIssueDetailID ?? null,
        })),
    };
}

module.exports = { PartsIssueError, issuePartsInTx };
