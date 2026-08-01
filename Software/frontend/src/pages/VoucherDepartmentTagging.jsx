/**
 * Department Tagging workspace — owner ask 2026-08-01. Posted CPV/BPV/JV
 * lines don't carry a department yet (tagging was added after they were
 * posted). Reporting-only: picking a department here never touches the GL,
 * it only fills data_FinanceVoucherDetail.DepartmentID via PATCH
 * /accounts/vouchers/:id/lines/:lineId/department (migration 110).
 *
 * Line-level, not voucher-level: a JV that mixes an expense line with a
 * non-expense line, or splits one bill across two departments, is tagged
 * one line at a time. Each row here is a LINE, not a whole voucher — a
 * voucher with two qualifying lines shows up twice.
 *
 * Scope is Operating Expenses only (GLCode LIKE '502%' — Admin/Service/
 * Parts/Sales); Cost of Sales (501xxx, e.g. Paint/Parts COGS) and any
 * Asset/Liability-only line never show up here.
 *
 * Within that, by default this also hides:
 *   - lines on a voucher linked to a source document (Job Card, GRN, Store
 *     Sale...) — system-generated at finalize, not typed by an accountant;
 *   - lines already on a Parts (502003xxx) or Sales (502004xxx) GL account
 *     — self-evidently Parts/Sales department expenses already, same
 *     COA-prefix classification the P&L by Department report uses.
 * "Show all" reveals everything still undecided within the 502xxx scope.
 * A line explicitly marked "Not an expense" never resurfaces regardless.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Building2, Search, RefreshCw, Save, ArrowRight, Loader2, X } from 'lucide-react';
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
    const [picks, setPicks] = useState({});     // VoucherDetailID -> DepartmentID chosen (not yet saved)
    const [busyId, setBusyId] = useState(null); // VoucherDetailID currently saving

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
            || (r.Narration || '').toLowerCase().includes(q)
            || (r.GLTitle || '').toLowerCase().includes(q);
    });

    const saveDepartment = async (row) => {
        const deptId = picks[row.VoucherDetailID];
        if (!deptId) {
            notify({ type: 'warning', title: 'Pick a department', message: 'Choose a department before saving.' });
            return;
        }
        setBusyId(row.VoucherDetailID);
        try {
            await axios.patch(`${API}/accounts/vouchers/${row.VoucherID}/lines/${row.VoucherDetailID}/department`, { DepartmentID: deptId, IsExpense: true });
            setRows(prev => prev.filter(r => r.VoucherDetailID !== row.VoucherDetailID));
            notify({ type: 'success', title: 'Tagged', message: 'Department saved.' });
        } catch (e) {
            notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message });
        }
        setBusyId(null);
    };

    const markNotExpense = async (row) => {
        setBusyId(row.VoucherDetailID);
        try {
            await axios.patch(`${API}/accounts/vouchers/${row.VoucherID}/lines/${row.VoucherDetailID}/department`, { DepartmentID: null, IsExpense: false });
            setRows(prev => prev.filter(r => r.VoucherDetailID !== row.VoucherDetailID));
            notify({ type: 'success', title: 'Marked', message: 'Line marked as not an expense.' });
        } catch (e) {
            notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message });
        }
        setBusyId(null);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="erp-control-panel">
                <div style={{ marginRight: 'auto' }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Building2 size={16} color="var(--erp-brand)" /> Department Tagging — CPV / BPV / JV
                    </div>
                    <div className="subtitle">
                        Reporting-only, per line — it only feeds the Expense by Department report, no GL
                        impact. Scope is Operating Expenses only (Admin / Service / Parts / Sales) — Cost of
                        Sales (e.g. Paint/Parts COGS) and asset/liability-only lines never show up here.
                        Lines on a Job Card/GRN/Store Sale-linked voucher, or already on a Parts or Sales GL
                        account, are hidden by default. Mark a line "Not an expense" (✕) and it's gone for good.
                    </div>
                </div>
                <div className="row" style={{ gap: 8, alignItems: 'center' }}>
                    <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: '#475569' }}>
                        <input type="checkbox" checked={showAll} onChange={e => setShowAll(e.target.checked)} />
                        Show all (incl. job-card-linked / Parts / Sales)
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
                        placeholder="Search voucher #, account, narration…"
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
                                    <th style={{ padding: 10, textAlign: 'left', position: 'sticky', top: 0, background: '#f8fafc' }}>Account / Narration</th>
                                    <th style={{ padding: 10, textAlign: 'right', position: 'sticky', top: 0, background: '#f8fafc' }}>Amount</th>
                                    <th style={{ padding: 10, textAlign: 'left', width: 220, position: 'sticky', top: 0, background: '#f8fafc' }}>Department</th>
                                    <th style={{ padding: 10, width: 130, position: 'sticky', top: 0, background: '#f8fafc' }}></th>
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map(r => {
                                    const isBusy = busyId === r.VoucherDetailID;
                                    return (
                                    <tr key={r.VoucherDetailID} style={{ borderBottom: '1px solid #f1f5f9' }}>
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
                                        <td style={{ padding: 10, color: '#64748b' }}>
                                            <div><span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>{r.GLCode}</span> {r.GLTitle}</div>
                                            {(r.Narration || r.Remarks) && <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>{r.Narration || r.Remarks}</div>}
                                        </td>
                                        <td style={{ padding: 10, textAlign: 'right', fontWeight: 600 }}>{fmt(r.Debit)}</td>
                                        <td style={{ padding: 10 }}>
                                            <select value={picks[r.VoucherDetailID] || ''} onChange={e => setPicks(p => ({ ...p, [r.VoucherDetailID]: e.target.value }))}
                                                disabled={isBusy}
                                                style={{ width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.82rem' }}>
                                                <option value="">— Pick department —</option>
                                                {departments.map(d => <option key={d.DepartmentID} value={d.DepartmentID}>{d.DepartmentName}</option>)}
                                            </select>
                                        </td>
                                        <td style={{ padding: 10, display: 'flex', gap: 6 }}>
                                            <button type="button" className="erp-btn erp-btn-sm erp-btn-primary"
                                                onClick={() => saveDepartment(r)} disabled={isBusy || !picks[r.VoucherDetailID]}>
                                                {isBusy ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                                            </button>
                                            <button type="button" className="erp-btn erp-btn-sm" title="Not an expense"
                                                onClick={() => markNotExpense(r)} disabled={isBusy}>
                                                <X size={12} />
                                            </button>
                                        </td>
                                    </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
}
