/**
 * Paint Lab — Reports hub.
 *
 * A single page with a left-rail selector for each of the 8 reports.
 * Each report shares the same shell (filters strip + table + totals row
 * + Print), so print output is uniform. Deliberately not using the
 * general-purpose ReportShell because we want everything scoped to
 * /api/paint/reports/* and the row for "Stock Ledger" needs a picker
 * for the item.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Package, ScrollText, Truck, Undo2, Wrench, ClipboardList,
    PieChart, AlertTriangle, Printer, Search, Loader2,
} from 'lucide-react';
import { ErpControlPanel } from '../../components/erp';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';
import SearchableSelect from '../../components/SearchableSelect';

const fmt  = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const d    = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const dt   = (v) => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const dt = new Date(); dt.setDate(1); return dt.toISOString().slice(0, 10); };

const REPORTS = [
    { key: 'stock-balance',            label: 'Stock Balance',          icon: Package,        wide: false },
    { key: 'stock-ledger',             label: 'Stock Ledger (per Item)', icon: ScrollText,    wide: true  },
    { key: 'purchase',                 label: 'Purchase Register (GRN)', icon: Truck,         wide: true  },
    { key: 'grtn',                     label: 'GRTN Register',           icon: Undo2,         wide: false },
    { key: 'issue-to-jc',              label: 'Paint Issue to Job Card', icon: Wrench,        wide: true  },
    { key: 'consumption-by-jc',        label: 'Consumption by Job Card', icon: ClipboardList, wide: false },
    { key: 'consumption-by-business',  label: 'Consumption by Business', icon: PieChart,      wide: false },
    { key: 'low-stock',                label: 'Low Stock (Reorder Alert)', icon: AlertTriangle, wide: false },
];

export default function PaintReports() {
    const [active, setActive]     = useState('stock-balance');
    const [from, setFrom]         = useState(firstOfMonth());
    const [to, setTo]             = useState(today());
    const [items, setItems]       = useState([]);
    const [paintItemId, setPaintItemId] = useState('');
    const [jcFinalizedOnly, setJCFin] = useState(false);
    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(false);
    const [err, setErr]           = useState(null);

    // Item picker options (only fetch once — used by Stock Ledger).
    useEffect(() => {
        axios.get('/api/paint/items').then(r => setItems(r.data || [])).catch(() => {});
    }, []);

    // Reload whenever the active report or filters change.
    useEffect(() => {
        (async () => {
            setLoading(true); setErr(null); setData(null);
            try {
                const params = {};
                const wantsDates = ['stock-ledger', 'purchase', 'grtn', 'issue-to-jc', 'consumption-by-jc', 'consumption-by-business']
                    .includes(active);
                if (wantsDates) { if (from) params.from = from; if (to) params.to = to; }
                if (active === 'stock-ledger') {
                    if (!paintItemId) { setLoading(false); return; }
                    params.paintItemId = paintItemId;
                }
                if (active === 'consumption-by-jc' && jcFinalizedOnly) params.jcFinalized = 1;
                const r = await axios.get(`/api/paint/reports/${active}`, { params });
                setData(r.data);
            } catch (e) {
                setErr(e.response?.data?.error || e.message);
            }
            setLoading(false);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, from, to, paintItemId, jcFinalizedOnly]);

    const activeDef = REPORTS.find(r => r.key === active);
    const itemOpts  = useMemo(() => items.map(i => ({
        id: i.PaintItemID, label: i.PaintName, sub: `${i.PaintCode} · Stock ${Number(i.StockQty).toFixed(2)}`,
    })), [items]);

    const printReport = () => window.print();

    const filterSummary = useMemo(() => {
        const parts = [];
        if (['stock-ledger','purchase','grtn','issue-to-jc','consumption-by-jc','consumption-by-business'].includes(active)) {
            parts.push(`Period: ${d(from)} → ${d(to)}`);
        }
        if (active === 'stock-ledger' && paintItemId) {
            const it = items.find(x => x.PaintItemID === Number(paintItemId));
            if (it) parts.push(`Item: ${it.PaintCode} · ${it.PaintName}`);
        }
        if (active === 'consumption-by-jc' && jcFinalizedOnly) parts.push('Finalized JCs only');
        return parts.join('   ·   ');
    }, [active, from, to, paintItemId, jcFinalizedOnly, items]);

    return (
        <div className={`report-landscape${activeDef?.wide ? ' report-super-wide' : ''}`} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <PrintBusinessHeader docTitle={`Paint Lab — ${activeDef?.label}`} docMetaLeft={filterSummary} showOnScreen={false} />

            <ErpControlPanel title="Paint Lab Reports" subtitle="Stock, movements, purchase, returns, and consumption analytics.">
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    From
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        disabled={['stock-balance', 'low-stock'].includes(active)} />
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                    To
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        disabled={['stock-balance', 'low-stock'].includes(active)} />
                </label>
                {active === 'consumption-by-jc' && (
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                        <input type="checkbox" checked={jcFinalizedOnly} onChange={e => setJCFin(e.target.checked)} />
                        Finalized JCs only
                    </label>
                )}
                <button className="btn btn-primary" onClick={printReport} disabled={loading || !data}>
                    <Printer size={14} /> Print
                </button>
            </ErpControlPanel>

            <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 10 }}>
                <div className="erp-panel no-print" style={{ padding: 6, height: 'fit-content' }}>
                    {REPORTS.map(r => {
                        const Icon = r.icon;
                        const isActive = r.key === active;
                        return (
                            <button key={r.key}
                                onClick={() => setActive(r.key)}
                                className="report-tab"
                                style={{
                                    width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                                    padding: '8px 10px', border: 'none',
                                    background: isActive ? 'var(--erp-brand-soft)' : 'transparent',
                                    color: isActive ? 'var(--erp-brand)' : 'var(--erp-text)',
                                    borderLeft: isActive ? '3px solid var(--erp-brand)' : '3px solid transparent',
                                    cursor: 'pointer', fontSize: 13, textAlign: 'left', borderRadius: 4,
                                }}>
                                <Icon size={14} /> {r.label}
                            </button>
                        );
                    })}
                </div>

                <div className="erp-panel" style={{ padding: 10, overflowX: 'auto' }}>
                    {active === 'stock-ledger' && (
                        <div className="no-print" style={{ marginBottom: 10, display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
                            <span style={{ fontWeight: 600 }}>Paint Item:</span>
                            <div style={{ minWidth: 300 }}>
                                <SearchableSelect
                                    value={paintItemId}
                                    onChange={setPaintItemId}
                                    options={itemOpts}
                                    placeholder="Pick a paint item…"
                                    title="Pick paint item for ledger"
                                />
                            </div>
                        </div>
                    )}

                    {err && <div className="erp-alert danger">{err}</div>}
                    {loading && <div style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'center', color: '#64748b' }}><Loader2 size={16} className="animate-spin" /> Loading…</div>}
                    {!loading && !err && !data && active === 'stock-ledger' && (
                        <div style={{ padding: 20, color: '#64748b', textAlign: 'center' }}>Pick a paint item to see its ledger.</div>
                    )}

                    {data && active === 'stock-balance' && <StockBalanceReport data={data} />}
                    {data && active === 'stock-ledger' && <StockLedgerReport data={data} />}
                    {data && active === 'purchase' && <PurchaseReport data={data} />}
                    {data && active === 'grtn' && <GRTNReport data={data} />}
                    {data && active === 'issue-to-jc' && <IssueToJCReport data={data} />}
                    {data && active === 'consumption-by-jc' && <ConsumptionByJCReport data={data} />}
                    {data && active === 'consumption-by-business' && <ConsumptionByBusinessReport data={data} />}
                    {data && active === 'low-stock' && <LowStockReport data={data} />}
                </div>
            </div>
        </div>
    );
}

// ─────────────── individual report renders (tables only)
function ReportTable({ headers, rows, footer, empty = 'No rows.' }) {
    return (
        <table style={tableStyle}>
            <thead><tr>{headers.map((h, i) => <th key={i} style={{ ...th, ...(h.align === 'right' ? { textAlign: 'right' } : {}) }}>{h.label}</th>)}</tr></thead>
            <tbody>
                {rows.length === 0
                    ? <tr><td colSpan={headers.length} style={{ padding: 16, textAlign: 'center', color: '#94a3b8' }}>{empty}</td></tr>
                    : rows.map((row, i) => <tr key={i} style={{ borderTop: '1px solid #e5e7eb' }}>
                        {row.map((c, j) => <td key={j} style={{ ...td, ...(headers[j].align === 'right' ? { textAlign: 'right' } : {}) }}>{c}</td>)}
                    </tr>)}
            </tbody>
            {footer && <tfoot>{footer}</tfoot>}
        </table>
    );
}

function StockBalanceReport({ data }) {
    const rows = (data.rows || []).map(r => [
        r.PaintCode, r.PaintName, r.CategoryName || '—', r.BrandName || '—', r.UOMName || '—',
        fmtQ(r.ReorderLevel), fmtQ(r.StockQty), fmt(r.AvgCost), fmt(r.StockValue),
        r.BelowReorder ? '⚠' : '', dt(r.LastMovementAt),
    ]);
    return (<>
        <ReportTable
            headers={[
                { label: 'Code' }, { label: 'Paint Name' }, { label: 'Category' }, { label: 'Brand' }, { label: 'UOM' },
                { label: 'Reorder', align: 'right' }, { label: 'Stock Qty', align: 'right' },
                { label: 'Avg Cost', align: 'right' }, { label: 'Stock Value', align: 'right' },
                { label: 'Low?' }, { label: 'Last Movement' },
            ]}
            rows={rows}
            footer={<tr style={totalRowStyle}>
                <td colSpan={8} style={{ ...td, fontWeight: 600 }}>Totals · {data.totals?.items || 0} items · {data.totals?.belowReorder || 0} below reorder</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.stockValue)}</td>
                <td colSpan={2}></td>
            </tr>}
        />
    </>);
}

function StockLedgerReport({ data }) {
    const item = data.item;
    return (<>
        {item && (
            <div style={{ marginBottom: 8, fontSize: 13 }}>
                <strong>{item.PaintCode} · {item.PaintName}</strong>{item.UOMName ? ` (${item.UOMName})` : ''} — Current: {fmtQ(item.StockQty)} @ {fmt(item.AvgCost)} = {fmt(item.StockValue)}
            </div>
        )}
        <ReportTable
            headers={[
                { label: 'When' }, { label: 'Source' }, { label: 'Ref' }, { label: 'Warehouse' },
                { label: 'Qty Δ', align: 'right' }, { label: 'Unit Cost', align: 'right' }, { label: 'Value Δ', align: 'right' },
                { label: 'Running Qty', align: 'right' }, { label: 'Running Avg', align: 'right' }, { label: 'Running Value', align: 'right' },
                { label: 'Note' }, { label: 'By' },
            ]}
            rows={(data.rows || []).map(r => [
                dt(r.MovementAt), r.SourceType, r.SourceRef || '', r.WHDesc || '',
                fmtQ(r.QuantityDelta), fmt(r.UnitCost), fmt(r.ValueDelta),
                fmtQ(r.RunningQty), fmt(r.RunningAvgCost), fmt(r.RunningValue),
                r.Note || '', r.CreatedByName || '',
            ])}
        />
    </>);
}

function PurchaseReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'GRN #' }, { label: 'Date' }, { label: 'Supplier' }, { label: 'Bill #' }, { label: 'Warehouse' },
                { label: 'Voucher' }, { label: 'Sub Total', align: 'right' }, { label: 'Discount', align: 'right' },
                { label: 'GST', align: 'right' }, { label: 'Grand Total', align: 'right' },
            ]}
            rows={(data.rows || []).map(r => [
                r.GRNNo, d(r.GRNDate), r.PartyName, r.SupplierBillNo || '', r.WHDesc || '',
                r.VoucherNo || '', fmt(r.SubTotal), fmt(r.DiscountTotal), fmt(r.GSTTotal), fmt(r.GrandTotal),
            ])}
            footer={<tr style={totalRowStyle}>
                <td colSpan={6} style={{ ...td, fontWeight: 600 }}>Totals · {data.totals?.count || 0} GRNs</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.subTotal)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.discountTotal)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.gstTotal)}</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.grandTotal)}</td>
            </tr>}
        />
    );
}

function GRTNReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'GRTN #' }, { label: 'Date' }, { label: 'Supplier' }, { label: 'Source GRN' },
                { label: 'Warehouse' }, { label: 'Voucher' }, { label: 'Grand Total', align: 'right' },
            ]}
            rows={(data.rows || []).map(r => [
                r.GRTNNo, d(r.GRTNDate), r.PartyName, r.SourceGRNNo,
                r.WHDesc || '', r.VoucherNo || '', fmt(r.GrandTotal),
            ])}
            footer={<tr style={totalRowStyle}>
                <td colSpan={6} style={{ ...td, fontWeight: 600 }}>Totals · {data.totals?.count || 0} GRTNs</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.grandTotal)}</td>
            </tr>}
        />
    );
}

function IssueToJCReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'Issue #' }, { label: 'Date' }, { label: 'JC #' }, { label: 'Vehicle' },
                { label: 'Customer' }, { label: 'Business' }, { label: 'Warehouse' },
                { label: '# Lines', align: 'right' }, { label: 'Total Cost', align: 'right' }, { label: 'Locked' },
            ]}
            rows={(data.rows || []).map(r => [
                r.IssueNo, d(r.IssueDate), r.JobCardNo, r.VehicleRegNo || '',
                r.CustomerName || '', r.CardCode, r.WHDesc || '',
                fmtQ(r.LineCount), fmt(r.TotalCost), r.Locked ? '✓' : '',
            ])}
            footer={<tr style={totalRowStyle}>
                <td colSpan={8} style={{ ...td, fontWeight: 600 }}>Totals · {data.totals?.count || 0} issues</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.totalCost)}</td>
                <td></td>
            </tr>}
        />
    );
}

function ConsumptionByJCReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'JC #' }, { label: 'Vehicle' }, { label: 'Customer' }, { label: 'Business' },
                { label: 'JC Fin?' }, { label: '# Issues', align: 'right' },
                { label: 'First Issue' }, { label: 'Last Issue' }, { label: 'Total Consumption', align: 'right' },
            ]}
            rows={(data.rows || []).map(r => [
                r.JobCardNo, r.VehicleRegNo || '', r.CustomerName || '', r.CardCode,
                r.IsFinalized ? '✓' : '', fmtQ(r.IssueCount), d(r.FirstIssueDate), d(r.LastIssueDate), fmt(r.TotalConsumption),
            ])}
            footer={<tr style={totalRowStyle}>
                <td colSpan={8} style={{ ...td, fontWeight: 600 }}>Totals · {data.totals?.jobCount || 0} JCs</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.totalConsumption)}</td>
            </tr>}
        />
    );
}

function ConsumptionByBusinessReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'Code' }, { label: 'Business Type' },
                { label: '# JCs', align: 'right' }, { label: '# Issues', align: 'right' },
                { label: 'Total Consumption', align: 'right' },
            ]}
            rows={(data.rows || []).map(r => [
                r.CardCode, r.Title, fmtQ(r.JCCount), fmtQ(r.IssueCount), fmt(r.TotalConsumption),
            ])}
            footer={<tr style={totalRowStyle}>
                <td colSpan={4} style={{ ...td, fontWeight: 600 }}>Totals</td>
                <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{fmt(data.totals?.totalConsumption)}</td>
            </tr>}
        />
    );
}

function LowStockReport({ data }) {
    return (
        <ReportTable
            headers={[
                { label: 'Code' }, { label: 'Paint Name' }, { label: 'Category' }, { label: 'Brand' }, { label: 'UOM' },
                { label: 'Reorder', align: 'right' }, { label: 'Stock Qty', align: 'right' },
                { label: 'Short By', align: 'right' }, { label: 'Avg Cost', align: 'right' }, { label: 'Stock Value', align: 'right' },
            ]}
            rows={(data.rows || []).map(r => [
                r.PaintCode, r.PaintName, r.CategoryName || '—', r.BrandName || '—', r.UOMName || '—',
                fmtQ(r.ReorderLevel), fmtQ(r.StockQty), fmtQ(r.ShortBy), fmt(r.AvgCost), fmt(r.StockValue),
            ])}
            empty="No items are below their reorder level. 🎉"
            footer={<tr style={totalRowStyle}><td colSpan={10} style={{ ...td, fontWeight: 600 }}>{data.totals?.count || 0} items below reorder</td></tr>}
        />
    );
}

const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: 12 };
const th = { padding: '6px 8px', textAlign: 'left', fontSize: 11, textTransform: 'uppercase', color: '#64748b', background: '#f8fafc', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap' };
const td = { padding: '4px 8px', fontSize: 12, verticalAlign: 'top' };
const totalRowStyle = { background: '#f1f5f9', borderTop: '2px solid #cbd5e1' };
