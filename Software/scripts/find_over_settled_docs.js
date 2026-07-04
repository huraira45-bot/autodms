/**
 * Find JC / Store Sale source docs where the Gen-Cust A/R has been
 * OVER-SETTLED — i.e. Sum(Cr) tagged to that doc exceeds Sum(Dr). Every
 * such case is a candidate double-entry from the old POS auto-settle era
 * (Store Sale variant: the Receive-Payment BRV allocates to an invoice
 * that was already auto-settled at finalize, so Gen-Cust ends up net Cr
 * for that doc — a customer credit that shouldn't exist).
 *
 * Prints per doc:
 *   - Invoice Dr on Gen-Cust
 *   - Total Cr on Gen-Cust
 *   - Net (negative means over-settled)
 *   - Every voucher that credited Gen-Cust with amount + AllocatedToVoucherID
 *
 * Read-only.  Run:  node scripts\find_over_settled_docs.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';

(async () => {
    try {
        const pool = await getPool();
        const roles = await pool.request().query(`
            SELECT GLCAID FROM dms_SystemAccounts WHERE RoleKey='GENERAL_CUSTOMER'`);
        const gcGL = roles.recordset[0]?.GLCAID;
        if (!gcGL) throw new Error('GENERAL_CUSTOMER role not mapped.');

        // ── JC side ──
        const jcRows = await pool.request().input('gl', sql.Int, gcGL)
            .query(`
                WITH GCPerJC AS (
                    SELECT d.JobCardID,
                           SUM(CASE WHEN d.Debit  > 0 THEN d.Debit  ELSE 0 END) AS Dr,
                           SUM(CASE WHEN d.Credit > 0 THEN d.Credit ELSE 0 END) AS Cr
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID = d.VoucherID
                    WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                      AND d.GLCAID=@gl AND d.JobCardID IS NOT NULL AND d.PartyID IS NULL
                    GROUP BY d.JobCardID
                )
                SELECT g.JobCardID, g.Dr, g.Cr, (g.Cr - g.Dr) AS OverBy,
                       jc.JobCardNo, jc.IsFinalized
                FROM GCPerJC g
                LEFT JOIN Addata_JobCardInfo jc ON jc.JobCardId = g.JobCardID
                WHERE (g.Cr - g.Dr) > 0.01
                ORDER BY (g.Cr - g.Dr) DESC`);

        // ── Store Sale side ──
        // Store sales don't tag JobCardID on their invoice legs, so we need to
        // find them via SourceDocType='STORE_SALE' on the SS finalize voucher +
        // AllocatedToVoucherID from receipt BRV/CRVs.
        const ssRows = await pool.request().input('gl', sql.Int, gcGL)
            .query(`
                WITH SSInvoiceDr AS (
                    -- The Store Sale finalize voucher: Dr Gen-Cust for customerPays.
                    -- Grouped by SaleID.
                    SELECT vi.SourceDocID AS SaleID, vi.VoucherID AS InvoiceVoucherID,
                           SUM(d.Debit) AS Dr
                    FROM data_FinanceVoucherInfo vi
                    INNER JOIN data_FinanceVoucherDetail d ON d.VoucherID = vi.VoucherID
                    WHERE vi.Status='Posted' AND vi.ReversesVoucherID IS NULL
                      AND vi.SourceDocType='STORE_SALE'
                      AND d.GLCAID=@gl AND d.Debit > 0
                    GROUP BY vi.SourceDocID, vi.VoucherID
                ),
                SSCredits AS (
                    -- Any Cr on Gen-Cust that either (a) SourceDocType=STORE_SALE
                    -- (the auto-settle CRV at finalize) OR (b) has an
                    -- AllocatedToVoucherID pointing at a SS invoice voucher.
                    SELECT COALESCE(vi.SourceDocID, ai.SourceDocID) AS SaleID,
                           SUM(d.Credit) AS Cr
                    FROM data_FinanceVoucherDetail d
                    INNER JOIN data_FinanceVoucherInfo vi ON vi.VoucherID = d.VoucherID
                    LEFT JOIN data_FinanceVoucherInfo ai
                           ON ai.VoucherID = d.AllocatedToVoucherID
                          AND ai.SourceDocType='STORE_SALE'
                    WHERE vi.Status='Posted' AND vi.ReversesVoucherID IS NULL
                      AND d.GLCAID=@gl AND d.Credit > 0
                      AND (vi.SourceDocType='STORE_SALE' OR ai.SourceDocType='STORE_SALE')
                    GROUP BY COALESCE(vi.SourceDocID, ai.SourceDocID)
                )
                SELECT i.SaleID, ss.InvoiceNo,
                       i.Dr, ISNULL(c.Cr, 0) AS Cr, (ISNULL(c.Cr, 0) - i.Dr) AS OverBy
                FROM SSInvoiceDr i
                LEFT JOIN SSCredits c ON c.SaleID = i.SaleID
                LEFT JOIN data_StoreSaleInfo ss ON ss.SaleID = i.SaleID
                WHERE (ISNULL(c.Cr, 0) - i.Dr) > 0.01
                ORDER BY (ISNULL(c.Cr, 0) - i.Dr) DESC`);

        // Print
        let totalJC = 0, totalSS = 0;

        console.log('\n── Job Cards with Gen-Cust OVER-SETTLED ──');
        if (!jcRows.recordset.length) {
            console.log('   (none)');
        } else {
            for (const r of jcRows.recordset) {
                totalJC += Number(r.OverBy) || 0;
                console.log(`\n  JC ${r.JobCardNo || '#'+r.JobCardID}  fin:${r.IsFinalized ? 'Y':'N'}`);
                console.log(`    Gen-Cust Dr ${fmt(r.Dr).padStart(12)}   Cr ${fmt(r.Cr).padStart(12)}   OVER BY ${fmt(r.OverBy).padStart(12)}`);
                await printJCCredits(pool, gcGL, r.JobCardID);
            }
        }

        console.log('\n── Store Sales with Gen-Cust OVER-SETTLED ──');
        if (!ssRows.recordset.length) {
            console.log('   (none)');
        } else {
            for (const r of ssRows.recordset) {
                totalSS += Number(r.OverBy) || 0;
                console.log(`\n  Store Sale ${r.InvoiceNo || '#'+r.SaleID}`);
                console.log(`    Gen-Cust Dr ${fmt(r.Dr).padStart(12)}   Cr ${fmt(r.Cr).padStart(12)}   OVER BY ${fmt(r.OverBy).padStart(12)}`);
                await printSSCredits(pool, gcGL, r.SaleID);
            }
        }

        console.log('\n' + '─'.repeat(80));
        console.log(`  JCs over-settled total:         PKR ${fmt(totalJC)}`);
        console.log(`  Store Sales over-settled total: PKR ${fmt(totalSS)}`);
        console.log(`  GRAND TOTAL to reconcile:       PKR ${fmt(totalJC + totalSS)}\n`);
        process.exit(0);
    } catch (e) {
        console.error('Detector failed:', e.message);
        process.exit(1);
    }
})();

async function printJCCredits(pool, gcGL, jcId) {
    const q = await pool.request()
        .input('gl', sql.Int, gcGL).input('jc', sql.Int, jcId)
        .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.SourceDocType,
                       d.Credit, d.AllocatedToVoucherID
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                  AND d.GLCAID=@gl AND d.JobCardID=@jc AND d.Credit > 0
                ORDER BY v.VoucherDate, v.VoucherID`);
    for (const v of q.recordset) {
        const alloc = v.AllocatedToVoucherID ? `→ allocated to #${v.AllocatedToVoucherID}` : '';
        console.log(`      · ${dt(v.VoucherDate)}  ${v.VoucherNo.padEnd(14)}  ${(v.SourceDocType || 'MANUAL').padEnd(11)}  Cr ${fmt(v.Credit).padStart(12)}  ${alloc}  VoucherID #${v.VoucherID}`);
    }
}

async function printSSCredits(pool, gcGL, saleId) {
    const q = await pool.request()
        .input('gl', sql.Int, gcGL).input('sl', sql.Int, saleId)
        .query(`SELECT v.VoucherID, v.VoucherNo, v.VoucherDate, v.SourceDocType,
                       d.Credit, d.AllocatedToVoucherID
                FROM data_FinanceVoucherDetail d
                INNER JOIN data_FinanceVoucherInfo v ON v.VoucherID=d.VoucherID
                LEFT JOIN data_FinanceVoucherInfo ai ON ai.VoucherID = d.AllocatedToVoucherID
                WHERE v.Status='Posted' AND v.ReversesVoucherID IS NULL
                  AND d.GLCAID=@gl AND d.Credit > 0
                  AND ( (v.SourceDocType='STORE_SALE' AND v.SourceDocID=@sl)
                     OR (ai.SourceDocType='STORE_SALE' AND ai.SourceDocID=@sl) )
                ORDER BY v.VoucherDate, v.VoucherID`);
    for (const v of q.recordset) {
        const alloc = v.AllocatedToVoucherID ? `→ allocated to #${v.AllocatedToVoucherID}` : '';
        console.log(`      · ${dt(v.VoucherDate)}  ${v.VoucherNo.padEnd(14)}  ${(v.SourceDocType || 'MANUAL').padEnd(11)}  Cr ${fmt(v.Credit).padStart(12)}  ${alloc}  VoucherID #${v.VoucherID}`);
    }
}
