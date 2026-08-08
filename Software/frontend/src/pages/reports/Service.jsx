import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { Wrench, Activity, ShieldCheck, UserCog } from 'lucide-react';
import ReportShell, { TH, TD, fmt, fmtInt, todayISO, yearStartISO, PeriodControls } from './ReportShell';

const firstOfMonthISO = () => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};

// =====================================================================
// Job Card Register
// =====================================================================
export function JobCardRegister() {
    // navigate kept for other links; Parts drill-through uses window.open so
    // the issue slip opens in a new tab (owner ask 2026-07-17).
    const navigate = useNavigate();
    const [jobTypes, setJobTypes] = useState([]);
    useEffect(() => {
        axios.get('/api/workshop/job-types').then(r => setJobTypes(r.data || [])).catch(() => {});
    }, []);
    const selectStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' };
    const toggleBusinessType = (params, updateParam, id) => {
        const set = new Set(
            String(params.businessType || '')
                .split(',').map(s => s.trim()).filter(Boolean)
        );
        const key = String(id);
        if (set.has(key)) set.delete(key); else set.add(key);
        updateParam('businessType', Array.from(set).join(','));
    };
    const selectedBTSet = (params) => new Set(
        String(params.businessType || '')
            .split(',').map(s => s.trim()).filter(Boolean)
    );
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
        filename: `job-card-register-${params.from || 'from'}_to_${params.to || 'to'}.csv`,
        headers: [
            'Card #', 'Finalized Date', 'Finalized By', 'Customer', 'Customer Code',
            'Credit Party', 'Vehicle Reg', 'Chassis', 'Advisor', 'Job Type', 'Payment Type',
            'Status', 'Labour', 'Sublet', 'PST', 'Parts', 'GST', 'Total',
        ],
        rows: (data.rows || []).map(r => [
            r.JobCardNo,
            r.FinalizedAt || r.JobCardDate || '',
            r.FinalizedByName || '',
            r.CustomerName || '',
            r.CustomerCode || '',
            r.CreditPartyName || '',
            r.VehicleRegNo || '',
            r.ChasisNo || '',
            r.ServiceAdvisor || '',
            r.JobTypeName || r.JobTypeCode || '',
            r.PaymentType || '',
            r.IsFinalized ? 'Finalized' : (r.Status || 'Draft'),
            Number(r.LabourAmount || 0),
            Number(r.SubletAmount || 0),
            Number(r.PSTAmount    || 0),
            Number(r.PartsAmount  || 0),
            Number(r.GSTAmount    || 0),
            Number(r.TotalAmount  || 0),
        ]),
    });
    return (
        <ReportShell
            title="Job Card Register"
            subtitle="Job cards finalized in the period — the date shown is the finalize date (bill date), which is what the period filter matches on."
            icon={Wrench}
            endpoint="service/job-card-register"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), businessType: '', paymentMode: '', finalized: 'finalized', hasParts: '' }}
            printFilterSummary={printFilterSummary}
            excelExport={excelExport}
            landscape
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
                                {jobTypes.length === 0 && (
                                    <span style={{ color: '#94a3b8' }}>Loading…</span>
                                )}
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
                                        title="Clear selection"
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
                            <select value={params.paymentMode || ''} onChange={e => updateParam('paymentMode', e.target.value)}
                                style={selectStyle}>
                                <option value="">All</option>
                                <option value="cash">Cash (incl. POS &amp; Bank Transfer)</option>
                                <option value="credit">Credit</option>
                            </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                            Parts:
                            <select value={params.hasParts || ''} onChange={e => updateParam('hasParts', e.target.value)}
                                style={selectStyle}>
                                <option value="">All</option>
                                <option value="with">With parts issued</option>
                                <option value="without">Without parts issued</option>
                            </select>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                            Status:
                            <select value={params.finalized || 'finalized'} onChange={e => updateParam('finalized', e.target.value)}
                                style={selectStyle}>
                                <option value="finalized">Finalized only</option>
                                <option value="draft">Draft only</option>
                                <option value="all">All (incl. Draft)</option>
                            </select>
                        </label>
                    </>
                );
            }}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Cards',  value: fmtInt(data.totals.count) },
                        { label: 'Labour', value: 'PKR ' + fmt(data.totals.labour) },
                        { label: 'Sublet', value: 'PKR ' + fmt(data.totals.sublet) },
                        { label: 'PST',    value: 'PKR ' + fmt(data.totals.pst) },
                        { label: 'Parts',  value: 'PKR ' + fmt(data.totals.parts) },
                        { label: 'GST',    value: 'PKR ' + fmt(data.totals.gst) },
                        { label: 'Total',  value: 'PKR ' + fmt(data.totals.total), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Card #</TH><TH>Finalized Date</TH><TH>Customer</TH><TH>Credit Party</TH><TH>Vehicle</TH>
                                    <TH>Advisor</TH><TH>Status</TH>
                                    <TH align="right">Labour</TH>
                                    <TH align="right">Sublet</TH>
                                    <TH align="right">PST</TH>
                                    <TH align="right">Parts</TH>
                                    <TH align="right">GST</TH>
                                    <TH align="right">Total</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={13}>No job cards in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.JobCardId} style={trBody}>
                                        <TD mono><strong>{r.JobCardNo}</strong></TD>
                                        <TD>
                                            {r.FinalizedAt || r.JobCardDate || '—'}
                                            {r.FinalizedByName && <div style={subText}>by {r.FinalizedByName}</div>}
                                        </TD>
                                        <TD>{r.CustomerName}<div style={subText}>{r.CustomerCode}</div></TD>
                                        <TD>{r.CreditPartyName || '—'}</TD>
                                        <TD mono>{r.VehicleRegNo}<div style={subText}>{r.ChasisNo}</div></TD>
                                        <TD>{r.ServiceAdvisor}</TD>
                                        <TD><StatusPill v={r.Status} finalized={r.IsFinalized} /></TD>
                                        <TD align="right" mono>{fmt(r.LabourAmount)}</TD>
                                        <TD align="right" mono>{fmt(r.SubletAmount)}</TD>
                                        <TD align="right" mono color="#1d4ed8">{fmt(r.PSTAmount)}</TD>
                                        <TD align="right" mono>
                                            <a
                                                href={`/parts-issue?jobCardId=${r.JobCardId}`}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                title="Open Parts Issue for this Job Card (new tab)"
                                                style={{
                                                    color: '#1d4ed8',
                                                    textDecoration: 'underline',
                                                    fontFamily: 'inherit',
                                                }}>
                                                {fmt(r.PartsAmount)}
                                            </a>
                                        </TD>
                                        <TD align="right" mono color="#1d4ed8">{fmt(r.GSTAmount)}</TD>
                                        <TD align="right" mono bold>{fmt(r.TotalAmount)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                            {data.rows.length > 0 && (
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #0f172a', background: '#f8fafc' }}>
                                        <td colSpan={6} style={{ padding: 12, fontWeight: 700 }}>
                                            Totals — {fmtInt(data.totals.count)} cards
                                        </td>
                                        <TD align="right" bold>{fmt(data.totals.labour)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.sublet)}</TD>
                                        <TD align="right" bold color="#1d4ed8">{fmt(data.totals.pst)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.parts)}</TD>
                                        <TD align="right" bold color="#1d4ed8">{fmt(data.totals.gst)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.total)}</TD>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Advisor Performance — work delivered per Service Advisor, filterable
// by Business Type (Job Card Type) and Payment mode. Groups by advisor,
// sums labour / parts / sublet, ranks by total revenue.
// =====================================================================
export function AdvisorPerformance() {
    const [jobTypes, setJobTypes] = useState([]);
    useEffect(() => {
        axios.get('/api/workshop/job-types').then(r => setJobTypes(r.data || [])).catch(() => {});
    }, []);
    const selectStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' };
    const printFilterSummary = (params) => {
        const parts = [];
        if (params.from && params.to) parts.push(`Period: ${params.from} → ${params.to}`);
        if (params.businessType) {
            const t = jobTypes.find(x => String(x.JobCardTypeId) === String(params.businessType));
            parts.push(`Business Type: ${t ? `${t.CardCode} — ${t.Title}` : params.businessType}`);
        } else {
            parts.push('Business Type: All');
        }
        if (params.paymentMode === 'cash')        parts.push('Payment: Cash (incl. POS & Bank Transfer)');
        else if (params.paymentMode === 'credit')  parts.push('Payment: Credit');
        else                                       parts.push('Payment: All');
        if (params.finalized === 'draft')          parts.push('Status: Draft only');
        else if (params.finalized === 'all')       parts.push('Status: All (incl. Draft)');
        else                                       parts.push('Status: Finalized only');
        return parts.join('  •  ');
    };
    return (
        <ReportShell
            title="Service Advisor Performance"
            subtitle="Work delivered by each Service Advisor — cards handled, labour / parts / sublet revenue, filterable by business type and payment mode."
            icon={UserCog}
            endpoint="service/advisor-performance"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO(), businessType: '', paymentMode: '', finalized: 'finalized' }}
            printFilterSummary={printFilterSummary}
            controls={({ params, updateParam }) => (
                <>
                    <PeriodControls params={params} updateParam={updateParam} />
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Business Type:
                        <select value={params.businessType || ''} onChange={e => updateParam('businessType', e.target.value)}
                            style={selectStyle}>
                            <option value="">All</option>
                            {jobTypes.map(t => (
                                <option key={t.JobCardTypeId} value={t.JobCardTypeId}>
                                    {t.CardCode} — {t.Title}
                                </option>
                            ))}
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Payment:
                        <select value={params.paymentMode || ''} onChange={e => updateParam('paymentMode', e.target.value)}
                            style={selectStyle}>
                            <option value="">All</option>
                            <option value="cash">Cash (incl. POS &amp; Bank Transfer)</option>
                            <option value="credit">Credit</option>
                        </select>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
                        Status:
                        <select value={params.finalized || 'finalized'} onChange={e => updateParam('finalized', e.target.value)}
                            style={selectStyle}>
                            <option value="finalized">Finalized only</option>
                            <option value="draft">Draft only</option>
                            <option value="all">All (incl. Draft)</option>
                        </select>
                    </label>
                </>
            )}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Advisors', value: fmtInt(data.totals.advisors) },
                        { label: 'Cards',    value: fmtInt(data.totals.cards) },
                        { label: 'Labour',   value: 'PKR ' + fmt(data.totals.labour) },
                        { label: 'Parts',    value: 'PKR ' + fmt(data.totals.parts) },
                        { label: 'Sublet',   value: 'PKR ' + fmt(data.totals.sublet) },
                        { label: 'Total',    value: 'PKR ' + fmt(data.totals.total), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH align="right">#</TH>
                                    <TH>Service Advisor</TH>
                                    <TH align="right">Cards</TH>
                                    <TH align="right">Labour</TH>
                                    <TH align="right">Parts</TH>
                                    <TH align="right">Sublet</TH>
                                    <TH align="right">Total</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={7}>No work found in this period for the chosen filters.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={`${r.ServiceAdvisorID || 'null'}-${i}`} style={trBody}>
                                        <TD align="right" color="#94a3b8">{i + 1}</TD>
                                        <TD><strong>{r.Advisor}</strong></TD>
                                        <TD align="right">{fmtInt(r.Cards)}</TD>
                                        <TD align="right" mono>{fmt(r.Labour)}</TD>
                                        <TD align="right" mono>{fmt(r.Parts)}</TD>
                                        <TD align="right" mono>{fmt(r.Sublet)}</TD>
                                        <TD align="right" mono bold>{fmt(r.Total)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                            {data.rows.length > 0 && (
                                <tfoot>
                                    <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                        <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>Totals</td>
                                        <TD align="right" bold>{fmtInt(data.totals.cards)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.labour)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.parts)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.sublet)}</TD>
                                        <TD align="right" bold>{fmt(data.totals.total)}</TD>
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Service Revenue Summary (per-day)
// =====================================================================
export function ServiceRevenueSummary() {
    return (
        <ReportShell
            title="Service Revenue Summary"
            subtitle="Daily labour / parts / sublet revenue across all job cards in the period."
            icon={Activity}
            endpoint="service/revenue-summary"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Days',   value: fmtInt(data.totals.days) },
                        { label: 'Cards',  value: fmtInt(data.totals.cards) },
                        { label: 'Labour', value: 'PKR ' + fmt(data.totals.labour) },
                        { label: 'Parts',  value: 'PKR ' + fmt(data.totals.parts) },
                        { label: 'Sublet', value: 'PKR ' + fmt(data.totals.sublet) },
                        { label: 'Total',  value: 'PKR ' + fmt(data.totals.total), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Day</TH><TH align="right">Cards</TH>
                                    <TH align="right">Labour</TH><TH align="right">Parts</TH>
                                    <TH align="right">Sublet</TH><TH align="right">Total</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={6}>No activity in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.Day} style={trBody}>
                                        <TD>{r.Day}</TD>
                                        <TD align="right">{r.Cards}</TD>
                                        <TD align="right" mono>{fmt(r.Labour)}</TD>
                                        <TD align="right" mono>{fmt(r.Parts)}</TD>
                                        <TD align="right" mono>{fmt(r.Sublet)}</TD>
                                        <TD align="right" mono bold>{fmt(r.Total)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Insurance Claims
// =====================================================================
export function InsuranceClaims() {
    return (
        <ReportShell
            title="Insurance Claims"
            subtitle="Job cards billed to insurance customers — claim status and amount."
            icon={ShieldCheck}
            endpoint="service/insurance-claims"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Claims',     value: fmtInt(data.totals.count) },
                        { label: 'Finalized',  value: fmtInt(data.totals.finalized) },
                        { label: 'Claim Amt',  value: 'PKR ' + fmt(data.totals.claimAmount), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Card #</TH><TH>Date</TH><TH>Customer</TH><TH>Vehicle</TH>
                                    <TH>Insurance Company</TH><TH>Delivered</TH>
                                    <TH>Status</TH><TH align="right">Claim Amount</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={8}>No insurance claims in this period.</Empty>}
                                {data.rows.map((r, i) => (
                                    <tr key={i} style={trBody}>
                                        <TD mono>{r.JobCardNo}</TD>
                                        <TD>{r.JobCardDate}</TD>
                                        <TD>{r.CustomerName}</TD>
                                        <TD mono>{r.VehicleRegNo}</TD>
                                        <TD>{r.InsuranceCompany}</TD>
                                        <TD>{r.DeliveryDate || '—'}</TD>
                                        <TD><StatusPill v={r.Status} finalized={r.IsFinalized} /></TD>
                                        <TD align="right" mono bold>{fmt(r.ClaimAmount)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Mechanic Productivity
// =====================================================================
export function MechanicProductivity() {
    return (
        <ReportShell
            title="Mechanic Productivity"
            subtitle="Per-technician job-line count and labour value in the period."
            icon={UserCog}
            endpoint="service/mechanic-productivity"
            defaultParams={{ from: firstOfMonthISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data) => (
                <>
                    <SummaryBar items={[
                        { label: 'Technicians', value: fmtInt(data.totals.techs) },
                        { label: 'Job Cards',   value: fmtInt(data.totals.jobCards) },
                        { label: 'Job Lines',   value: fmtInt(data.totals.jobLines) },
                        { label: 'Gross Labour',value: 'PKR ' + fmt(data.totals.grossLabour) },
                        { label: 'Net Labour',  value: 'PKR ' + fmt(data.totals.netLabour), strong: true },
                    ]} />
                    <div className="card" style={{ overflowX: 'auto' }}>
                        <table style={tableStyle}>
                            <thead>
                                <tr style={trHeader}>
                                    <TH>Technician</TH>
                                    <TH align="right">Job Cards</TH>
                                    <TH align="right">Lines</TH>
                                    <TH align="right">Gross Labour</TH>
                                    <TH align="right">Discount</TH>
                                    <TH align="right">Net Labour</TH>
                                </tr>
                            </thead>
                            <tbody>
                                {data.rows.length === 0 && <Empty cols={6}>No technician activity in this period.</Empty>}
                                {data.rows.map(r => (
                                    <tr key={r.TechnicianId} style={trBody}>
                                        <TD>{r.TechnicianName}</TD>
                                        <TD align="right">{r.JobCards}</TD>
                                        <TD align="right">{r.JobLines}</TD>
                                        <TD align="right" mono>{fmt(r.GrossLabour)}</TD>
                                        <TD align="right" mono color="#b91c1c">{fmt(r.Discount)}</TD>
                                        <TD align="right" mono bold>{fmt(r.NetLabour)}</TD>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </ReportShell>
    );
}

// =====================================================================
// Shared bits
// =====================================================================
const tableStyle = { width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' };
const trHeader   = { background: '#f8fafc', borderBottom: '2px solid #e2e8f0' };
const trBody     = { borderBottom: '1px solid #f1f5f9' };
const subText    = { fontSize: '0.72rem', color: '#94a3b8' };

function SummaryBar({ items }) {
    // `report-summary-strip` gets an ultra-compact one-line rendering in print
    // — see .report-summary-strip in index.css @media print.
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

function Empty({ cols, children }) {
    return (
        <tr>
            <td colSpan={cols} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                {children}
            </td>
        </tr>
    );
}

function StatusPill({ v, finalized }) {
    const palette = {
        'Open':        { bg: '#fef3c7', col: '#92400e' },
        'In Progress': { bg: '#dbeafe', col: '#1e40af' },
        'InProgress':  { bg: '#dbeafe', col: '#1e40af' },
        'Closed':      { bg: '#dcfce7', col: '#15803d' },
        'Finalized':   { bg: '#dcfce7', col: '#15803d' },
        'Cancelled':   { bg: '#fee2e2', col: '#b91c1c' },
    };
    const label = v || (finalized ? 'Finalized' : 'Open');
    const sty = palette[label] || { bg: '#f1f5f9', col: '#475569' };
    return (
        <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px',
                       borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 }}>{label}</span>
    );
}
