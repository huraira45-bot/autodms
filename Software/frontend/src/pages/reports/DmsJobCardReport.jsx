import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardList, Search } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ReportShell, { TH, TD } from './ReportShell';

const inputStyle = { padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 };
const safeCell = value => typeof value === 'string' && /^[\s]*[=+\-@\t\r]/.test(value) ? `'${value}` : value;

function NumberSearch({ number, updateParam }) {
    const [draft, setDraft] = useState(number || '');
    return <form onSubmit={event => { event.preventDefault(); updateParam('number', draft.trim()); }}
        style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        <label htmlFor="dms-job-card-number">DMS job card number (optional)</label>
        <input id="dms-job-card-number" value={draft} onChange={event => setDraft(event.target.value)}
            placeholder="Leave blank for all cards in the date range" maxLength={50} style={{ ...inputStyle, width: 285 }} />
        <button type="submit" className="erp-btn erp-btn-primary"><Search size={14} /> Search</button>
        <button type="button" className="erp-btn" onClick={() => { setDraft(''); updateParam('number', ''); }}>Clear</button>
    </form>;
}

export default function DmsJobCardReport() {
    const { hasPermission } = useAuth();
    const canOpen = hasPermission('workshop_jobs:view');
    if (!canOpen && !hasPermission('report:job_card_register'))
        return <div className="erp-alert danger">You do not have permission to view this report.</div>;
    return <ReportShell title="DMS Job Card Lookup"
        subtitle="Leave the DMS number blank and select From/To dates to see all job cards in that period. Enter a number to narrow the results."
        icon={ClipboardList} endpoint="service/dms-job-cards"
        defaultParams={{ number: '', match: 'contains', from: '', to: '', finalized: 'all' }}
        superWide
        printFilterSummary={params => [
            params.number ? `DMS number: ${params.number} (${params.match === 'exact' ? 'exact' : 'contains'})` : 'DMS number: All',
            `Job card dates: ${params.from || 'Any'} to ${params.to || 'Any'}`, `Finalization: ${params.finalized}`,
        ].join(' | ')}
        excelExport={data => ({
            filename: 'dms-job-card-lookup.csv',
            headers: ['DMS Job Card Number', 'RO Number', 'Internal Job Number', 'Job Card Date', 'Customer',
                'CNIC', 'Phone', 'Credit Party', 'Vehicle Registration', 'Chassis', 'Vehicle Model',
                'Business Unit', 'Service Advisor', 'Payment Type', 'Job Status', 'Finalization'],
            rows: (data.rows || []).map(row => [row.DMSJobCardNo, row.JobCardNo, row.jobCode, row.JobCardDate,
                row.CustomerName, row.CNIC, row.PhoneNo, row.CreditPartyName, row.VehicleRegNo, row.ChasisNo,
                row.VehicleModel, row.JobTypeName, row.ServiceAdvisor, row.PaymentType, row.JobStatusText,
                row.IsFinalized ? 'Finalized' : 'Draft'].map(safeCell)),
        })}
        controls={({ params, updateParam }) => <>
            <NumberSearch number={params.number} updateParam={updateParam} />
            <label>Match <select value={params.match} onChange={event => updateParam('match', event.target.value)} style={inputStyle}>
                <option value="contains">Contains</option><option value="exact">Exact number</option>
            </select></label>
            <label>From <input type="date" aria-label="Job card date from" value={params.from}
                onChange={event => updateParam('from', event.target.value)} style={inputStyle} /></label>
            <label>To <input type="date" aria-label="Job card date to" value={params.to}
                onChange={event => updateParam('to', event.target.value)} style={inputStyle} /></label>
            <label>Finalization <select value={params.finalized} onChange={event => updateParam('finalized', event.target.value)} style={inputStyle}>
                <option value="all">All</option><option value="draft">Draft</option><option value="finalized">Finalized</option>
            </select></label>
        </>}
    >
        {(data, { loading }) => <>
            <div style={{ color: 'var(--erp-text-muted)', fontSize: 13 }} role="status">
                {loading ? 'Searching...' : data.searchRequired ? 'Enter a DMS job card number, or select both From and To dates to show all cards in that period.' : `${data.count} matching job card(s).`}
            </div>
            {!data.searchRequired && !loading && data.count === 0 && <div className="erp-alert">
                No job cards match the selected filters. Check the date range, DMS number and finalization filter.
            </div>}
            {!data.searchRequired && data.count > 0 && <div className="erp-panel" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <thead><tr><TH>DMS job card #</TH><TH>RO / Job #</TH><TH>Job card date</TH><TH>Customer</TH>
                        <TH>Vehicle</TH><TH>Business unit</TH><TH>Advisor</TH><TH>Payment</TH><TH>Job status</TH><TH>Finalization</TH>
                    </tr></thead>
                    <tbody>{data.rows.map(row => <tr key={row.JobCardId} style={{ borderTop: '1px solid #e2e8f0' }}>
                        <TD mono bold>{row.DMSJobCardNo || '-'}</TD>
                        <TD>{canOpen ? <Link to={`/workshop/jobs/${row.JobCardId}`} style={{ color: 'var(--erp-brand)', fontWeight: 600 }}>
                            {row.JobCardNo || `#${row.JobCardId}`}</Link> : row.JobCardNo || `#${row.JobCardId}`}
                            <div>{row.jobCode || ''}</div></TD>
                        <TD>{row.JobCardDate || '-'}</TD>
                        <TD><strong>{row.CustomerName || row.CreditPartyName || '-'}</strong>
                            <div>{row.CNIC || ''}</div><div>{row.PhoneNo || ''}</div>
                            {row.CustomerName && row.CreditPartyName && <div>Party: {row.CreditPartyName}</div>}</TD>
                        <TD>{row.VehicleRegNo || '-'}<div>{row.ChasisNo || ''}</div><div>{row.VehicleModel || ''}</div></TD>
                        <TD>{row.JobTypeName || '-'}</TD><TD>{row.ServiceAdvisor || '-'}</TD>
                        <TD>{row.PaymentType || '-'}</TD><TD>{row.JobStatusText}</TD>
                        <TD>{row.IsFinalized ? 'Finalized' : 'Draft'}</TD>
                    </tr>)}</tbody>
                </table>
            </div>}
        </>}
    </ReportShell>;
}
