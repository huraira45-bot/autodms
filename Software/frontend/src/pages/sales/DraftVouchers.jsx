import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { FileClock, Loader2, RefreshCw } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { ErpControlPanel } from '../../components/erp';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleDateString('en-PK') : '';

const SOURCE_LABEL = {
    MASTER_INVOICE:           'Master Invoice',
    SALES_PAYMENT:            'Customer Payment',
    SALES_DELIVERY:           'Delivery',
    SALES_INCENTIVE_ACCRUAL:  'Staff Incentive Accrual',
    SALES_INCENTIVE_DISB:     'Staff Incentive Disbursement',
};

const TYPE_TO_ROUTE = {
    CPV: '/vouchers/cpv', CRV: '/vouchers/crv', BPV: '/vouchers/bpv',
    BRV: '/vouchers/brv', JV:  '/vouchers/jv',
};

export default function DraftVouchers() {
    const navigate = useNavigate();
    const { notify } = useFeedback();
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const r = await axios.get('/api/sales/draft-vouchers');
            setRows(r.data || []);
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
        setBusy(false);
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const open = (v) => {
        const route = TYPE_TO_ROUTE[v.VoucherType] || '/vouchers/jv';
        navigate(`${route}?id=${v.VoucherID}`);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><FileClock size={16} color="var(--erp-amber, #b45309)" /> Booking Draft Vouchers</span>}
                subtitle="Vouchers created by the booking flow (Master Invoice, payments, delivery, incentives) that are sitting in Draft awaiting review and Finalize before they hit the GL."
                actions={<button className="btn-sm" onClick={load} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>}
            />

            <div className="card">
                <h3 style={{ marginTop: 0 }}>Awaiting Finalize ({rows.length})</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={th}>Voucher</th>
                            <th style={th}>Source</th>
                            <th style={th}>Booking</th>
                            <th style={th}>Customer</th>
                            <th style={th}>Chassis</th>
                            <th style={th}>Date</th>
                            <th style={{...th, textAlign:'right'}}>Amount</th>
                            <th style={th}>Created By</th>
                            <th style={th}></th>
                        </tr></thead>
                        <tbody>
                            {rows.map(v => (
                                <tr key={v.VoucherID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={td}>{v.VoucherNo} <span style={{ color: '#94a3b8' }}>({v.VoucherType})</span></td>
                                    <td style={td}>{SOURCE_LABEL[v.SourceDocType] || v.SourceDocType}</td>
                                    <td style={td}>{v.BookingNo || '—'}</td>
                                    <td style={td}>{v.CustomerName || '—'}</td>
                                    <td style={td}>{v.ChasisNo || '—'}</td>
                                    <td style={td}>{dt(v.VoucherDate)}</td>
                                    <td style={tdNum}>{fmt(v.TotalAmount)}</td>
                                    <td style={td}>{v.CreatedByName || '—'}</td>
                                    <td style={td}>
                                        <button onClick={() => open(v)} className="btn-sm">Review</button>
                                    </td>
                                </tr>
                            ))}
                            {!busy && rows.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>Nothing waiting — every booking voucher has been reviewed.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
const tdNum = { padding: 8, textAlign: 'right', fontFamily: 'monospace' };
