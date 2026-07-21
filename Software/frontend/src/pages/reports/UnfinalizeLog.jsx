// Unfinalize activity report — every JC unfinalize request across every
// workflow state, filterable by date / status / RO# / requester.
// Owner ask 2026-07-21. Gated behind report:unfinalize_log, am_approve,
// or admin_unfinalize.
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Undo2, ArrowRight } from 'lucide-react';
import ReportShell, { TH, TD, todayISO, yearStartISO } from './ReportShell';

const STATUS_META = {
    PENDING:      { label: 'Pending AM',   bg: '#fef3c7', color: '#92400e' },
    AM_APPROVED:  { label: 'AM Approved',  bg: '#dbeafe', color: '#1e3a8a' },
    COMPLETED:    { label: 'Unfinalized',  bg: '#dcfce7', color: '#166534' },
    REJECTED:     { label: 'Rejected',     bg: '#fee2e2', color: '#991b1b' },
};

const fmtDT = (v) => v ? new Date(v).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
const fmtD  = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';

function UnfinalizeControls({ params, updateParam }) {
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
            <label style={S.ctrlLabel}>
                Status
                <select value={params.status || 'ALL'}
                        onChange={e => updateParam('status', e.target.value)}
                        style={S.ctrlInput}>
                    <option value="ALL">All</option>
                    <option value="PENDING">Pending AM</option>
                    <option value="AM_APPROVED">AM Approved</option>
                    <option value="COMPLETED">Unfinalized</option>
                    <option value="REJECTED">Rejected</option>
                </select>
            </label>
            <label style={S.ctrlLabel}>
                JC / RO #
                <input type="text" value={params.search || ''} placeholder="e.g. GR-3232"
                       onChange={e => updateParam('search', e.target.value)}
                       style={{ ...S.ctrlInput, width: 140 }} />
            </label>
            <label style={S.ctrlLabel}>
                Requester
                <input type="text" value={params.requester || ''} placeholder="e.g. Ramzan"
                       onChange={e => updateParam('requester', e.target.value)}
                       style={{ ...S.ctrlInput, width: 140 }} />
            </label>
        </>
    );
}

export default function UnfinalizeLog() {
    const navigate = useNavigate();
    return (
        <ReportShell
            title="Unfinalize Log (Job Cards)"
            subtitle="Every unfinalize request against a Job Card — pending, AM-approved, executed, or rejected."
            icon={Undo2}
            endpoint="/api/reports/unfinalize-log"
            defaultParams={{ from: yearStartISO(), to: todayISO(), status: 'ALL', search: '', requester: '' }}
            controls={UnfinalizeControls}
            excelExport={(data) => ({
                filename: `unfinalize-log-${todayISO()}.csv`,
                headers: ['Requested At','JC No','JC Date','Advisor','Customer','Reg #','Requester','Reason','Status','AM Approved At','AM By','Executed At','Executed By','Rejected At','Rejected By','Rejection Reason'],
                rows: (data?.rows || []).map(r => [
                    fmtDT(r.RequestedAt),
                    r.JobCardNo || r.EntityRef || '',
                    fmtD(r.JobCardDate),
                    r.ServiceAdvisor || '',
                    r.CustomerName || '',
                    r.VehicleRegNo || '',
                    r.RequestedByName || '',
                    r.Reason || '',
                    STATUS_META[r.Status]?.label || r.Status || '',
                    fmtDT(r.AMApprovedAt),
                    r.AMApprovedByName || '',
                    fmtDT(r.AdminApprovedAt),
                    r.AdminApprovedByName || '',
                    fmtDT(r.RejectedAt),
                    r.RejectedByName || '',
                    r.RejectionReason || '',
                ]),
            })}
        >
            {(data) => (
                <>
                    <div className="card" style={S.kpiRow}>
                        <KPI label="Total requests" value={data.summary?.requestCount || 0} big strong />
                        <KPI label="Pending AM"    value={data.summary?.pending || 0}    colour="#92400e" />
                        <KPI label="AM Approved"   value={data.summary?.amApproved || 0} colour="#1e3a8a" />
                        <KPI label="Unfinalized"   value={data.summary?.completed || 0}  colour="#166534" />
                        <KPI label="Rejected"      value={data.summary?.rejected || 0}   colour="#991b1b" />
                    </div>

                    <div className="card">
                        {data.rows.length === 0 ? (
                            <div style={{ padding: 24, color: '#64748b', textAlign: 'center' }}>
                                No unfinalize requests match the selected filters.
                            </div>
                        ) : (
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                                <thead>
                                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                                        <TH>Requested</TH>
                                        <TH>JC No</TH>
                                        <TH>Advisor</TH>
                                        <TH>Customer / Reg</TH>
                                        <TH>Requester</TH>
                                        <TH>Reason</TH>
                                        <TH>Status</TH>
                                        <TH>Timeline</TH>
                                        <TH></TH>
                                    </tr>
                                </thead>
                                <tbody>
                                    {data.rows.map(r => {
                                        const meta = STATUS_META[r.Status] || { label: r.Status, bg: '#e2e8f0', color: '#334155' };
                                        const jcRef = r.JobCardNo || r.EntityRef || `#${r.EntityID}`;
                                        return (
                                            <tr key={r.RequestID}
                                                style={{ borderBottom: '1px solid #f1f5f9', cursor: r.EntityID ? 'pointer' : 'default' }}
                                                onClick={() => r.EntityID && navigate(`/workshop/jobs/${r.EntityID}`)}
                                                title={r.EntityID ? 'Open the Job Card' : ''}>
                                                <TD>{fmtDT(r.RequestedAt)}</TD>
                                                <TD mono color="#1e40af">{jcRef}</TD>
                                                <TD>{r.ServiceAdvisor || <span style={{ color: '#94a3b8' }}>—</span>}</TD>
                                                <TD>
                                                    <div style={{ lineHeight: 1.3 }}>
                                                        <div>{r.CustomerName || '—'}</div>
                                                        {r.VehicleRegNo && <div style={{ color: '#64748b', fontSize: '0.78rem' }}>{r.VehicleRegNo}</div>}
                                                    </div>
                                                </TD>
                                                <TD>{r.RequestedByName || ''}</TD>
                                                <TD color="#334155">{r.Reason || ''}</TD>
                                                <TD>
                                                    <span style={{ background: meta.bg, color: meta.color,
                                                                    padding: '2px 8px', borderRadius: 12,
                                                                    fontSize: '0.72rem', fontWeight: 700 }}>
                                                        {meta.label}
                                                    </span>
                                                </TD>
                                                <TD>
                                                    <div style={{ fontSize: '0.72rem', color: '#64748b', lineHeight: 1.3 }}>
                                                        {r.AMApprovedAt && <div>AM: {fmtDT(r.AMApprovedAt)} · {r.AMApprovedByName}</div>}
                                                        {r.AdminApprovedAt && <div>Exec: {fmtDT(r.AdminApprovedAt)} · {r.AdminApprovedByName}</div>}
                                                        {r.RejectedAt && <div style={{ color: '#991b1b' }}>Rej: {fmtDT(r.RejectedAt)} · {r.RejectedByName}</div>}
                                                        {r.RejectionReason && <div style={{ color: '#991b1b' }}>"{r.RejectionReason}"</div>}
                                                    </div>
                                                </TD>
                                                <TD>{r.EntityID && <ArrowRight size={12} color="#94a3b8" />}</TD>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </>
            )}
        </ReportShell>
    );
}

function KPI({ label, value, colour, big, strong }) {
    return (
        <div style={S.kpi}>
            <div style={S.kpiLabel}>{label}</div>
            <div style={{
                ...S.kpiValue,
                fontSize: big ? '1.4rem' : '1.05rem',
                fontWeight: strong ? 800 : 700,
                color: colour || '#0f172a',
            }}>
                {value}
            </div>
        </div>
    );
}

const S = {
    kpiRow: { display: 'flex', gap: 24, flexWrap: 'wrap', alignItems: 'center' },
    kpi: { minWidth: 130 },
    kpiLabel: {
        fontSize: '0.7rem', color: '#64748b',
        textTransform: 'uppercase', letterSpacing: '0.1em',
        fontWeight: 700, marginBottom: 4,
    },
    kpiValue: { lineHeight: 1.1 },
    ctrlLabel: {
        display: 'inline-flex', alignItems: 'center', gap: 6,
        fontSize: '0.85rem', color: '#334155',
    },
    ctrlInput: {
        padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 6,
        fontSize: '0.85rem',
    },
};
