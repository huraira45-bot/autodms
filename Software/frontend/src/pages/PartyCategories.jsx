/**
 * Parties — Party Categories.
 *
 * Owner ask 2026-09-19: say which party is an individual, which is a company,
 * which is an insurer and which is Master Motors, so the receivable and
 * recovery reports can be read by kind of party.
 *
 * This is a separate field from the party's type (Customer / Supplier /
 * Insurance / Both), which says how they trade with us and drives the sales
 * picker, supplier screens and GL setup. Parties already typed as Insurance
 * were classified automatically; the rest start unclassified.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, Search, Loader2, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { ErpControlPanel } from '../components/erp';

const API = '/api';

const CATEGORIES = [
    { key: 'Individual',   label: 'Individual',    hint: 'A person — walk-in or retail customer.' },
    { key: 'Corporate',    label: 'Corporate',     hint: 'A company or institution buying on its own account.' },
    { key: 'Insurance',    label: 'Insurance',     hint: 'An insurer paying claims on behalf of customers.' },
    { key: 'MasterMotors', label: 'Master Motors', hint: 'The principal — vehicles, incentives and claims.' },
];
const CAT_COLOR = { Individual: '#0f766e', Corporate: '#1d4ed8', Insurance: '#b45309', MasterMotors: '#7c3aed' };

export default function PartyCategories() {
    const { notify } = useFeedback();
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('ALL');   // ALL | Unclassified | <category>
    const [saving, setSaving] = useState({});      // PartyID -> true while saving
    const [justSaved, setJustSaved] = useState({});

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const params = {};
            if (search.trim()) params.search = search.trim();
            if (filter !== 'ALL') params.category = filter;
            const r = await axios.get(`${API}/parties`, { params });
            setRows(r.data || []);
        } catch (e) { notify({ type: 'error', title: 'Could not load parties', message: e.response?.data?.error || e.message }); }
        setBusy(false);
    }, [search, filter, notify]);

    useEffect(() => {
        const t = setTimeout(load, search ? 300 : 0);
        return () => clearTimeout(t);
    }, [load, search]);

    const setCategory = async (party, category) => {
        setSaving(s => ({ ...s, [party.PartyID]: true }));
        try {
            await axios.patch(`${API}/parties/${party.PartyID}/category`, { PartyCategory: category || null });
            setRows(rs => rs.map(r => r.PartyID === party.PartyID ? { ...r, PartyCategory: category || null } : r));
            setJustSaved(s => ({ ...s, [party.PartyID]: true }));
            setTimeout(() => setJustSaved(s => ({ ...s, [party.PartyID]: false })), 1500);
        } catch (e) {
            notify({ type: 'error', title: 'Could not save', message: e.response?.data?.error || e.message });
        }
        setSaving(s => ({ ...s, [party.PartyID]: false }));
    };

    // Counts of what is on screen — with no filter this is the whole book.
    const counts = rows.reduce((acc, r) => {
        const k = r.PartyCategory || 'Unclassified';
        acc[k] = (acc[k] || 0) + 1;
        return acc;
    }, {});

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Users size={16} /> Party Categories</span>}
                subtitle="Mark each party as Individual, Corporate, Insurance or Master Motors. The unpaid and recovery reports group by this."
                actions={<button className="btn-sm" onClick={load} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>}
            />

            <div className="card" style={{ background: '#f0f9ff', borderLeft: '3px solid #0369a1', fontSize: '0.82rem', color: '#0c4a6e' }}>
                This is separate from the party's <strong>type</strong> (Customer / Supplier / Insurance / Both), which stays as it is —
                the sales customer picker, supplier screens and account setup all depend on that. Parties already typed as Insurance
                have been classified for you.
            </div>

            <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: '1 1 260px' }}>
                    <Search size={14} style={{ position: 'absolute', left: 8, top: 10, color: '#94a3b8' }} />
                    <input value={search} onChange={e => setSearch(e.target.value)}
                           placeholder="Search by name, CNIC, phone or NTN"
                           style={{ width: '100%', padding: '8px 8px 8px 28px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem' }} />
                </div>
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {['ALL', 'Unclassified', ...CATEGORIES.map(c => c.key)].map(k => (
                        <button key={k} onClick={() => setFilter(k)}
                                style={{ padding: '6px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: '0.8rem',
                                         background: filter === k ? '#1e40af' : '#f1f5f9',
                                         color: filter === k ? 'white' : '#475569',
                                         fontWeight: filter === k ? 600 : 500 }}>
                            {k === 'ALL' ? 'All' : k === 'Unclassified' ? 'Not classified' : CATEGORIES.find(c => c.key === k)?.label}
                            {counts[k] != null && filter === 'ALL' ? ` (${counts[k]})` : ''}
                        </button>
                    ))}
                </div>
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                    {rows.length} {rows.length === 1 ? 'party' : 'parties'}
                    {counts.Unclassified ? ` · ${counts.Unclassified} still to classify` : ''}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', textAlign: 'left' }}>
                            <th style={th}>Party</th>
                            <th style={th}>Type</th>
                            <th style={th}>Phone / CNIC</th>
                            <th style={th}>Account</th>
                            <th style={{ ...th, width: 210 }}>Category</th>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(p => (
                            <tr key={p.PartyID} style={{ borderBottom: '1px solid #f1f5f9',
                                                         background: p.PartyCategory ? 'white' : '#fffbeb' }}>
                                <td style={td}><strong>{p.PartyName}</strong></td>
                                <td style={td}>{p.PartyType}</td>
                                <td style={{ ...td, fontSize: '0.78rem', color: '#64748b' }}>
                                    {[p.PhoneOne, p.CNIC].filter(Boolean).join(' · ') || '—'}
                                </td>
                                <td style={{ ...td, fontSize: '0.78rem', color: '#64748b' }}>
                                    {p.PartyGLCode ? `${p.PartyGLCode}` : <span style={{ color: '#b45309' }}>no account</span>}
                                </td>
                                <td style={td}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <select value={p.PartyCategory || ''}
                                                disabled={!!saving[p.PartyID]}
                                                onChange={e => setCategory(p, e.target.value)}
                                                style={{ padding: '5px 8px', borderRadius: 6, fontSize: '0.82rem',
                                                         border: `1px solid ${p.PartyCategory ? '#cbd5e1' : '#fbbf24'}`,
                                                         color: CAT_COLOR[p.PartyCategory] || '#92400e',
                                                         fontWeight: 600, minWidth: 150 }}>
                                            <option value="">— not classified —</option>
                                            {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                                        </select>
                                        {saving[p.PartyID] && <Loader2 size={13} className="animate-spin" style={{ color: '#94a3b8' }} />}
                                        {justSaved[p.PartyID] && <CheckCircle2 size={14} style={{ color: '#15803d' }} />}
                                    </div>
                                </td>
                            </tr>
                        ))}
                        {!busy && rows.length === 0 && (
                            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                No parties match this search.
                            </td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <div className="card" style={{ fontSize: '0.78rem', color: '#64748b' }}>
                {CATEGORIES.map(c => (
                    <div key={c.key} style={{ marginBottom: 2 }}>
                        <strong style={{ color: CAT_COLOR[c.key] }}>{c.label}</strong> — {c.hint}
                    </div>
                ))}
            </div>
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
