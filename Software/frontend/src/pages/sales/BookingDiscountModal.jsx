import { useState } from 'react';
import axios from 'axios';
import { Shell, Field, Err, Actions, inputStyle } from './VehicleModelsAdmin';

const fmt = value => Number(value || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export default function BookingDiscountModal({ booking, onClose, onSaved }) {
    const [discount, setDiscount] = useState('');
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const price = Number(booking.NegotiatedPrice);
    const amount = Number(discount);
    const next = Math.round((price - amount) * 100) / 100;
    const valid = /^\d+(?:\.\d{1,2})?$/.test(discount) && amount > 0 && next > 0 && reason.trim().length >= 5;
    const save = async () => {
        setBusy(true); setError('');
        try {
            const { data } = await axios.post(`/api/sales/bookings/${booking.BookingID}/discount`, {
                DiscountAmount: discount, ExpectedNegotiatedPrice: price, Reason: reason.trim(),
            });
            onSaved(data.message);
        } catch (err) { setError(err.response?.data?.error || err.message); setBusy(false); }
    };
    return <Shell title={`Give discount — ${booking.BookingNo}`} onClose={busy ? () => {} : onClose} width={520}>
        <p style={{ marginTop: 0, fontSize: '0.85rem' }}>
            Reduce the customer’s vehicle price. No ledger entry is created. Recorded payments, premium and Master’s amount remain unchanged.
        </p>
        {error && <Err>{error}</Err>}
        <div style={{ fontSize: '0.85rem', marginBottom: 12 }}>Current vehicle price: <strong>PKR {fmt(price)}</strong></div>
        <Field label="Additional discount (PKR)">
            <input type="number" min="0.01" step="0.01" value={discount} disabled={busy}
                onChange={e => setDiscount(e.target.value)} style={inputStyle} autoFocus />
        </Field>
        <Field label="Reason (required)">
            <textarea value={reason} onChange={e => setReason(e.target.value)} minLength={5} maxLength={500}
                disabled={busy} rows={2} style={inputStyle} />
        </Field>
        {amount > 0 && next > 0 && <div style={{ background: '#f0fdf4', padding: 12, borderRadius: 6, fontSize: '0.85rem' }}>
            New vehicle price: <strong>PKR {fmt(next)}</strong><br />
            Customer total including premium: <strong>PKR {fmt(next + Number(booking.PremiumAmount || 0))}</strong><br />
            Total discount from standard: <strong>PKR {fmt(Number(booking.StandardPrice) - next)}</strong>
        </div>}
        <p style={{ fontSize: '0.8rem', color: '#64748b' }}>If Master also accepts a reduced settlement, record it using “Master agreed amount” on the booking.</p>
        <Actions onCancel={onClose} onConfirm={save} busy={busy} disabled={!valid} confirmLabel="Apply discount" />
    </Shell>;
}
