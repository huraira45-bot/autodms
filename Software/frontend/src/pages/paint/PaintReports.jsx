/**
 * Paint Lab — Reports hub. Compact desktop-ERP layout.
 * Left rail selects one of 8 reports; right pane holds filter bar +
 * scrollable table + print button. No page-level horizontal scroll.
 */
import React, { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import {
    Package, ScrollText, Truck, Undo2, Wrench, ClipboardList,
    PieChart, AlertTriangle, Printer, Loader2,
} from 'lucide-react';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';
import SearchableSelect from '../../components/SearchableSelect';

const fmt  = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtQ = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 4 });
const d    = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
const dt   = (v) => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' }) : '';
const today = () => new Date().toISOString().slice(0, 10);
const firstOfMonth = () => { const x = new Date(); x.setDate(1); return x.toISOString().slice(0, 10); };

const REPORTS = [
    { key: 'stock-balance',           label: 'Stock Balance',           icon: Package,        wide: false },
    { key: 'stock-ledger',            label: 'Stock Ledger',            icon: ScrollText,     wide: true  },
    { key: 'purchase',                label: 'Purchase (GRN)',          icon: Truck,          wide: true  },
    { key: 'grtn',                    label: 'GRTN Register',           icon: Undo2,          wide: false },
    { key: 'issue-to-jc',             label: 'Issue to Job Card',       icon: Wrench,         wide: true  },
    { key: 'consumption-by-jc',       label: 'Consumption by JC',       icon: ClipboardList,  wide: false },
    { key: 'consumption-by-business', label: 'Consumption by Business', icon: PieChart,       wide: false },
    { key: 'low-stock',               label: 'Low Stock',               icon: AlertTriangle,  wide: false },
];

export default function PaintReports() {
    const [active, setActive]         = useState('stock-balance');
    const [from, setFrom]             = useState(firstOfMonth());
    const [to, setTo]                 = useState(today());
    const [items, setItems]           = useState([]);
    const [paintItemId, setPaintItemId] = useState('');
    const [jcFinalizedOnly, setJCFin] = useState(false);
    const [data, setData]             = useState(null);
    const [loading, setLoading]       = useState(false);
    const [err, setErr]               = useState(null);

    useEffect(() => { axios.get('/api/paint/items').then(r => setItems(r.data || [])).catch(() => {}); }, []);

    useEffect(() => {
        (async () => {
            setLoading(true); setErr(null); setData(null);
            try {
                const params = {};
                const wantsDates = !['stock-balance', 'low-stock'].includes(active);
                if (wantsDates) { if (from) params.from = from; if (to) params.to = to; }
                if (active === 'stock-ledger') {
                    if (!paintItemId) { setLoading(false); return; }
                    params.paintItemId = paintItemId;
                }
                if (active === 'consumption-by-jc' && jcFinalizedOnly) params.jcFinalized = 1;
                const r = await axios.get(`/api/paint/reports/${active}`, { params });
                setData(r.data);
            } catch (e) { setErr(e.response?.data?.error || e.message); }
            setLoading(false);
        })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [active, from, to, paintItemId, jcFinalizedOnly]);

    const activeDef = REPORTS.find(r => r.key === active);
    const itemOpts  = useMemo(() => items.map(i => ({
        id: i.PaintItemID, label: i.PaintName, sub: `${i.PaintCode} · Stock ${Number(i.StockQty).toFixed(2)}`,
    })), [items]);

    const filterSummary = useMemo(() => {
        const parts = [];
        if (!['stock-balance', 'low-stock'].includes(active)) parts.push(`Period: ${d(from)} → ${d(to)}`);
        if (active === 'stock-ledger' && paintItemId) {
            const it = items.find(x => x.PaintItemID === Number(paintItemId));
            if (it) parts.push(`Item: ${it.PaintCode} · ${it.PaintName}`);
        }
        if (active === 'consumption-by-jc' && jcFinalizedOnly) parts.push('Finalized JCs only');
        return parts.join('   ·   ');
    }, [active, from, to, paintItemId, jcFinalizedOnly, items]);

    return (
        <div className={`paint-page report-landscape${activeDef?.wide ? ' report-super-wide' : ''}`}>
            <PrintBusinessHeader docTitle={`Paint Lab — ${activeDef?.label}`} docMetaLeft={filterSummary} showOnScreen={false} />

            <div className="paint-actionbar no-print">
                <div className="title">
                    Paint Lab Reports <span className="subtitle">Stock, movements, purchase, returns, consumption</span>
                </div>
                <div className="actions">
                    <button className="btn btn-primary" onClick={() => window.print()} disabled={loading || !data}>
                        <Printer size={13} /> Print
                    </button>
                </div>
            </div>

            {/* Compact filter bar */}
            <div className="paint-filterbar no-print">
                <label>From
                    <input type="date" value={from} onChange={e => setFrom(e.target.value)}
                        disabled={['stock-balance', 'low-stock'].includes(active)} />
                </label>
                <label>To
                    <input type="date" value={to} onChange={e => setTo(e.target.value)}
                        disabled={['stock-balance', 'low-stock'].includes(active)} />
                </label>
                {active === 'stock-ledger' && (
                    <label style={{ minWidth: 260 }}>Paint Item
                        <div style={{ minWidth: 200 }}>
                            <SearchableSelect value={paintItemId} onChange={setPaintItemId}
                                options={itemOpts} placeholder="Pick paint item…" title="Pick paint item" />
                        </div>
                    </label>
                )}
                {active === 'consumption-by-jc' && (
                    <label>
                        <input type="checkbox" checked={jcFinalizedOnly}
                            onChange={e => setJCFin(e.target.checked)} />
                        Finalized JCs only
                    </label>
                )}
                <div className="spacer" />
            </div>

            <div className="paint-report-layout">
                <div className="paint-rail no-print">
                    {REPORTS.map(r => {
                        const Icon = r.icon;
                        return (
                            <button key={r.key} onClick={() => setActive(r.key)}
                                className={`tab ${r.key === active ? 'active' : ''}`}>
                                <Icon size={13} /> {r.label}
                            </button>
                        );
                    })}
                </div>

                <div>
                    {err && <div className="erp-alert danger" style={{ padding: '6px 10px', fontSize: 12 }}>{err}</div>}
                    {loading && (
                        <div className="paint-card muted" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <Loader2 size={13} className="animate-spin" /> Loading…
                        </div>
                    )}
                    {!loading && !err && !data && active === 'stock-ledger' && (
                        <div className="paint-card muted" style={{ textAlign: 'center', padding: 16 }}>
                            Pick a paint item to see its ledger.
                        </div>
                    )}

                    {data && active === 'stock-balance'           && <StockBalanceReport data={data} />}
                    {data && active === 'stock-ledger'            && <StockLedgerReport data={data} />}
                    {data && active === 'purchase'                && <PurchaseReport data={data} />}
                    {data && active === 'grtn'                    && <GRTNReport data={data} />}
                    {data && active === 'issue-to-jc'             && <IssueToJCReport data={data} />}
                    {data && active === 'consumption-by-jc'       && <ConsumptionByJCReport data={data} />}
                    {data && active === 'consumption-by-business' && <ConsumptionByBusinessReport data={data} />}
                    {data && active === 'low-stock'               && <LowStockReport data={data} />}
                </div>
            </div>
        </div>
    );
}

function ReportWrap({ children }) {
    return <div className="paint-table-wrap tall">{children}</div>;
}

function StockBalanceReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>Code</th><th>Paint Name</th><th>Category</th><th>Brand</th><th>UOM</th>
                        <th className="num">Reorder</th><th className="num">Stock Qty</th>
                        <th className="num">Avg Cost</th><th className="num">Stock Value</th>
                        <th>Low?</th><th>Last Movement</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.PaintItemID}>
                            <td className="mono">{r.PaintCode}</td>
                            <td className="trunc">{r.PaintName}</td>
                            <td className="trunc">{r.CategoryName || '—'}</td>
                            <td className="trunc">{r.BrandName || '—'}</td>
                            <td>{r.UOMName || '—'}</td>
                            <td className="num">{fmtQ(r.ReorderLevel)}</td>
                            <td className="num">{fmtQ(r.StockQty)}</td>
                            <td className="num">{fmt(r.AvgCost)}</td>
                            <td className="num">{fmt(r.StockValue)}</td>
                            <td>{r.BelowReorder ? '⚠' : ''}</td>
                            <td>{dt(r.LastMovementAt)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={8}>Totals · {data.totals?.items || 0} items · {data.totals?.belowReorder || 0} below reorder</td>
                        <td className="num">{fmt(data.totals?.stockValue)}</td>
                        <td colSpan={2}></td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function StockLedgerReport({ data }) {
    const item = data.item;
    return (<>
        {item && (
            <div className="paint-card" style={{ marginBottom: 6, fontSize: 12 }}>
                <strong>{item.PaintCode} · {item.PaintName}</strong>{item.UOMName ? ` (${item.UOMName})` : ''}
                {' — '}Current: {fmtQ(item.StockQty)} @ {fmt(item.AvgCost)} = {fmt(item.StockValue)}
            </div>
        )}
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>When</th><th>Source</th><th>Ref</th><th>Warehouse</th>
                        <th className="num">Qty Δ</th><th className="num">Unit Cost</th><th className="num">Value Δ</th>
                        <th className="num">Running Qty</th><th className="num">Running Avg</th><th className="num">Running Value</th>
                        <th>Note</th><th>By</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.LedgerID}>
                            <td>{dt(r.MovementAt)}</td>
                            <td>{r.SourceType}</td>
                            <td className="mono">{r.SourceRef || ''}</td>
                            <td className="trunc">{r.WHDesc || ''}</td>
                            <td className="num">{fmtQ(r.QuantityDelta)}</td>
                            <td className="num">{fmt(r.UnitCost)}</td>
                            <td className="num">{fmt(r.ValueDelta)}</td>
                            <td className="num">{fmtQ(r.RunningQty)}</td>
                            <td className="num">{fmt(r.RunningAvgCost)}</td>
                            <td className="num">{fmt(r.RunningValue)}</td>
                            <td className="trunc">{r.Note || ''}</td>
                            <td className="trunc">{r.CreatedByName || ''}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </ReportWrap>
    </>);
}

function PurchaseReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>GRN #</th><th>Date</th><th>Supplier</th><th>Bill #</th><th>Warehouse</th>
                        <th>Voucher</th>
                        <th className="num">Sub Total</th><th className="num">Discount</th>
                        <th className="num">GST</th><th className="num">Grand Total</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.PaintGRNID}>
                            <td className="mono">{r.GRNNo}</td>
                            <td>{d(r.GRNDate)}</td>
                            <td className="trunc">{r.PartyName}</td>
                            <td className="trunc">{r.SupplierBillNo || ''}</td>
                            <td className="trunc">{r.WHDesc || ''}</td>
                            <td className="mono">{r.VoucherNo || ''}</td>
                            <td className="num">{fmt(r.SubTotal)}</td>
                            <td className="num">{fmt(r.DiscountTotal)}</td>
                            <td className="num">{fmt(r.GSTTotal)}</td>
                            <td className="num">{fmt(r.GrandTotal)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={6}>Totals · {data.totals?.count || 0} GRNs</td>
                        <td className="num">{fmt(data.totals?.subTotal)}</td>
                        <td className="num">{fmt(data.totals?.discountTotal)}</td>
                        <td className="num">{fmt(data.totals?.gstTotal)}</td>
                        <td className="num">{fmt(data.totals?.grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function GRTNReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>GRTN #</th><th>Date</th><th>Supplier</th><th>Source GRN</th>
                        <th>Warehouse</th><th>Voucher</th><th className="num">Grand Total</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.PaintGRTNID}>
                            <td className="mono">{r.GRTNNo}</td>
                            <td>{d(r.GRTNDate)}</td>
                            <td className="trunc">{r.PartyName}</td>
                            <td className="mono">{r.SourceGRNNo}</td>
                            <td className="trunc">{r.WHDesc || ''}</td>
                            <td className="mono">{r.VoucherNo || ''}</td>
                            <td className="num">{fmt(r.GrandTotal)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={6}>Totals · {data.totals?.count || 0} GRTNs</td>
                        <td className="num">{fmt(data.totals?.grandTotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function IssueToJCReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>Issue #</th><th>Date</th><th>JC #</th><th>Vehicle</th>
                        <th>Customer</th><th>Business</th><th>Warehouse</th>
                        <th className="num"># Lines</th><th className="num">Total Cost</th><th>Locked</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.PaintIssueID}>
                            <td className="mono">{r.IssueNo}</td>
                            <td>{d(r.IssueDate)}</td>
                            <td className="mono">{r.JobCardNo}</td>
                            <td className="trunc">{r.VehicleRegNo || ''}</td>
                            <td className="trunc">{r.CustomerName || ''}</td>
                            <td>{r.CardCode}</td>
                            <td className="trunc">{r.WHDesc || ''}</td>
                            <td className="num">{fmtQ(r.LineCount)}</td>
                            <td className="num">{fmt(r.TotalCost)}</td>
                            <td>{r.Locked ? '✓' : ''}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={8}>Totals · {data.totals?.count || 0} issues</td>
                        <td className="num">{fmt(data.totals?.totalCost)}</td>
                        <td></td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function ConsumptionByJCReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>JC #</th><th>Vehicle</th><th>Customer</th><th>Business</th>
                        <th>JC Fin?</th><th className="num"># Issues</th>
                        <th>First Issue</th><th>Last Issue</th><th className="num">Total Consumption</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.JobCardId}>
                            <td className="mono">{r.JobCardNo}</td>
                            <td className="trunc">{r.VehicleRegNo || ''}</td>
                            <td className="trunc">{r.CustomerName || ''}</td>
                            <td>{r.CardCode}</td>
                            <td>{r.IsFinalized ? '✓' : ''}</td>
                            <td className="num">{fmtQ(r.IssueCount)}</td>
                            <td>{d(r.FirstIssueDate)}</td>
                            <td>{d(r.LastIssueDate)}</td>
                            <td className="num">{fmt(r.TotalConsumption)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={8}>Totals · {data.totals?.jobCount || 0} JCs</td>
                        <td className="num">{fmt(data.totals?.totalConsumption)}</td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function ConsumptionByBusinessReport({ data }) {
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>Code</th><th>Business Type</th>
                        <th className="num"># JCs</th><th className="num"># Issues</th>
                        <th className="num">Total Consumption</th>
                    </tr>
                </thead>
                <tbody>
                    {(data.rows || []).map(r => (
                        <tr key={r.JobCardTypeId}>
                            <td className="mono">{r.CardCode}</td>
                            <td>{r.Title}</td>
                            <td className="num">{fmtQ(r.JCCount)}</td>
                            <td className="num">{fmtQ(r.IssueCount)}</td>
                            <td className="num">{fmt(r.TotalConsumption)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr>
                        <td colSpan={4}>Totals</td>
                        <td className="num">{fmt(data.totals?.totalConsumption)}</td>
                    </tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}

function LowStockReport({ data }) {
    if ((data.rows || []).length === 0) {
        return <div className="paint-card muted" style={{ padding: 16, textAlign: 'center' }}>
            No items are below their reorder level.
        </div>;
    }
    return (
        <ReportWrap>
            <table className="paint-table">
                <thead>
                    <tr>
                        <th>Code</th><th>Paint Name</th><th>Category</th><th>Brand</th><th>UOM</th>
                        <th className="num">Reorder</th><th className="num">Stock Qty</th>
                        <th className="num">Short By</th><th className="num">Avg Cost</th><th className="num">Stock Value</th>
                    </tr>
                </thead>
                <tbody>
                    {data.rows.map(r => (
                        <tr key={r.PaintItemID}>
                            <td className="mono">{r.PaintCode}</td>
                            <td className="trunc">{r.PaintName}</td>
                            <td className="trunc">{r.CategoryName || '—'}</td>
                            <td className="trunc">{r.BrandName || '—'}</td>
                            <td>{r.UOMName || '—'}</td>
                            <td className="num">{fmtQ(r.ReorderLevel)}</td>
                            <td className="num">{fmtQ(r.StockQty)}</td>
                            <td className="num" style={{ color: '#b91c1c', fontWeight: 600 }}>{fmtQ(r.ShortBy)}</td>
                            <td className="num">{fmt(r.AvgCost)}</td>
                            <td className="num">{fmt(r.StockValue)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr><td colSpan={10}>{data.totals?.count || 0} items below reorder</td></tr>
                </tfoot>
            </table>
        </ReportWrap>
    );
}
