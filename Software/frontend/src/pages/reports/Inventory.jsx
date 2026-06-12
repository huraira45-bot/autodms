/**
 * Inventory reports.
 *
 *   - InventoryValuation: on-hand qty × weighted-avg rate per item, with filters
 *     by warehouse / category / search, sorted by value desc.
 */
import React, { useEffect, useState } from 'react';
import { Package, AlertTriangle, Download } from 'lucide-react';
import axios from 'axios';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, DateInput } from './ReportShell';

const API_BASE = '/api';

function csvEscape(v) {
    if (v == null) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function downloadCSV(rows, totals, asOf) {
    const header = ['Item Code', 'Part #', 'Item Name', 'Bin', 'Warehouse', 'Category', 'UOM',
                    'On Hand', 'Rate (PKR)', 'Value (PKR)', 'Reorder Level'];
    const body = rows.map(r => [
        r.ItemCode, r.PartNumber, r.ItemName, r.BinLocation, r.Warehouse,
        r.Category, r.UOM,
        r.OnHand, r.Rate, r.Value, r.ReOrderLevel
    ].map(csvEscape).join(','));
    const footer = `,,,,,,Totals,${totals.totalQty},,${totals.totalValue},`;
    const csv = [header.join(','), ...body, footer].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `inventory-on-hand-${asOf}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

export function InventoryValuation() {
    const [warehouses, setWarehouses] = useState([]);
    const [categories, setCategories] = useState([]);

    // Load lookups once for the filter dropdowns
    useEffect(() => {
        Promise.allSettled([
            axios.get(`${API_BASE}/inventory-config/warehouses`).then(r => setWarehouses(r.data || [])),
            axios.get(`${API_BASE}/inventory-config/categories`).then(r => setCategories(r.data || [])),
        ]);
    }, []);

    return (
        <ReportShell
            title="Inventory On Hand"
            subtitle="Current stock by item — quantity × weighted-average rate."
            icon={Package}
            endpoint="inventory-valuation"
            defaultParams={{ asOf: todayISO(), search: '', whId: '', catId: '', includeZero: '0' }}
            controls={({ params, updateParam }) => (
                <>
                    <DateInput label="As of" value={params.asOf} onChange={v => updateParam('asOf', v)} />
                    <input
                        type="search"
                        placeholder="Item name, code, or part #…"
                        value={params.search || ''}
                        onChange={e => updateParam('search', e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 220 }}
                    />
                    <select value={params.whId || ''} onChange={e => updateParam('whId', e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                        <option value="">All Warehouses</option>
                        {warehouses.map(w => <option key={w.WHID} value={w.WHID}>{w.WHDesc}</option>)}
                    </select>
                    <select value={params.catId || ''} onChange={e => updateParam('catId', e.target.value)}
                        style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                        <option value="">All Categories</option>
                        {categories.map(c => <option key={c.CategoryID} value={c.CategoryID}>{c.CategoryName}</option>)}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.85rem', color: '#475569' }}>
                        <input type="checkbox" checked={params.includeZero === '1'}
                            onChange={e => updateParam('includeZero', e.target.checked ? '1' : '0')} />
                        Include zero-stock
                    </label>
                </>
            )}
        >
            {(data) => (
                <>
                    {/* Summary cards */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                        <SummaryCard label="As of"           value={data.asOf} />
                        <SummaryCard label="Items"           value={fmtInt(data.totals.items)} />
                        <SummaryCard label="Total On-Hand Qty" value={fmt(data.totals.totalQty)} />
                        <SummaryCard label="Total Stock Value (PKR)" value={fmt(data.totals.totalValue)} highlight />
                    </div>

                    {data.totals.belowReorder > 0 && (
                        <div className="card" style={{ background: '#fef3c7', border: '1px solid #fbbf24', color: '#78350f', display: 'flex', gap: 8, alignItems: 'center' }}>
                            <AlertTriangle size={16} />
                            <strong>{data.totals.belowReorder}</strong> items at or below their reorder level.
                        </div>
                    )}

                    <div className="card" style={{ overflowX: 'auto' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                            <div style={{ color: '#64748b', fontSize: '0.85rem' }}>
                                Showing {data.rows.length} of {fmtInt(data.totals.items)} items
                            </div>
                            <button className="btn-sm" disabled={data.rows.length === 0}
                                onClick={() => downloadCSV(data.rows, data.totals, data.asOf)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Download size={14} /> Export CSV
                            </button>
                        </div>

                        {data.rows.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                                <Package size={32} style={{ opacity: 0.4 }} />
                                <div style={{ marginTop: 8 }}>No items match the current filters.</div>
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Code</TH>
                                        <TH>Part #</TH>
                                        <TH>Item</TH>
                                        <TH>Bin</TH>
                                        <TH>Warehouse</TH>
                                        <TH align="right">On Hand</TH>
                                        <TH align="right">Rate</TH>
                                        <TH align="right">Value (PKR)</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => {
                                        const belowReorder = r.ReOrderLevel > 0 && r.OnHand <= r.ReOrderLevel;
                                        return (
                                            <tr key={r.ItemId} style={{
                                                borderBottom: '1px solid #f1f5f9',
                                                background: belowReorder ? '#fffbeb' : undefined,
                                            }}>
                                                <TD mono color="#475569">{r.ItemCode}</TD>
                                                <TD mono color="#64748b">{r.PartNumber}</TD>
                                                <TD>{r.ItemName}</TD>
                                                <TD color="#64748b" mono>{r.BinLocation}</TD>
                                                <TD color="#64748b">{r.Warehouse}</TD>
                                                <TD align="right" bold color={belowReorder ? '#b45309' : undefined}>
                                                    {fmt(r.OnHand)} {r.UOM}
                                                </TD>
                                                <TD align="right" color="#64748b">{fmt(r.Rate)}</TD>
                                                <TD align="right" bold>{fmt(r.Value)}</TD>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={5} style={{ padding: 12, fontWeight: 700 }}>
                                            Totals — {fmtInt(data.totals.items)} items
                                        </td>
                                        <TD align="right" bold>{fmt(data.totals.totalQty)}</TD>
                                        <td></td>
                                        <TD align="right" bold>{fmt(data.totals.totalValue)}</TD>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

function SummaryCard({ label, value, highlight }) {
    return (
        <div className="card" style={{
            background: highlight ? 'linear-gradient(135deg, #1e40af, #2563eb)' : undefined,
            color: highlight ? 'white' : undefined,
        }}>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase',
                color: highlight ? 'rgba(255,255,255,0.85)' : '#64748b' }}>{label}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, marginTop: 4 }}>{value}</div>
        </div>
    );
}
