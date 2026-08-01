/**
 * Department Tagging workspace — owner ask 2026-08-01. Posted CPV/BPV/JV
 * vouchers don't carry a department yet (tagging was added after they were
 * posted). Reporting-only: picking a department here never touches the GL,
 * it only fills data_FinanceVoucherInfo.DepartmentID via PATCH
 * /accounts/vouchers/:id/department (migration 109).
 *
 * By default this hides vouchers that already touch a Parts or Sales GL
 * account (502003xxx / 502004xxx) — those are self-evidently Parts/Sales
 * department expenses already, same COA-prefix classification the P&L by
 * Department report uses. "Show all" reveals everything still untagged.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Building2, Search, RefreshCw, Save, ArrowRight, Loader2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_ROUTE = { CPV: '/vouchers/cpv', BPV: '/vouchers/bpv', JV: '/vouchers/jv' };

export default function VoucherDepartmentTagging() {
    const { notify } = useFeedback();
    const navigate = useNavigate();

    const [rows, setRows] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showAll, setShowAll] = useState(false);
    const [query, setQuery] = useState('');
    const [picks, setPicks] = useState({});     // VoucherID -> DepartmentID chosen (not yet saved)
    const [savingId, setSavingId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/accounts/vouchers/needs-department`, { params: { all: showAll ? 1 : 0, limit: 300 } });
            setRows(r.data.rows || []);
        } catch (e) {
            notify({ type: 'error', title: 'Failed to load', message: e.response?.data?.error || e.message });
        }
        setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [showAll]);

    useEffect(() => { load(); }, [load]);
    useEffect(() => {
        axios.get(`${API}/departments`).then(r => setDepartments(r.data || [])).catch(() => {});
    }, []);

    const filtered = rows.filter(r => {
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (r.VoucherNo || '').toLowerCase().includes(q)
            || (r.Remarks || '').toLowerCase().includes(q)
            || (r.AccountsTouched || '').toLowerCase().includes(q);
    });

    const save = async (voucherId) => {
        const deptId = picks[voucherId];
        if (!deptId) {
            notify({ type: 'warning', title: 'Pick a department', message: 'Choose a department before saving.' });
            return;
        }
        setSavingId(voucherId);
        try {
            await axios.patch(`${API}/accounts/vouchers/${voucherId}/department`, { DepartmentID: deptId });
            setRows(prev => prev.filter(r => r.VoucherID !== voucherId));
            notify({ type: 'success', title: 'Tagged', message: 'Department saved.' });
        } catch (e) {
            notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message });
        }
        setSavingId(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="erp-control-panel">
                <div style={{ marginRight: 'auto' }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Building2 size={16} color="var(--erp-brand)" /> Department Tagging — CPV / BPV / JV
                    </div>
                    <div className="subtitle">
                        Reporting-only. Picking a department here has no GL impact — it only feeds the
                        Expense by Department report. Vouchers already touching a Parts or Sales GL account
                        are hidden by default (already obviously Parts/Sales spend).
                    </div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#475569' }}>
                        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                        Show all (incl. Parts/Sales)
                    </label>
                    <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh
                    </button>
                </div>
            </div>

            <div className="card" style={{ padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                    <Search size={16} color="#94a3b8" />
                    <input type="text" value={query} onChange={e => setQuery(e.target.value)}
                        placeholder="Search voucher #, remarks, account…"
                        style={{ flex: 1, padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }} />
                    <span style={{ fontSize: '0.75rem', color: '#94a3b8', whiteSpace: 'nowrap' }}>
                        {filtered.length} of {rows.length} untagged
                    </span>
                </div>

                {loading ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Loading…</div>
                ) : filtered.length === 0 ? (
                    <div style={{ padding: 24, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                        {rows.length === 0 ? 'Nothing left to tag.' : 'No matches.'}
                    </div>
                ) : (
                    <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Voucher</th>
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Date</th>
                                    <th style={{ padding: 10, textAlign: 'right', position: 'sticky', top: 0, background: '#f8fafc' }}>Amount</th>
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Account(s) / Remarks</th>
                                    <th style={{ padding: 10, textAlign: 'left', width: 220, position: 'sticky', top: 0, background: '#f8fafc' }}>Department</th>
                                    <th style={{ padding: 10, width: 90, position: 'sticky', top: 0, background: '#f8fafc' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => (
                                    <tr key={r.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: 10 }}>
                                            <span
                                                style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                                onClick={() => navigate(`${TYPE_ROUTE[r.VoucherTypeCode] || '/vouchers/jv'}?id=${r.VoucherID}`)}
                                                title="Open voucher">
                                                {r.VoucherNo} <ArrowRight size={11} color="#94a3b8" />
                                            </span>
                                            <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{r.VoucherTypeCode}</div>
                                        </td>
                                        <td style={{ padding: 10, color: '#475569' }}>{new Date(r.VoucherDate).toLocaleDateString()}</td>
                                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{fmt(r.TotalAmount)}</td>
                                        <td style={{ padding: 10, color: '#64748b' }}>
                                            <div>{r.AccountsTouched || '—'}</div>
                                            {r.Remarks && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.Remarks}</div>}
                                        </td>
                                        <td style={{ padding: 10 }}>
                                            <select value={picks[r.VoucherID] || ''} onChange={e => setPicks(p => ({ ...p, [r.VoucherID]: e.target.value }))}
                                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.82rem' }}>
                                                <option value="">— Pick department —</option>
                                                {departments.map(d => <option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: 10 }}>
                                            <button type="button" className="erp-btn erp-btn-sm erp-btn-primary"
                                                onClick={() => save(r.VoucherID)} disabled={savingId === r.VoucherID || !picks[r.VoucherID]}>
                                                {savingId === r.VoucherID ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
