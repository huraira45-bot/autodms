import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { CheckCircle2, XCircle, RefreshCw, Loader2, ArrowDownToLine, ArrowUpFromLine, Undo2 } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';

const STATUS_TABS = [
    { key: 'Pending',  label: 'Pending',  color: '#b45309', bg: '#fef3c7' },
    { key: 'Cleared',  label: 'Cleared',  color: '#15803d', bg: '#dcfce7' },
    { key: 'Bounced',  label: 'Bounced',  color: '#b91c1c', bg: '#fee2e2' },
];

const DIRECTION_TABS = [
    { key: 'Received', label: 'Received (Customers)', icon: ArrowDownToLine, color: '#1d4ed8' },
    { key: 'Issued',   label: 'Issued (Suppliers)',   icon: ArrowUpFromLine, color: '#7c2d12' },
];

export default function Cheques() {
    const { notify, confirm } = useFeedback();
    const [status, setStatus] = useState('Pending');
    const [direction, setDirection] = useState('Received');
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [busyId, setBusyId] = useState(null);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const r = await axios.get('/api/cheques', { params: { status, direction } });
            setRows(r.data || []);
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        } finally { setLoading(false); }
    }, [status, direction, notify]);

    useEffect(() => { load(); }, [load]);

    const onAction = async (cheque, kind) => {
        const isReceived = cheque.Direction === 'Received';
        let title, message, confirmText, danger;
        if (kind === 'clear') {
            title = `Clear cheque #${cheque.ChequeNo}?`;
            message = isReceived
                ? `Posts Dr ${cheque.BankTitle} / Cr Cheques on Hand for PKR ${fmt(cheque.Amount)} and closes the receipt.`
                : `Posts Dr Cheques on Hand / Cr ${cheque.BankTitle} for PKR ${fmt(cheque.Amount)} — money has left the bank.`;
            confirmText = 'mark as CLEARED';
            danger = false;
        } else if (kind === 'bounce') {
            title = `Bounce cheque #${cheque.ChequeNo}?`;
            message = isReceived
                ? `Re-opens the customer's outstanding for PKR ${fmt(cheque.Amount)} (Dr customer A/R / Cr Cheques on Hand).`
                : `Re-opens the supplier's A/P for PKR ${fmt(cheque.Amount)} (Dr Cheques on Hand / Cr supplier).`;
            confirmText = 'mark as BOUNCED';
            danger = true;
        } else {
            title = `Revert cheque #${cheque.ChequeNo}?`;
            message = `Reverses the clearance voucher ${cheque.ClearanceVoucherNo || ''} and flips this cheque back to Pending.`;
            confirmText = 'REVERT';
            danger = true;
        }
        const ok = await confirm({ title, message, confirmText, danger });
        if (!ok) return;
        setBusyId(cheque.ChequeID);
        try {
            const url = `/api/cheques/${cheque.ChequeID}/${kind}`;
            const r = await axios.post(url, {});
            const vno = r.data.VoucherNo || r.data.ReversalVoucherNo || '';
            notify(`${r.data.message}${vno ? ` Voucher ${vno}.` : ''}`, 'success');
            load();
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        } finally { setBusyId(null); }
    };

    const total = rows.reduce((s, r) => s + Number(r.Amount || 0), 0);
    const counterpartyLabel = direction === 'Received' ? 'Payer' : 'Payee';
    const bankLabel         = direction === 'Received' ? 'Deposit Bank' : 'Drawn-On Bank';
    const drawerLabel       = direction === 'Received' ? 'Drawer Bank (on cheque)' : 'Payee Bank';

    return (
        <div style={{ padding: 20 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <h2 style={{ margin: 0, color: '#1a3a6a' }}>Cheque Clearance</h2>
                <button onClick={load} disabled={loading}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', border: '1px solid #cbd5e1', background: 'white', borderRadius: 4, cursor: 'pointer' }}>
                    {loading ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />} Refresh
                </button>
            </div>

            {/* Direction sub-tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                {DIRECTION_TABS.map(t => {
                    const Icon = t.icon;
                    return (
                        <button key={t.key} onClick={() => setDirection(t.key)}
                            style={{
                                display: 'flex', alignItems: 'center', gap: 6,
                                padding: '8px 16px',
                                border: '1px solid #c8d4e4',
                                background: direction === t.key ? t.color : 'white',
                                color: direction === t.key ? 'white' : '#475569',
                                fontWeight: direction === t.key ? 700 : 400,
                                borderRadius: 4, cursor: 'pointer'
                            }}>
                            <Icon size={14} /> {t.label}
                        </button>
                    );
                })}
            </div>

            {/* Status tabs */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 14 }}>
                {STATUS_TABS.map(t => (
                    <button key={t.key} onClick={() => setStatus(t.key)}
                        style={{
                            padding: '6px 14px',
                            border: '1px solid #c8d4e4',
                            background: status === t.key ? t.bg : 'white',
                            color: status === t.key ? t.color : '#475569',
                            fontWeight: status === t.key ? 700 : 400,
                            borderRadius: 4, cursor: 'pointer'
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            {rows.length === 0 ? (
                <div style={{ padding: 30, textAlign: 'center', color: '#94a3b8', border: '1px solid #c8d4e4', borderRadius: 4 }}>
                    {loading ? 'Loading…' : `No ${status.toLowerCase()} ${direction.toLowerCase()} cheques.`}
                </div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, background: 'white' }}>
                    <thead>
                        <tr style={{ background: '#e8edf2' }}>
                            {['Cheque #', 'Cheque Date', 'Amount', drawerLabel, bankLabel, counterpartyLabel, 'Source Voucher', status === 'Pending' ? 'Actions' : 'Cleared / Posted'].map(h => (
                                <th key={h} style={{ padding: '6px 10px', textAlign: h === 'Amount' ? 'right' : 'left', border: '1px solid #c8d4e4' }}>{h}</th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.map(r => (
                            <tr key={r.ChequeID}>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0', fontFamily: 'monospace' }}>{r.ChequeNo}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0' }}>{dt(r.ChequeDate)}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0', textAlign: 'right', fontWeight: 600 }}>{fmt(r.Amount)}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0' }}>{r.DrawerBank || '—'}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0', fontSize: 11 }}>{r.BankCode} — {r.BankTitle}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0' }}>{r.PartyName || (r.JobCardNo ? `Walk-in (${r.JobCardNo})` : '—')}</td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0', fontFamily: 'monospace', fontSize: 11 }}>{r.ReceiptVoucherNo} <span style={{ color: '#94a3b8' }}>· {dt(r.ReceiptDate)}</span></td>
                                <td style={{ padding: '5px 10px', border: '1px solid #e2e8f0' }}>
                                    {status === 'Pending' ? (
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button disabled={busyId === r.ChequeID}
                                                onClick={() => onAction(r, 'clear')}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#15803d', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>
                                                <CheckCircle2 size={12} /> Clear
                                            </button>
                                            <button disabled={busyId === r.ChequeID}
                                                onClick={() => onAction(r, 'bounce')}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', background: '#b91c1c', color: 'white', border: 'none', borderRadius: 3, cursor: 'pointer', fontWeight: 600, fontSize: 11 }}>
                                                <XCircle size={12} /> Bounce
                                            </button>
                                        </div>
                                    ) : (
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11 }}>
                                            <div style={{ flex: 1 }}>
                                                <div>{dt(r.ClearedAt)}</div>
                                                {r.ClearanceVoucherNo && <div style={{ fontFamily: 'monospace', color: '#64748b' }}>{r.ClearanceVoucherNo}</div>}
                                            </div>
                                            <button disabled={busyId === r.ChequeID || !r.ClearanceVoucherID}
                                                onClick={() => onAction(r, 'revert')}
                                                title={r.ClearanceVoucherID ? 'Reverse the clearance voucher and flip back to Pending' : 'No clearance voucher to revert'}
                                                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', background: '#64748b', color: 'white', border: 'none', borderRadius: 3, cursor: r.ClearanceVoucherID ? 'pointer' : 'not-allowed', fontWeight: 600, fontSize: 10 }}>
                                                <Undo2 size={11} /> Undo
                                            </button>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot>
                        <tr style={{ background: '#f8fafc', fontWeight: 700 }}>
                            <td colSpan={2} style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #c8d4e4' }}>Total ({rows.length} {rows.length === 1 ? 'cheque' : 'cheques'})</td>
                            <td style={{ padding: '6px 10px', textAlign: 'right', border: '1px solid #c8d4e4' }}>{fmt(total)}</td>
                            <td colSpan={5} style={{ border: '1px solid #c8d4e4' }} />
                        </tr>
                    </tfoot>
                </table>
            )}
        </div>
    );
}
