import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { TrendingUp, Wallet, Clock, Plus, X, FileCheck2, RotateCcw, Loader2, ReceiptText } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const API = '';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleString('en-PK') : '';

const STATUS_STYLE = {
    Accrued:            { bg: '#fef3c7', col: '#92400e', label: 'Accrued' },
    PartiallyDisbursed: { bg: '#dbeafe', col: '#1e40af', label: 'Partial' },
    Disbursed:          { bg: '#dcfce7', col: '#15803d', label: 'Settled' },
    Reversed:           { bg: '#fee2e2', col: '#b91c1c', label: 'Reversed' },
    PendingCert:        { bg: '#fef3c7', col: '#92400e', label: 'Awaiting Cert' },
    CertReceived:       { bg: '#dbeafe', col: '#1e40af', label: 'Cert in hand' },
    Settled:            { bg: '#dcfce7', col: '#15803d', label: 'Settled' },
};

export default function MasterIncentive() {
    const { notify, confirm } = useFeedback();
    const [summary, setSummary]   = useState(null);
    const [accruals, setAccruals] = useState([]);
    const [receipts, setReceipts] = useState([]);
    const [showAll, setShowAll]   = useState(false);
    const [busy, setBusy]         = useState(false);
    const [receiptFor, setReceiptFor] = useState(null);  // accrual obj or null

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const [s, a, r] = await Promise.all([
                axios.get('/api/sales/master-incentive/summary'),
                axios.get('/api/sales/master-incentive/accruals', { params: showAll ? {} : { status: 'open' } }),
                axios.get('/api/sales/master-incentive/receipts'),
            ]);
            setSummary(s.data);
            setAccruals(a.data || []);
            setReceipts(r.data || []);
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        }
        setBusy(false);
    }, [showAll, notify]);

    useEffect(() => { load(); }, [load]);

    const onCertReceived = async (rcpt) => {
        const cref = window.prompt('WHT certificate reference (optional):', rcpt.CertificateRef || '');
        if (cref === null) return;
        try {
            await axios.post(`/api/sales/master-incentive/receipts/${rcpt.ReceiptID}/mark-cert-received`, { CertificateRef: cref });
            notify('Certificate marked received.', 'success');
            load();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    };

    const onRevoke = async (rcpt) => {
        const reason = window.prompt(`Revoke MRV ${rcpt.ReceiptVoucherNo || rcpt.ReceiptID}? Reason:`, '');
        if (!reason) return;
        const ok = await confirm({
            title: 'Reverse the receipt voucher?',
            message: 'A reversal voucher will be posted, the accrual will re-open, and this receipt will be flagged REVERSED.',
            confirmLabel: 'REVERSE',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await axios.post(`/api/sales/master-incentive/receipts/${rcpt.ReceiptID}/revoke`, { reason });
            notify('Receipt reversed.', 'success');
            load();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    };

    return (
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <TrendingUp size={28} color="#1e40af" /> Master Incentive
            </h1>

            {/* Summary tiles */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12, marginBottom: 20 }}>
                <Tile icon={TrendingUp} title="Total Accrued" value={summary ? fmt(summary.totalAccrued) : '…'} color="#1e40af" />
                <Tile icon={Wallet}     title="Total Received" value={summary ? fmt(summary.totalReceived) : '…'} color="#15803d" />
                <Tile icon={Clock}      title="Outstanding"   value={summary ? fmt(summary.outstanding) : '…'} color="#b45309" />
                <Tile icon={ReceiptText} title="Open Accruals" value={summary ? String(summary.pendingCount) : '…'} color="#7c3aed" />
            </div>

            {/* Open Accruals */}
            <div className="card" style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>{showAll ? 'All Master Accruals' : 'Open Accruals (awaiting Master payment)'}</h3>
                    <div style={{ display: 'flex', gap: 8 }}>
                        <button onClick={() => setShowAll(v => !v)} className="btn-sm">
                            {showAll ? 'Open only' : 'Show all'}
                        </button>
                    </div>
                </div>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                <th style={th}>Accrual #</th>
                                <th style={th}>Booking</th>
                                <th style={th}>Category</th>
                                <th style={th}>Chassis</th>
                                <th style={{...th, textAlign: 'right'}}>Accrued</th>
                                <th style={{...th, textAlign: 'right'}}>Received</th>
                                <th style={{...th, textAlign: 'right'}}>Outstanding</th>
                                <th style={th}>Status</th>
                                <th style={th}>Accrued At</th>
                                <th style={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {accruals.map(a => {
                                const st = STATUS_STYLE[a.Status] || { bg: '#f1f5f9', col: '#475569', label: a.Status };
                                const open = ['Accrued', 'PartiallyDisbursed'].includes(a.Status);
                                return (
                                    <tr key={a.AccrualID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={td}>#{a.AccrualID}</td>
                                        <td style={td}>{a.BookingNo || '—'}</td>
                                        <td style={td}>{a.IncentiveCategory}</td>
                                        <td style={{...td, fontFamily: 'monospace'}}>{a.ChasisNo || '—'}</td>
                                        <td style={tdNum}>{fmt(a.AmountAccrued)}</td>
                                        <td style={tdNum}>{fmt(a.DisbursedAmount)}</td>
                                        <td style={{...tdNum, fontWeight: 700, color: open ? '#b45309' : '#94a3b8'}}>{fmt(a.Outstanding)}</td>
                                        <td style={td}>
                                            <span style={{ background: st.bg, color: st.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>
                                                {st.label}
                                            </span>
                                        </td>
                                        <td style={{...td, color: '#64748b', fontSize: '0.78rem'}}>{dt(a.AccruedAt)}</td>
                                        <td style={td}>
                                            {open && (
                                                <button onClick={() => setReceiptFor(a)}
                                                    style={{ padding: '4px 8px', background: '#15803d', color: 'white', border: 'none', borderRadius: 4, fontSize: '0.72rem', fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                                                    <Plus size={11} /> Record Receipt
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {accruals.length === 0 && (
                                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                    {busy ? <Loader2 size={16} className="spin" /> : 'No accruals.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Receipts history */}
            <div className="card">
                <h3 style={{ marginTop: 0 }}>Master Receipts (MRVs)</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                <th style={th}>MRV #</th>
                                <th style={th}>Booking</th>
                                <th style={th}>Category</th>
                                <th style={{...th, textAlign: 'right'}}>Gross</th>
                                <th style={{...th, textAlign: 'right'}}>WHT</th>
                                <th style={{...th, textAlign: 'right'}}>GST</th>
                                <th style={{...th, textAlign: 'right'}}>Net Cash</th>
                                <th style={th}>Status</th>
                                <th style={th}>Received</th>
                                <th style={th}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {receipts.map(r => {
                                const st = STATUS_STYLE[r.Status] || { bg: '#f1f5f9', col: '#475569', label: r.Status };
                                return (
                                    <tr key={r.ReceiptID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={{...td, fontFamily: 'monospace', fontWeight: 700}}>{r.ReceiptVoucherNo || `MRV-${r.ReceiptID}`}</td>
                                        <td style={td}>{r.BookingNo || '—'}</td>
                                        <td style={td}>{r.IncentiveCategory}</td>
                                        <td style={tdNum}>{fmt(r.GrossAmount)}</td>
                                        <td style={tdNum}>{fmt(r.WHTAmount)}</td>
                                        <td style={tdNum}>{fmt(r.GSTOnIncentive)}</td>
                                        <td style={{...tdNum, fontWeight: 700, color: '#15803d'}}>{fmt(r.NetCashReceived)}</td>
                                        <td style={td}>
                                            <span style={{ background: st.bg, color: st.col, padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>
                                                {st.label}
                                            </span>
                                            {r.CertificateRef && <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: 2 }}>Ref: {r.CertificateRef}</div>}
                                        </td>
                                        <td style={{...td, color: '#64748b', fontSize: '0.78rem'}}>{dt(r.ReceivedAt)}<br/>by {r.ReceivedByName || '—'}</td>
                                        <td style={td}>
                                            <div style={{ display: 'flex', gap: 4 }}>
                                                {r.Status === 'PendingCert' && (
                                                    <button onClick={() => onCertReceived(r)} title="Mark certificate received"
                                                        style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#1d4ed8' }}>
                                                        <FileCheck2 size={14} />
                                                    </button>
                                                )}
                                                <button onClick={() => onRevoke(r)} title="Reverse this receipt"
                                                    style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
                                                    <RotateCcw size={14} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                            {receipts.length === 0 && (
                                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No receipts yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {receiptFor && (
                <ReceiptModal accrual={receiptFor} onClose={() => setReceiptFor(null)} onSaved={() => { setReceiptFor(null); load(); }} />
            )}

            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function ReceiptModal({ accrual, onClose, onSaved }) {
    const { notify } = useFeedback();
    const outstanding = Number(accrual.Outstanding || 0);
    const [gross, setGross] = useState(String(outstanding.toFixed(2)));
    const [wht, setWht]     = useState('0');
    const [gst, setGst]     = useState('0');
    const [bankAccountId, setBankAccountId] = useState('');
    const [certRef, setCertRef] = useState('');
    const [notes, setNotes] = useState('');
    const [banks, setBanks] = useState([]);
    const [busy, setBusy]   = useState(false);

    const g = Number(gross) || 0;
    const w = Number(wht)   || 0;
    const s = Number(gst)   || 0;
    const net = g - w + s;

    useEffect(() => {
        axios.get('/api/accounts/banks').then(r => setBanks(r.data || [])).catch(() => {});
    }, []);

    const save = async () => {
        if (g <= 0)             return notify('Gross must be > 0', 'error');
        if (g > outstanding + 0.01) return notify(`Gross exceeds outstanding (${fmt(outstanding)})`, 'error');
        if (!bankAccountId)     return notify('Pick a bank account', 'error');
        setBusy(true);
        try {
            await axios.post('/api/sales/master-incentive/receipts', {
                AccrualID: accrual.AccrualID,
                GrossAmount: g, WHTAmount: w, GSTOnIncentive: s,
                NetCashReceived: net,
                BankAccountGLCAID: Number(bankAccountId),
                CertificateRef: certRef || null,
                Notes: notes || null,
            });
            notify('Master receipt posted.', 'success');
            onSaved();
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        }
        setBusy(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 20, maxWidth: 540, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>Record Master Receipt — Accrual #{accrual.AccrualID}</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 14, fontSize: '0.82rem', display: 'flex', justifyContent: 'space-between' }}>
                    <span>Booking <strong>{accrual.BookingNo}</strong> · {accrual.IncentiveCategory}</span>
                    <span>Outstanding <strong>PKR {fmt(outstanding)}</strong></span>
                </div>
                <Row label="Bank Account *">
                    <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} style={input}>
                        <option value="">— Pick the bank that received the funds —</option>
                        {banks.map(b => <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} · {b.GLTitle}</option>)}
                    </select>
                </Row>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                    <Row label="Gross Amount (PKR) *">
                        <input type="number" value={gross} onChange={e => setGross(e.target.value)} style={input} />
                    </Row>
                    <Row label="Net Cash Received (auto)">
                        <input type="number" value={net.toFixed(2)} disabled style={{...input, background: '#f1f5f9'}} />
                    </Row>
                    <Row label="WHT withheld">
                        <input type="number" value={wht} onChange={e => setWht(e.target.value)} style={input} />
                    </Row>
                    <Row label="GST on incentive">
                        <input type="number" value={gst} onChange={e => setGst(e.target.value)} style={input} />
                    </Row>
                </div>
                <Row label="WHT certificate ref (if any)">
                    <input value={certRef} onChange={e => setCertRef(e.target.value)} placeholder="cert # or document ref" style={input} />
                </Row>
                <Row label="Notes">
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{...input, resize: 'vertical'}} />
                </Row>
                <div style={{ marginTop: 14, padding: 8, background: '#eff6ff', color: '#1e3a8a', borderRadius: 6, fontSize: '0.78rem' }}>
                    Will post: <strong>Dr Bank PKR {fmt(net)}</strong>{w > 0 && <> + <strong>Dr WHT Recvbl PKR {fmt(w)}</strong></>}{s > 0 && <> + <strong>Cr GST Payable PKR {fmt(s)}</strong></>} / <strong>Cr Master Incentive Recvbl PKR {fmt(g)}</strong>.
                </div>
                <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={onClose} className="btn-sm">Cancel</button>
                    <button onClick={save} disabled={busy} style={{ padding: '8px 16px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {busy ? <Loader2 size={14} className="spin" /> : <FileCheck2 size={14} />} Post Receipt
                    </button>
                </div>
            </div>
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.78rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
const tdNum = { padding: 8, textAlign: 'right', fontFamily: 'monospace' };
const input = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem' };

function Tile({ icon: Icon, title, value, color }) {
    return (
        <div className="card" style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 38, height: 38, borderRadius: 8, background: color + '22', color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Icon size={20} />
            </div>
            <div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{title}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0f172a' }}>{value}</div>
            </div>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#475569', marginBottom: 4, fontWeight: 600 }}>{label}</label>
            {children}
        </div>
    );
}
