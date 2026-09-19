/**
 * Reports by party category — Individual / Corporate / Insurance / Master Motors.
 * Owner ask 2026-09-19.
 *
 *   Unpaid by Party Category  — who owes what, with aging, by kind of party.
 *   Recovery by Party Category — what actually came back in a period.
 *
 * The category itself is set on Parties > Party Categories.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Users, Wallet, ChevronRight, ChevronDown, Loader2 } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, DateInput } from './ReportShell';

const CATEGORIES = [
    { key: 'ALL',          label: 'All categories' },
    { key: 'Individual',   label: 'Individual' },
    { key: 'Corporate',    label: 'Corporate' },
    { key: 'Insurance',    label: 'Insurance' },
    { key: 'MasterMotors', label: 'Master Motors' },
    { key: 'Unclassified', label: 'Not classified yet' },
];

const CAT_COLOR = {
    Individual:   '#0f766e',
    Corporate:    '#1d4ed8',
    Insurance:    '#b45309',
    MasterMotors: '#7c3aed',
    Unclassified: '#64748b',
};

function CategorySelect({ value, onChange }) {
    return (
        <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: '0.75rem', color: '#475569' }}>
            Party category
            <select value={value || 'ALL'} onChange={e => onChange(e.target.value)}
                    style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem', minWidth: 170 }}>
                {CATEGORIES.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
            </select>
        </label>
    );
}

function CategoryCards({ list, valueKey, label }) {
    if (!list?.length) return null;
    return (
        <div className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            {list.map(c => (
                <div key={c.Category} style={{ flex: '1 1 160px', padding: '10px 12px', borderRadius: 8,
                                               background: '#f8fafc', borderLeft: `4px solid ${CAT_COLOR[c.Category] || '#94a3b8'}` }}>
                    <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#64748b' }}>{c.CategoryLabel}</div>
                    <div style={{ fontWeight: 700, fontSize: '1.05rem' }}>PKR {fmt(c[valueKey])}</div>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{c.parties} {c.parties === 1 ? 'party' : 'parties'}{label ? ` · ${label(c)}` : ''}</div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Unpaid job cards / store sales, by party category
// ─────────────────────────────────────────────────────────────────────────────
export function UnpaidByPartyCategory() {
    const excelExport = (data, params) => ({
        filename: `unpaid-by-category-${params.category || 'all'}-as-of-${params.asOf || 'today'}.csv`,
        headers: ['Category', 'Party', 'Party Type', 'Invoices', 'Invoiced', 'Paid', 'Outstanding',
                  'Job Cards Due', 'Store Sales Due', '0-30', '31-60', '61-90', '90+', 'Oldest (days)'],
        rows: (data.rows || []).map(r => [
            r.CategoryLabel, r.PartyName, r.PartyType, r.InvoiceCount,
            Number(r.Invoiced), Number(r.Paid), Number(r.Outstanding),
            Number(r.JobCardDue), Number(r.StoreSaleDue),
            Number(r.current), Number(r.b31_60), Number(r.b61_90), Number(r.b90plus), r.OldestDays,
        ]),
    });

    return (
        <ReportShell
            title="Unpaid by Party Category"
            subtitle="Every party with an unpaid job card or store sale — what was invoiced, what they have paid against it, what is left and how old it is. Grouped by Individual / Corporate / Insurance / Master Motors."
            icon={Users}
            endpoint="party-outstanding-by-type"
            defaultParams={{ asOf: todayISO(), category: 'ALL' }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <DateInput label="As of" value={params.asOf} onChange={v => updateParam('asOf', v)} />
                    <CategorySelect value={params.category} onChange={v => updateParam('category', v)} />
                </>
            )}
        >
            {(data, params) => (
                <>
                    <CategoryCards list={data.byCategory} valueKey="outstanding"
                                   label={(c) => `${fmt(c.paid)} paid of ${fmt(c.invoiced)}`} />

                    <div className="card" style={{ overflowX: 'auto' }}>
                        {(!data.rows || data.rows.length === 0) ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                Nothing outstanding in this category as of {data.asOf}.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Category</TH><TH>Party</TH>
                                        <TH align="right">Invoices</TH>
                                        <TH align="right">Invoiced</TH>
                                        <TH align="right">Paid</TH>
                                        <TH align="right">Outstanding</TH>
                                        <TH align="right">0–30</TH>
                                        <TH align="right">31–60</TH>
                                        <TH align="right">61–90</TH>
                                        <TH align="right">90+</TH>
                                        <TH align="right">Oldest</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <PartyRow key={r.PartyID} row={r} asOf={params?.asOf || data.asOf} />
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>
                                            Totals — {data.totals.parties} parties
                                        </td>
                                        <TD align="right" bold>{data.totals.invoices}</TD>
                                        <TD align="right" bold>{fmt(data.totals.invoiced)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.paid)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.outstanding)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.current)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.b31_60)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.b61_90)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.b90plus)}</TD>
                                        <td></td>
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

/** One party, expanding to the invoices behind its balance. */
function PartyRow({ row, asOf }) {
    const [open, setOpen] = useState(false);
    const [detail, setDetail] = useState(null);
    const [busy, setBusy] = useState(false);

    const toggle = async () => {
        const next = !open;
        setOpen(next);
        if (next && !detail) {
            setBusy(true);
            try {
                const { data } = await axios.get('/api/reports/party-open-invoices',
                    { params: { partyId: row.PartyID, asOf } });
                setDetail(data.rows || []);
            } catch { setDetail([]); }
            setBusy(false);
        }
    };

    return (
        <>
            <tr style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }} onClick={toggle}>
                <TD>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                                   color: CAT_COLOR[row.Category] || '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                        {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                        {row.CategoryLabel}
                    </span>
                </TD>
                <TD>
                    <strong>{row.PartyName}</strong>
                    <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {row.PartyType}
                        {row.JobCardDue > 0 && ` · job cards ${fmt(row.JobCardDue)}`}
                        {row.StoreSaleDue > 0 && ` · store sales ${fmt(row.StoreSaleDue)}`}
                    </div>
                </TD>
                <TD align="right">{row.InvoiceCount}</TD>
                <TD align="right" mono>{fmt(row.Invoiced)}</TD>
                <TD align="right" mono color={row.Paid > 0 ? '#15803d' : undefined}>{fmt(row.Paid)}</TD>
                <TD align="right" mono bold>{fmt(row.Outstanding)}</TD>
                <TD align="right" mono>{fmt(row.current)}</TD>
                <TD align="right" mono>{fmt(row.b31_60)}</TD>
                <TD align="right" mono>{fmt(row.b61_90)}</TD>
                <TD align="right" mono color={row.b90plus > 0 ? '#b91c1c' : undefined}>{fmt(row.b90plus)}</TD>
                <TD align="right">{row.OldestDays}d</TD>
            </tr>
            {open && (
                <tr>
                    <td colSpan={11} style={{ background: '#f8fafc', padding: '8px 16px 14px 38px' }}>
                        {busy ? (
                            <div style={{ color: '#64748b', fontSize: '0.8rem' }}>
                                <Loader2 size={13} className="animate-spin" style={{ verticalAlign: 'middle' }} /> Loading invoices…
                            </div>
                        ) : !detail?.length ? (
                            <div style={{ color: '#94a3b8', fontSize: '0.8rem' }}>No invoice detail.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem' }}>
                                <thead>
                                    <tr style={{ color: '#64748b', textAlign: 'left' }}>
                                        <th style={{ padding: 4 }}>Doc</th>
                                        <th style={{ padding: 4 }}>Voucher</th>
                                        <th style={{ padding: 4 }}>Date</th>
                                        <th style={{ padding: 4 }}>Vehicle</th>
                                        <th style={{ padding: 4 }}>Claim #</th>
                                        <th style={{ padding: 4, textAlign: 'right' }}>Invoiced</th>
                                        <th style={{ padding: 4, textAlign: 'right' }}>Paid</th>
                                        <th style={{ padding: 4, textAlign: 'right' }}>Outstanding</th>
                                        <th style={{ padding: 4, textAlign: 'right' }}>Age</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {detail.map(d => (
                                        <tr key={d.VoucherID} style={{ borderTop: '1px solid #e2e8f0' }}>
                                            <td style={{ padding: 4 }}>{d.DocType} {d.DocNo}</td>
                                            <td style={{ padding: 4, color: '#64748b' }}>{d.VoucherNo}</td>
                                            <td style={{ padding: 4 }}>{d.InvoiceDate}</td>
                                            <td style={{ padding: 4 }}>{d.VehicleRegNo || '—'}</td>
                                            <td style={{ padding: 4 }}>{d.ClaimNo || '—'}</td>
                                            <td style={{ padding: 4, textAlign: 'right' }}>{fmt(d.Invoiced)}</td>
                                            <td style={{ padding: 4, textAlign: 'right' }}>{fmt(d.Paid)}</td>
                                            <td style={{ padding: 4, textAlign: 'right', fontWeight: 600 }}>{fmt(d.Outstanding)}</td>
                                            <td style={{ padding: 4, textAlign: 'right' }}>{d.AgeDays}d</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// Recovery by party category
// ─────────────────────────────────────────────────────────────────────────────
export function RecoveryByPartyCategory() {
    const excelExport = (data, params) => ({
        filename: `recovery-by-category-${params.category || 'all'}-${params.from}-to-${params.to}.csv`,
        headers: ['Category', 'Party', 'Party Type', 'Recovered', 'From Job Cards', 'From Store Sales',
                  'Receipts', 'Invoices Settled', 'Last Receipt'],
        rows: (data.rows || []).map(r => [
            r.CategoryLabel, r.PartyName, r.PartyType,
            Number(r.Recovered), Number(r.FromJobCards), Number(r.FromStoreSales),
            r.Receipts, r.InvoicesSettled, r.LastReceiptDate || '',
        ]),
    });

    const firstOfMonth = () => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); };

    return (
        <ReportShell
            title="Recovery by Party Category"
            subtitle="What was actually recovered in the period — receipts matched against a job card or store sale — grouped by kind of party."
            icon={Wallet}
            endpoint="recovery-by-type"
            defaultParams={{ from: firstOfMonth(), to: todayISO(), category: 'ALL' }}
            excelExport={excelExport}
            controls={({ params, updateParam }) => (
                <>
                    <DateInput label="From" value={params.from} onChange={v => updateParam('from', v)} />
                    <DateInput label="To"   value={params.to}   onChange={v => updateParam('to', v)} />
                    <CategorySelect value={params.category} onChange={v => updateParam('category', v)} />
                </>
            )}
        >
            {(data) => (
                <>
                    <CategoryCards list={data.byCategory} valueKey="recovered"
                                   label={(c) => `${c.receipts} ${c.receipts === 1 ? 'receipt' : 'receipts'}`} />

                    {data.unallocated?.amount > 0 && (
                        <div className="card" style={{ background: '#fffbeb', border: '1px solid #fde68a', fontSize: '0.82rem', color: '#92400e' }}>
                            <strong>PKR {fmt(data.unallocated.amount)}</strong> came in from parties in this period across
                            {' '}{data.unallocated.receipts} receipt{data.unallocated.receipts === 1 ? '' : 's'} but was never matched to a
                            job card or store sale, so it is <strong>not counted</strong> in the figures below. Allocate those
                            receipts against their invoices to see them here.
                        </div>
                    )}

                    <div className="card" style={{ overflowX: 'auto' }}>
                        {(!data.rows || data.rows.length === 0) ? (
                            <div style={{ padding: 32, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                Nothing recovered against invoices between {data.from} and {data.to}.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Category</TH><TH>Party</TH>
                                        <TH align="right">Recovered</TH>
                                        <TH align="right">From Job Cards</TH>
                                        <TH align="right">From Store Sales</TH>
                                        <TH align="right">Receipts</TH>
                                        <TH align="right">Invoices settled</TH>
                                        <TH>Last receipt</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => (
                                        <tr key={r.PartyID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD>
                                                <span style={{ color: CAT_COLOR[r.Category] || '#64748b', fontWeight: 600, fontSize: '0.78rem' }}>
                                                    {r.CategoryLabel}
                                                </span>
                                            </TD>
                                            <TD>
                                                <strong>{r.PartyName}</strong>
                                                <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.PartyType}</div>
                                            </TD>
                                            <TD align="right" mono bold color="#15803d">{fmt(r.Recovered)}</TD>
                                            <TD align="right" mono>{fmt(r.FromJobCards)}</TD>
                                            <TD align="right" mono>{fmt(r.FromStoreSales)}</TD>
                                            <TD align="right">{r.Receipts}</TD>
                                            <TD align="right">{r.InvoicesSettled}</TD>
                                            <TD>{r.LastReceiptDate || '—'}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>
                                            Totals — {data.totals.parties} parties
                                        </td>
                                        <TD align="right" bold>{fmt(data.totals.recovered)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.fromJobCards)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.fromStoreSales)}</TD>
                                        <td colSpan={3}></td>
                                    </tr>
                                </tfoot>
                            </table>
                        )}
                    </div>

                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', padding: '0 4px' }}>
                        Categories are set on <Link to="/parties/categories" style={{ color: '#1e40af' }}>Parties › Party Categories</Link>.
                    </div>
                </>
            )}
        </ReportShell>
    );
}
