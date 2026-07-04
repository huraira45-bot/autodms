/**
 * Bulk-reverse the Receive-Payment BRVs that DUPLICATED an auto-settle
 * CRV on Store Sales (found by find_over_settled_docs.js on 2026-07-05).
 *
 * Pattern being fixed:
 *   Store Sale finalize (old auto-settle path) posted CRV-nnnn with
 *       Dr POS_CLEARING / Cr GENERAL_CUSTOMER (allocated to SS invoice)
 *   Cashier then ran Receive Payment → BRV-nnnn with
 *       Dr POS_CLEARING / Cr GENERAL_CUSTOMER (allocated to CRV or SI)
 *   Result: Gen-Cust net Cr for the SS (phantom customer credit),
 *   POS_CLEARING doubled.
 *
 * The reversal mirrors the BRV: Dr GENERAL_CUSTOMER / Cr POS_CLEARING,
 * undoing the second settlement leaving the auto-settle CRV as the
 * legitimate close.
 *
 * DRY RUN:   node scripts\bulk_reverse_over_settled.js
 * COMMIT:    node scripts\bulk_reverse_over_settled.js --commit
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { postReversalVoucher } = require('../services/voucherReversalService');

// From find_over_settled_docs.js output 2026-07-05.
// (Store Sale invoice # ← duplicate BRV VoucherID)
const VOUCHER_IDS = [
    120,  // BRV-0028   01-Jul   11,200.00   SS SAL-00042
    427,  // BRV-0284   04-Jul   12,115.00   SS SAL-00063
];

const COMMIT = process.argv.includes('--commit');
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    let totalPlanned = 0, totalSkipped = 0;
    const plan = [];
    for (const id of VOUCHER_IDS) {
        const r = await pool.request().input('id', sql.Int, id)
            .query(`SELECT VoucherID, VoucherNo, VoucherDate, Status, TotalAmount, Remarks
                    FROM data_FinanceVoucherInfo WHERE VoucherID=@id`);
        if (!r.recordset.length) {
            console.log(`  #${id}  NOT FOUND — skipping`);
            plan.push({ id, action: 'SKIP', reason: 'not found' });
            continue;
        }
        const v = r.recordset[0];
        if (v.Status !== 'Posted') {
            console.log(`  #${id}  ${v.VoucherNo}  Status=${v.Status}  — skipping (already ${v.Status.toLowerCase()})`);
            plan.push({ id, action: 'SKIP', reason: v.Status });
            totalSkipped += Number(v.TotalAmount) || 0;
            continue;
        }
        plan.push({ id, action: 'REVERSE', voucher: v });
        totalPlanned += Number(v.TotalAmount) || 0;
        console.log(`  #${id}  ${v.VoucherNo}  ${new Date(v.VoucherDate).toLocaleDateString('en-GB')}  ${fmt(v.TotalAmount).padStart(12)}  → will reverse`);
    }
    console.log(`\n  Total to reverse: PKR ${fmt(totalPlanned)}`);
    if (totalSkipped > 0) console.log(`  Total skipped:    PKR ${fmt(totalSkipped)}`);

    if (!COMMIT) {
        console.log(`\nDRY RUN complete. To actually reverse, re-run with --commit:`);
        console.log(`  node scripts\\bulk_reverse_over_settled.js --commit\n`);
        process.exit(0);
    }

    const userInfo = { userId: null, userName: 'system-bulk-over-settled-cleanup' };
    let done = 0, failed = 0;
    for (const step of plan) {
        if (step.action !== 'REVERSE') continue;
        const tx = new sql.Transaction(pool);
        await tx.begin();
        try {
            const info = await postReversalVoucher(step.id, userInfo, tx);
            await tx.commit();
            console.log(`  ✓ #${step.id}  ${step.voucher.VoucherNo}  → posted ${info.reversalNo}`);
            done++;
        } catch (e) {
            try { await tx.rollback(); } catch {}
            console.error(`  ✗ #${step.id}  ${step.voucher.VoucherNo}  FAILED: ${e.message}`);
            failed++;
        }
    }
    console.log(`\nDone. Reversed: ${done}   Failed: ${failed}\n`);
    console.log(`Verify with:  node scripts\\find_over_settled_docs.js`);
    console.log(`Both Store Sales should show as no longer over-settled.`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('bulk_reverse failed:', e.message); process.exit(1); });
