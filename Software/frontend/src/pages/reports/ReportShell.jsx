import React, { useState, useEffect, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Printer, FileSpreadsheet } from 'lucide-react';
import ReportPrintHeader from '../../components/ReportPrintHeader';
import { Paginator } from './Paginator';

// CSV downloader used by ReportShell's Excel button. Emits UTF-8 with BOM so
// Excel handles non-ASCII characters (e.g. Urdu customer names) correctly.
function downloadCsv(filename, headers, rows) {
    const escape = (v) => {
        if (v === null || v === undefined) return '';
        const s = String(v);
        return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.map(escape).join(',')];
    for (const row of rows) lines.push(row.map(escape).join(','));
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

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
    // Optional Excel/CSV export. Pass a function (data, params) => {
    //   filename: 'job-card-register-2026-07.csv',
    //   headers: ['Card #', 'Date', ...],
    //   rows:    [['GR-3110', '2026-07-10', ...], ...]
    // }
    // When provided, ReportShell renders an "Export Excel" button. Owner ask
    // 2026-07-14. CSV works because Excel opens .csv as a spreadsheet — no
    // xlsx library dependency needed.
    excelExport,
    // Owner ask 2026-07-18: client-side pagination is on by default. If the
    // payload has a `rows` array, ReportShell slices it before handing it to
    // the child render function and renders a Paginator strip at the bottom.
    // Reports whose payload doesn't have `rows` (Balance Sheet, P&L, etc.)
    // are unaffected — the strip stays hidden because sourceRows is null.
    // Pass `paginate={false}` to opt out (rare) or `paginate={{ key:'foo',
    // size:100 }}` to point at a different array or override the page size.
    // Excel export always sees the full unfiltered array — the cursor never
    // truncates exports.
    paginate = true,
}) {
    const [params, setParams] = useState(defaultParams);
    const [data, setData]     = useState(null);
    const [loading, setLoad]  = useState(false);
    const [err, setErr]       = useState(null);

    const load = useCallback(async () => {
        setLoad(true); setErr(null);
        try {
            // `endpoint` is normally a slug appended to /api/reports/. If a
            // caller passes an absolute API path (starts with `/`) we honour
            // that instead — used by non-report screens (e.g. Charity Tracker
            // at /api/charity/entries) that want ReportShell's pagination,
            // print + Excel affordances.
            const url = endpoint.startsWith('/')
                ? endpoint
                : `${API_BASE}/reports/${endpoint}`;
            const res = await axios.get(url, { params });
            setData(res.data);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setData(null);
        }
        setLoad(false);
    }, [endpoint, params]);

    useEffect(() => { load(); }, [load]);

    const updateParam = (k, v) => setParams(p => ({ ...p, [k]: v }));

    // ---- Pagination: slice data[key] transparently ----
    const pgCfg = useMemo(() => {
        if (!paginate) return null;
        if (typeof paginate === 'object') return { key: paginate.key || 'rows', size: paginate.size || 50 };
        return { key: paginate === true ? 'rows' : paginate, size: 50 };
    }, [paginate]);
    const [page, setPage]         = useState(1);
    const [pageSize, setPageSize] = useState(pgCfg?.size || 50);
    // Reset to page 1 whenever the underlying rows change (new filter, etc.)
    const sourceRows = pgCfg && data && Array.isArray(data[pgCfg.key]) ? data[pgCfg.key] : null;
    useEffect(() => { setPage(1); }, [sourceRows]);
    const totalRows  = sourceRows ? sourceRows.length : 0;
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize));
    const safePage   = Math.min(Math.max(1, page), totalPages);
    const pagedData  = useMemo(() => {
        if (!pgCfg || !data) return data;
        if (!sourceRows) return data;
        const start = (safePage - 1) * pageSize;
        return { ...data, [pgCfg.key]: sourceRows.slice(start, start + pageSize) };
    }, [pgCfg, data, sourceRows, safePage, pageSize]);

    // ---- Print: bypass pagination entirely ----
    // Owner ask 2026-08-17: pagination (added 2026-07-18 so huge on-screen
    // tables didn't crawl) had the side effect of only ever putting the
    // CURRENT page's rows in the DOM at all -- Print just captured whatever
    // was already rendered, so a paginated report only ever printed one
    // page. Printing renders the FULL dataset for a moment, fires the
    // browser print dialog once that's actually painted, then reverts to
    // the paginated view for on-screen browsing.
    const [printingAll, setPrintingAll] = useState(false);
    const handlePrint = () => {
        if (pgCfg && totalRows > pageSize) setPrintingAll(true);
        else window.print();
    };
    useEffect(() => {
        if (!printingAll) return;
        // Double rAF: the first fires before the browser paints this frame's
        // DOM changes, the second confirms the paint actually happened --
        // needed since swapping in thousands of extra rows isn't instant.
        let raf2;
        const raf1 = requestAnimationFrame(() => { raf2 = requestAnimationFrame(() => window.print()); });
        return () => { cancelAnimationFrame(raf1); if (raf2) cancelAnimationFrame(raf2); };
    }, [printingAll]);
    useEffect(() => {
        const onAfterPrint = () => setPrintingAll(false);
        window.addEventListener('afterprint', onAfterPrint);
        return () => window.removeEventListener('afterprint', onAfterPrint);
    }, []);

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
                    {excelExport && (
                        <button type="button" className="erp-btn erp-btn-sm"
                            onClick={() => {
                                // Export always uses the FULL unfiltered data
                                // regardless of the current page cursor.
                                const spec = excelExport(data, params);
                                if (!spec || !spec.headers) return;
                                downloadCsv(spec.filename || `${endpoint.replace(/\//g,'-')}.csv`,
                                            spec.headers, spec.rows || []);
                            }}
                            disabled={loading || !data}
                            title="Download as .csv (opens in Excel)">
                            <FileSpreadsheet size={14} /> Excel
                        </button>
                    )}
                    <button type="button" className="erp-btn erp-btn-sm erp-btn-primary" onClick={handlePrint}
                        disabled={loading || !data || printingAll}>
                        <Printer size={14} /> {printingAll ? 'Preparing…' : 'Print'}
                    </button>
                </div>
            </div>
            {err && (
                <div className="erp-alert danger">{err}</div>
            )}
            {data && children(printingAll ? data : pagedData, { params, updateParam, reload: load, loading, Icon })}
            {!printingAll && pgCfg && totalRows > pageSize && (
                <Paginator
                    page={safePage}
                    pageSize={pageSize}
                    totalRows={totalRows}
                    totalPages={totalPages}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => { setPageSize(n); setPage(1); }}
                />
            )}
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
