import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Receipt, Save, Loader2, Check, ChevronRight, ChevronDown } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Store Sale Tax Invoice Tracker — GST-only sibling of the Job Card version
// (Store Sale has no PST/labour). Editable GST invoice number + paid
// checkbox per sale. Owner ask 2026-07-30.
// ---------------------------------------------------------------------------
export function StoreSaleTaxInvoiceTracker() {
    const selectStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' };

    const printFilterSummary = (params) => {
        const parts = [];
        if (params.from && params.to) parts.push(`Finalized Period: ${params.from} → ${params.to}`);
        if (params.paymentMode === 'cash')       parts.push('Payment: Cash (incl. POS, Cheque & Bank Transfer)');
        else if (params.paymentMode === 'credit') parts.push('Payment: Credit');
        else                                      parts.push('Payment: All');
        if (params.finalized === 'draft')       parts.push('Status: Draft only');
        else if (params.finalized === 'all')     parts.push('Status: All (incl. Draft)');
        else                                     parts.push('Status: Finalized only');
        return parts.join('  •  ');
    };

    const excelExport = (data, params) => ({
        filename: `store-sale-tax-invoice-tracker-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: [
            'Invoice #', 'Finalized Date', 'Payment', 'Customer',
            'Parts Amount', 'GST', 'Net Payable',
            'GST Invoice #', 'GST Paid',
            'Updated By', 'Updated At',
        ],
        rows: (data.rows || []).map(r => [
            r.InvoiceNo,
            r.FinalizedAt || r.SaleDate || '',
            r.PaymentMode || '',
            r.Customer || '',
            Number(r.PartsAmount || 0),
            Number(r.GSTAmount || 0),
            Number(r.NetPayable || 0),
            r.GSTInvoiceNo || '',
            r.GSTPaid ? 'Yes' : 'No',
            r.TaxUpdatedByName || '',
            r.TaxUpdatedAt || '',
        ]),
    });

    return (
        <ReportShell
            title="Store Sale Tax Invoice Tracker"
            subtitle="Per Store Sale GST invoice number + paid status. Editable — changes save on Enter or when you click Save."
            icon={Receipt}
            endpoint="parts/tax-invoice-tracker"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), paymentMode: '', finalized: 'finalized' }}
            printFilterSummary={printFilterSummary}
            excelExport={excelExport}
            landscape
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Payment:
                        <select value={params.paymentMode || ''} onChange={e => updateParam('paymentMode', e.target.value)} style={selectStyle}>
                            <option value="">All</option>
                            <option value="cash">Cash (incl. POS, Cheque &amp; Bank Transfer)</option>
                            <option value="credit">Credit</option>
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Status:
                        <select value={params.finalized || 'finalized'} onChange={e => updateParam('finalized', e.target.value)} style={selectStyle}>
                            <option value="finalized">Finalized only</option>
                            <option value="draft">Draft only</option>
                            <option value="all">All (incl. Draft)</option>
                        </select>
                    </label>
                </>
            )}
        >
            {(data) => <TrackerTable initialRows={data.rows} totals={data.totals} />}
        </ReportShell>
    );
}

// ------------------------------- Table body ---------------------------------
function TrackerTable({ initialRows, totals }) {
    const [rows, setRows] = useState(initialRows);
    useEffect(() => { setRows(initialRows); }, [initialRows]);

    // expanded[SaleID] = true | false — only the GST/parts breakdown to show.
    const [expanded, setExpanded] = useState({});
    // linesCache[SaleID] = { parts } | 'loading' | 'error:msg'
    const [linesCache, setLinesCache] = useState({});

    const toggleExpand = async (saleId) => {
        setExpanded(prev => ({ ...prev, [saleId]: !prev[saleId] }));
        if (!linesCache[saleId]) {
            setLinesCache(prev => ({ ...prev, [saleId]: 'loading' }));
            try {
                const r = await axios.get(`/api/reports/parts/tax-invoice-tracker/${saleId}/lines`);
                setLinesCache(prev => ({ ...prev, [saleId]: r.data }));
            } catch (e) {
                setLinesCache(prev => ({ ...prev, [saleId]: 'error:' + (e.response?.data?.error || e.message) }));
            }
        }
    };

    const updateLocal = (idx, patch) => {
        setRows(prev => {
            const next = prev.slice();
            next[idx] = { ...next[idx], ...patch, _dirty: true };
            return next;
        });
    };

    const saveRow = useCallback(async (idx) => {
        const row = rows[idx];
        if (!row?._dirty) return;
        setRows(prev => {
            const n = prev.slice(); n[idx] = { ...n[idx], _saving: true }; return n;
        });
        try {
            const r = await axios.patch(`/api/reports/parts/tax-invoice-tracker/${row.SaleID}`, {
                GSTInvoiceNo: row.GSTInvoiceNo || '',
                GSTPaid:      !!row.GSTPaid,
            });
            setRows(prev => {
                const n = prev.slice();
                n[idx] = { ...n[idx], ...r.data, _dirty: false, _saving: false, _savedAt: Date.now() };
                return n;
            });
        } catch (e) {
            setRows(prev => {
                const n = prev.slice();
                n[idx] = { ...n[idx], _saving: false, _error: e.response?.data?.error || e.message };
                return n;
            });
        }
    }, [rows]);

    return (
        <>
            <SummaryBar items={[
                { label: 'Invoices',   value: fmtInt(totals.count) },
                { label: 'Parts',      value: 'PKR ' + fmt(totals.partsAmount) },
                { label: 'GST',        value: 'PKR ' + fmt(totals.gstAmount) },
                { label: 'Net Payable',value: 'PKR ' + fmt(totals.netPayable) },
                { label: 'GST Paid',   value: `${fmtInt(totals.gstPaidCount)} / ${fmtInt(totals.count)}`, strong: true },
            ]} />
            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                    <thead>
                        <tr style={trHeader}>
                            <TH>Invoice #</TH><TH>Finalized</TH><TH>Payment</TH><TH>Customer</TH>
                            <TH align="right">Parts</TH>
                            <TH align="right">GST</TH>
                            <TH align="right">Net Payable</TH>
                            <TH>GST Invoice #</TH>
                            <TH align="center">GST Paid</TH>
                            <TH align="center" width={90}>Save</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td colSpan={10} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                No store sales in this period.
                            </td></tr>
                        )}
                        {rows.map((r, i) => {
                            const isOpen = !!expanded[r.SaleID];
                            const cachedLines = linesCache[r.SaleID];
                            return (
                            <React.Fragment key={r.SaleID}>
                            <tr style={trBody}>
                                <TD mono><strong>{r.InvoiceNo}</strong></TD>
                                <TD>{r.FinalizedAt || r.SaleDate || '—'}</TD>
                                <TD>{r.PaymentMode}</TD>
                                <TD>{r.Customer}</TD>
                                <TD align="right" mono>{fmt(r.PartsAmount)}</TD>
                                <TD align="right" mono>
                                    <button type="button" onClick={() => toggleExpand(r.SaleID)}
                                        title="Show parts (GST base)" style={expandBtn}>
                                        {isOpen ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                        <span style={{ color: '#1d4ed8' }}>{fmt(r.GSTAmount)}</span>
                                    </button>
                                </TD>
                                <TD align="right" mono>{fmt(r.NetPayable)}</TD>
                                <TD>
                                    <input type="text" value={r.GSTInvoiceNo || ''}
                                        onChange={e => updateLocal(i, { GSTInvoiceNo: e.target.value })}
                                        onKeyDown={e => e.key === 'Enter' && saveRow(i)}
                                        placeholder="—"
                                        style={inputCell} />
                                </TD>
                                <TD align="center">
                                    <input type="checkbox" checked={!!r.GSTPaid}
                                        onChange={e => updateLocal(i, { GSTPaid: e.target.checked })} />
                                </TD>
                                <TD align="center">
                                    {r._saving ? (
                                        <Loader2 size={14} className="animate-spin" style={{ color: '#64748b' }} />
                                    ) : r._dirty ? (
                                        <button type="button" onClick={() => saveRow(i)}
                                            title="Save this row"
                                            style={saveBtn}>
                                            <Save size={12} /> Save
                                        </button>
                                    ) : r._savedAt && (Date.now() - r._savedAt) < 3000 ? (
                                        <span style={{ color: '#15803d', display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.75rem' }}>
                                            <Check size={12} /> Saved
                                        </span>
                                    ) : (
                                        <span style={{ color: '#cbd5e1', fontSize: '0.75rem' }}>—</span>
                                    )}
                                    {r._error && <div style={{ color: '#b91c1c', fontSize: '0.7rem' }}>{r._error}</div>}
                                </TD>
                            </tr>
                            {isOpen && (
                                <tr>
                                    <td colSpan={10} style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <LinesSubRow lines={cachedLines} />
                                    </td>
                                </tr>
                            )}
                            </React.Fragment>
                            );
                        })}
                    </tbody>
                    {rows.length > 0 && (
                        <tfoot>
                            <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Totals — {fmtInt(totals.count)} invoices</td>
                                <TD align="right" bold>{fmt(totals.partsAmount)}</TD>
                                <TD align="right" bold>{fmt(totals.gstAmount)}</TD>
                                <TD align="right" bold>{fmt(totals.netPayable)}</TD>
                                <td colSpan={3}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </>
    );
}

// ---------------------------- Expandable sub-row ----------------------------
function LinesSubRow({ lines }) {
    if (lines === 'loading' || !lines) {
        return (
            <div style={{ padding: 16, color: '#64748b', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Loader2 size={14} className="animate-spin" /> Loading lines…
            </div>
        );
    }
    if (typeof lines === 'string' && lines.startsWith('error:')) {
        return <div style={{ padding: 16, color: '#b91c1c', fontSize: '0.8rem' }}>{lines.slice(6)}</div>;
    }

    const parts = lines.parts || [];
    if (parts.length === 0) return <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>No lines on this sale.</div>;
    return (
        <div style={{ padding: '8px 16px' }}>
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
                Parts sold (GST base)
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                <thead>
                    <tr style={{ background: '#eef2ff', borderBottom: '1px solid #cbd5e1' }}>
                        <TH>Item Code</TH><TH>Part #</TH><TH>Item Name</TH>
                        <TH align="right">Qty</TH>
                        <TH align="right">Sale Rate</TH>
                        <TH align="right">Discount</TH>
                        <TH align="center">GST?</TH>
                        <TH align="right">GST</TH>
                        <TH align="right">Line Total</TH>
                    </tr>
                </thead>
                <tbody>
                    {parts.map((p, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            <TD mono>{p.ItemNumber || '—'}</TD>
                            <TD mono color="#64748b">{p.ManualNumber || ''}</TD>
                            <TD>{p.ItemName || ''}</TD>
                            <TD align="right" mono>{fmt(p.Quantity)}</TD>
                            <TD align="right" mono>{fmt(p.Rate)}</TD>
                            <TD align="right" mono color={p.Discount > 0 ? '#b45309' : undefined}>
                                {p.Discount > 0 ? fmt(p.Discount) : '—'}
                            </TD>
                            <TD align="center" color={p.IsGST ? '#15803d' : '#94a3b8'}>{p.IsGST ? 'Yes' : 'No'}</TD>
                            <TD align="right" mono color="#1d4ed8">{fmt(p.TaxAmount)}</TD>
                            <TD align="right" mono bold>{fmt(p.LineTotal)}</TD>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// ------------------------------ Shared style --------------------------------
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const trHeader   = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const trBody     = { borderBottom: '1px solid #f1f5f9' };
const inputCell  = { width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.85rem', boxSizing: 'border-box' };
const saveBtn    = {
    display: 'inline-flex', alignItems: 'center', gap: 4,
    padding: '3px 8px', border: '1px solid #1d4ed8',
    background: '#1d4ed8', color: 'white', borderRadius: 4,
    fontSize: '0.75rem', cursor: 'pointer',
};
const expandBtn  = {
    display: 'inline-flex', alignItems: 'center', gap: 3,
    background: 'none', border: 'none', padding: 0,
    font: 'inherit', color: '#64748b', cursor: 'pointer',
};

function SummaryBar({ items }) {
    return (
        <div className="card report-summary-strip" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 14 }}>
            {items.map(it => (
                <div key={it.label} className="rss-item">
                    <div className="rss-label" style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{it.label}</div>
                    <div className="rss-value" style={{ fontWeight: it.strong ? 700 : 600, fontSize: it.strong ? '1.1rem' : '0.95rem',
                                  color: it.strong ? '#1e40af' : '#0f172a' }}>{it.value}</div>
                </div>
            ))}
        </div>
    );
}
