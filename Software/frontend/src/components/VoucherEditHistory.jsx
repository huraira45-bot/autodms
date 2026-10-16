import { useEffect, useState } from 'react';
import axios from 'axios';

const actions = {
    VOUCHER_EDIT: 'Voucher edited', DATE_CHANGE: 'Date changed',
    LINE_DEPARTMENT_CHANGE: 'Department / expense changed', EXPENSE_FLAG_CHANGE: 'Expense flags changed',
    LEGACY_DATE_CHANGE: 'Earlier date change (date-only record)',
};
const money = v => Number(v || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const value = v => v == null || v === '' ? '—' : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v);
const cell = { padding: '7px 8px', borderBottom: '1px solid #e2e8f0', textAlign: 'left', verticalAlign: 'top' };
const stamp = v => new Date(v).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' });

function SnapshotLines({ title, snapshot }) {
    const lines = snapshot?.Lines;
    return <div style={{ flex: '1 1 420px', minWidth: 0 }}>
        <strong>{title}</strong>
        <p style={{ fontSize: 12 }}>Business date: {value(snapshot?.Header?.VoucherDate?.slice(0, 10))} · Status: {value(snapshot?.Header?.Status)}
            {snapshot?.Header?.TotalAmount != null && <> · Header amount: PKR {money(snapshot.Header.TotalAmount)}</>}</p>
        {!lines ? <p>Line details were not recorded in the earlier date log.</p> : <>
            <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead><tr>{['Account / narration', 'Debit', 'Credit', 'Department / links'].map(t => <th key={t} style={cell}>{t}</th>)}</tr></thead>
                    <tbody>{lines.map((line, i) => <tr key={i}>
                        <td style={cell}><strong>{line.GLCode || `#${line.GLCAID}`} {line.GLTitle}</strong><div style={{ whiteSpace: 'pre-wrap' }}>{line.Narration}</div></td>
                        <td style={cell}>{money(line.Debit)}</td><td style={cell}>{money(line.Credit)}</td>
                        <td style={cell}>
                            <div>{line.DepartmentName || (line.DepartmentID ? `Department #${line.DepartmentID}` : 'No department')}</div>
                            <div>Expense: {value(line.IsExpense)}</div>
                            {['PartyID', 'JobCardID', 'BookingID', 'AllocatedToVoucherID'].filter(k => line[k] != null).map(k => <div key={k}>{k}: {line[k]}</div>)}
                        </td>
                    </tr>)}</tbody>
                    <tfoot><tr><th style={cell}>Total</th><th style={cell}>{money(lines.reduce((s, l) => s + Number(l.Debit), 0))}</th><th style={cell}>{money(lines.reduce((s, l) => s + Number(l.Credit), 0))}</th><td /></tr></tfoot>
                </table>
            </div>
            <p>Manual charity: {snapshot.Charity?.length ? snapshot.Charity.map(c => `PKR ${money(c.CharityAmount)} on ${money(c.VoucherAmount)}`).join(', ') : 'No'}</p>
        </>}
    </div>;
}

function EditDetail({ row }) {
    const before = row.Before?.Header || {}, after = row.After?.Header || {};
    const fields = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(k => value(before[k]) !== value(after[k]));
    return <div style={{ paddingTop: 12 }}>
        {fields.length ? <div style={{ overflowX: 'auto' }}><table style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}>
            <thead><tr><th style={cell}>Header field</th><th style={cell}>Before</th><th style={cell}>After</th></tr></thead>
            <tbody>{fields.map(k => <tr key={k}><td style={cell}>{k}</td><td style={{ ...cell, whiteSpace: 'pre-wrap' }}>{value(before[k])}</td><td style={{ ...cell, whiteSpace: 'pre-wrap' }}>{value(after[k])}</td></tr>)}</tbody>
        </table></div> : <p>Header unchanged. Review the line details below.</p>}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12 }}>
            <SnapshotLines title="Before edit" snapshot={row.Before} /><SnapshotLines title="After edit" snapshot={row.After} />
        </div>
    </div>;
}

export default function VoucherEditHistory({ voucherId }) {
    const [filters, setFilters] = useState({ voucherNo: '', changedBy: '', from: '', to: '' });
    const [query, setQuery] = useState({});
    const [offset, setOffset] = useState(0);
    const [refresh, setRefresh] = useState(0);
    const [result, setResult] = useState({ rows: [], total: 0 });
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const limit = 10;
    useEffect(() => {
        const controller = new AbortController();
        setBusy(true); setError(''); setResult({ rows: [], total: 0 });
        const url = voucherId ? `/api/accounts/vouchers/${voucherId}/edit-history` : '/api/accounts/vouchers/edit-history';
        axios.get(url, { params: { ...query, offset, limit }, signal: controller.signal })
            .then(r => { if (!controller.signal.aborted) setResult(r.data); })
            .catch(err => { if (!controller.signal.aborted) setError(err.response?.data?.error || err.message); })
            .finally(() => { if (!controller.signal.aborted) setBusy(false); });
        return () => controller.abort();
    }, [voucherId, query, offset, refresh]);
    const input = (key, label, type = 'text') => <label style={{ fontSize: 12 }}>{label}<input type={type} value={filters[key]} maxLength={key === 'changedBy' ? 100 : 50}
        onChange={e => setFilters(f => ({ ...f, [key]: e.target.value }))} style={{ display: 'block', padding: 7, border: '1px solid #cbd5e1', borderRadius: 4 }} /></label>;
    return <section className="card" aria-label="Voucher edit history">
        <h3 style={{ margin: '0 0 6px' }}>Voucher edit history</h3>
        <p style={{ color: '#64748b', fontSize: 13 }}>Shows edits recorded after this feature was installed, plus available earlier date changes. Times and date filters use Pakistan time.</p>
        <form onSubmit={e => { e.preventDefault(); setOffset(0); setQuery({ ...filters }); }} style={{ display: 'flex', gap: 8, alignItems: 'end', flexWrap: 'wrap', marginBottom: 12 }}>
            {!voucherId && input('voucherNo', 'Voucher number')}{input('changedBy', 'Edited by')}{input('from', 'Edited from', 'date')}{input('to', 'Edited to', 'date')}
            <button className="erp-btn" type="submit" disabled={busy}>Find edits</button>
            <button className="erp-btn" type="button" onClick={() => setRefresh(n => n + 1)} disabled={busy}>Refresh</button>
        </form>
        {error && <p role="alert" style={{ color: '#b91c1c' }}>{error}</p>}
        {busy ? <p>Loading edit history…</p> : !error && <>
            {!result.rows.length && <p>No recorded edits found. Earlier unlogged edits cannot be reconstructed.</p>}
            {result.rows.map(row => <details key={row.EditID} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 12, marginBottom: 8 }}>
                <summary style={{ cursor: 'pointer', fontSize: 13 }}>
                    <strong>{row.VoucherNo || `Voucher #${row.VoucherID}`}</strong> · {actions[row.Action] || row.Action} · <strong>{row.ChangedByName}</strong> (user #{row.ChangedBy}) · {stamp(row.ChangedAt)} PKT · Edit #{row.EditID}
                </summary>
                <p style={{ whiteSpace: 'pre-wrap', fontSize: 13 }}>Reason: {row.Reason || 'Not provided'}</p>
                <EditDetail row={row} />
            </details>)}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
                <button type="button" className="erp-btn" onClick={() => setOffset(n => Math.max(0, n - limit))} disabled={!offset}>Previous</button>
                <span style={{ fontSize: 13 }}>{result.total ? `${offset + 1}–${Math.min(offset + limit, result.total)} of ${result.total}` : '0 edits'}</span>
                <button type="button" className="erp-btn" onClick={() => setOffset(n => n + limit)} disabled={offset + limit >= result.total}>Next</button>
            </div>
        </>}
    </section>;
}
