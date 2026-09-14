/**
 * Fill in a customer's missing CNIC and/or date of birth from the tablet
 * (plan 2026-09-14). A job card can't be finalized without both, and the
 * advisor shouldn't have to go to the desk for them.
 *
 * Only what is missing is asked for. A CNIC or date of birth already on file
 * is not changed here; that stays a desk edit.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Loader2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { tStyles as S } from './tabletStyles';
import { API, errText } from './estimateFormat';

// 3630212345671 -> 36302-1234567-1, as the desk stores it.
const formatCnic = (value) => {
    const d = String(value).replace(/\D/g, '').slice(0, 13);
    return [d.slice(0, 5), d.slice(5, 12), d.slice(12)].filter(Boolean).join('-');
};

export default function MissingCustomerDetails({ customerId, hasCNIC, hasDOB, onSaved, title }) {
    const { error, success } = useFeedback();
    const [cnic, setCnic] = useState('');
    const [dob, setDob] = useState('');
    const [busy, setBusy] = useState(false);

    if (!customerId || (hasCNIC && hasDOB)) return null;

    const cnicComplete = cnic.replace(/\D/g, '').length === 13;
    const ready = (!hasCNIC && cnicComplete) || (!hasDOB && !!dob);
    const missing = [!hasCNIC && 'CNIC', !hasDOB && 'date of birth'].filter(Boolean);
    const today = new Date().toISOString().slice(0, 10);

    const save = async () => {
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/customers/${customerId}/missing-details`, {
                CNIC: !hasCNIC && cnicComplete ? cnic : undefined,
                DOB: !hasDOB && dob ? dob : undefined,
            });
            success('Customer details saved');
            setCnic('');
            setDob('');
            onSaved?.(data);
        } catch (err) {
            error('Could not save', errText(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ ...S.result('warn'), marginTop: 12 }}>
            <strong>{title || 'Needed before this job card can be finalized:'}</strong> the customer's {missing.join(' and ')}.
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 10, marginTop: 10 }}>
                {!hasCNIC && (
                    <div>
                        <label style={S.label}>CNIC</label>
                        <input style={S.input} inputMode="numeric" placeholder="36302-1234567-1" value={cnic}
                               onChange={e => setCnic(formatCnic(e.target.value))} />
                    </div>
                )}
                {!hasDOB && (
                    <div>
                        <label style={S.label}>Date of birth</label>
                        <input style={S.input} type="date" max={today} value={dob} onChange={e => setDob(e.target.value)} />
                    </div>
                )}
            </div>
            <button type="button" style={{ ...S.btn, marginTop: 10 }} onClick={save} disabled={busy || !ready}>
                {busy ? <Loader2 size={20} className="animate-spin" /> : 'Save'}
            </button>
        </div>
    );
}
