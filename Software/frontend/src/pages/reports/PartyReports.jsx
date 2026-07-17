import React, { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import { Search, Users, Wallet, ChevronDown, ChevronRight } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, PeriodControls, DateInput } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// ─────────────────────────────────────────────────────────────────────────────
// Shared: party picker (typeahead → resolves to a PartyID string in params)
// ─────────────────────────────────────────────────────────────────────────────
function PartyPicker({ params, updateParam, labelKey = 'partyId' }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selectedName, setSelectedName] = useState('');
    const [open, setOpen] = useState(false);

    // If the URL already has a PartyID (e.g. bookmarked) and no name yet, fetch it.
    useEffect(() => {
        if (!params[labelKey] || selectedName) return;
        axios.get('/api/reports/parties', { params: { search: '' } })
            .then(r => {
                const p = (r.data || []).find(x => String(x.PartyID) === String(params[labelKey]));
                if (p) setSelectedName(p.PartyName);
            })
            .catch(() => {});
    }, [params, labelKey, selectedName]);

    const doSearch = useCallback(async (v) => {
        setQuery(v);
        try {
            const r = await axios.get('/api/reports/parties', { params: { search: v } });
            setResults(r.data || []);
        } catch { setResults([]); }
    }, []);

    return (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
            <Search size={14} color="#64748b" />
            <input
                type="search"
                placeholder={selectedName || 'Search party name / CNIC / phone…'}
                value={query}
                onFocus={() => { setOpen(true); if (!results.length) doSearch(''); }}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                onChange={e => doSearch(e.target.value)}
                style={{
                    padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6,
                    fontSize: '0.875rem', minWidth: 260,
                }}
            />
            {params[labelKey] && (
                <button type="button"
                    onClick={() => { updateParam(labelKey, ''); setSelectedName(''); setQuery(''); }}
                    title="Clear"
                    style={{
                        background: 'none', border: 'none', color: '#64748b',
                        cursor: 'pointer', padding: 0, fontSize: '0.8rem',
                    }}>
                    Clear
                </button>
            )}
            {open && results.length > 0 && (
                <div style={{
                    position: 'absolute', top: '100%', left: 20, right: 0,
                    background: '#fff', border: '1px solid #cbd5e1', borderRadius: 6,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.08)', zIndex: 20,
                    maxHeight: 260, overflowY: 'auto', marginTop: 4, minWidth: 320,
                }}>
                    {results.map(p => (
                        <div key={p.PartyID}
                            onMouseDown={() => {
                                updateParam(labelKey, String(p.PartyID));
                                setSelectedName(p.PartyName);
                                setQuery('');
                                setOpen(false);
                            }}
                            style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.85rem' }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f0f9ff'}
                            onMouseLeave={e => e.currentTarget.style.background = ''}>
                            <div style={{ fontWeight: 600 }}>{p.PartyName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {[p.PhoneOne, p.CNIC].filter(Boolean).join(' · ')}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 1: Party Open Invoices
// ─────────────────────────────────────────────────────────────────────────────
export function PartyOpenInvoices() {
    const excelExport = (data, params) => ({
        filename: `party-open-invoices-${params.partyId || 'party'}-as-of-${params.asOf || 'today'}.csv`,
        headers: ['Doc Type', 'Doc No', 'Voucher', 'Invoice Date', 'Vehicle', 'Invoiced', 'Paid', 'Outstanding', 'Age (days)', 'Bucket'],
        rows: (data.rows || []).map(r => [
            r.DocType, r.DocNo, r.VoucherNo, r.InvoiceDate || '', r.VehicleRegNo || '',
            Number(r.Invoiced), Number(r.Paid), Number(r.Outstanding),
            r.AgeDays, r.Bucket,
        ]),
    });
    return (
        <ReportShell
            title="Party Open Invoices"
            subtitle="Search a party — every unpaid credit Job Card or Store Sale with days-outstanding and aging bucket."
            icon={Users}
            endpoint="party-open-invoices"
            defaultParams={{ partyId: '', asOf: todayISO() }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <PartyPicker params={params} updateParam={updateParam} />
                    <DateInput label="As of" value={params.asOf} onChange={v => updateParam('asOf', v)} />
                </>
            )}
        >
            {(data) => {
                if (!data.party) {
                    return <div className="card" style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>Pick a party to see their open invoices.</div>;
                }
                return (
                    <>
                        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
                            <div>
                                <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{data.asOf}</div>
                                <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>{data.party.PartyName}</div>
                                <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                    {[data.party.PartyType, data.party.PhoneOne, data.party.CNIC].filter(Boolean).join(' · ')}
                                    {data.party.PartyGLCode && ` · GL ${data.party.PartyGLCode} (${data.party.PartyGLTitle})`}
                                </div>
                            </div>
                            <div style={{ display: 'flex', gap: 12 }}>
                                {['current', 'b31_60', 'b61_90', 'b90plus'].map(k => (
                                    <div key={k} style={{ background: k === 'b90plus' ? '#fee2e2' : '#f1f5f9', padding: '8px 12px', borderRadius: 6, minWidth: 100 }}>
                                        <div style={{ fontSize: '0.7rem', color: k === 'b90plus' ? '#b91c1c' : '#64748b', textTransform: 'uppercase' }}>
                                            {k === 'current' ? '0–30' : k === 'b31_60' ? '31–60' : k === 'b61_90' ? '61–90' : '90+'}
                                        </div>
                                        <div style={{ fontWeight: 700, color: k === 'b90plus' ? '#b91c1c' : undefined }}>{fmt(data.totals[k])}</div>
                                    </div>
                                ))}
                                <div style={{ background: '#1e40af', color: 'white', padding: '8px 12px', borderRadius: 6, minWidth: 120 }}>
                                    <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Total Outstanding</div>
                                    <div style={{ fontWeight: 700, fontSize: '1rem' }}>PKR {fmt(data.totals.outstanding)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="card" style={{ overflowX: 'auto' }}>
                            {data.rows.length === 0 ? (
                                <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                    No open invoices for this party as of {data.asOf}. All settled.
                                </div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <TH>Doc Type</TH><TH>Doc #</TH><TH>Voucher</TH>
                                            <TH>Invoice Date</TH><TH>Vehicle</TH>
                                            <TH align="right">Invoiced</TH>
                                            <TH align="right">Paid</TH>
                                            <TH align="right">Outstanding</TH>
                                            <TH align="right">Age (days)</TH>
                                            <TH align="center">Bucket</TH>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.rows.map(r => (
                                            <tr key={r.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <TD>{r.DocType}</TD>
                                                <TD mono><strong>{r.DocNo}</strong></TD>
                                                <TD mono color="#64748b">{r.VoucherNo}</TD>
                                                <TD>{r.InvoiceDate || '—'}</TD>
                                                <TD mono>{r.VehicleRegNo}</TD>
                                                <TD align="right" mono>{fmt(r.Invoiced)}</TD>
                                                <TD align="right" mono color={r.Paid > 0 ? '#15803d' : undefined}>{fmt(r.Paid)}</TD>
                                                <TD align="right" mono bold>{fmt(r.Outstanding)}</TD>
                                                <TD align="right" mono>{r.AgeDays}</TD>
                                                <TD align="center">
                                                    <BucketBadge b={r.Bucket} />
                                                </TD>
                                            </tr>
                                        ))}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td colSpan={5} style={{ padding: 12, fontWeight: 700 }}>Totals — {data.rows.length} invoices</td>
                                            <TD align="right" bold>{fmt(data.totals.invoiced)}</TD>
                                            <TD align="right" bold>{fmt(data.totals.paid)}</TD>
                                            <TD align="right" bold>{fmt(data.totals.outstanding)}</TD>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            )}
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}

function BucketBadge({ b }) {
    const labels = { current: '0–30', b31_60: '31–60', b61_90: '61–90', b90plus: '90+' };
    const colors = {
        current: { bg: '#dcfce7', fg: '#166534' },
        b31_60:  { bg: '#fef3c7', fg: '#854d0e' },
        b61_90:  { bg: '#fed7aa', fg: '#9a3412' },
        b90plus: { bg: '#fecaca', fg: '#991b1b' },
    };
    const c = colors[b] || colors.current;
    return (
        <span style={{
            background: c.bg, color: c.fg, padding: '2px 8px', borderRadius: 99,
            fontSize: '0.72rem', fontWeight: 700,
        }}>{labels[b]}</span>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Report 2: Store Sale Receivables — parties who owe us money on credit
//           store sales. Grouped by party; expand to see each open SS invoice.
// ─────────────────────────────────────────────────────────────────────────────
export function StoreSaleReceivables() {
    const [expanded, setExpanded] = useState({});
    const toggle = (id) => setExpanded(p => ({ ...p, [id]: !p[id] }));

    const excelExport = (data, params) => ({
        filename: `store-sale-receivables-as-of-${params.asOf || 'today'}.csv`,
        headers: ['Party', 'Party Type', 'Sale Invoice #', 'Voucher #', 'Invoice Date', 'Invoiced', 'Paid', 'Outstanding', 'Age (days)', 'Bucket'],
        rows: (data.rows || []).flatMap(g =>
            g.Invoices.map(inv => [
                g.PartyName, g.PartyType || '', inv.SaleInvoiceNo, inv.VoucherNo,
                inv.InvoiceDate || '',
                Number(inv.Invoiced), Number(inv.Paid), Number(inv.Outstanding),
                inv.AgeDays, inv.Bucket,
            ])
        ),
    });

    return (
        <ReportShell
            title="Store Sale Receivables"
            subtitle="Money owed FROM parties on credit store sales. One row per party — expand to see each open SS invoice with aging."
            icon={Wallet}
            endpoint="store-sale-receivables"
            defaultParams={{ asOf: todayISO(), partyId: '' }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <DateInput label="As of" value={params.asOf} onChange={v => updateParam('asOf', v)} />
                    <PartyPicker params={params} updateParam={updateParam} />
                </>
            )}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 20, justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{data.asOf}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.15rem' }}>
                                {fmtInt(data.totals.parties)} parties · {fmtInt(data.totals.invoices)} open invoices
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 12 }}>
                            {['current', 'b31_60', 'b61_90', 'b90plus'].map(k => (
                                <div key={k} style={{ background: k === 'b90plus' ? '#fee2e2' : '#f1f5f9', padding: '8px 12px', borderRadius: 6, minWidth: 100 }}>
                                    <div style={{ fontSize: '0.7rem', color: k === 'b90plus' ? '#b91c1c' : '#64748b', textTransform: 'uppercase' }}>
                                        {k === 'current' ? '0–30' : k === 'b31_60' ? '31–60' : k === 'b61_90' ? '61–90' : '90+'}
                                    </div>
                                    <div style={{ fontWeight: 700, color: k === 'b90plus' ? '#b91c1c' : undefined }}>{fmt(data.totals[k])}</div>
                                </div>
                            ))}
                            <div style={{ background: '#1e40af', color: 'white', padding: '8px 12px', borderRadius: 6, minWidth: 120 }}>
                                <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>Total Outstanding</div>
                                <div style={{ fontWeight: 700, fontSize: '1rem' }}>PKR {fmt(data.totals.outstanding)}</div>
                            </div>
                        </div>
                    </div>
                    <div className="card" style={{ overflowX: 'auto' }}>
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                No outstanding store-sale receivables as of {data.asOf}. All settled.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH width={30}></TH>
                                        <TH>Party</TH>
                                        <TH>Type</TH>
                                        <TH align="right">Invoices</TH>
                                        <TH align="right">0–30</TH>
                                        <TH align="right">31–60</TH>
                                        <TH align="right">61–90</TH>
                                        <TH align="right">90+</TH>
                                        <TH align="right">Outstanding</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(g => (
                                        <React.Fragment key={g.PartyID}>
                                            <tr style={{ borderBottom: '1px solid #f1f5f9', background: expanded[g.PartyID] ? '#f0f9ff' : undefined }}>
                                                <TD>
                                                    <button type="button" onClick={() => toggle(g.PartyID)}
                                                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, color: '#64748b' }}>
                                                        {expanded[g.PartyID] ? <ChevronDown size={14}/> : <ChevronRight size={14}/>}
                                                    </button>
                                                </TD>
                                                <TD><strong>{g.PartyName}</strong></TD>
                                                <TD color="#64748b">{g.PartyType || '—'}</TD>
                                                <TD align="right" mono>{fmtInt(g.Invoices.length)}</TD>
                                                <TD align="right" mono>{fmt(g.Buckets.current)}</TD>
                                                <TD align="right" mono>{fmt(g.Buckets.b31_60)}</TD>
                                                <TD align="right" mono>{fmt(g.Buckets.b61_90)}</TD>
                                                <TD align="right" mono color={g.Buckets.b90plus > 0 ? '#b91c1c' : undefined} bold={g.Buckets.b90plus > 0}>
                                                    {fmt(g.Buckets.b90plus)}
                                                </TD>
                                                <TD align="right" mono bold>{fmt(g.TotalOutstanding)}</TD>
                                            </tr>
                                            {expanded[g.PartyID] && (
                                                <tr>
                                                    <td colSpan={9} style={{ padding: 0, background: '#f8fafc' }}>
                                                        <div style={{ padding: '8px 16px' }}>
                                                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                                                <thead>
                                                                    <tr style={{ background: '#eef2ff', borderBottom: '1px solid #cbd5e1' }}>
                                                                        <TH>Sale Invoice #</TH>
                                                                        <TH>Voucher #</TH>
                                                                        <TH>Invoice Date</TH>
                                                                        <TH align="right">Invoiced</TH>
                                                                        <TH align="right">Paid</TH>
                                                                        <TH align="right">Outstanding</TH>
                                                                        <TH align="right">Age</TH>
                                                                        <TH align="center">Bucket</TH>
                                                                    </tr>
                                                                </thead>
                                                                <tbody>
                                                                    {g.Invoices.map(inv => (
                                                                        <tr key={inv.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                                            <TD mono><strong>{inv.SaleInvoiceNo || '—'}</strong></TD>
                                                                            <TD mono color="#64748b">{inv.VoucherNo}</TD>
                                                                            <TD>{inv.InvoiceDate || '—'}</TD>
                                                                            <TD align="right" mono>{fmt(inv.Invoiced)}</TD>
                                                                            <TD align="right" mono color={inv.Paid > 0 ? '#15803d' : undefined}>{fmt(inv.Paid)}</TD>
                                                                            <TD align="right" mono bold>{fmt(inv.Outstanding)}</TD>
                                                                            <TD align="right" mono>{inv.AgeDays}</TD>
                                                                            <TD align="center"><BucketBadge b={inv.Bucket} /></TD>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={3} style={{ padding: 12, fontWeight: 700 }}>Grand Total</td>
                                        <TD align="right" bold>{fmtInt(data.totals.invoices)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.current)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.b31_60)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.b61_90)}</TD>
                                        <TD align="right" bold color={data.totals.b90plus > 0 ? '#b91c1c' : undefined}>{fmt(data.totals.b90plus)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.outstanding)}</TD>
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
