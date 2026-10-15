import { useState } from 'react';
import axios from 'axios';
import { Shell, Field, Err, Actions, inputStyle } from './VehicleModelsAdmin';
import { masterAmountDue } from '../../utils/salesMasterAmount';
const fmt = value => Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function MasterAgreedAmountModal({ booking, onClose, onSaved }) {
    const current = masterAmountDue(booking);
    const [amount, setAmount] = useState(String(booking.MasterAgreedAmount || booking.NegotiatedPrice || current));
    const [reason, setReason] = useState('');
    const [confirmed, setConfirmed] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try {
            const { data } = await axios.post(`/api/sales/bookings/${booking.BookingID}/master-agreed-amount`, {
                Amount: amount, ExpectedMasterAmount: current, Reason: reason.trim(),
            });
            onSaved(data.message);
        } catch (err) { setError(err.response?.data?.error || err.message); setBusy(false); }
    };
    return <Shell title={`Master agreed amount — ${booking.BookingNo}`} onClose={busy ? () => {} : onClose} width={540}>
        <p style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Record the amount Master Motors has accepted as full settlement for this booking. The gate-pass check uses this amount.
            {' '}No ledger entry or additional payment is created. The customer price and catalog rate stay unchanged.
        </p>
        {error && <Err>{error}</Err>}
        <div style={{ marginBottom: 12, fontSize: '0.85rem' }}>Current Master amount: <strong>PKR {fmt(current)}</strong><br />
            Sent to Master: <strong>PKR {fmt(booking.AmountPaidToMaster)}</strong></div>
        <Field label="Full amount accepted by Master (PKR)">
            <input type="number" min="0.01" step="0.01" value={amount} disabled={busy}
                onChange={e => setAmount(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Reason / Master confirmation (required)">
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} maxLength={500} disabled={busy} style={inputStyle} />
        </Field>
        <label style={{ display: 'flex', gap: 8, fontSize: '0.85rem' }}>
            <input type="checkbox" checked={confirmed} disabled={busy} onChange={e => setConfirmed(e.target.checked)} />
            Master has accepted this as the full settlement amount.
        </label>
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Save Master agreed amount" busy={busy}
            disabled={!confirmed || !/^\d+(?:\.\d{1,2})?$/.test(amount) || !(Number(amount) > 0) || reason.trim().length < 5} />
    </Shell>;
}
