import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Printer } from 'lucide-react';
import ReportPrintHeader from '../../components/ReportPrintHeader';

export const API_BASE = '/api';

export const fmt = (n) => Number(n || 0).toLocaleString('en-PK', {
    minimumFractionDigits: 2, maximumFractionDigits: 2
});

export const fmtInt = (n) => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 });

/**
 * Common shell for every report page.
 * Children receive (data, params, setParams, reload).
 */
export default function ReportShell({
    title, subtitle, icon: Icon, endpoint, defaultParams = {}, controls, children,
    printFilterSummary,
    // Owner ask 2026-07-04: NO report may print with clipped columns. Landscape
    // is now the default for every report — it's the world-class norm for
    // accounting/inventory PDFs and gives the table 297mm of horizontal room.
    // Pass `landscape={false}` explicitly on the rare very-narrow report
    // (Financials trial-balance-style pages) if portrait is preferred.
    landscape = true,
    // `superWide` marks reports with 12+ columns where 8pt isn't small enough
    // to fit landscape. Applies a 7.5pt/2pt-padding CSS variant.
    superWide = false,
}) {
    const [params, setParams] = useState(defaultParams);
    const [data, setData]     = useState(null);
    const [loading, setLoad]  = useState(false);
    const [err, setErr]       = useState(null);

    const load = useCallback(async () => {
        setLoad(true); setErr(null);
        try {
            const res = await axios.get(`${API_BASE}/reports/${endpoint}`, { params });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoad(false);
    }, [endpoint, params]);

    useEffect(() => { load(); }, [load]);

    const updateParam = (k, v) => setParams(p => ({ ...p, [k]: v }));

    const printedAt = new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' });
    const filterSummary = typeof printFilterSummary === 'function'
        ? printFilterSummary(params)
        : formatFilterSummary(params);

    // Toggle the page-orientation class on <body> while this report is mounted.
    // We do it on body (not the wrapper) because @page bindings resolve at the
    // root document element in most browsers.
    useEffect(() => {
        if (!landscape) return;
        document.body.classList.add('print-landscape');
        return () => document.body.classList.remove('print-landscape');
    }, [landscape]);

    const wrapperClass = [
        landscape ? 'report-landscape' : null,
        superWide ? 'report-super-wide' : null,
    ].filter(Boolean).join(' ');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className={wrapperClass || undefined}>
            <PrintHeader title={title} subtitle={subtitle} printedAt={printedAt} filterSummary={filterSummary} />
            <div className="erp-control-panel no-print">
                <div style={{ marginRight: 'auto' }}>
                    <div className="title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {Icon && <Icon size={16} color="var(--erp-brand)" />}
                        {title}
                    </div>
                    {subtitle && <div className="subtitle">{subtitle}</div>}
                </div>
                <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
                    {controls && controls({ params, updateParam })}
                    <button type="button" className="erp-btn erp-btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                    <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={() => window.print()}
                        disabled={loading || !data}>
                        <Printer size={14} /> Print
                    </button>
                </div>
            </div>
            {err && (
                <div className="erp-alert danger">{err}</div>
            )}
            {data && children(data, { params, updateParam, reload: load, loading, Icon })}
        </div>
    );
}

function formatFilterSummary(params) {
    if (!params) return '';
    const parts = [];
    if (params.from && params.to) parts.push(`Period: ${params.from} → ${params.to}`);
    else if (params.asOf) parts.push(`As of: ${params.asOf}`);
    else if (params.date) parts.push(`Date: ${params.date}`);
    return parts.join('  •  ');
}

// Re-exported so legacy report pages that still `import { PrintHeader } from
// './reports/ReportShell'` keep compiling. All rendering delegates to the new
// business-profile-backed ReportPrintHeader — no company details are
// hard-coded here anymore (owner ask 2026-07-03).
export function PrintHeader(props) {
    return <ReportPrintHeader {...props} />;
}

// Legacy no-op left in place so the old class name still targets nothing.
function _legacyPrintHeaderPlaceholder({ title, subtitle, printedAt, filterSummary }) {
    return (
        <div className="print-only print-header" style={{ display: 'none' }}>
            <h1>{title}</h1>
            {subtitle && <div>{subtitle}</div>}
            <div className="meta"><span>{filterSummary}</span><span>Printed: {printedAt}</span></div>
        </div>
    );
}

// Inline-styled helpers (reused across reports)
export const TH = ({ children, align = 'left', width }) => (
    <th style={{
        padding: 10, textAlign: align, fontSize: '0.7rem', color: '#64748b',
        textTransform: 'uppercase', width
    }}>{children}</th>
);

export const TD = ({ children, align = 'left', mono, color, bold }) => (
    <td style={{
        padding: '8px 12px', textAlign: align,
        fontFamily: mono ? 'monospace' : undefined,
        color, fontWeight: bold ? 600 : undefined,
        whiteSpace: align === 'right' ? 'nowrap' : undefined
    }}>{children}</td>
);

export const todayISO = () => new Date().toISOString().slice(0, 10);
export const yearStartISO = () => new Date(new Date().getFullYear(), 0, 1).toISOString().slice(0, 10);

export const DateInput = ({ value, onChange, label = 'Date' }) => (
    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.875rem' }}>
        {label}:
        <input type="date" value={value || todayISO()} onChange={e => onChange(e.target.value)}
            style={{ padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6 }} />
    </label>
);

export const PeriodControls = ({ params, updateParam }) => (
    <>
        <DateInput label="From" value={params.from} onChange={v => updateParam('from', v)} />
        <DateInput label="To"   value={params.to}   onChange={v => updateParam('to', v)} />
    </>
);

export const AsOfControl = ({ params, updateParam }) => (
    <DateInput label="As of" value={params.asOf} onChange={v => updateParam('asOf', v)} />
);

export const SingleDateControl = ({ params, updateParam }) => (
    <DateInput value={params.date} onChange={v => updateParam('date', v)} />
);
