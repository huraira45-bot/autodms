/**
 * Diagnostic: find JCs and Store Sales whose POS receipt was posted TWICE —
 * once by the old finalize auto-settle path (Dr POS_CLEARING / Cr Gen-Cust,
 * SourceDoc = JOBCARD/STORE_SALE) AND once via Receive Payment where the
 * overpayment spilled into CUSTOMER_ADVANCE_RECEIVED.
 *
 * Prints one line per affected source doc:
 *   [JC/SS #]  Auto CRV: CRV-nnnn (928.00)   Duplicate CRV: CRV-mmmm (928.00 → Cust Adv)
 *
 * Run:  node scripts\find_double_pos_receipts.js
 * Read-only — no writes.
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    try {
        const pool = await getPool();
        // Resolve the two role GLs by name.
        const roles = await pool.request().query(`
            SELECT RoleKey, GLCAID FROM dms_SystemAccounts
            WHERE RoleKey IN ('POS_CLEARING','CUSTOMER_ADVANCE_RECEIVED')`);
        const roleMap = Object.fromEntries(roles.recordset.map(r => [r.RoleKey, r.GLCAID]));
        const posGL  = roleMap.POS_CLEARING;
        const caGL   = roleMap.CUSTOMER_ADVANCE_RECEIVED;
        if (!posGL) throw new Error('POS_CLEARING role not mapped.');
        if (!caGL)  throw new Error('CUSTOMER_ADVANCE_RECEIVED role not mapped.');

        const q = await pool.request()
            .input('pos', sql.Int, posGL)
            .input('ca',  sql.Int, caGL)
            .query(`
                -- Every Posted voucher whose Cr line hits Customer Advance AND
                -- whose Dr line hits POS_CLEARING (i.e. POS overpayment).
                WITH CustAdvPOSReceipts AS (
                    SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.SourceDocType, v.SourceDocID,
                           v.TotalAmount, v.Remarks
                    FROM data_FinanceVoucherInfo v
                    WHERE v.Status = 'Posted'
                      AND v.ReversesVoucherID IS NULL
                      AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                                  WHERE d.VoucherID=v.VoucherID AND d.GLCAID=@ca AND d.Credit > 0)
                      AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                                  WHERE d.VoucherID=v.VoucherID AND d.GLCAID=@pos AND d.Debit  > 0)
                ),
                -- Auto-settle CRVs the old finalize path posted for JCs / Store Sales.
                AutoSettleCRVs AS (
                    SELECT v.VoucherID, v.VoucherNo, v.SourceDocType, v.SourceDocID, v.TotalAmount
                    FROM data_FinanceVoucherInfo v
                    WHERE v.Status = 'Posted'
                      AND v.ReversesVoucherID IS NULL
                      AND v.SourceDocType IN ('JOBCARD','STORE_SALE')
                      AND (v.Remarks LIKE '%POS receipt at finalize%'
                        OR v.Remarks LIKE '%POS auto-settle%')
                      AND EXISTS (SELECT 1 FROM data_FinanceVoucherDetail d
                                  WHERE d.VoucherID=v.VoucherID AND d.GLCAID=@pos AND d.Debit > 0)
                )
                SELECT
                    a.SourceDocType,
                    a.SourceDocID,
                    -- Human-readable ref for the source doc
                    COALESCE(
                        (SELECT jc.JobCardNo FROM Addata_JobCardInfo jc
                         WHERE a.SourceDocType='JOBCARD' AND jc.JobCardId=a.SourceDocID),
                        (SELECT ss.InvoiceNo FROM data_StoreSaleInfo ss
                         WHERE a.SourceDocType='STORE_SALE' AND ss.SaleID=a.SourceDocID)
                    ) AS SourceRef,
                    a.VoucherNo    AS AutoCRV_No,
                    a.TotalAmount  AS AutoCRV_Amount,
                    c.VoucherNo    AS DupCRV_No,
                    c.VoucherDate  AS DupCRV_Date,
                    c.TotalAmount  AS DupCRV_Amount,
                    c.VoucherID    AS DupVoucherID,
                    c.Remarks      AS DupRemarks
                FROM AutoSettleCRVs a
                INNER JOIN CustAdvPOSReceipts c
                    ON c.SourceDocType = a.SourceDocType
                    AND c.SourceDocID  = a.SourceDocID
                ORDER BY c.VoucherDate DESC, c.VoucherID DESC;
            `);

        if (!q.recordset.length) {
            console.log('No double POS receipts detected. Nothing to reconcile.');
            process.exit(0);
        }

        console.log(`\nFound ${q.recordset.length} double POS receipt(s):\n`);
        console.log('SourceRef'.padEnd(14),
            'Auto CRV'.padEnd(14),  'Auto Amt'.padStart(14),
            '│ Duplicate CRV'.padEnd(20), 'Dup Amt'.padStart(14),
            '│ Duplicate VoucherID'.padStart(22));
        console.log('-'.repeat(110));
        let total = 0;
        for (const r of q.recordset) {
            console.log(
                (r.SourceRef || '').padEnd(14),
                (r.AutoCRV_No || '').padEnd(14),  fmt(r.AutoCRV_Amount).padStart(14),
                ('│ ' + (r.DupCRV_No || '')).padEnd(20), fmt(r.DupCRV_Amount).padStart(14),
                ('│ #' + r.DupVoucherID).padStart(22),
            );
            total += Number(r.DupCRV_Amount) || 0;
        }
        console.log('-'.repeat(110));
        console.log(`Total sitting incorrectly in CUSTOMER_ADVANCE_RECEIVED: PKR ${fmt(total)}\n`);
        console.log('To reconcile: reverse each Duplicate VoucherID via the standard');
        console.log('Unfinalize → Approve → Post Reversal flow (or a single JV for the batch).');
        console.log('See docs/POS_DOUBLE_ENTRY_RECONCILIATION.md for step-by-step.');
        process.exit(0);
    } catch (e) {
        console.error('Diagnostic failed:', e.message);
        process.exit(1);
    }
})();
