import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { RefreshCw, Plus } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';
import { Shell, Field, Actions, Err, inputStyle } from './VehicleModelsAdmin';
const fmt = v => Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });
const day = v => String(v || '').slice(0, 10);
export default function MasterIncentiveRates() {
    const { hasModule } = useAuth(), canEdit = hasModule('sales_admin_settings');
    const [variants, setVariants] = useState([]), [rows, setRows] = useState([]), [variant, setVariant] = useState('');
    const [loading, setLoading] = useState(false), [error, setError] = useState(''), [open, setOpen] = useState(false);
    const [ending, setEnding] = useState(null);
    const load = useCallback(async () => {
        setLoading(true); setError('');
        try { const r = await axios.get('/api/sales/master-incentive/rates', { params: { variantId: variant || undefined } }); setRows(r.data); }
        catch (e) { setError(e.response?.data?.error || e.message); } finally { setLoading(false); }
    }, [variant]);
    useEffect(() => { load(); }, [load]);
    useEffect(() => { axios.get('/api/sales/master-incentive/rate-options').then(r => setVariants(r.data)).catch(e => setError(e.response?.data?.error || e.message)); }, []);
    const options = variants.map(v => ({ id: v.VariantID, label: v.VariantName, sub: v.ModelName || v.VariantCode }));
    return <div style={{ display: 'grid', gap: 12 }}>
        <ErpControlPanel title="Master Incentive Rates" subtitle="Set each variant’s incentive for a date range. Previous rates remain in history."
            actions={<>{hasModule('accounting_setup') && <Link className="erp-btn" to="/accounting/setup">Accounting Setup</Link>}
                {canEdit && <button className="erp-btn erp-btn-primary" onClick={() => setOpen(true)}><Plus size={14} /> Add rate</button>}
                <button className="erp-btn" disabled={loading} onClick={load}><RefreshCw size={14} /> Refresh</button></>} />
        {error && <Err>{error}</Err>}
        <div className="card"><SearchableSelect value={variant} onChange={setVariant} options={options} placeholder="All variants" /></div>
        <div className="card" style={{ overflowX: 'auto' }}><table className="erp-table" style={{ width: '100%' }}>
            <thead><tr>{['Variant', 'From date', 'To date', 'Amount per booking (PKR)', 'Period', 'Notes', 'Created by', 'Actions'].map(h => <th key={h}>{h}</th>)}</tr></thead>
            <tbody>{rows.map(r => <tr key={r.RateID}><td><strong>{r.VariantName}</strong><div>{r.ModelName}</div></td><td>{day(r.EffectiveFrom)}</td><td>{day(r.EffectiveTo)}</td>
                <td>{fmt(r.AmountPerBooking)}</td><td>{r.PeriodStatus}</td><td>{r.Notes || '—'}</td><td>{r.CreatedByName}</td>
                <td>{canEdit && <button className="erp-btn" onClick={() => setEnding(r)}>End rate earlier</button>}</td></tr>)}
                {!rows.length && <tr><td colSpan={8}>{loading ? 'Loading rates…' : 'No rates saved for this selection.'}</td></tr>}</tbody>
        </table></div>
        {open && <RateModal options={options} initialVariant={variant} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); load(); }} />}
        {ending && <EndRateModal row={ending} onClose={() => setEnding(null)} onSaved={() => { setEnding(null); load(); }} />}
    </div>;
}
function EndRateModal({ row, onClose, onSaved }) {
    const [to, setTo] = useState(day(row.EffectiveTo)), [reason, setReason] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try { await axios.post(`/api/sales/master-incentive/rates/${row.RateID}/end`, { EffectiveTo: to, ExpectedTo: day(row.EffectiveTo), Reason: reason }); onSaved(); }
        catch (e) { setError(e.response?.data?.error || e.message); } finally { setBusy(false); }
    };
    return <Shell title={`End rate — ${row.VariantName}`} onClose={onClose}>
        {error && <Err>{error}</Err>}<p>Keep this rate through the selected date, then add the replacement rate from the following day. Existing accrued amounts remain unchanged.</p>
        <Field label="Last effective date"><input type="date" min={day(row.EffectiveFrom)} max={day(row.EffectiveTo)} value={to} onChange={e => setTo(e.target.value)} style={inputStyle} /></Field>
        <Field label="Reason"><textarea maxLength={500} value={reason} onChange={e => setReason(e.target.value)} style={inputStyle} /></Field>
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Save end date" busy={busy} disabled={!to || to >= day(row.EffectiveTo) || reason.trim().length < 5} />
    </Shell>;
}
function RateModal({ options, initialVariant, onClose, onSaved }) {
    const [variant, setVariant] = useState(initialVariant), [from, setFrom] = useState(''), [to, setTo] = useState('');
    const [amount, setAmount] = useState(''), [notes, setNotes] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
    const save = async () => {
        setBusy(true); setError('');
        try { await axios.post('/api/sales/master-incentive/rates', { VariantID: Number(variant), EffectiveFrom: from, EffectiveTo: to, AmountPerBooking: amount, Notes: notes }); onSaved(); }
        catch (e) { setError(e.response?.data?.error || e.message); } finally { setBusy(false); }
    };
    return <Shell title="Add Master incentive rate" onClose={onClose}>
        {error && <Err>{error}</Err>}
        <p>Bookings use the rate effective on their booking date. Date ranges for the same variant must not overlap. Saved rates and previously accrued amounts are retained.</p>
        <Field label="Variant *"><SearchableSelect value={variant} onChange={setVariant} options={options} placeholder="Select variant" /></Field>
        <Field label="From date *"><input type="date" value={from} max={to || undefined} onChange={e => setFrom(e.target.value)} style={inputStyle} /></Field>
        <Field label="To date *"><input type="date" value={to} min={from || undefined} onChange={e => setTo(e.target.value)} style={inputStyle} /></Field>
        <Field label="Incentive per booking (PKR) *"><input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></Field>
        <Field label="Notes"><textarea maxLength={500} value={notes} onChange={e => setNotes(e.target.value)} style={inputStyle} /></Field>
        <Actions onCancel={onClose} onConfirm={save} confirmLabel="Save rate" busy={busy} disabled={!variant || !from || !to || from > to || amount === '' || Number(amount) < 0} />
    </Shell>;
}
