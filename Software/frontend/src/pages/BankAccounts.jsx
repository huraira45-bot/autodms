import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Landmark, Save, Search, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';

const API_BASE = '/api';

// Inline searchable picker for the Bank Charges expense account.
function COAPicker({ value, valueLabel, onChange }) {
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [results, setResults] = useState([]);
    const [busy, setBusy] = useState(false);

    const search = useCallback(async (term) => {
        if (term.length < 2) { setResults([]); return; }
        setBusy(true);
        try {
            const res = await axios.get(`${API_BASE}/accounts/coa`, { params: { search: term } });
            // Only leaf accounts (cannot post to parents)
            setResults(res.data.filter(a => !a.isParent));
        } catch (err) { console.error(err); }
        setBusy(false);
    }, []);

    useEffect(() => {
        const t = setTimeout(() => search(q), 250);
        return () => clearTimeout(t);
    }, [q, search]);

    return (
        <div style={{ position: 'relative' }}>
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                style={{
                    width: '100%', textAlign: 'left', padding: '8px 12px',
                    border: '1px solid #cbd5e1', borderRadius: 6, background: 'white',
                    cursor: 'pointer', fontSize: '0.875rem',
                    color: valueLabel ? '#0f172a' : '#94a3b8'
                }}
            >
                {valueLabel || 'Select expense account...'}
            </button>
            {open && (
                <div style={{
                    position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 20,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
                    marginTop: 4, boxShadow: '0 4px 12px rgba(0,0,0,0.08)', maxHeight: 280, overflow: 'hidden',
                    display: 'flex', flexDirection: 'column'
                }}>
                    <div style={{ padding: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Search size={14} color="#64748b" />
                        <input
                            autoFocus
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Type 2+ chars..."
                            style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }}
                        />
                        {busy && <Loader2 size={12} className="animate-spin" />}
                    </div>
                    <div style={{ overflowY: 'auto', maxHeight: 230 }}>
                        {q.length < 2 ? (
                            <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem' }}>Start typing to search.</div>
                        ) : results.length === 0 && !busy ? (
                            <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem' }}>No matches.</div>
                        ) : results.map(a => (
                            <div
                                key={a.GLCAID}
                                onClick={() => { onChange(a); setOpen(false); setQ(''); }}
                                style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.875rem' }}
                                onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                            >
                                <span style={{ fontFamily: 'monospace', color: '#64748b', marginRight: 8 }}>{a.GLCode}</span>
                                <span>{a.GLTitle}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function BankRow({ bank, onSaved }) {
    const [pct, setPct] = useState(bank.POSCommissionPct ?? '');
    const [chgId, setChgId] = useState(bank.BankChargesGLCAID || null);
    const [chgLabel, setChgLabel] = useState(
        bank.BankChargesGLCode ? `${bank.BankChargesGLCode} — ${bank.BankChargesGLTitle}` : ''
    );
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState(null);

    const dirty =
        String(pct ?? '') !== String(bank.POSCommissionPct ?? '') ||
        (chgId || null) !== (bank.BankChargesGLCAID || null);

    const save = async () => {
        setSaving(true);
        setStatus(null);
        try {
            await axios.patch(`${API_BASE}/accounts/banks/${bank.GLCAID}/config`, {
                POSCommissionPct: pct === '' ? null : parseFloat(pct),
                BankChargesGLCAID: chgId,
            });
            setStatus({ ok: true, msg: 'Saved' });
            onSaved && onSaved();
            setTimeout(() => setStatus(null), 2500);
        } catch (err) {
            setStatus({ ok: false, msg: err.response?.data?.error || err.message });
        }
        setSaving(false);
    };

    return (
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
            <td style={{ padding: 12, fontFamily: 'monospace', color: '#64748b', fontSize: '0.85rem' }}>
                {bank.BankGLCode}
            </td>
            <td style={{ padding: 12, fontWeight: 500 }}>
                {bank.BankGLTitle}
                {!bank.IsActive && (
                    <span style={{
                        marginLeft: 8, fontSize: '0.7rem', padding: '2px 8px',
                        background: '#fef2f2', color: '#b91c1c', borderRadius: 99
                    }}>INACTIVE</span>
                )}
            </td>
            <td style={{ padding: 12, width: 130 }}>
                <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={pct}
                    onChange={e => setPct(e.target.value)}
                    placeholder="0.00"
                    style={{
                        width: '100%', padding: '6px 10px', border: '1px solid #cbd5e1',
                        borderRadius: 6, fontSize: '0.875rem'
                    }}
                />
            </td>
            <td style={{ padding: 12, minWidth: 280 }}>
                <COAPicker
                    value={chgId}
                    valueLabel={chgLabel}
                    onChange={(a) => {
                        setChgId(a.GLCAID);
                        setChgLabel(`${a.GLCode} — ${a.GLTitle}`);
                    }}
                />
                {chgId && (
                    <button
                        type="button"
                        onClick={() => { setChgId(null); setChgLabel(''); }}
                        style={{
                            marginTop: 4, fontSize: '0.7rem', background: 'transparent',
                            border: 'none', color: '#64748b', cursor: 'pointer', padding: 0
                        }}
                    >
                        Clear
                    </button>
                )}
            </td>
            <td style={{ padding: 12, width: 180 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <button
                        onClick={save}
                        disabled={!dirty || saving}
                        className="btn"
                        style={{
                            padding: '6px 12px', fontSize: '0.85rem',
                            opacity: (!dirty || saving) ? 0.5 : 1,
                            cursor: (!dirty || saving) ? 'not-allowed' : 'pointer'
                        }}
                    >
                        {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        Save
                    </button>
                    {status && (
                        <span style={{
                            display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.8rem',
                            color: status.ok ? '#16a34a' : '#dc2626'
                        }}>
                            {status.ok ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                            {status.msg}
                        </span>
                    )}
                </div>
            </td>
        </tr>
    );
}

export default function BankAccounts() {
    const [banks, setBanks] = useState([]);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/accounts/bank-configs`);
            setBanks(res.data);
        } catch (err) { console.error(err); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Bank Accounts</h1>
                    <p className="page-subtitle">Per-bank POS commission % and Bank Charges expense account. Required for POS Settlement.</p>
                </div>
            </div>

            <div className="card">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, color: 'var(--primary)' }}>
                    <Landmark size={20} />
                    <strong>Configured Bank Accounts</strong>
                    {loading && <Loader2 size={14} className="animate-spin" />}
                </div>

                {banks.length === 0 ? (
                    <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>
                        No banks marked yet. Go to <strong>Chart of Accounts</strong> and click <em>Mark Bank</em> on a leaf account to configure it here.
                    </div>
                ) : (
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 12, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>GL Code</th>
                                    <th style={{ padding: 12, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Bank Account</th>
                                    <th style={{ padding: 12, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>POS Commission %</th>
                                    <th style={{ padding: 12, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Bank Charges Account</th>
                                    <th style={{ padding: 12, textAlign: 'left', fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {banks.map(b => (
                                    <BankRow key={b.GLCAID} bank={b} onSaved={load} />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <div style={{
                    marginTop: 16, padding: 12, background: '#eff6ff', border: '1px solid #bfdbfe',
                    borderRadius: 8, fontSize: '0.85rem', color: '#1e40af'
                }}>
                    <strong>Note:</strong> The <em>POS Commission %</em> is the bank's default cut (e.g. 1.50 = 1.5%) on card swipes, and the <em>Bank Charges Account</em> is the expense head it posts to during POS Settlement. Both can be overridden per-settlement, but a default must be set here before that bank can be used for settlement.
                </div>
            </div>
        </div>
    );
}
