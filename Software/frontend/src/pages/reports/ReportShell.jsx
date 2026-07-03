import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw, Printer } from 'lucide-react';

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
    // Owner ask 2026-07-03: wide reports (JC Register etc.) were clipping the
    // rightmost columns because the print CSS forces A4 portrait. Opt-in
    // landscape via this prop; ReportShell just adds a class that the
    // print CSS uses to reassign the @page rule.
    landscape = false,
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }} className={landscape ? 'report-landscape' : undefined}>
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

export function PrintHeader({ title, subtitle, printedAt, filterSummary }) {
    return (
        <div className="print-only print-header">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ width: 74, height: 56, border: '1px solid #64748b', display: 'flex', flexDirection: 'column',
                              alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <div style={{ fontSize: 20, lineHeight: 1 }}>⌖</div>
                    <div style={{ fontSize: '6pt', textAlign: 'center', marginTop: 2 }}>CHANGAN AUTO<br/>MULTAN</div>
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                    <div style={{ fontSize: '14pt', fontWeight: 700 }}>CHANGAN MULTAN MOTORS</div>
                    <div style={{ fontSize: '8pt', color: '#334155', marginTop: 1 }}>
                        NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN.&nbsp;&nbsp;Phone#: 061-111-222-388
                    </div>
                </div>
            </div>
            <div style={{ borderTop: '1px solid #0f172a', marginTop: 6, paddingTop: 6 }}>
                <h1>{title}</h1>
                {subtitle && <div style={{ fontSize: '9pt', color: '#475569', marginTop: 2 }}>{subtitle}</div>}
                <div className="meta">
                    <span>{filterSummary}</span>
                    <span>Printed: {printedAt}</span>
                </div>
            </div>
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
