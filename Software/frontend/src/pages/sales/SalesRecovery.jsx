import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { TrendingDown, Loader2, AlertTriangle, Check, X, RefreshCw, FileX2 } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleDateString('en-PK') : '';

const STATUS_STYLE = {
    Active:           { bg: '#dbeafe', col: '#1e40af', label: 'Active' },
    FullyRecovered:   { bg: '#dcfce7', col: '#15803d', label: 'Fully Recovered' },
    WrittenOff:       { bg: '#fee2e2', col: '#b91c1c', label: 'Written Off' },
    Pending:          { bg: '#f1f5f9', col: '#475569', label: 'Pending' },
    PartiallyPaid:    { bg: '#dbeafe', col: '#1e40af', label: 'Partial' },
    Paid:             { bg: '#dcfce7', col: '#15803d', label: 'Paid' },
    Overdue:          { bg: '#fee2e2', col: '#b91c1c', label: 'Overdue' },
};

export default function SalesRecovery() {
    const { notify, confirm } = useFeedback();
    const [tab, setTab]       = useState('aging');
    const [plans, setPlans]   = useState([]);
    const [aging, setAging]   = useState(null);
    const [selectedPlan, setSelectedPlan] = useState(null);
    const [busy, setBusy]     = useState(false);

    const load = useCallback(async () => {
        setBusy(true);
        try {
            if (tab === 'aging') {
                const r = await axios.get('/api/sales/recovery/aging');
                setAging(r.data);
            } else {
                const r = await axios.get('/api/sales/recovery/plans');
                setPlans(r.data || []);
            }
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
        setBusy(false);
    }, [tab, notify]);

    useEffect(() => { load(); }, [load]);

    const sweepOverdue = async () => {
        try {
            const r = await axios.post('/api/sales/recovery/sweep-overdue', {});
            notify(`Marked ${r.data.Updated} installments as Overdue.`, 'success');
            load();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    };

    return (
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <TrendingDown size={28} color="#b91c1c" /> Sales Recovery
            </h1>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[['aging','Aging Report'],['plans','All Plans']].map(([key,label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        style={{ padding: '8px 16px', background: tab===key?'#1e40af':'#f1f5f9', color: tab===key?'white':'#475569', border:'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                        {label}
                    </button>
                ))}
                <div style={{ flex: 1 }} />
                <button onClick={sweepOverdue} className="btn-sm">
                    <RefreshCw size={14} /> Sweep Overdue
                </button>
            </div>

            {tab === 'aging' && aging && (
                <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 18 }}>
                        <Tile label="Total Outstanding" value={`PKR ${fmt(aging.buckets.TotalOutstanding)}`} color="#b91c1c" />
                        <Tile label="0-30 days"  value={`PKR ${fmt(aging.buckets.Bucket_0_30)}`}   color="#fbbf24" />
                        <Tile label="31-60 days" value={`PKR ${fmt(aging.buckets.Bucket_31_60)}`}  color="#fb923c" />
                        <Tile label="61-90 days" value={`PKR ${fmt(aging.buckets.Bucket_61_90)}`}  color="#ef4444" />
                        <Tile label="90+ days"   value={`PKR ${fmt(aging.buckets.Bucket_Over_90)}`} color="#7f1d1d" />
                    </div>

                    <div className="card">
                        <h3 style={{ marginTop: 0 }}>Overdue Installments ({aging.detail.length})</h3>
                        <div style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                    <th style={th}>Booking</th>
                                    <th style={th}>Customer</th>
                                    <th style={th}>Owner</th>
                                    <th style={th}>Seq</th>
                                    <th style={th}>Due</th>
                                    <th style={{...th, textAlign:'right'}}>Outstanding</th>
                                    <th style={{...th, textAlign:'right'}}>Days OD</th>
                                    <th style={th}></th>
                                </tr></thead>
                                <tbody>
                                    {aging.detail.map(i => (
                                        <tr key={i.InstallmentID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={td}>{i.BookingNo}</td>
                                            <td style={td}>{i.PartyName || '—'}</td>
                                            <td style={td}>{i.OwnerName || '—'}</td>
                                            <td style={td}>{i.SeqNo}</td>
                                            <td style={td}>{dt(i.DueDate)}</td>
                                            <td style={tdNum}>{fmt(i.Outstanding)}</td>
                                            <td style={{...tdNum, color: i.DaysOverdue > 60 ? '#b91c1c' : '#b45309', fontWeight: 700}}>{i.DaysOverdue}</td>
                                            <td style={td}>
                                                <button onClick={() => setSelectedPlan({ planId: i.RecoveryPlanID })} className="btn-sm">View Plan</button>
                                            </td>
                                        </tr>
                                    ))}
                                    {aging.detail.length === 0 && (
                                        <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No overdue installments.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}

            {tab === 'plans' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>All Recovery Plans</h3>
                    <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                            <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                <th style={th}>Booking</th>
                                <th style={th}>Customer</th>
                                <th style={th}>Vehicle</th>
                                <th style={th}>Owner</th>
                                <th style={{...th, textAlign:'right'}}>Total Owed</th>
                                <th style={{...th, textAlign:'right'}}>Paid</th>
                                <th style={{...th, textAlign:'right'}}>Outstanding</th>
                                <th style={th}>OD/Up</th>
                                <th style={th}>Status</th>
                                <th style={th}></th>
                            </tr></thead>
                            <tbody>
                                {plans.map(p => {
                                    const st = STATUS_STYLE[p.Status] || STATUS_STYLE.Pending;
                                    return (
                                        <tr key={p.RecoveryPlanID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                            <td style={td}>{p.BookingNo}</td>
                                            <td style={td}>{p.PartyName || '—'}</td>
                                            <td style={td}>{p.VariantName || '—'} {p.AllocatedChasisNo && <code style={{ fontSize: '0.72rem' }}>{p.AllocatedChasisNo}</code>}</td>
                                            <td style={td}>{p.OwnerName || '—'}</td>
                                            <td style={tdNum}>{fmt(p.TotalRemainingAtDelivery)}</td>
                                            <td style={tdNum}>{fmt(p.TotalPaid)}</td>
                                            <td style={{...tdNum, fontWeight: 700, color: p.Outstanding > 0.01 ? '#b45309' : '#15803d'}}>{fmt(p.Outstanding)}</td>
                                            <td style={td}>
                                                {p.OverdueCount > 0 && <span style={{ color: '#b91c1c', fontWeight: 700 }}>{p.OverdueCount} OD</span>}
                                                {p.OverdueCount > 0 && p.UpcomingCount > 0 && ' / '}
                                                {p.UpcomingCount > 0 && <span style={{ color: '#64748b' }}>{p.UpcomingCount} up</span>}
                                            </td>
                                            <td style={td}>
                                                <span style={{ background: st.bg, color: st.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{st.label}</span>
                                            </td>
                                            <td style={td}>
                                                <button onClick={() => setSelectedPlan({ planId: p.RecoveryPlanID })} className="btn-sm">Open</button>
                                            </td>
                                        </tr>
                                    );
                                })}
                                {plans.length === 0 && (
                                    <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>{busy ? <Loader2 size={16} className="spin" /> : 'No recovery plans yet.'}</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {selectedPlan && <PlanModal planId={selectedPlan.planId} onClose={() => setSelectedPlan(null)} onSaved={() => { setSelectedPlan(null); load(); }} />}
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function PlanModal({ planId, onClose, onSaved }) {
    const { notify, confirm } = useFeedback();
    const [data, setData] = useState(null);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try { const r = await axios.get(`/api/sales/recovery/plans/${planId}`); setData(r.data); }
        catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    }, [planId, notify]);

    useEffect(() => { load(); }, [load]);

    const markPaid = async (inst) => {
        const amt = window.prompt(`Mark Installment #${inst.SeqNo} paid. Amount (max ${fmt(inst.AmountDue - inst.AmountPaid)}):`, String(inst.AmountDue - inst.AmountPaid));
        if (!amt) return;
        const vno = window.prompt('Voucher # / reference (optional):', '');
        setBusy(true);
        try {
            await axios.post(`/api/sales/recovery/installments/${inst.InstallmentID}/mark-paid`, { AmountPaid: Number(amt), VoucherNo: vno || null });
            notify('Installment marked paid.', 'success');
            load();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
        setBusy(false);
    };

    const writeOff = async () => {
        const reason = window.prompt('Write off this plan. Reason:', '');
        if (!reason) return;
        const ok = await confirm({ title: 'Write off the recovery plan?', message: 'This requires admin approval. All open installments will be marked Written Off.', confirmLabel: 'WRITE OFF', tone: 'danger' });
        if (!ok) return;
        try {
            await axios.post(`/api/sales/recovery/plans/${planId}/write-off`, { Reason: reason });
            notify('Plan written off.', 'success');
            onSaved();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    };

    if (!data) return null;
    const p = data.plan;

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 20, maxWidth: 820, width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Recovery Plan #{p.RecoveryPlanID} — Booking #{p.BookingID}</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 14, fontSize: '0.84rem', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    <div><strong>Total Owed</strong><br/>PKR {fmt(p.TotalRemainingAtDelivery)}</div>
                    <div><strong>Owner</strong><br/>{p.OwnerName || '—'}</div>
                    <div><strong>Status</strong><br/>{STATUS_STYLE[p.Status]?.label || p.Status}</div>
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                        <th style={th}>Seq</th>
                        <th style={th}>Due</th>
                        <th style={{...th, textAlign:'right'}}>Amount Due</th>
                        <th style={{...th, textAlign:'right'}}>Paid</th>
                        <th style={{...th, textAlign:'right'}}>Outstanding</th>
                        <th style={th}>Days OD</th>
                        <th style={th}>Status</th>
                        <th style={th}>Voucher</th>
                        <th style={th}></th>
                    </tr></thead>
                    <tbody>
                        {data.installments.map(i => {
                            const st = STATUS_STYLE[i.Status] || STATUS_STYLE.Pending;
                            const open = i.Status === 'Pending' || i.Status === 'PartiallyPaid' || i.Status === 'Overdue';
                            return (
                                <tr key={i.InstallmentID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={td}>{i.SeqNo}</td>
                                    <td style={td}>{dt(i.DueDate)}</td>
                                    <td style={tdNum}>{fmt(i.AmountDue)}</td>
                                    <td style={tdNum}>{fmt(i.AmountPaid)}</td>
                                    <td style={tdNum}>{fmt(i.AmountDue - i.AmountPaid)}</td>
                                    <td style={{...tdNum, color: i.DaysOverdue > 0 && open ? '#b91c1c' : '#64748b'}}>{i.DaysOverdue > 0 && open ? i.DaysOverdue : '—'}</td>
                                    <td style={td}><span style={{ background: st.bg, color: st.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>{st.label}</span></td>
                                    <td style={{...td, fontFamily: 'monospace', fontSize: '0.74rem'}}>{i.PaidVoucherNo || '—'}</td>
                                    <td style={td}>
                                        {open && <button onClick={() => markPaid(i)} disabled={busy} style={{ padding: '4px 8px', background: '#15803d', color: 'white', border: 'none', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}><Check size={11} /> Mark Paid</button>}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
                {!p.WrittenOffAt && !p.FullyRecoveredAt && (
                    <div style={{ marginTop: 16, textAlign: 'right' }}>
                        <button onClick={writeOff} style={{ padding: '8px 14px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                            <FileX2 size={14} /> Write Off Plan
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
const tdNum = { padding: 8, textAlign: 'right', fontFamily: 'monospace' };

function Tile({ label, value, color }) {
    return (
        <div className="card" style={{ padding: 14, borderLeft: `4px solid ${color}` }}>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontSize: '1.15rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
        </div>
    );
}
