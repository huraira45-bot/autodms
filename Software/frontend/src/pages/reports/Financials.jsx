import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, Scale, BookOpen, ChevronRight, ChevronDown } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO, PeriodControls, AsOfControl, SingleDateControl } from './ReportShell';

// Row drill-down helper — opens GL Detail for the clicked account, passing
// through the current date range so the linked page auto-loads matching data.
function useDrillToGL() {
    const navigate = useNavigate();
    return (params) => (glcaid) => {
        if (!glcaid || typeof glcaid !== 'number') return;
        const q = new URLSearchParams({ glcaid: String(glcaid) });
        if (params?.from) q.set('from', params.from);
        if (params?.to)   q.set('to',   params.to);
        if (params?.asOf) q.set('to',   params.asOf);
        navigate(`/reports/gl-detail?${q.toString()}`);
    };
}

// ---- Profit & Loss ----
export function PnL() {
    const drillTo = useDrillToGL();
    return (
        <ReportShell
            title="Profit & Loss"
            subtitle="Revenue − Expenses for the chosen period. Click a group to see accounts under it (e.g. per-department sales)."
            icon={TrendingUp}
            endpoint="pnl"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data, ctx) => (
                <>
                    <div className="card" style={{
                        background: data.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (data.netProfit >= 0 ? '#bbf7d0' : '#fecaca'),
                        padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Net Profit</div>
                            <div style={{ fontWeight: 800, fontSize: '1.6rem', color: data.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                                PKR {fmt(data.netProfit)}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                            {data.from} → {data.to}
                        </div>
                    </div>

                    <PnLSection title="REVENUE"  groups={data.revenue?.groups || []}  total={data.revenue?.total || 0}  drillTo={drillTo(ctx?.params)} />
                    <PnLSection title="EXPENSES" groups={data.expenses?.groups || []} total={data.expenses?.total || 0} drillTo={drillTo(ctx?.params)} />
                </>
            )}
        </ReportShell>
    );
}

// ---- P&L by Department ----
// Reuses the existing chart of accounts (401001 Sales, 401002 Service,
// 401003 Parts, 401004 Other Revenues → Admin; matching 502xxx expense
// groups + the two Cost-of-Sold leaves) — no DepartmentID tagging needed.
// Admin has no matching revenue account so it's always last. Owner ask
// 2026-07-31.
export function PnLByDepartment() {
    const drillTo = useDrillToGL();
    return (
        <ReportShell
            title="P&L by Department"
            subtitle="Sales / Service / Parts revenue vs. direct cost, from the existing chart of accounts. Admin (no matching revenue) is shown last."
            icon={TrendingUp}
            endpoint="pnl-department"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={PeriodControls}
        >
            {(data, ctx) => (
                <>
                    <div className="card" style={{
                        background: data.netProfit >= 0 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (data.netProfit >= 0 ? '#bbf7d0' : '#fecaca'),
                        padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Net Profit</div>
                            <div style={{ fontWeight: 800, fontSize: '1.6rem', color: data.netProfit >= 0 ? '#15803d' : '#b91c1c' }}>
                                PKR {fmt(data.netProfit)}
                            </div>
                        </div>
                        <div style={{ fontSize: '0.85rem', color: '#475569' }}>
                            {data.from} → {data.to}
                        </div>
                    </div>

                    {(data.departments || []).map(d => (
                        <DeptCard key={d.key} dept={d} drillTo={drillTo(ctx?.params)} />
                    ))}

                    {(data.unmapped?.revenue?.length > 0 || data.unmapped?.expense?.length > 0) && (
                        <div className="card" style={{ borderLeft: '3px solid #f59e0b' }}>
                            <div style={{ fontWeight: 700, color: '#92400e', marginBottom: 8 }}>Unmapped accounts</div>
                            <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                                Had activity this period but don't match a known department account — likely a chart-of-accounts
                                change since this report was built. Excluded from the totals above; worth a look.
                            </div>
                            {[...(data.unmapped.revenue || []), ...(data.unmapped.expense || [])].map(r => (
                                <div key={r.GLCode} style={{ fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                                    <span>{r.GLCode} — {r.GLTitle}</span>
                                    <span>PKR {fmt(r.amount)}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </>
            )}
        </ReportShell>
    );
}

function DeptCard({ dept, drillTo }) {
    const [open, setOpen] = useState(false);
    return (
        <div className="card" style={{ borderLeft: '3px solid ' + (dept.revenueGenerating ? '#1d4ed8' : '#94a3b8') }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                 onClick={() => setOpen(o => !o)}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    <span style={{ fontWeight: 700, color: '#1e293b' }}>{dept.label}</span>
                    {!dept.revenueGenerating && (
                        <span style={{ fontSize: '0.7rem', padding: '2px 6px', borderRadius: 4, background: '#f1f5f9', color: '#64748b' }}>
                            Non-revenue-generating
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', gap: 24, fontSize: '0.85rem' }}>
                    <span>Revenue <strong style={{ color: '#0f172a' }}>{fmt(dept.revenue)}</strong></span>
                    <span>Expense <strong style={{ color: '#0f172a' }}>{fmt(dept.expense)}</strong></span>
                    <span>Net <strong style={{ color: dept.net >= 0 ? '#15803d' : '#b91c1c' }}>{fmt(dept.net)}</strong></span>
                </div>
            </div>
            {open && (
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                    <PnLDeptLineList title="Revenue" lines={dept.revenueLines} drillTo={drillTo} color="#0284c7" />
                    <PnLDeptLineList title="Expense" lines={dept.expenseLines} drillTo={drillTo} color="#b45309" />
                </div>
            )}
        </div>
    );
}

function PnLDeptLineList({ title, lines, drillTo, color }) {
    if (!lines || !lines.length) {
        return <div style={{ fontSize: '0.8rem', color: '#94a3b8', fontStyle: 'italic' }}>No {title.toLowerCase()} activity.</div>;
    }
    return (
        <div>
            <div style={{ fontSize: '0.7rem', textTransform: 'uppercase', color: '#94a3b8', marginBottom: 4 }}>{title}</div>
            {lines.map(l => {
                const canDrill = drillTo && typeof l.GLCAID === 'number';
                return (
                    <div key={l.GLCode}
                         onClick={canDrill ? () => drillTo(l.GLCAID) : undefined}
                         title={canDrill ? 'Open GL Detail for this account' : undefined}
                         style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', padding: '3px 0', cursor: canDrill ? 'pointer' : 'default' }}>
                        <span style={{ color: '#475569' }}>{l.GLCode} {l.GLTitle}</span>
                        <span style={{ color, fontFamily: 'monospace' }}>{fmt(l.amount)}</span>
                    </div>
                );
            })}
        </div>
    );
}

function PnLSection({ title, groups, total, drillTo }) {
    const [expanded, setExpanded] = useState(new Set());
    const toggle = (code) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    };
    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, color: '#1e40af' }}>{title}</div>
                <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Total <strong style={{ color: '#0f172a' }}>PKR {fmt(total)}</strong>
                </div>
            </div>
            {groups.length === 0 ? (
                <div style={{ padding: 16, color: '#64748b', fontStyle: 'italic' }}>No activity in this section.</div>
            ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <TH>Code</TH>
                            <TH>Group / Account</TH>
                            <TH align="right">Debit</TH>
                            <TH align="right">Credit</TH>
                            <TH align="right">Net</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {groups.map(g => {
                            const open = expanded.has(g.code);
                            const gDr = g.leaves.reduce((s, l) => s + (Number(l.TotalDr) || 0), 0);
                            const gCr = g.leaves.reduce((s, l) => s + (Number(l.TotalCr) || 0), 0);
                            return (
                                <React.Fragment key={g.code}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer' }}
                                        onClick={() => toggle(g.code)}
                                        title={open ? 'Collapse' : 'Expand'}>
                                        <TD mono color="#475569">
                                            {open ? <ChevronDown size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                  : <ChevronRight size={12} style={{ display: 'inline', marginRight: 4 }} />}
                                            {g.code}
                                        </TD>
                                        <TD bold color="#0f172a">{g.title}</TD>
                                        <TD align="right" mono>{gDr > 0.005 ? fmt(gDr) : '—'}</TD>
                                        <TD align="right" mono>{gCr > 0.005 ? fmt(gCr) : '—'}</TD>
                                        <TD align="right" bold>{fmt(g.total)}</TD>
                                    </tr>
                                    {open && g.leaves.map(l => {
                                        const canDrill = drillTo && typeof l.GLCAID === 'number';
                                        return (
                                            <tr key={l.GLCAID}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: canDrill ? 'pointer' : 'default', background: 'white' }}
                                                onClick={canDrill ? () => drillTo(l.GLCAID) : undefined}
                                                title={canDrill ? 'Open GL Detail for this account' : undefined}>
                                                <TD mono color="#64748b">&nbsp;&nbsp;&nbsp;&nbsp;{l.GLCode}</TD>
                                                <TD color="#334155">{l.GLTitle}</TD>
                                                <TD align="right" mono color="#0284c7">{Number(l.TotalDr) > 0.005 ? fmt(l.TotalDr) : '—'}</TD>
                                                <TD align="right" mono color="#0284c7">{Number(l.TotalCr) > 0.005 ? fmt(l.TotalCr) : '—'}</TD>
                                                <TD align="right">{fmt(l.PeriodAmount)}</TD>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td colSpan={4} style={{ padding: 12, fontWeight: 700 }}>Total {title}</td>
                            <TD align="right" bold>{fmt(total)}</TD>
                        </tr>
                    </tfoot>
                </table>
            )}
        </div>
    );
}

// ---- Balance Sheet ----
export function BalanceSheet() {
    const drillTo = useDrillToGL();
    return (
        <ReportShell
            title="Balance Sheet"
            subtitle="Assets vs. Liabilities + Equity as of the chosen date. Class → Group → Sub-group → Account, aligned with the Chart of Accounts."
            icon={Scale}
            endpoint="balance-sheet"
            defaultParams={{ asOf: todayISO() }}
            controls={AsOfControl}
        >
            {(data, ctx) => (
                <>
                    <div className="card" style={{
                        background: Math.abs(data.diff) < 0.01 ? '#f0fdf4' : '#fef2f2',
                        border: '1px solid ' + (Math.abs(data.diff) < 0.01 ? '#bbf7d0' : '#fecaca'),
                        padding: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12
                    }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>Status as of {data.asOf}</div>
                            <div style={{ fontWeight: 700, color: Math.abs(data.diff) < 0.01 ? '#15803d' : '#b91c1c' }}>
                                {Math.abs(data.diff) < 0.01 ? 'Balance Sheet is balanced' : `Out of balance by PKR ${fmt(data.diff)}`}
                            </div>
                        </div>
                        <div style={{ display: 'flex', gap: 24 }}>
                            <KPI label="Total Assets" value={data.assets.total} />
                            <KPI label="Liab + Equity" value={data.liabilitiesAndEquity} />
                        </div>
                    </div>

                    {(data.classes || []).map(cls => (
                        <BSClassPanel key={cls.classRoot} cls={cls} drillTo={drillTo(ctx?.params)} />
                    ))}
                </>
            )}
        </ReportShell>
    );
}

function BSClassPanel({ cls, drillTo }) {
    const [openClass, setOpenClass] = useState(true);
    const [expandedGroups, setExpandedGroups] = useState(new Set());
    const [expandedSubs, setExpandedSubs]     = useState(new Set());
    const toggleGroup = (code) => {
        setExpandedGroups(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    };
    const toggleSub = (code) => {
        setExpandedSubs(prev => {
            const next = new Set(prev);
            if (next.has(code)) next.delete(code); else next.add(code);
            return next;
        });
    };
    return (
        <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, cursor: 'pointer' }}
                 onClick={() => setOpenClass(v => !v)}
                 title={openClass ? 'Collapse' : 'Expand'}>
                <div style={{ fontWeight: 700, color: '#1e40af', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {openClass ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    Class {cls.classRoot} — {cls.classTitle}
                </div>
                <div style={{ fontSize: '0.9rem', color: '#0f172a' }}>
                    <strong>PKR {fmt(cls.total)}</strong>
                </div>
            </div>
            {openClass && (
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <TH>Code</TH>
                            <TH>Group / Sub-group / Account</TH>
                            <TH align="right">Balance</TH>
                        </tr>
                    </thead>
                    <tbody>
                        {(cls.groups || []).map(g => {
                            const groupOpen = expandedGroups.has(g.code);
                            return (
                                <React.Fragment key={g.code}>
                                    <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#eff6ff', cursor: 'pointer' }}
                                        onClick={() => toggleGroup(g.code)}>
                                        <TD mono color="#1e3a8a" bold>
                                            {groupOpen ? <ChevronDown size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                       : <ChevronRight size={12} style={{ display: 'inline', marginRight: 4 }} />}
                                            {g.code}
                                        </TD>
                                        <TD bold color="#1e3a8a">{g.title}</TD>
                                        <TD align="right" bold color="#1e3a8a">{fmt(g.total)}</TD>
                                    </tr>
                                    {groupOpen && (g.subgroups || []).map(sg => {
                                        const subOpen = expandedSubs.has(sg.code);
                                        return (
                                            <React.Fragment key={sg.code}>
                                                <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#f8fafc', cursor: 'pointer' }}
                                                    onClick={() => toggleSub(sg.code)}>
                                                    <TD mono color="#475569">
                                                        &nbsp;&nbsp;&nbsp;
                                                        {subOpen ? <ChevronDown size={12} style={{ display: 'inline', marginRight: 4 }} />
                                                                 : <ChevronRight size={12} style={{ display: 'inline', marginRight: 4 }} />}
                                                        {sg.code}
                                                    </TD>
                                                    <TD bold color="#0f172a">{sg.title}</TD>
                                                    <TD align="right" bold>{fmt(sg.total)}</TD>
                                                </tr>
                                                {subOpen && sg.leaves.map(l => {
                                                    const canDrill = drillTo && typeof l.GLCAID === 'number';
                                                    return (
                                                        <tr key={l.GLCAID}
                                                            style={{ borderBottom: '1px solid #f1f5f9', cursor: canDrill ? 'pointer' : 'default' }}
                                                            onClick={canDrill ? () => drillTo(l.GLCAID) : undefined}
                                                            title={canDrill ? 'Open GL Detail for this account' : undefined}>
                                                            <TD mono color="#64748b">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;{l.GLCode}</TD>
                                                            <TD color="#334155">{l.GLTitle}</TD>
                                                            <TD align="right">{fmt(l.PeriodAmount)}</TD>
                                                        </tr>
                                                    );
                                                })}
                                            </React.Fragment>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                    <tfoot>
                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                            <td colSpan={2} style={{ padding: 12, fontWeight: 700 }}>Total Class {cls.classRoot}</td>
                            <TD align="right" bold>{fmt(cls.total)}</TD>
                        </tr>
                    </tfoot>
                </table>
            )}
        </div>
    );
}

const KPI = ({ label, value }) => (
    <div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase' }}>{label}</div>
        <div style={{ fontWeight: 700, fontSize: '1.1rem' }}>PKR {fmt(value)}</div>
    </div>
);

// ---- Day Book ----
export function DayBook() {
    return (
        <ReportShell
            title="Day Book"
            subtitle="All posted vouchers for the chosen date."
            icon={BookOpen}
            endpoint="day-book"
            defaultParams={{ date: todayISO() }}
            controls={SingleDateControl}
        >
            {(data) => (
                <>
                    <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16 }}>
                        <div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'uppercase' }}>{data.date}</div>
                            <div style={{ fontWeight: 700, fontSize: '1.2rem' }}>{data.vouchers.length} vouchers · PKR {fmt(data.total)}</div>
                        </div>
                        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                            {Object.entries(data.byType).map(([type, amt]) => (
                                <div key={type} style={{ background: '#f1f5f9', padding: '6px 12px', borderRadius: 6, fontSize: '0.85rem' }}>
                                    <strong>{type}</strong>: {fmt(amt)}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="card">
                        {data.vouchers.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No vouchers posted on this date.</div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Voucher</TH><TH>Type</TH><TH>Remarks</TH><TH>Source</TH><TH>Created By</TH>
                                        <TH align="right">Lines</TH><TH align="right">Amount</TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.vouchers.map(v => (
                                        <tr key={v.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                            <TD mono color="#475569">{v.VoucherNo}</TD>
                                            <TD>{v.VoucherType}</TD>
                                            <TD>{v.Remarks || '—'}</TD>
                                            <TD>{v.SourceDocType ? `${v.SourceDocType} #${v.SourceDocID}` : '—'}</TD>
                                            <TD>{v.CreatedByName || '—'}</TD>
                                            <TD align="right">{v.LineCount}</TD>
                                            <TD align="right" bold>{fmt(v.TotalAmount)}</TD>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}
