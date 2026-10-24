import { Fragment, useState } from 'react';
import { Link } from 'react-router-dom';
import { History } from 'lucide-react';
import { SnapshotLines } from '../../components/VoucherEditHistory';
import ReportShell, { TH, TD, fmtInt } from './ReportShell';

const today = () => new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
const timestamp = value => new Date(value).toLocaleString('en-GB', { timeZone: 'Asia/Karachi', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const text = value => value == null ? '—' : typeof value === 'boolean' ? (value ? 'Yes' : 'No') : typeof value === 'object' ? JSON.stringify(value) : String(value);
const csv = value => /^[=+\-@\t\r]/.test(String(value || '')) ? `'${value}` : value ?? '';
const types = { CPV: 'cpv', CRV: 'crv', BPV: 'bpv', BRV: 'brv', JV: 'jv' };
const actions = { VOUCHER_EDIT: 'Voucher edited', DATE_CHANGE: 'Date changed', LINE_DEPARTMENT_CHANGE: 'Department / expense changed', EXPENSE_FLAG_CHANGE: 'Expense flags changed', LEGACY_DATE_CHANGE: 'Earlier date-only changes' };
function Controls({ params, updateParam }) {
    const [draft, setDraft] = useState(params);
    const field = (key, label, type = 'text', maxLength) => <label style={{ fontSize: 12 }}>{label}<input type={type} value={draft[key] || ''} maxLength={maxLength}
        onChange={event => setDraft(d => ({ ...d, [key]: event.target.value }))} style={{ display: 'block', padding: 7, border: '1px solid #cbd5e1', borderRadius: 5 }} /></label>;
    return <>
        <Link className="erp-btn" to="/reports/voucher-audit">Voucher lifecycle</Link>
        <form onSubmit={event => { event.preventDefault(); for (const key of ['from', 'to', 'voucherNo', 'changedBy', 'action']) updateParam(key, draft[key] || undefined); }} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end' }}>
            {field('from', 'Edited from (PKT)', 'date')}{field('to', 'Edited to (PKT)', 'date')}
            {field('changedBy', 'Edited by / username', 'text', 100)}{field('voucherNo', 'Voucher number', 'text', 50)}
            <label style={{ fontSize: 12 }}>Edit action<select value={draft.action || ''} onChange={event => setDraft(d => ({ ...d, action: event.target.value }))} style={{ display: 'block', padding: 7, border: '1px solid #cbd5e1', borderRadius: 5 }}>
                <option value="">All edits</option>{Object.entries(actions).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select></label>
            <button type="submit" className="erp-btn erp-btn-primary">Find edits</button>
        </form>
    </>;
}
function ChangeDetail({ row }) {
    return <div style={{ padding: 10 }}>
        <strong>{row.Coverage}</strong>
        {row.Action === 'LEGACY_DATE_CHANGE' && <p>Only the earlier voucher date change was recorded. Line details are unavailable for this record.</p>}
        {row.Changes.length > 0 && <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
            <thead><tr><TH>Section</TH><TH>Field</TH><TH>Before edit</TH><TH>After edit</TH></tr></thead>
            <tbody>{row.Changes.map((change, index) => <tr key={index}><TD>{change.Section}</TD><TD>{change.Field}</TD>
                <TD><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text(change.Before)}</div></TD><TD><div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text(change.After)}</div></TD></tr>)}</tbody>
        </table>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12 }}><SnapshotLines title="Before edit" snapshot={row.Before} /><SnapshotLines title="After edit" snapshot={row.After} /></div>
    </div>;
}

export default function VoucherEditAudit() {
    const [expanded, setExpanded] = useState({});
    return <ReportShell title="Voucher Edit Audit" icon={History} endpoint="voucher-edit-audit" defaultParams={{ from: today(), to: today() }} superWide
        subtitle="Who edited which voucher, when, and what changed. Dates and times use Pakistan time."
        controls={props => <Controls {...props} />}
        printFilterSummary={params => [`Edited ${params.from || ''} to ${params.to || ''} (PKT)`, params.changedBy && `User: ${params.changedBy}`, params.voucherNo && `Voucher: ${params.voucherNo}`, params.action && actions[params.action]].filter(Boolean).join(' | ')}
        excelExport={data => ({ filename: `voucher-edit-audit-${data.from}-to-${data.to}.csv`,
            headers: ['Edit ID', 'Edited at (Pakistan)', 'Edited by', 'User ID', 'Voucher', 'Type', 'Edit action', 'Voucher date before', 'Voucher date after', 'Section', 'Field', 'Before edit', 'After edit', 'Reason', 'History coverage'],
            rows: data.rows.flatMap(row => (row.Changes.length ? row.Changes : [null]).map(change => [row.EditID, timestamp(row.EditedAtUtc), row.ChangedByName, row.ChangedBy,
                row.VoucherNo, row.VoucherType, row.ActionLabel, row.VoucherDateBefore, row.VoucherDateAfter, change?.Section || '', change?.Field || row.ChangesSummary,
                change ? text(change.Before) : '', change ? text(change.After) : '', row.Reason, row.Coverage].map(csv))),
        })}>
        {data => <>
            <div className="card" style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                <span>Edits: <strong>{fmtInt(data.totals.edits)}</strong></span><span>Vouchers: <strong>{fmtInt(data.totals.vouchers)}</strong></span>
                <span>Identified users: <strong>{fmtInt(data.totals.users)}</strong></span><span>Earlier date-only records: <strong>{fmtInt(data.totals.legacyDateOnly)}</strong></span>
            </div>
            <p className="hint">Filters apply to the day the edit was made, including edits to older vouchers. Earlier unlogged changes cannot be reconstructed.</p>
            <div className="card" style={{ overflowX: 'auto' }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead><tr><TH>Edited at (PKT)</TH><TH>Edited by</TH><TH>Voucher</TH><TH>Edit action</TH><TH>Voucher date</TH><TH>What changed</TH><TH>Reason</TH><th className="no-print">Details</th></tr></thead>
                <tbody>{!data.rows.length && <tr><td colSpan={8} style={{ padding: 24 }}>No recorded voucher edits match these dates and filters.</td></tr>}
                    {data.rows.map(row => <Fragment key={row.EditID}><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                        <TD>{timestamp(row.EditedAtUtc)}<div><small>Edit #{row.EditID}</small></div></TD><TD><strong>{row.ChangedByName}</strong><div><small>User #{row.ChangedBy}</small></div></TD>
                        <TD>{row.VoucherExists ? <Link to={`/vouchers/${types[row.VoucherType] || 'jv'}?id=${row.VoucherID}`}>{row.VoucherNo || `#${row.VoucherID}`}</Link> : <strong>{row.VoucherNo || `#${row.VoucherID}`}</strong>}<div><small>{row.VoucherType}{!row.VoucherExists && ' · Voucher no longer present'}</small></div></TD>
                        <TD>{row.ActionLabel}</TD><TD>{row.VoucherDateAfter || row.VoucherDateBefore || '—'}</TD>
                        <TD><div style={{ maxWidth: 300, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{row.ChangesSummary}</div></TD><TD>{row.Reason || 'Not provided'}</TD>
                        <td className="no-print" style={{ padding: 10 }}><button className="erp-btn" aria-expanded={!!expanded[row.EditID]} onClick={() => setExpanded(p => ({ ...p, [row.EditID]: !p[row.EditID] }))}>{expanded[row.EditID] ? 'Hide' : 'View changes'}</button></td>
                    </tr>{expanded[row.EditID] && <tr><td colSpan={8}><ChangeDetail row={row} /></td></tr>}</Fragment>)}
                </tbody>
            </table></div>
        </>}
    </ReportShell>;
}
