import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Receipt, Save, Loader2, Check, ChevronRight, ChevronDown } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// ---------------------------------------------------------------------------
// Tax Invoice Tracker — same filter shape as Job Card Register, plus editable
// GST/PST invoice number and paid checkboxes per JC. Owner ask 2026-07-17.
// ---------------------------------------------------------------------------
export function TaxInvoiceTracker() {
    const [jobTypes, setJobTypes] = useState([]);

    useEffect(() => {
        axios.get('/api/workshop/job-types').then(r => setJobTypes(r.data || [])).catch(() => {});
    }, []);

    const selectStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' };

    const selectedBTSet = (params) => new Set(
        String(params.businessType || '')
            .split(',').map(s => s.trim()).filter(Boolean)
    );
    const toggleBusinessType = (params, updateParam, id) => {
        const set = selectedBTSet(params);
        const key = String(id);
        if (set.has(key)) set.delete(key); else set.add(key);
        updateParam('businessType', Array.from(set).join(','));
    };

    const printFilterSummary = (params) => {
        const parts = [];
        if (params.from && params.to) parts.push(`Finalized Period: ${params.from} → ${params.to}`);
        const btSet = selectedBTSet(params);
        if (btSet.size === 0) {
            parts.push('Business Type: All');
        } else {
            const labels = jobTypes
                .filter(t => btSet.has(String(t.JobCardTypeId)))
                .map(t => t.CardCode || t.Title);
            parts.push(`Business Type: ${labels.join(', ') || Array.from(btSet).join(', ')}`);
        }
        if (params.paymentMode === 'cash')       parts.push('Payment: Cash (incl. POS & Bank Transfer)');
        else if (params.paymentMode === 'credit') parts.push('Payment: Credit');
        else                                      parts.push('Payment: All');
        if (params.hasParts === 'with')          parts.push('Parts: With parts issued');
        else if (params.hasParts === 'without')  parts.push('Parts: Without parts issued');
        if (params.finalized === 'draft')       parts.push('Status: Draft only');
        else if (params.finalized === 'all')     parts.push('Status: All (incl. Draft)');
        else                                     parts.push('Status: Finalized only');
        return parts.join('  •  ');
    };

    const excelExport = (data, params) => ({
        filename: `tax-invoice-tracker-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: [
            'Card #', 'Finalized Date', 'Payment', 'Job Type',
            'Parts Amount', 'Labour+Sublet', 'GST', 'PST',
            'GST Invoice #', 'GST Paid', 'PST Invoice #', 'PST Paid',
            'Updated By', 'Updated At',
        ],
        rows: (data.rows || []).map(r => [
            r.JobCardNo,
            r.FinalizedAt || r.JobCardDate || '',
            r.Status || '',
            r.JobTypeCode || r.JobType || '',
            Number(r.PartsAmount || 0),
            Number(r.LabourSublet || 0),
            Number(r.GSTAmount || 0),
            Number(r.PSTAmount || 0),
            r.GSTInvoiceNo || '',
            r.GSTPaid ? 'Yes' : 'No',
            r.PSTInvoiceNo || '',
            r.PSTPaid ? 'Yes' : 'No',
            r.TaxUpdatedByName || '',
            r.TaxUpdatedAt || '',
        ]),
    });

    return (
        <ReportShell
            title="Tax Invoice Tracker"
            subtitle="Per Job Card GST/PST invoice numbers + paid status. Editable — changes save on Enter or when you click Save."
            icon={Receipt}
            endpoint="service/tax-invoice-tracker"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), businessType: '', paymentMode: '', finalized: 'finalized', hasParts: '' }}
            printFilterSummary={printFilterSummary}
            excelExport={excelExport}
            landscape
            superWide
            controls={({ params, updateParam }) => {
                const btSet = selectedBTSet(params);
                return (
                    <>
                        <PeriodControls params={params} updateParam={updateParam} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem', flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600 }}>Business Type:</span>
                            <div style={{
                                display: 'flex', flexWrap: 'wrap', gap: '4px 10px',
                                padding: '6px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
                                background: '#f8fafc', maxWidth: 520,
                            }}>
                                {jobTypes.length === 0 && <span style={{ color: '#94a3b8' }}>Loading…</span>}
                                {jobTypes.map(t => (
                                    <label key={t.JobCardTypeId} title={t.Title}
                                        style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', userSelect: 'none' }}>
                                        <input
                                            type="checkbox"
                                            checked={btSet.has(String(t.JobCardTypeId))}
                                            onChange={() => toggleBusinessType(params, updateParam, t.JobCardTypeId)}
                                        />
                                        <span style={{ fontFamily: 'monospace' }}>{t.CardCode || t.Title}</span>
                                    </label>
                                ))}
                                {btSet.size > 0 && (
                                    <button type="button"
                                        onClick={() => updateParam('businessType', '')}
                                        style={{
                                            background: 'none', border: 'none', cursor: 'pointer',
                                            color: '#64748b', fontSize: '0.75rem', padding: 0, marginLeft: 4,
                                        }}>
                                        Clear
                                    </button>
                                )}
                            </div>
                        </div>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                            Payment:
                            <select value={params.paymentMode || ''} onChange={e => updateParam('paymentMode', e.target.value)} style={selectStyle}>
                                <option value="">All</option>
                                <option value="cash">Cash (incl. POS &amp; Bank Transfer)</option>
                                <option value="credit">Credit</option>
                            </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                            Parts:
                            <select value={params.hasParts || ''} onChange={e => updateParam('hasParts', e.target.value)} style={selectStyle}>
                                <option value="">All</option>
                                <option value="with">With parts issued</option>
                                <option value="without">Without parts issued</option>
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
                );
            }}
        >
            {(data) => <TrackerTable initialRows={data.rows} totals={data.totals} />}
        </ReportShell>
    );
}

// ------------------------------- Table body ---------------------------------
function TrackerTable({ initialRows, totals }) {
    // Local mutable state so edits survive filter refreshes only for the
    // duration a row's edit is in flight. On a re-fetch we adopt the fresh
    // server-side values.
    const [rows, setRows] = useState(initialRows);
    useEffect(() => { setRows(initialRows); }, [initialRows]);

    // expanded[JobCardId] = 'gst' | 'pst' | null. Only one expansion per row.
    const [expanded, setExpanded] = useState({});
    // linesCache[JobCardId] = { parts, labour, sublet } | 'loading' | 'error:msg'
    const [linesCache, setLinesCache] = useState({});

    const toggleExpand = async (jobCardId, kind) => {
        setExpanded(prev => ({ ...prev, [jobCardId]: prev[jobCardId] === kind ? null : kind }));
        if (!linesCache[jobCardId]) {
            setLinesCache(prev => ({ ...prev, [jobCardId]: 'loading' }));
            try {
                const r = await axios.get(`/api/reports/service/tax-invoice-tracker/${jobCardId}/lines`);
                setLinesCache(prev => ({ ...prev, [jobCardId]: r.data }));
            } catch (e) {
                setLinesCache(prev => ({ ...prev, [jobCardId]: 'error:' + (e.response?.data?.error || e.message) }));
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
            const r = await axios.patch(`/api/reports/service/tax-invoice-tracker/${row.JobCardId}`, {
                GSTInvoiceNo: row.GSTInvoiceNo || '',
                PSTInvoiceNo: row.PSTInvoiceNo || '',
                GSTPaid:      !!row.GSTPaid,
                PSTPaid:      !!row.PSTPaid,
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
                { label: 'Cards',        value: fmtInt(totals.count) },
                { label: 'Parts',        value: 'PKR ' + fmt(totals.partsAmount) },
                { label: 'Labour+Sublet',value: 'PKR ' + fmt(totals.labourSublet) },
                { label: 'GST',          value: 'PKR ' + fmt(totals.gstAmount) },
                { label: 'PST',          value: 'PKR ' + fmt(totals.pstAmount) },
                { label: 'GST Paid',     value: `${fmtInt(totals.gstPaidCount)} / ${fmtInt(totals.count)}` },
                { label: 'PST Paid',     value: `${fmtInt(totals.pstPaidCount)} / ${fmtInt(totals.count)}`, strong: true },
            ]} />
            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={tableStyle}>
                    <thead>
                        <tr style={trHeader}>
                            <TH>Card #</TH><TH>Finalized</TH><TH>Payment</TH><TH>Type</TH>
                            <TH align="right">Parts</TH>
                            <TH align="right">Labour + Sublet</TH>
                            <TH align="right">GST</TH>
                            <TH align="right">PST</TH>
                            <TH>GST Invoice #</TH>
                            <TH align="center">GST Paid</TH>
                            <TH>PST Invoice #</TH>
                            <TH align="center">PST Paid</TH>
                            <TH align="center" width={90}>Save</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 && (
                            <tr><td colSpan={13} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                No job cards in this period.
                            </td></tr>
                        )}
                        {rows.map((r, i) => {
                            const expandKind = expanded[r.JobCardId];
                            const cachedLines = linesCache[r.JobCardId];
                            return (
                            <React.Fragment key={r.JobCardId}>
                            <tr style={trBody}>
                                <TD mono><strong>{r.JobCardNo}</strong></TD>
                                <TD>{r.FinalizedAt || r.JobCardDate || '—'}</TD>
                                <TD>{r.Status}</TD>
                                <TD mono color="#64748b">{r.JobTypeCode}</TD>
                                <TD align="right" mono>{fmt(r.PartsAmount)}</TD>
                                <TD align="right" mono>{fmt(r.LabourSublet)}</TD>
                                <TD align="right" mono>
                                    <button type="button" onClick={() => toggleExpand(r.JobCardId, 'gst')}
                                        title="Show parts (GST base)" style={expandBtn}>
                                        {expandKind === 'gst' ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                        <span style={{ color: '#1d4ed8' }}>{fmt(r.GSTAmount)}</span>
                                    </button>
                                </TD>
                                <TD align="right" mono>
                                    <button type="button" onClick={() => toggleExpand(r.JobCardId, 'pst')}
                                        title="Show labour + sublet (PST base)" style={expandBtn}>
                                        {expandKind === 'pst' ? <ChevronDown size={12}/> : <ChevronRight size={12}/>}
                                        <span style={{ color: '#1d4ed8' }}>{fmt(r.PSTAmount)}</span>
                                    </button>
                                </TD>
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
                                <TD>
                                    <input type="text" value={r.PSTInvoiceNo || ''}
                                        onChange={e => updateLocal(i, { PSTInvoiceNo: e.target.value })}
                                        onKeyDown={e => e.key === 'Enter' && saveRow(i)}
                                        placeholder="—"
                                        style={inputCell} />
                                </TD>
                                <TD align="center">
                                    <input type="checkbox" checked={!!r.PSTPaid}
                                        onChange={e => updateLocal(i, { PSTPaid: e.target.checked })} />
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
                            {expandKind && (
                                <tr>
                                    <td colSpan={13} style={{ padding: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                        <LinesSubRow kind={expandKind} lines={cachedLines} />
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
                                <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Totals — {fmtInt(totals.count)} cards</td>
                                <TD align="right" bold>{fmt(totals.partsAmount)}</TD>
                                <TD align="right" bold>{fmt(totals.labourSublet)}</TD>
                                <TD align="right" bold>{fmt(totals.gstAmount)}</TD>
                                <TD align="right" bold>{fmt(totals.pstAmount)}</TD>
                                <td colSpan={5}></td>
                            </tr>
                        </tfoot>
                    )}
                </table>
            </div>
        </>
    );
}

// ---------- Expandable sub-row: parts (GST) or labour+sublet (PST) ----------
function LinesSubRow({ kind, lines }) {
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

    if (kind === 'gst') {
        const parts = lines.parts || [];
        if (parts.length === 0) return <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>No parts issued on this Job Card.</div>;
        return (
            <div style={{ padding: '8px 16px' }}>
                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
                    Parts issued (GST base)
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                    <thead>
                        <tr style={{ background: '#eef2ff', borderBottom: '1px solid #cbd5e1' }}>
                            <TH>Item Code</TH><TH>Part #</TH><TH>Item Name</TH>
                            <TH align="right">Qty</TH>
                            <TH align="right">Sale Rate</TH>
                            <TH align="right">Discount</TH>
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
                                <TD align="right" mono color="#1d4ed8">{fmt(p.TaxAmount)}</TD>
                                <TD align="right" mono bold>{fmt(p.LineTotal)}</TD>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        );
    }

    // kind === 'pst'
    const labour = lines.labour || [];
    const sublet = lines.sublet || [];
    if (labour.length === 0 && sublet.length === 0) {
        return <div style={{ padding: 12, color: '#94a3b8', fontSize: '0.8rem', fontStyle: 'italic' }}>No labour or sublet lines on this Job Card.</div>;
    }
    return (
        <div style={{ padding: '8px 16px' }}>
            {labour.length > 0 && (
                <>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
                        Labour / Services (PST base)
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem', marginBottom: 8 }}>
                        <thead>
                            <tr style={{ background: '#eef2ff', borderBottom: '1px solid #cbd5e1' }}>
                                <TH>Description</TH>
                                <TH align="right">Qty</TH>
                                <TH align="right">Price</TH>
                                <TH align="right">Discount</TH>
                                <TH align="right">PST</TH>
                                <TH align="right">Line Total</TH>
                            </tr>
                        </thead>
                        <tbody>
                            {labour.map((l, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <TD>{l.Description || '—'}</TD>
                                    <TD align="right" mono>{fmt(l.Quantity)}</TD>
                                    <TD align="right" mono>{fmt(l.Price)}</TD>
                                    <TD align="right" mono color={l.Discount > 0 ? '#b45309' : undefined}>
                                        {l.Discount > 0 ? fmt(l.Discount) : '—'}
                                    </TD>
                                    <TD align="right" mono color="#1d4ed8">{fmt(l.TaxAmount)}</TD>
                                    <TD align="right" mono bold>{fmt(l.LineTotal)}</TD>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
            {sublet.length > 0 && (
                <>
                    <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', marginBottom: 4, fontWeight: 600 }}>
                        Sublet (PST base)
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                        <thead>
                            <tr style={{ background: '#eef2ff', borderBottom: '1px solid #cbd5e1' }}>
                                <TH>Vendor</TH>
                                <TH>Description</TH>
                                <TH align="right">Payable</TH>
                                <TH align="right">PST</TH>
                                <TH align="right">Line Total</TH>
                            </tr>
                        </thead>
                        <tbody>
                            {sublet.map((s, i) => (
                                <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <TD>{s.VendorName || '—'}</TD>
                                    <TD>{s.Description || '—'}</TD>
                                    <TD align="right" mono>{fmt(s.PayableAmount)}</TD>
                                    <TD align="right" mono color="#1d4ed8">{fmt(s.TaxAmount)}</TD>
                                    <TD align="right" mono bold>{fmt(s.LineTotal)}</TD>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </>
            )}
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
