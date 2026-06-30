import { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Search, Save, Loader2, Users, ShieldCheck, AlertTriangle } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api/parties';

// Four business keys mirror the CHECK constraint on dms_PartyBusinessAccess.
const BUSINESSES = [
    { key: 'WORKSHOP',    label: 'Workshop',    hint: 'Job Card customers' },
    { key: 'SALES',       label: 'Spare Parts', hint: 'Store Sale customers' },
    { key: 'PROCUREMENT', label: 'Procurement', hint: 'GRN / GRTN suppliers' },
    { key: 'SUBLET',      label: 'Sublet',      hint: 'Sublet repair vendors' },
];

export default function PartyBusinessAccess() {
    const { notify, confirm } = useFeedback();
    const [rows, setRows] = useState([]);     // [{ PartyID, PartyName, PartyType, Businesses: [] }]
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState({});  // { [PartyID]: true }
    const [search, setSearch] = useState('');
    const [showOnlyUnmapped, setShowOnlyUnmapped] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/business-access`);
            setRows(r.data);
        } catch (e) {
            notify({ type: 'error', title: 'Load failed', message: e.response?.data?.error || e.message });
        }
        setLoading(false);
    };

    useEffect(() => { load(); }, []);

    const toggle = (partyId, key) => {
        setRows(prev => prev.map(r => {
            if (r.PartyID !== partyId) return r;
            const has = r.Businesses.includes(key);
            return { ...r, Businesses: has ? r.Businesses.filter(b => b !== key) : [...r.Businesses, key], _dirty: true };
        }));
    };

    const saveRow = async (party) => {
        setSaving(s => ({ ...s, [party.PartyID]: true }));
        try {
            await axios.post(`${API}/business-access`, { PartyID: party.PartyID, BusinessKeys: party.Businesses });
            setRows(prev => prev.map(r => r.PartyID === party.PartyID ? { ...r, _dirty: false } : r));
            notify({ type: 'success', title: 'Saved', message: `${party.PartyName} access updated.` });
        } catch (e) {
            notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message });
        }
        setSaving(s => { const n = { ...s }; delete n[party.PartyID]; return n; });
    };

    const grantAll = async () => {
        const ok = await confirm({
            title: 'Grant ALL businesses to ALL parties?',
            message: 'Every existing party will be mapped to Workshop, Sales, Procurement, and Sublet. Use this once at first setup so dropdowns aren\'t empty.',
            confirmLabel: 'Grant all',
        });
        if (!ok) return;
        try {
            const r = await axios.post(`${API}/business-access/grant-all`);
            notify({ type: 'success', title: 'Done', message: `${r.data.inserted} access rows added.` });
            load();
        } catch (e) {
            notify({ type: 'error', title: 'Grant failed', message: e.response?.data?.error || e.message });
        }
    };

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        return rows.filter(r => {
            if (showOnlyUnmapped && r.Businesses.length > 0) return false;
            if (!q) return true;
            return (r.PartyName || '').toLowerCase().includes(q)
                || String(r.PhoneOne || '').includes(q)
                || (r.PartyType || '').toLowerCase().includes(q);
        });
    }, [rows, search, showOnlyUnmapped]);

    const unmappedCount = rows.filter(r => r.Businesses.length === 0).length;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Party ↔ Business Access</h1>
                    <p className="page-subtitle">
                        Control which parties appear in each module's picker. A party with NO mapping is hidden from every form.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Refresh
                    </button>
                    <button className="btn" onClick={grantAll} style={{ background: '#0f766e' }}>
                        Grant ALL to ALL (bootstrap)
                    </button>
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 12, flexWrap: 'wrap' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, height: 36, flex: 1, minWidth: 260 }}>
                        <Search size={14} color="#94a3b8" />
                        <input
                            type="text" value={search} onChange={e => setSearch(e.target.value)}
                            placeholder="Search by name, phone, or type..."
                            style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem', background: 'transparent' }}
                        />
                    </div>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: unmappedCount > 0 ? '#b91c1c' : '#475569' }}>
                        <input type="checkbox" checked={showOnlyUnmapped} onChange={e => setShowOnlyUnmapped(e.target.checked)} />
                        Show only unmapped ({unmappedCount})
                    </label>
                    <div style={{ fontSize: '0.8rem', color: '#64748b' }}>
                        <Users size={12} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        {filtered.length} of {rows.length} parties
                    </div>
                </div>

                {unmappedCount > 0 && !showOnlyUnmapped && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '6px 10px', borderRadius: 6, fontSize: '0.8rem', marginBottom: 10 }}>
                        <AlertTriangle size={14} /> {unmappedCount} parties have no business mapping — they're currently hidden from every picker.
                    </div>
                )}

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={th}>Party</th>
                                <th style={th}>Type</th>
                                <th style={th}>Phone</th>
                                {BUSINESSES.map(b => (
                                    <th key={b.key} style={{ ...th, textAlign: 'center', minWidth: 110 }} title={b.hint}>{b.label}</th>
                                ))}
                                <th style={{ ...th, textAlign: 'center', width: 90 }}>Save</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filtered.map(p => (
                                <tr key={p.PartyID} style={{ borderBottom: '1px solid #f1f5f9', background: p._dirty ? '#fef9c3' : 'transparent' }}>
                                    <td style={td}><strong>{p.PartyName}</strong></td>
                                    <td style={{ ...td, color: '#64748b' }}>{p.PartyType || '—'}</td>
                                    <td style={{ ...td, color: '#64748b', fontFamily: 'monospace' }}>{p.PhoneOne || '—'}</td>
                                    {BUSINESSES.map(b => (
                                        <td key={b.key} style={{ ...td, textAlign: 'center' }}>
                                            <input type="checkbox" checked={p.Businesses.includes(b.key)} onChange={() => toggle(p.PartyID, b.key)} />
                                        </td>
                                    ))}
                                    <td style={{ ...td, textAlign: 'center' }}>
                                        <button
                                            onClick={() => saveRow(p)}
                                            disabled={!p._dirty || saving[p.PartyID]}
                                            style={{
                                                padding: '4px 10px', fontSize: '0.75rem', borderRadius: 4, cursor: p._dirty ? 'pointer' : 'default',
                                                border: '1px solid ' + (p._dirty ? '#15803d' : '#e2e8f0'),
                                                background: p._dirty ? '#15803d' : '#f1f5f9',
                                                color: p._dirty ? 'white' : '#94a3b8',
                                                opacity: saving[p.PartyID] ? 0.6 : 1,
                                                display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 600,
                                            }}>
                                            {saving[p.PartyID] ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filtered.length === 0 && (
                                <tr><td colSpan={4 + BUSINESSES.length} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>
                                    {loading ? 'Loading...' : 'No parties match.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const th = { padding: '8px 10px', textAlign: 'left', fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0' };
const td = { padding: '8px 10px', borderRight: '1px solid #f8fafc' };
