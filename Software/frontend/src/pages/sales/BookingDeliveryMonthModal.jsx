import { useState } from 'react';
import axios from 'axios';
import { deliveryMonthValue, formatDeliveryMonth } from '../../utils/deliveryMonth';

export default function BookingDeliveryMonthModal({ booking, onClose, onSaved }) {
    const original = deliveryMonthValue(booking.PromisedDeliveryMonth);
    const [month, setMonth] = useState(original);
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const save = async e => {
        e.preventDefault(); setBusy(true); setError('');
        try {
            await axios.patch(`/api/sales/bookings/${booking.BookingID}/delivery-month`, {
                PromisedDeliveryMonth: month || null, ExpectedMonth: original || null, Reason: reason.trim(),
            });
            onSaved();
        } catch (err) { setError(err.response?.data?.error || err.message); }
        finally { setBusy(false); }
    };
    return <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 1100, padding: 16 }}>
        <form onSubmit={save} role="dialog" aria-modal="true" aria-labelledby="delivery-month-title" className="card" style={{ width: '100%', maxWidth: 460 }}>
            <h3 id="delivery-month-title" style={{ marginTop: 0 }}>Promised delivery month — {booking.BookingNo}</h3>
            <p>Currently: <strong>{formatDeliveryMonth(original)}</strong></p>
            <label style={{ display: 'block', marginBottom: 12 }}>Promised delivery month (optional)
                <input type="month" value={month} onChange={e => setMonth(e.target.value)} disabled={busy} style={{ display: 'block', padding: 8, width: '100%' }} />
            </label>
            <button type="button" className="erp-btn erp-btn-sm" onClick={() => setMonth('')} disabled={busy}>Clear month</button>
            <label style={{ display: 'block', marginTop: 12 }}>Reason for change
                <textarea required minLength={3} maxLength={500} rows={2} value={reason} onChange={e => setReason(e.target.value)} disabled={busy} style={{ display: 'block', width: '100%', padding: 8 }} />
            </label>
            {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="button" className="erp-btn" disabled={busy} onClick={onClose}>Cancel</button>
                <button type="submit" className="erp-btn erp-btn-primary" disabled={busy || month === original || reason.trim().length < 3}>{busy ? 'Saving…' : 'Save month'}</button>
            </div>
        </form>
    </div>;
}
