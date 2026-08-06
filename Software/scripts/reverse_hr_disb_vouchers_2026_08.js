// One-off: reverses the 5 wrongly-posted HR salary disbursement vouchers
// for 2026-08 (owner report 2026-08-07 — "Pay Salary" was run against the
// wrong month). Run from Software/ so it can read .env and reach the API
// at localhost:5000:
//
//   node scripts\reverse_hr_disb_vouchers_2026_08.js
//
// For each voucher: request-unfinalize -> look up the new request ->
// am-approve -> admin-unfinalize. Stops immediately on any failure so
// nothing gets half-done silently. Safe to re-run after fixing an issue —
// already-reversed vouchers just won't have a pending request to find.
require('dotenv').config();
const jwt = require('jsonwebtoken');

const BASE = 'http://localhost:5000/api';
const VOUCHER_IDS = [3553, 3554, 3555, 3556, 3557]; // CPV-0450, CPV-0451, BPV-0177, BPV-0178, BPV-0179
const REASON = 'Posted for the wrong month (2026-08 disbursement run by mistake) — reversing to redo against the correct month.';

const token = jwt.sign({ userId: 1, userName: 'admin', groupId: 1, groupTitle: 'Admin' }, process.env.JWT_SECRET, { expiresIn: '10m' });
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };

async function call(method, path, body) {
    const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}: ${data.error || JSON.stringify(data)}`);
    return data;
}

(async () => {
    for (const voucherId of VOUCHER_IDS) {
        console.log(`\n=== Voucher #${voucherId} ===`);
        try {
            await call('POST', `/finalize/VOUCHER/${voucherId}/request-unfinalize`, { reason: REASON });
            console.log('  request-unfinalize: submitted');

            const requests = await call('GET', '/finalize/requests');
            const reqRow = requests.find(r => r.EntityType === 'VOUCHER' && r.EntityID === voucherId && r.Status === 'PENDING');
            if (!reqRow) throw new Error('Could not find the PENDING request just created.');
            console.log(`  found RequestID ${reqRow.RequestID}`);

            await call('PUT', `/finalize/requests/${reqRow.RequestID}/am-approve`);
            console.log('  am-approve: done');

            await call('PUT', `/finalize/requests/${reqRow.RequestID}/admin-unfinalize`);
            console.log('  admin-unfinalize: done — voucher reversed');
        } catch (err) {
            console.error(`  FAILED: ${err.message}`);
            console.error('\nStopping — fix the issue above before re-running (already-reversed vouchers are safe to leave as-is).');
            process.exit(1);
        }
    }
    console.log('\nAll 5 vouchers reversed successfully.');
})();
