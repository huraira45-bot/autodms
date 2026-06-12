/**
 * Cascade-block check for unfinalize requests.
 * Source contract: SYSTEM_DOCUMENTATION.md §14.22 item 13.
 *
 * Returns an array of blocking references. If the array is empty, unfinalize may proceed.
 * Each reference is { kind, ref, description } so the UI can render a clear blocker list.
 *
 * Conservative by design: a finalize chain must be unwound from the leaf inwards.
 *
 * Per-entity rules (additive — any single match blocks):
 *
 *   JOBCARD:
 *     - Posted payment vouchers tagged to this JobCardID (other than the SI voucher generated
 *       by the JC finalize itself).
 *
 *   GRN:
 *     - Finalized GRTN referencing this GRN (data_PurchaseReturnInfo.PurchaseID).
 *     - Posted payment voucher allocated to the GRN's PV voucher.
 *
 *   GRTN:
 *     - (no downstream checks — GRTN is a leaf)
 *
 *   STORE_SALE:
 *     - Finalized SSR referencing this sale (data_StoreSaleReturnInfo.OriginalSaleID).
 *     - Posted payment voucher allocated to the SS voucher.
 *
 *   SSR:
 *     - (leaf)
 *
 *   VOUCHER:
 *     - Any other Posted voucher detail line with AllocatedToVoucherID = this voucher
 *       (e.g., a customer payment was allocated against this invoice).
 */
const { sql } = require('../config/db');

/**
 * Finds the auto-posted voucher for a non-VOUCHER entity (the voucher created
 * by finalize() for that source doc).
 */
async function findSourceVoucherId(pool, entityType, entityId) {
    const r = await pool.request()
        .input('et',  sql.NVarChar(20), entityType)
        .input('eid', sql.Int,          entityId)
        .query(`SELECT TOP 1 VoucherID
                FROM data_FinanceVoucherInfo
                WHERE SourceDocType=@et AND SourceDocID=@eid
                  AND Status='Posted'
                ORDER BY VoucherID DESC`);
    return r.recordset[0]?.VoucherID || null;
}

async function jobCardRefs(pool, jcId) {
    const blockers = [];
    const sourceVid = await findSourceVoucherId(pool, 'JOBCARD', jcId);

    // Posted payment / allocation vouchers tagged to this JC, excluding the SI voucher itself.
    const r = await pool.request()
        .input('jc', sql.Int, jcId)
        .input('svid', sql.Int, sourceVid || -1)
        .query(`
            SELECT DISTINCT v.VoucherID, v.VoucherNo, vt.Title AS VoucherType, v.VoucherDate, v.TotalAmount
            FROM data_FinanceVoucherDetail d
            INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
            INNER JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
            WHERE d.JobCardID = @jc
              AND v.Status = 'Posted'
              AND v.VoucherID <> @svid
        `);
    for (const v of r.recordset) {
        blockers.push({
            kind: 'PAYMENT_VOUCHER',
            ref: v.VoucherNo,
            description: `${v.VoucherType} ${v.VoucherNo} (PKR ${Number(v.TotalAmount).toFixed(2)}) is tagged to this Job Card. Reverse the payment first.`
        });
    }
    return blockers;
}

async function grnRefs(pool, grnId) {
    const blockers = [];

    // 1. Finalized GRTN against this GRN
    const grtn = await pool.request()
        .input('id', sql.Int, grnId)
        .query(`SELECT PurchaseReturnID, PurchaseReturnNo
                FROM data_PurchaseReturnInfo
                WHERE PurchaseID=@id AND IsFinalized=1`);
    for (const g of grtn.recordset) {
        blockers.push({
            kind: 'GRTN',
            ref: g.PurchaseReturnNo,
            description: `Finalized GRTN ${g.PurchaseReturnNo} references this GRN. Unfinalize the GRTN first.`
        });
    }

    // 2. Allocated payment vouchers against the GRN's PV
    const sourceVid = await findSourceVoucherId(pool, 'GRN', grnId);
    if (sourceVid) {
        const pay = await pool.request()
            .input('vid', sql.Int, sourceVid)
            .query(`SELECT DISTINCT v.VoucherNo, vt.Title AS VoucherType, v.TotalAmount
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                    INNER JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                    WHERE d.AllocatedToVoucherID = @vid AND v.Status='Posted'`);
        for (const p of pay.recordset) {
            blockers.push({
                kind: 'PAYMENT_VOUCHER',
                ref: p.VoucherNo,
                description: `${p.VoucherType} ${p.VoucherNo} (PKR ${Number(p.TotalAmount).toFixed(2)}) is allocated against this GRN's invoice. Reverse the payment first.`
            });
        }
    }
    return blockers;
}

async function storeSaleRefs(pool, saleId) {
    const blockers = [];

    // 1. Finalized SSR against this sale
    const ssr = await pool.request()
        .input('id', sql.Int, saleId)
        .query(`SELECT ReturnID, ReturnNo
                FROM data_StoreSaleReturnInfo
                WHERE OriginalSaleID=@id AND IsFinalized=1`);
    for (const s of ssr.recordset) {
        blockers.push({
            kind: 'SSR',
            ref: s.ReturnNo,
            description: `Finalized SSR ${s.ReturnNo} references this sale. Unfinalize the SSR first.`
        });
    }

    // 2. Allocated payment vouchers against the SS voucher
    const sourceVid = await findSourceVoucherId(pool, 'STORE_SALE', saleId);
    if (sourceVid) {
        const pay = await pool.request()
            .input('vid', sql.Int, sourceVid)
            .query(`SELECT DISTINCT v.VoucherNo, vt.Title AS VoucherType, v.TotalAmount
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                    INNER JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                    WHERE d.AllocatedToVoucherID = @vid AND v.Status='Posted'`);
        for (const p of pay.recordset) {
            blockers.push({
                kind: 'PAYMENT_VOUCHER',
                ref: p.VoucherNo,
                description: `${p.VoucherType} ${p.VoucherNo} (PKR ${Number(p.TotalAmount).toFixed(2)}) is allocated against this sale. Reverse the payment first.`
            });
        }
    }
    return blockers;
}

async function voucherRefs(pool, voucherId) {
    const blockers = [];

    // Any other Posted voucher detail line allocated against this voucher
    const r = await pool.request()
        .input('vid', sql.Int, voucherId)
        .query(`SELECT DISTINCT v.VoucherNo, vt.Title AS VoucherType, v.TotalAmount
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON d.VoucherID = v.VoucherID
                INNER JOIN GLVoucherType vt ON v.VoucherTypeID = vt.Voucherid
                WHERE d.AllocatedToVoucherID = @vid
                  AND v.Status = 'Posted'
                  AND v.VoucherID <> @vid`);
    for (const p of r.recordset) {
        blockers.push({
            kind: 'ALLOCATED_PAYMENT',
            ref: p.VoucherNo,
            description: `${p.VoucherType} ${p.VoucherNo} (PKR ${Number(p.TotalAmount).toFixed(2)}) is allocated against this voucher. Reverse it first.`
        });
    }
    return blockers;
}

const HANDLERS = {
    JOBCARD:    jobCardRefs,
    GRN:        grnRefs,
    GRTN:       async () => [],       // leaf — no downstream
    STORE_SALE: storeSaleRefs,
    SSR:        async () => [],       // leaf
    VOUCHER:    voucherRefs
};

/**
 * Returns the list of blocking downstream references for an entity.
 * Empty array = OK to unfinalize.
 */
async function getDownstreamRefs(entityType, entityId, pool) {
    const fn = HANDLERS[entityType];
    if (!fn) return [];
    return fn(pool, entityId);
}

module.exports = { getDownstreamRefs };
