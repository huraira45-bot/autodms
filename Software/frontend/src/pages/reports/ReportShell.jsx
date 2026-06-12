import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Loader2, RefreshCw } from 'lucide-react';

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
    title, subtitle, icon: Icon, endpoint, defaultParams = {}, controls, children
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

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">{title}</h1>
                    {subtitle && <p className="page-subtitle">{subtitle}</p>}
                </div>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                    {controls && controls({ params, updateParam })}
                    <button className="btn" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
                        Refresh
                    </button>
                </div>
            </div>
            {err && (
                <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c' }}>
                    {err}
                </div>
            )}
            {data && children(data, { params, updateParam, reload: load, loading, Icon })}
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
