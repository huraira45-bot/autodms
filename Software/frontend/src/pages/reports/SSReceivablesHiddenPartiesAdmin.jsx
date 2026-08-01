/**
 * Settings form for "Store Sale Receivables (Custom View)" — owner ask
 * 2026-08-01. Separate from the report itself: pick which parties are left
 * out of the custom report. The original Store Sale Receivables report
 * always shows everyone and is unaffected by this list.
 */
import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { EyeOff, Search, Save, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const API = '/api';

export default function SSReceivablesHiddenPartiesAdmin() {
    const { notify } = useFeedback();
    const [parties, setParties] = useState([]);
    const [query, setQuery] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [dirty, setDirty] = useState(false);

    const load = async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/reports/store-sale-receivables-custom/hidden-parties`);
            setParties(r.data.parties || []);
            setDirty(false);
        } catch (e) {
            notify({ type: 'error', title: 'Failed to load', message: e.response?.data?.error || e.message });
        }
        setLoading(false);
    };
    useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

    const toggle = (partyId) => {
        setParties(prev => prev.map(p => p.PartyID === partyId ? { ...p, Hidden: !p.Hidden } : p));
        setDirty(true);
    };

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return parties;
        return parties.filter(p =>
            (p.PartyName || '').toLowerCase().includes(q) ||
            (p.PartyType || '').toLowerCase().includes(q));
    }, [parties, query]);

    const hiddenCount = parties.filter(p => p.Hidden).length;

    const save = async () => {
        setSaving(true);
        try {
            const HiddenPartyIds = parties.filter(p => p.Hidden).map(p => p.PartyID);
            const r = await axios.put(`${API}/reports/store-sale-receivables-custom/hidden-parties`, { HiddenPartyIds });
            notify({ type: 'success', title: 'Saved', message: r.data.message });
            setDirty(false);
        } catch (e) {
            notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message });
        }
        setSaving(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="erp-control-panel">
                <div style={{ marginRight: 'auto' }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <EyeOff size={16} color="var(--erp-brand)" /> Store Sale Receivables — Hidden Parties
                    </div>
                    <div className="subtitle">
                        Checked parties are left out of "Store Sale Receivables (Custom View)". The original
                        Store Sale Receivables report always shows everyone and is unaffected by this list.
                    </div>
                </div>
                <div className="row" style={{ gap: 8 }}>
                    <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                        <RefreshCw size={14} /> Refresh
                    </button>
                    <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={save} disabled={saving || !dirty}>
                        <Save size={14} /> Save{hiddenCount > 0 ? ` (${hiddenCount} hidden)` : ''}
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Search size={16} color="#94a3b8" />
                    <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Search parties…"
                        style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {filtered.length} of {parties.length}
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
                ) : (
                    <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 10, textAlign: 'left', width: 90, position: 'sticky', top: 0, background: '#f8fafc' }}>Status</th>
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Party Name</th>
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Type</th>
                                    <th style={{ padding: 10, textAlign: 'left', width: 100, position: 'sticky', top: 0, background: '#f8fafc' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(p => (
                                    <tr key={p.PartyID} style={{ borderBottom: '1px solid #f1f5f9', background: p.Hidden ? '#fef2f2' : undefined }}>
                                        <td style={{ padding: 10 }}>
                                            <span style={{
                                                fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 99,
                                                background: p.Hidden ? '#fee2e2' : '#dcfce7',
                                                color: p.Hidden ? '#991b1b' : '#166534',
                                            }}>
                                                {p.Hidden ? 'Hidden' : 'Visible'}
                                            </span>
                                        </td>
                                        <td style={{ padding: 10, fontWeight: p.Hidden ? 400 : 600, color: p.Hidden ? '#94a3b8' : '#0f172a' }}>
                                            {p.PartyName}
                                        </td>
                                        <td style={{ padding: 10, color: '#64748b' }}>{p.PartyType || '—'}</td>
                                        <td style={{ padding: 10 }}>
                                            {p.Hidden ? (
                                                <button type="button" onClick={() => toggle(p.PartyID)}
                                                    style={{ background: '#dcfce7', color: '#166534', border: '1px solid #86efac', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    Show
                                                </button>
                                            ) : (
                                                <button type="button" onClick={() => toggle(p.PartyID)}
                                                    style={{ background: '#fee2e2', color: '#991b1b', border: '1px solid #fca5a5', borderRadius: 6, padding: '4px 10px', fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer' }}>
                                                    Hide
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                                {filtered.length === 0 && (
                                    <tr><td colSpan={4} style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>No matches.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
