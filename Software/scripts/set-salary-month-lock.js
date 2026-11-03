// Server-administrator maintenance. Default preview rolls back; --commit saves.
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const { sql, getPool } = require('../config/db');
const snapshots = require('../services/salarySheetSnapshotService');
const { setMonthLock } = require('../services/salaryMonthLockService');
const salary = require('../controllers/hrSalaryController');
(async () => {
    const args = process.argv.slice(2), options = {};
    for (let i=0; i<args.length; i++) {
        if (args[i] === '--commit') { options.commit = true; continue; }
        if (['--lock','--unlock'].includes(args[i])) {
            if (options.locked !== undefined) throw new Error('Choose either --lock or --unlock.');
            options.locked = args[i] === '--lock'; continue;
        }
        if (!['--month','--reason'].includes(args[i]) || !args[i+1]) throw new Error('Use --month YYYY-MM --lock|--unlock --reason "reason" [--commit]');
        options[args[i].slice(2)] = args[++i];
    }
    const tx = new sql.Transaction(await getPool());
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
        await snapshots.lockMonth(tx, options.month);
        const current = await snapshots.getControl(tx, options.month);
        const result = await setMonthLock(tx, { monthId: options.month, locked: options.locked, reason: options.reason,
            user: { groupId: 1, userName: 'Server administrator (owner-requested salary control)' },
            expectedControlId: current?.ControlID ?? null, buildLiveSheet: salary._buildLiveSheet });
        if (options.commit) await tx.commit(); else await tx.rollback();
        console.log(JSON.stringify({ ...result, committed: Boolean(options.commit) }, null, 2));
    } catch (error) { try { await tx.rollback(); } catch {} throw error; }
})().catch(error => { console.error(error.message); process.exitCode=1; }).finally(() => sql.close());
