import { useEffect, useState } from 'react';
import axios from 'axios';
import { Shell, Field, Err, Actions, inputStyle } from './VehicleModelsAdmin';
import CustomerIdentityWarnings from './CustomerIdentityWarnings';

export default function EditSalesCustomerModal({ bookingId, onClose, onDone }) {
    const [original, setOriginal] = useState(null), [form, setForm] = useState({});
    const [linkedBookings, setLinkedBookings] = useState(0), [reason, setReason] = useState('');
    const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => {
        const controller = new AbortController();
        axios.get(`/api/sales/bookings/${bookingId}/customer`, { signal: controller.signal })
            .then(({ data }) => {
                setOriginal(data.customer); setForm(data.customer); setLinkedBookings(data.linkedBookings);
            }).catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || err.message); })
            .finally(() => { if (!controller.signal.aborted) setLoading(false); });
        return () => controller.abort();
    }, [bookingId]);
    const save = async () => {
        if (busy) return;
        setBusy(true); setError('');
        try {
            const { PartyID, ...details } = form;
            const { data } = await axios.put(`/api/sales/bookings/${bookingId}/customer`, { ...details, Expected: original, Reason: reason });
            onDone(data);
        } catch (err) { setError(err.response?.data?.error || err.message); setBusy(false); }
    };
    const field = (key, label, maxLength) => <Field label={label}><input value={form[key] || ''} maxLength={maxLength}
        onChange={event => setForm(value => ({ ...value, [key]: event.target.value }))} style={inputStyle} /></Field>;
    return <Shell title="Edit customer details" onClose={() => !busy && onClose()} width={560}>
        {error && <Err>{error}</Err>}
        {loading ? <p>Loading customer…</p> : original && <fieldset disabled={busy} style={{ border: 0, padding: 0, margin: 0 }}>
            <p style={{ fontSize: 13 }}>This updates the customer record used by {linkedBookings} booking{linkedBookings === 1 ? '' : 's'}, including this booking.</p>
            {field('PartyName', 'Customer name *', 100)}{field('CNIC', 'CNIC', 50)}{field('NTNNO', 'NTN', 50)}
            <CustomerIdentityWarnings cnic={form.CNIC} ntn={form.NTNNO} excludeId={original.PartyID} />
            {field('PhoneOne', 'Phone', 50)}
            <Field label="Address"><textarea value={form.AddressOne || ''} maxLength={4000} rows={3} style={inputStyle}
                onChange={event => setForm(value => ({ ...value, AddressOne: event.target.value }))} /></Field>
            <Field label="Reason for correction *"><textarea value={reason} maxLength={500} rows={2} style={inputStyle} onChange={event => setReason(event.target.value)} /></Field>
        </fieldset>}
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Save customer" busy={busy} disabled={loading || !original || !form.PartyName?.trim() || reason.trim().length < 3} />
    </Shell>;
}
