/**
 * Sales — Incentive disbursement screen + per-employee balance view.
 *
 * Decision #8: accrual at booking save, disbursement at admin discretion.
 * FIFO distribution across outstanding accruals.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Wallet, RefreshCw, Loader2, DollarSign, Eye, Users as UsersIcon, Send } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

export default function IncentiveDisbursement() {
    const { hasModule } = useAuth();
    const canDisburse = hasModule('sales_admin_settings');

    const [balances, setBalances] = useState([]);
    const [loading, setLoading] = useState(false);
    const [payItem, setPayItem] = useState(null);
    const [viewItem, setViewItem] = useState(null);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get(`${API}/sales/incentives/balances`);
            setBalances(r.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const totalOutstanding = balances.reduce((s, b) => s + Number(b.Outstanding || 0), 0);
    const totalAccrued     = balances.reduce((s, b) => s + Number(b.TotalAccrued || 0), 0);
    const totalDisbursed   = balances.reduce((s, b) => s + Number(b.TotalDisbursed || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Sales Incentive — Disbursement</h1>
                    <p className="page-subtitle">Per-employee outstanding incentive accruals. Payouts distribute FIFO across oldest accruals.</p>
                </div>
                <button className="btn-sm" onClick={load} disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                </button>
            </div>

            {msg && <FlashMsg msg={msg} />}

            {/* Summary cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <SummaryCard label="Total Accrued"    value={totalAccrued}    color="#1e40af" />
                <SummaryCard label="Total Disbursed"  value={totalDisbursed}  color="#15803d" />
                <SummaryCard label="Outstanding"      value={totalOutstanding} color="#b45309" big />
                <SummaryCard label="Employees" value={balances.length} color="#475569" noPkr />
            </div>

            <div className="card" style={{ overflowX: 'auto' }}>
                {balances.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <UsersIcon size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No accruals yet. Bookings auto-accrue once an employee is assigned to an active policy.'}</div>
                    </div>
                ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                        <thead>
                            <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                <Th>Employee</Th>
                                <Th align="right">Accruals</Th>
                                <Th align="right">Total Accrued</Th>
                                <Th align="right">Disbursed</Th>
                                <Th align="right">Outstanding</Th>
                                <Th>Last Activity</Th>
                                <Th>Actions</Th>
                            </tr>
                        </thead>
                        <tbody>
                            {balances.map(b => (
                                <tr key={b.EarnerEmployeeID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td>
                                        <div style={{ fontWeight: 600 }}>{(b.EmployeeName || '').trim() || `Emp #${b.EarnerEmployeeID}`}</div>
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>ID {b.EarnerEmployeeID}</div>
                                    </Td>
                                    <Td align="right">{b.AccrualCount}</Td>
                                    <Td align="right">{fmtN(b.TotalAccrued)}</Td>
                                    <Td align="right" style={{ color: '#15803d' }}>{fmtN(b.TotalDisbursed)}</Td>
                                    <Td align="right" style={{ color: b.Outstanding > 0 ? '#b45309' : '#94a3b8', fontWeight: 700 }}>{fmtN(b.Outstanding)}</Td>
                                    <Td style={{ fontSize: '0.72rem', color: '#64748b' }}>
                                        {b.LastDisbursedAt ? `Paid ${new Date(b.LastDisbursedAt).toLocaleDateString()}` : `Last accrual ${new Date(b.LastAccruedAt).toLocaleDateString()}`}
                                    </Td>
                                    <Td>
                                        <div style={{ display: 'flex', gap: 4 }}>
                                            <button className="btn-icon" onClick={() => setViewItem(b)} title="View accruals"><Eye size={14} /></button>
                                            {canDisburse && b.Outstanding > 0 && (
                                                <button className="btn-icon" onClick={() => setPayItem(b)} title="Disburse" style={{ color: '#15803d' }}><Send size={14} /></button>
                                            )}
                                        </div>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {payItem && <DisburseModal employee={payItem} onClose={() => setPayItem(null)} onSaved={() => { setPayItem(null); flash('ok', 'Disbursed'); load(); }} />}
            {viewItem && <AccrualsModal employee={viewItem} onClose={() => setViewItem(null)} />}
        </div>
    );
}

function SummaryCard({ label, value, color, big, noPkr }) {
    return (
        <div className="card" style={{ padding: 14 }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: big ? '1.6rem' : '1.3rem', color, marginTop: 4 }}>
                {noPkr ? fmtN(value) : `PKR ${fmtN(value)}`}
            </div>
        </div>
    );
}

function DisburseModal({ employee, onClose, onSaved }) {
    const [amount, setAmount] = useState('');
    const [mode, setMode] = useState('Cash');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/incentives/disburse`, {
                EmployeeID: employee.EarnerEmployeeID,
                Amount: Number(amount),
                PaymentMode: mode,
                Notes: notes,
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const overage = Number(amount) > Number(employee.Outstanding);

    return (
        <Shell title={`Disburse to ${(employee.EmployeeName || '').trim() || 'Emp #' + employee.EarnerEmployeeID}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                Outstanding balance: <strong>PKR {fmtN(employee.Outstanding)}</strong> across {employee.AccrualCount} accrual(s)
            </div>
            <Field label="Amount (PKR) *"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} /></Field>
            <Field label="Payment Mode">
                <select value={mode} onChange={e => setMode(e.target.value)} style={inputStyle}>
                    <option>Cash</option><option>BankTransfer</option><option>Cheque</option>
                </select>
            </Field>
            <Field label="Notes (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            {overage && <Err>Amount exceeds outstanding balance.</Err>}
            <div style={{ padding: 8, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, fontSize: '0.78rem', color: '#1e40af', marginBottom: 10 }}>
                Note: when system-account roles are mapped, this will also post a CPV/BPV voucher automatically. Until then, record the actual cash payout in <strong>/payments/make</strong>.
            </div>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Disburse" busy={busy} disabled={!amount || Number(amount) <= 0 || overage} />
        </Shell>
    );
}

function AccrualsModal({ employee, onClose }) {
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        (async () => {
            try { const r = await axios.get(`${API}/sales/incentives/accruals`, { params: { employeeId: employee.EarnerEmployeeID } }); setRows(r.data); }
            catch {}
            setLoading(false);
        })();
    }, [employee.EarnerEmployeeID]);

    return (
        <Shell title={`Accruals — ${(employee.EmployeeName || '').trim() || 'Emp #' + employee.EarnerEmployeeID}`} onClose={onClose} width={720}>
            {loading ? <Loader2 className="animate-spin" /> : (
                <table style={{ width: '100%', fontSize: '0.82rem' }}>
                    <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <Th>Booking</Th><Th>Policy</Th><Th align="right">Accrued</Th><Th align="right">Disbursed</Th><Th align="right">Outstanding</Th><Th>Status</Th><Th>When</Th>
                    </tr></thead>
                    <tbody>
                        {rows.map(a => (
                            <tr key={a.AccrualID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <Td mono color="#1e40af">{a.BookingNo}</Td>
                                <Td style={{ fontSize: '0.78rem' }}>{a.PolicyName || '—'}</Td>
                                <Td align="right">{fmtN(a.AmountAccrued)}</Td>
                                <Td align="right" style={{ color: '#15803d' }}>{fmtN(a.DisbursedAmount)}</Td>
                                <Td align="right" style={{ color: a.Outstanding > 0 ? '#b45309' : '#94a3b8', fontWeight: 600 }}>{fmtN(a.Outstanding)}</Td>
                                <Td>
                                    <Pill bg={a.Status === 'Disbursed' ? '#dcfce7' : a.Status === 'Reversed' ? '#fee2e2' : '#fef3c7'}
                                          col={a.Status === 'Disbursed' ? '#15803d' : a.Status === 'Reversed' ? '#b91c1c' : '#92400e'}>{a.Status}</Pill>
                                </Td>
                                <Td style={{ fontSize: '0.7rem', color: '#64748b' }}>{new Date(a.AccruedAt).toLocaleDateString()}</Td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
            <div style={{ marginTop: 14, textAlign: 'right' }}><button className="btn-sm" onClick={onClose}>Close</button></div>
        </Shell>
    );
}
