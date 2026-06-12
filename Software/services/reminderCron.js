/**
 * Service-reminder daily tick (09:00 by default, configurable via REMINDER_CRON).
 *
 * Flips Scheduled → Sent rows whose DueDate <= today. The CRO officer then
 * works the queue from the Reminders UI and contacts customers to book a JC.
 */
const cron = require('node-cron');
const { dailyTick } = require('./croReminderService');

const CRON_EXPRESSION = process.env.REMINDER_CRON || '0 9 * * *';
let scheduled = null;
let running = false;

async function tick({ verbose = false } = {}) {
    if (running) { if (verbose) console.log('[reminderCron] previous tick in flight'); return { skipped: true }; }
    running = true;
    try { return await dailyTick({ verbose }); }
    catch (err) { console.error('[reminderCron] tick failed:', err.message); return { error: err.message }; }
    finally { running = false; }
}

function start({ verbose = false } = {}) {
    if (scheduled) return scheduled;
    scheduled = cron.schedule(CRON_EXPRESSION, () => {
        tick({ verbose }).catch(e => console.error('[reminderCron] unhandled:', e));
    });
    console.log(`[reminderCron] scheduled (${CRON_EXPRESSION})`);
    return scheduled;
}
function stop() { if (scheduled) { scheduled.stop(); scheduled = null; } }

module.exports = { start, stop, tick, CRON_EXPRESSION };
