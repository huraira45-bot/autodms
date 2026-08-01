// Expense by Department — posted CPV/BPV/JV lines grouped by the HR
// department they were tagged with (data_FinanceVoucherDetail.DepartmentID,
// migration 110 — tagging is per LINE, not per whole voucher). Owner ask
// 2026-08-01: "which department expense is this... give us report which
// department expense is what". Reporting-only — the tag never touches the
// GL. Untagged lines land in a separate bucket; use the Department Tagging
// workspace (Vouchers → Tag Departments) to fix them up.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ArrowRight } from 'lucide-react';
import ReportShell, { TH, TD, fmt, todayISO, yearStartISO } from './ReportShell';
import { FinanceKpiStrip, PremiumGroupedBarChart, FINANCE_COLORS } from './charts';

const TYPE_ROUTE = { CPV: '/vouchers/cpv', BPV: '/vouchers/bpv', JV: '/vouchers/jv' };

function ExpenseByDeptControls({ params, updateParam }) {
    return (
        <>
            <label style={S.ctrlLabel}>
                From
                <input type="date" value={params.from || ''}
                       onChange={e => updateParam('from', e.target.value)}
                       style={S.ctrlInput} />
            </label>
            <label style={S.ctrlLabel}>
                To
                <input type="date" value={params.to || ''}
                       onChange={e => updateParam('to', e.target.value)}
                       style={S.ctrlInput} />
            </label>
        </>
    );
}

export default function ExpenseByDepartment() {
    const navigate = useNavigate();
    return (
        <ReportShell
            title="Expense by Department"
            subtitle="Posted CPV / BPV / JV lines, grouped by the HR department each was tagged with. Reporting-only — no GL impact."
            icon={Building2}
            endpoint="/api/reports/expense-by-department"
            defaultParams={{ from: yearStartISO(), to: todayISO() }}
            controls={ExpenseByDeptControls}
            excelExport={(data) => ({
                filename: `expense-by-department-${todayISO()}.csv`,
                headers: ['Date', 'Voucher #', 'Type', 'Account', 'Department', 'Amount', 'Narration'],
                rows: (data?.lines || []).map(l => [
                    l.VoucherDate ? new Date(l.VoucherDate).toLocaleDateString() : '',
                    l.VoucherNo || '',
                    l.VoucherTypeCode || '',
                    l.GLTitle || '',
                    l.DepartmentName || 'Unassigned',
                    Number(l.Amount || 0).toFixed(2),
                    l.Narration || l.Remarks || '',
                ]),
            })}
        >
            {(data) => {
                const chartData = (data.departments || []).map(d => ({ label: d.DepartmentName, total: d.total }));
                return (
                    <>
                        <FinanceKpiStrip items={[
                            { label: 'Total expense', value: `PKR ${fmt(data.grandTotal || 0)}` },
                            { label: 'Tagged',   value: `PKR ${fmt(data.totalTagged || 0)}`, tone: 'good' },
                            { label: 'Unassigned', value: `PKR ${fmt(data.unassigned?.total || 0)}`, tone: data.unassigned?.total > 0 ? 'bad' : 'default' },
                            { label: 'Untagged lines', value: data.unassigned?.lineCount || 0, sub: data.unassigned?.lineCount > 0 ? 'Use Department Tagging' : 'All tagged' },
                            { label: 'Departments', value: (data.departments || []).length },
                        ]} />

                        {chartData.length > 0 && (
                            <PremiumGroupedBarChart
                                title="Expense by Department"
                                subtitle="Total posted CPV/BPV/JV line amount per tagged department"
                                data={chartData}
                                series={[{ key: 'total', label: 'Expense', color: FINANCE_COLORS.expense }]}
                            />
                        )}

                        <div className="card">
                            <div style={S.sectionTitle}>By Department</div>
                            {data.departments?.length ? (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <TH>Department</TH>
                                            <TH align="right">Lines</TH>
                                            <TH align="right">Total</TH>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {data.departments.map(d => (
                                            <tr key={d.DepartmentID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <TD>{d.DepartmentName}</TD>
                                                <TD align="right">{d.lineCount}</TD>
                                                <TD align="right" bold>{fmt(d.total)}</TD>
                                            </tr>
                                        ))}
                                        {data.unassigned?.lineCount > 0 && (
                                            <tr style={{ borderBottom: '1px solid #f1f5f9', background: '#fef2f2' }}>
                                                <TD color="#b91c1c">Unassigned</TD>
                                                <TD align="right" color="#b91c1c">{data.unassigned.lineCount}</TD>
                                                <TD align="right" bold color="#b91c1c">{fmt(data.unassigned.total)}</TD>
                                            </tr>
                                        )}
                                    </tbody>
                                    <tfoot>
                                        <tr style={{ borderTop: '2px solid #cbd5e1', background: '#f8fafc' }}>
                                            <td style={{ padding: 12, fontWeight: 700 }}>Total:</td>
                                            <td></td>
                                            <TD align="right" bold>{fmt(data.grandTotal || 0)}</TD>
                                        </tr>
                                    </tfoot>
                                </table>
                            ) : (
                                <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No posted CPV/BPV/JV expense lines in this period.</div>
                            )}
                        </div>

                        <div className="card">
                            <div style={S.sectionTitle}>Lines</div>
                            {data.lines?.length === 0 ? (
                                <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>No lines match the selected filters.</div>
                            ) : (
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                    <thead>
                                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                            <TH>Date</TH>
                                            <TH>Voucher #</TH>
                                            <TH>Type</TH>
                                            <TH>Account</TH>
                                            <TH>Department</TH>
                                            <TH>Narration</TH>
                                            <TH align="right">Amount</TH>
                                            <TH></TH>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {(data.lines || []).map(l => (
                                            <tr key={l.VoucherDetailID}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: 'pointer' }}
                                                onClick={() => navigate(`${TYPE_ROUTE[l.VoucherTypeCode] || '/vouchers/jv'}?id=${l.VoucherID}`)}
                                                title="Open source voucher">
                                                <TD>{new Date(l.VoucherDate).toLocaleDateString()}</TD>
                                                <TD mono color="#1e40af">{l.VoucherNo}</TD>
                                                <TD>{l.VoucherTypeCode}</TD>
                                                <TD>{l.GLTitle}</TD>
                                                <TD>{l.DepartmentName || <span style={{ color: '#b91c1c' }}>Unassigned</span>}</TD>
                                                <TD>{l.Narration || l.Remarks || '—'}</TD>
                                                <TD align="right" bold>{fmt(l.Amount)}</TD>
                                                <TD><ArrowRight size={12} color="#94a3b8" /></TD>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </div>
                    </>
                );
            }}
        </ReportShell>
    );
}

const S = {
    sectionTitle: { padding: '10px 12px', fontWeight: 700, color: '#334155', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', fontSize: '0.85rem' },
    ctrlLabel: { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#334155' },
    ctrlInput: { padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' },
};
