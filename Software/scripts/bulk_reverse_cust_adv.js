/**
 * Bulk-reverse the 12 phantom Customer-Advance receipts identified by
 * scripts\diagnose_advance_source.js on 2026-07-05.
 *
 * Each reversal is a mirror-reversal (Dr Cust Advance / Cr POS_CLEARING)
 * posted via services/voucherReversalService, so it gets a real
 * VoucherNo (BRV-REV-NNNN), a full audit trail, and the original
 * voucher's Status flips to 'Reversed' — exactly the same as if
 * someone clicked Unfinalize → Reverse on each voucher through the UI.
 *
 * Idempotent: the service refuses to double-reverse ('Posted' guard),
 * so re-running is safe. Skips vouchers already reversed.
 *
 * DRY RUN:  node scripts\bulk_reverse_cust_adv.js
 * COMMIT:   node scripts\bulk_reverse_cust_adv.js --commit
 *
 * Owner review before committing is required — the amounts and VoucherIDs
 * below are the exact ones diagnose_advance_source.js flagged as DOUBLE.
 * Edit VOUCHER_IDS to remove any you don't want to reverse (e.g. #142 for
 * B&P-0006 if you want to keep that as a legitimate overpayment).
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { postReversalVoucher } = require('../services/voucherReversalService');

// VoucherIDs surfaced by diagnose_advance_source.js on 2026-07-05.
// One line per voucher so you can comment out any exception.
const VOUCHER_IDS = [
    161,  // BRV-0066  01-Jul  15,858.64  JC GR-0035
    142,  // BRV-0048  01-Jul   2,999.76  JC B&P-0006  ← Gen-Cust never billed; reversing kills a legit overpayment too. Remove this line if you'd rather keep it in Advance.
    223,  // BRV-0125  02-Jul   9,513.00  JC GR-0056
    252,  // BRV-0151  02-Jul   9,999.00  JC GR-0058
    436,  // BRV-0285  04-Jul 133,518.46  JC GR-0062
    329,  // BRV-0268  03-Jul  25,493.78  JC GR-0063  ← 400.00 more than the invoice; may deserve a refund JV after this.
    298,  // BRV-0265  03-Jul  14,319.82  JC GR-0064
    307,  // BRV-0266  03-Jul   2,320.00  JC GR-3002
    323,  // BRV-0267  03-Jul  12,690.00  JC GR-3004
    380,  // BRV-0275  04-Jul  11,781.02  JC GR-3015
    405,  // BRV-0278  04-Jul   9,513.00  JC GR-3021
    410,  // BRV-0279  04-Jul   9,513.00  JC GR-3024
];

const COMMIT = process.argv.includes('--commit');
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

(async () => {
    const pool = await getPool();
    console.log(`\nMode: ${COMMIT ? 'COMMIT (writes will happen)' : 'DRY RUN (no writes)'}\n`);

    // Load each voucher's current status + amount so we can plan.
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
        console.log(`  node scripts\\bulk_reverse_cust_adv.js --commit\n`);
        process.exit(0);
    }

    const userInfo = { userId: null, userName: 'system-bulk-cust-adv-cleanup' };
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
    console.log(`Verify with:  node scripts\\audit_customer_advance.js`);
    console.log(`Customer Advance should now sit at ~0.00.`);
    process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('bulk_reverse failed:', e.message); process.exit(1); });
