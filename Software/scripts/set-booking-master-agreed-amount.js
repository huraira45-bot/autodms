/** Explicit server-administrator action. Updates one booking plus audit; no GL writes. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { sql, getPool } = require('../config/db');
const { setMasterAgreedAmount } = require('../services/salesMasterAgreementService');
(async () => {
    const args = process.argv.slice(2), options = {};
    for (let i = 0; i < args.length; i += 2) {
        if (!['--booking','--amount','--expected','--reason'].includes(args[i]) || args[i + 1] === undefined) throw new Error('Use --booking BK-YYYY-NNNN --amount AMOUNT --expected CURRENT_MASTER_AMOUNT --reason "Master confirmation"');
        options[args[i].slice(2)] = args[i + 1];
    }
    if (!/^BK-\d{4}-\d{4,}$/.test(options.booking || '') || !options.amount || !options.expected || !options.reason) throw new Error('Booking, accepted amount, expected current amount and reason are required.');
    const pool = await getPool();
    const found = await pool.request().input('no', sql.NVarChar(20), options.booking)
        .query('SELECT BookingID,MasterAgreedAmount FROM dms_SalesBookings WHERE BookingNo=@no');
    if (!found.recordset.length) throw new Error('Booking not found.');
    const booking = found.recordset[0];
    if (Number(booking.MasterAgreedAmount) > 0 && Number(booking.MasterAgreedAmount) === Number(options.amount)) {
        console.log(options.booking + ': Master agreed amount already saved; no changes made.'); return;
    }
    const tx = new sql.Transaction(pool); await tx.begin();
    try {
        const result = await setMasterAgreedAmount(tx, { bookingId: booking.BookingID, amount: options.amount,
            expectedAmount: options.expected, reason: options.reason,
            user: { userName: 'Server administrator (manual command)', groupTitle: 'Manual server maintenance', modules: ['sales_admin_pricing'] } });
        await tx.commit(); console.log(options.booking + ': ' + JSON.stringify(result));
    } catch (err) { try { await tx.rollback(); } catch (_) {} throw err; }
})().catch(err => { console.error(err.message); process.exitCode = 1; }).finally(() => sql.close());
