import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Users, ArrowLeft, Loader2 } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, DateInput } from './ReportShell';

const yearStart = () => `${new Date().getFullYear()}-01-01`;

/**
 * Trade Receivables Sub-Ledger (owner ask 2026-09-10).
 *
 * The trial-balance extract of one receivables group — 102008 TRADE
 * RECEIVABLES - PARTS PARTIES by default — with each party's ledger one click
 * away, in the same page.
 *
 * The ledger is opened inline rather than by linking to GL Detail on purpose:
 * GL Detail can open ANY account, so linking there would mean granting a
 * manager the whole general ledger just to chase parts debtors. Everything
 * here is scoped to the receivables groups server-side.
 */
export function ReceivablesSubLedger() {
    const [groups, setGroups] = useState([]);
    useEffect(() => {
        axios.get('/api/reports/receivables-subledger/groups')
            .then(r => setGroups(r.data?.groups || []))
            .catch(() => setGroups([]));
    }, []);

    // Inline ledger drill-down state
    const [ledger, setLedger] = useState(null);       // { account, lines, ... }
    const [ledgerLoading, setLedgerLoading] = useState(false);
    const [ledgerErr, setLedgerErr] = useState('');

    const openLedger = async (glcaid, from, to) => {
        setLedgerLoading(true); setLedgerErr(''); setLedger(null);
        try {
            const r = await axios.get('/api/reports/receivables-subledger/ledger',
                                      { params: { glcaid, from, to } });
            setLedger(r.data);
        } catch (err) {
            setLedgerErr(err.response?.data?.error || err.message);
        } finally { setLedgerLoading(false); }
    };

    const excelExport = (data) => ({
        filename: `receivables-${data.parent?.GLCode || 'group'}-${data.from}_to_${data.to}.csv`,
        headers: ['Code', 'Party Account', 'Opening Dr', 'Opening Cr', 'Period Dr', 'Period Cr',
                  'Closing Dr', 'Closing Cr', 'Outstanding', 'Entries', 'Last Activity'],
        rows: (data.rows || []).map(r => [
            r.GLCode, r.GLTitle,
            Number(r.OpeningDr), Number(r.OpeningCr),
            Number(r.PeriodDr),  Number(r.PeriodCr),
            Number(r.ClosingDr), Number(r.ClosingCr),
            Number(r.Outstanding), Number(r.Entries), r.LastActivity || '',
        ]),
    });

    return (
        <ReportShell
            title="Trade Receivables Sub-Ledger"
            subtitle="Trial-balance extract of one receivables group, party by party — click any party to read its ledger."
            icon={Users}
            endpoint="receivables-subledger"
            landscape={false}
            defaultParams={{ from: yearStart(), to: todayISO(), parentCode: '', includeZero: '0' }}
            excelExport={excelExport}
            printFilterSummary={(p) => {
                const g = groups.find(x => x.GLCode === (p.parentCode || '102008'));
                return [`Period: ${p.from} → ${p.to}`,
                        g ? `Group: ${g.GLCode} — ${g.GLTitle}` : null].filter(Boolean).join('  •  ');
            }}
            controls={({ params, updateParam }) => (
                <>
                    <DateInput label="From" value={params.from} onChange={v => updateParam('from', v)} />
                    <DateInput label="To"   value={params.to}   onChange={v => updateParam('to', v)} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Group:
                        {/* Backend defaults to 102008 when none is sent, so the
                            box must show that rather than an empty selection. */}
                        <select value={params.parentCode || '102008'}
                                onChange={e => { updateParam('parentCode', e.target.value); setLedger(null); }}
                                style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', minWidth: 300 }}>
                            {groups.map(g => (
                                <option key={g.GLCAID} value={g.GLCode}>{g.GLCode} — {g.GLTitle}</option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        <input type="checkbox" checked={params.includeZero === '1'}
                               onChange={e => updateParam('includeZero', e.target.checked ? '1' : '0')} />
                        Include parties with no balance or movement
                    </label>
                </>
            )}
        >
            {(data, ctx) => {
                const p = ctx?.params || {};
                // ---------- Inline ledger view ----------
                if (ledger || ledgerLoading || ledgerErr) {
                    return (
                        <>
                            <div className="card" style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <button className="btn no-print" onClick={() => { setLedger(null); setLedgerErr(''); }}
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <ArrowLeft size={15} /> Back to the group
                                </button>
                                {ledger && (
                                    <div style={{ fontWeight: 700, color: '#1e3a8a' }}>
                                        {ledger.account.GLCode} — {ledger.account.GLTitle}
                                    </div>
                                )}
                            </div>

                            {ledgerLoading && (
                                <div className="card" style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>
                                    <Loader2 size={22} className="animate-spin" /> <div>Loading ledger…</div>
                                </div>
                            )}
                            {ledgerErr && (
                                <div className="card" style={{ padding: 16, background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b' }}>
                                    {ledgerErr}
                                </div>
                            )}

                            {ledger && (
                                <>
                                    <div className="card report-summary-strip" style={{ display: 'flex', gap: 24, flexWrap: 'wrap', padding: 14 }}>
                                        <Stat label="Opening"  value={fmt(ledger.openingBalance)} />
                                        <Stat label="Debit"    value={fmt(ledger.totals.debit)} />
                                        <Stat label="Credit"   value={fmt(ledger.totals.credit)} />
                                        <Stat label="Entries"  value={fmtInt(ledger.totals.entries)} />
                                        <Stat label="Closing"  value={fmt(ledger.closingBalance)} strong />
                                    </div>

                                    <div className="card" style={{ overflowX: 'auto' }}>
                                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                            <thead>
                                                <tr style={{ background: '#f1f5f9' }}>
                                                    <TH>Date</TH><TH>Voucher</TH><TH>Type</TH>
                                                    <TH>Narration</TH><TH>Job Card</TH>
                                                    <TH align="right">Debit</TH>
                                                    <TH align="right">Credit</TH>
                                                    <TH align="right">Balance</TH>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                                                    <td colSpan={7} style={{ padding: '8px 10px', fontWeight: 600 }}>Opening balance</td>
                                                    <TD align="right" bold>{fmt(ledger.openingBalance)}</TD>
                                                </tr>
                                                {ledger.lines.length === 0 && (
                                                    <tr><td colSpan={8} style={{ padding: 30, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                                        No entries in this period.
                                                    </td></tr>
                                                )}
                                                {ledger.lines.map((l, i) => (
                                                    <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                        <TD>{l.VoucherDate}</TD>
                                                        <TD mono>{l.VoucherNo}</TD>
                                                        <TD>{l.VoucherType}</TD>
                                                        <TD>{l.Narration}</TD>
                                                        <TD mono>{l.JobCardNo ? `JC-${l.JobCardNo}` : ''}</TD>
                                                        <TD align="right" mono>{l.Debit ? fmt(l.Debit) : ''}</TD>
                                                        <TD align="right" mono color="#1d4ed8">{l.Credit ? fmt(l.Credit) : ''}</TD>
                                                        <TD align="right" mono bold>{fmt(l.Balance)}</TD>
                                                    </tr>
                                                ))}
                                            </tbody>
                                            <tfoot>
                                                <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc', fontWeight: 800 }}>
                                                    <td colSpan={5} style={{ padding: 10 }}>Closing balance</td>
                                                    <TD align="right" bold>{fmt(ledger.totals.debit)}</TD>
                                                    <TD align="right" bold>{fmt(ledger.totals.credit)}</TD>
                                                    <TD align="right" bold>{fmt(ledger.closingBalance)}</TD>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </>
                            )}
                        </>
                    );
                }

                // ---------- Group extract ----------
                const t = data.totals || {};
                return (
                    <>
                        <div className="card" style={{ padding: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
                            <div style={{ fontWeight: 700, color: '#1e3a8a' }}>
                                {data.parent?.GLCode} — {data.parent?.GLTitle}
                            </div>
                            <div style={{ flex: 1 }} />
                            <Stat label="Parties"     value={fmtInt(t.parties)} />
                            <Stat label="Opening Dr"  value={fmt(t.openingDr)} />
                            <Stat label="Opening Cr"  value={fmt(t.openingCr)} />
                            <Stat label="Period Dr"   value={fmt(t.periodDr)} colour="#0284c7" />
                            <Stat label="Period Cr"   value={fmt(t.periodCr)} colour="#0284c7" />
                            <Stat label="Outstanding" value={'PKR ' + fmt(t.outstanding)} strong />
                        </div>

                        {t.hiddenZeroParties > 0 && (
                            <div style={{ fontSize: '0.78rem', color: '#94a3b8', padding: '0 4px' }}>
                                {fmtInt(t.hiddenZeroParties)} party account(s) with no balance and no movement are hidden — tick the box above to show them.
                            </div>
                        )}

                        <div className="card" style={{ overflowX: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                <thead>
                                    <tr style={{ background: '#f1f5f9' }}>
                                        <TH>Code</TH><TH>Party Account</TH>
                                        <TH align="right">Opening Dr</TH><TH align="right">Opening Cr</TH>
                                        <TH align="right">Period Dr</TH><TH align="right">Period Cr</TH>
                                        <TH align="right">Closing Dr</TH><TH align="right">Closing Cr</TH>
                                        <TH>Last Activity</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.length === 0 && (
                                        <tr><td colSpan={9} style={{ padding: 34, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                            No party accounts with activity in this period.
                                        </td></tr>
                                    )}
                                    {data.rows.map(r => (
                                        <tr key={r.GLCAID}
                                            onClick={() => openLedger(r.GLCAID, p.from, p.to)}
                                            title="Open this party's ledger"
                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}>
                                            <TD mono>{r.GLCode}</TD>
                                            <TD><span style={{ color: '#1d4ed8', textDecoration: 'underline' }}>{r.GLTitle}</span></TD>
                                            <TD align="right" mono>{r.OpeningDr ? fmt(r.OpeningDr) : ''}</TD>
                                            <TD align="right" mono>{r.OpeningCr ? fmt(r.OpeningCr) : ''}</TD>
                                            <TD align="right" mono color="#0284c7">{r.PeriodDr ? fmt(r.PeriodDr) : ''}</TD>
                                            <TD align="right" mono color="#0284c7">{r.PeriodCr ? fmt(r.PeriodCr) : ''}</TD>
                                            <TD align="right" mono bold>{r.ClosingDr ? fmt(r.ClosingDr) : ''}</TD>
                                            <TD align="right" mono bold color="#1d4ed8">{r.ClosingCr ? fmt(r.ClosingCr) : ''}</TD>
                                            <TD color="#64748b">{r.LastActivity || '—'}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc', fontWeight: 800 }}>
                                        <td colSpan={2} style={{ padding: 10 }}>TOTAL</td>
                                        <TD align="right" bold>{fmt(t.openingDr)}</TD>
                                        <TD align="right" bold>{fmt(t.openingCr)}</TD>
                                        <TD align="right" bold>{fmt(t.periodDr)}</TD>
                                        <TD align="right" bold>{fmt(t.periodCr)}</TD>
                                        <TD align="right" bold>{fmt(t.closingDr)}</TD>
                                        <TD align="right" bold>{fmt(t.closingCr)}</TD>
                                        <td></td>
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}

function Stat({ label, value, colour, strong }) {
    return (
        <div className="rss-item">
            <div className="rss-label" style={{ fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase' }}>{label}</div>
            <div className="rss-value" style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? '1.05rem' : '0.92rem',
                          color: strong ? '#1e40af' : (colour || '#0f172a') }}>{value}</div>
        </div>
    );
}

export default ReceivablesSubLedger;
