import { useState } from 'react';
import axios from 'axios';
import { Shell, Field, Err, Actions, inputStyle } from './VehicleModelsAdmin';
const day = value => value ? String(value).slice(0, 10) : '';
const today = () => new Date(Date.now() + 300 * 60000).toISOString().slice(0, 10);

export default function BookingDateModal({ booking, onClose, onSaved }) {
    const original = day(booking.BookingDate), effective = original || day(booking.CreatedAt);
    const [date, setDate] = useState(effective), [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false), [error, setError] = useState('');
    const save = async () => {
        if (busy || !date) return;
        setBusy(true); setError('');
        try {
            await axios.patch(`/api/sales/bookings/${booking.BookingID}/date`, { BookingDate: date, ExpectedDate: original || null, Reason: reason.trim() });
            onSaved();
        } catch (err) { setError(err.response?.data?.error || err.message); setBusy(false); }
    };
    return <Shell title={`Change booking date — ${booking.BookingNo}`} onClose={() => !busy && onClose()}>
        {error && <Err>{error}</Err>}
        <p>Current booking date: <strong>{effective || 'Not set'}</strong></p>
        <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <Field label="Booking date *"><input type="date" value={date} max={today()} onChange={event => setDate(event.target.value)} style={inputStyle} /></Field>
            <Field label="Reason for correction *"><textarea rows={2} maxLength={500} value={reason} onChange={event => setReason(event.target.value)} style={inputStyle} /></Field>
        </fieldset>
        <p style={{ fontSize: 12, color: '#64748b' }}>The corrected date will appear in the booking register and reports. The change is recorded in this booking’s history.</p>
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Save booking date" busy={busy}
            disabled={!date || date === effective || date > today() || reason.trim().length < 3} />
    </Shell>;
}
