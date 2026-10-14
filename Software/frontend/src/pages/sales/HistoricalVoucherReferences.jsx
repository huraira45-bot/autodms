import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link2 } from 'lucide-react';
import { inputStyle, Field, Err, Shell } from './VehicleModelsAdmin';

const API = '/api/sales/historical';
const date = value => value ? new Date(value).toLocaleDateString('en-PK') : '';
const money = value => Number(value || 0).toLocaleString('en-PK');

export function VoucherSearchFields({ search, voucherType, onSearch, onType, disabled }) {
    const [types, setTypes] = useState([]);
    const [error, setError] = useState('');
    useEffect(() => {
        let active = true;
        axios.get(`${API}/voucher-types`).then(({ data }) => {
            if (active) setTypes(data || []);
        }).catch(e => { if (active) setError(e.response?.data?.error || e.message); });
        return () => { active = false; };
    }, []);
    return <>
        <div style={{ display: 'flex', gap: 10 }}>
            <Field label="Voucher type" flex>
                <select value={voucherType} onChange={e => onType(e.target.value)} style={inputStyle} disabled={disabled}>
                    <option value="">All types</option>
                    {types.map(t => <option key={t.VoucherTypeCode} value={t.VoucherTypeCode}>{t.VoucherTypeCode}</option>)}
                </select>
            </Field>
            <Field label="Voucher number" flex>
                <input value={search} onChange={e => onSearch(e.target.value)} placeholder="e.g. JV-OB-0001 or 0846"
                    maxLength={100} style={inputStyle} disabled={disabled} />
            </Field>
        </div>
        {error && <Err>Cannot load voucher types: {error}</Err>}
    </>;
}

export function HistoricalVoucherReferencePanel({ booking, kind = 'BOOKING', paymentId }) {
    const [search, setSearch] = useState('');
    const [voucherType, setVoucherType] = useState('');
    const [vouchers, setVouchers] = useState(null);
    const [references, setReferences] = useState([]);
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState('');
    const [message, setMessage] = useState('');
    const base = `${API}/bookings/${booking.BookingID}`;
    const load = async () => {
        const { data } = await axios.get(`${base}/voucher-references`);
        setReferences(data || []);
    };
    useEffect(() => { load().catch(e => setErr(e.response?.data?.error || e.message)); }, [base]); // eslint-disable-line react-hooks/exhaustive-deps
    const reset = () => { setPicked(null); setVouchers(null); setMessage(''); };
    const find = async () => {
        setBusy(true); setErr(''); reset();
        try {
            const { data } = await axios.get(`${base}/voucher-search`, { params: { search: search.trim(), voucherType } });
            setVouchers(data.vouchers || []);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };
    const attach = async () => {
        if (!picked || busy) return;
        setBusy(true); setErr(''); setMessage('');
        try {
            const { data } = await axios.post(`${base}/voucher-references`, {
                VoucherID: picked.VoucherID, ReferenceKind: kind,
                ...(kind === 'CUSTOMER' ? { PaymentID: paymentId } : {}),
            });
            reset(); setMessage(data.message); await load();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };
    const remove = async reference => {
        setBusy(true); setErr(''); setMessage('');
        try {
            const { data } = await axios.delete(`${base}/voucher-references/${reference.ReferenceID}`);
            setMessage(data.message); await load();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };
    const visible = kind === 'BOOKING' ? references : references.filter(r =>
        r.ReferenceKind === kind && (kind !== 'CUSTOMER' || r.PaymentID === paymentId));
    const alreadyAttached = v => visible.some(r => r.VoucherID === v.VoucherID &&
        r.ReferenceKind === kind && (kind !== 'CUSTOMER' || r.PaymentID === paymentId));
    return <div>
        <div style={{ padding: 10, background: '#f0f9ff', borderRadius: 4, marginBottom: 12, fontSize: '0.82rem' }}>
            Search any voucher in the system by number and type, including vouchers on other accounts.
            {' '}A reference is supporting documentation only. It does not count as a customer payment or Master remittance.
        </div>
        {err && <Err>{err}</Err>}
        {message && <div role="status" style={{ color: '#166534', marginBottom: 10, fontSize: '0.82rem' }}>{message}</div>}
        {visible.length > 0 && <div style={{ marginBottom: 12 }}>
            <strong style={{ fontSize: '0.82rem' }}>Attached references</strong>
            {visible.map(r => <div key={r.ReferenceID} style={{ padding: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <div style={{ fontSize: '0.8rem' }}><strong>{r.VoucherNo}</strong> · {r.VoucherType} · {r.Status}
                    <div style={{ color: '#64748b', fontSize: '0.73rem' }}>{r.ReferenceKind === 'CUSTOMER' ? 'Customer payment #' + r.PaymentID : r.ReferenceKind === 'MASTER' ? 'Master payment' : 'Booking'} · Reference only</div>
                </div>
                <button className="btn-sm" disabled={busy} onClick={() => remove(r)}>Remove reference</button>
            </div>)}
        </div>}
        <VoucherSearchFields search={search} voucherType={voucherType} disabled={busy}
            onSearch={value => { setSearch(value); reset(); }} onType={value => { setVoucherType(value); reset(); }} />
        <button className="btn-sm" disabled={busy || (!search.trim() && !voucherType)} onClick={find}>
            {busy ? 'Working...' : 'Find any voucher'}
        </button>
        {vouchers && <div style={{ maxHeight: 250, overflowY: 'auto', border: '1px solid #e2e8f0', marginTop: 10, borderRadius: 6 }}>
            {!vouchers.length && <div style={{ padding: 14, color: '#64748b', fontSize: '0.82rem' }}>No voucher matches that number and type.</div>}
            {vouchers.map(v => <button key={v.VoucherID} type="button" disabled={busy || alreadyAttached(v)}
                onClick={() => setPicked(v)} style={{ display: 'block', width: '100%', textAlign: 'left', padding: 10,
                    border: 0, borderBottom: '1px solid #e2e8f0', background: picked?.VoucherID === v.VoucherID ? '#eff6ff' : 'white', cursor: 'pointer' }}>
                <strong>{v.VoucherNo}</strong> · {v.VoucherType} · {v.Status} {alreadyAttached(v) && '· Already attached'}
                <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>{date(v.VoucherDate)} · Voucher total: PKR {money(v.TotalAmount)}</div>
                {v.Remarks && <div style={{ color: '#64748b', fontSize: '0.75rem', marginTop: 4 }}>{String(v.Remarks).slice(0, 110)}</div>}
            </button>)}
            {vouchers.length === 50 && <div style={{ padding: 8, fontSize: '0.75rem', color: '#64748b' }}>Showing the first 50 matches. Enter more of the voucher number to narrow the search.</div>}
        </div>}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
            <button className="btn" disabled={busy || !picked || alreadyAttached(picked)} onClick={attach}>
                <Link2 size={13} /> {picked ? 'Link ' + picked.VoucherNo + ' as reference' : 'Select a voucher'}
            </button>
        </div>
    </div>;
}

export function HistoricalVoucherReferencesModal({ booking, onClose }) {
    return <Shell title={`${booking.BookingNo || 'Historical booking'} - voucher references`} onClose={onClose} width={640}>
        <HistoricalVoucherReferencePanel booking={booking} />
    </Shell>;
}
