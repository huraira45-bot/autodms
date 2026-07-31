/**
 * One-off: apply GR-3329's (JobCardID 882) pre-finalize walk-in advance
 * (Rs 10,000, BRV-0661) against its own Gen-Cust balance. Reuses the exact
 * same logic finalize now runs automatically for future JCs
 * (services/jobCardPostingService.js applyWalkInAdvanceForJC) — this JC
 * just finalized before that fix existed, so it needs a one-time manual run.
 *
 * Run:  node scripts\apply_advance_gr3329.js
 */
require('dotenv').config();
const { sql, getPool } = require('../config/db');
const { applyWalkInAdvanceForJC } = require('../services/jobCardPostingService');

const JOB_CARD_ID = 882; // GR-3329

(async () => {
    const pool = await getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
        const voucherId = await applyWalkInAdvanceForJC(
            JOB_CARD_ID,
            { userId: null, userName: 'system-correction' },
            tx
        );
        if (!voucherId) {
            console.log('Nothing to apply — advance already cleared or JC has a named party.');
            await tx.rollback();
            process.exit(0);
        }
        await tx.commit();
        console.log(`Applied. New JV VoucherID=${voucherId} — Dr Customer Advance / Cr General Customer.`);
        process.exit(0);
    } catch (e) {
        await tx.rollback();
        console.error('Failed:', e.message);
        process.exit(1);
    }
})();
