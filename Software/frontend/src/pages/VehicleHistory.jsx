/**
 * Vehicle History — search a vehicle by Reg #, Chassis #, or Engine # and
 * see every Job Card ever booked against it, newest first.
 * Owner ask 2026-07-03.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { Search, Loader2, Eye, Car, Lock } from 'lucide-react';
import { fmtDate } from '../utils/datetime';

const API = '/api/workshop';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function VehicleHistory() {
    const navigate = useNavigate();
    const [params, setParams] = useSearchParams();
    const [regNo, setRegNo] = useState(params.get('regNo') || '');
    const [chassis, setChassis] = useState(params.get('chassis') || '');
    const [engine, setEngine] = useState(params.get('engine') || '');
    const [excludeJc] = useState(params.get('excludeJc') || '');
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        const r = regNo.trim(), c = chassis.trim(), e = engine.trim();
        if (!r && !c && !e) { setData(null); return; }
        setLoading(true); setErr('');
        try {
            const res = await axios.get(`${API}/vehicle-history`, {
                params: { regNo: r, chassis: c, engine: e, excludeJc },
            });
            setData(res.data);
        } catch (ex) { setErr(ex.response?.data?.error || ex.message); setData(null); }
        setLoading(false);
    }, [regNo, chassis, engine, excludeJc]);

    // Auto-load if the URL carried the params (link from JC form)
    useEffect(() => {
        if (regNo || chassis || engine) load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const runSearch = (e) => {
        e?.preventDefault?.();
        setParams({ regNo, chassis, engine, ...(excludeJc ? { excludeJc } : {}) });
        load();
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Car size={22} color="var(--primary)" /> Vehicle History
                    </h1>
                    <p className="page-subtitle">Search by Reg #, Chassis #, or Engine # to see every Job Card ever booked against a vehicle.</p>
                </div>
            </div>

            <form onSubmit={runSearch} className="card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) auto', gap: 12, alignItems: 'end' }}>
                <div className="form-group">
                    <label>Registration #</label>
                    <input type="text" value={regNo} onChange={e => setRegNo(e.target.value)} placeholder="e.g. BGF-523" />
                </div>
                <div className="form-group">
                    <label>Chassis #</label>
                    <input type="text" value={chassis} onChange={e => setChassis(e.target.value)} placeholder="e.g. NKMASE2E9S1004582" />
                </div>
                <div className="form-group">
                    <label>Engine #</label>
                    <input type="text" value={engine} onChange={e => setEngine(e.target.value)} placeholder="e.g. 506861" />
                </div>
                <button type="submit" disabled={loading} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6, height: 40 }}>
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={16} />} Search
                </button>
            </form>

            {err && <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', padding: 12 }}>{err}</div>}

            {data && (
                <>
                    <div className="card" style={{ padding: 12, display: 'flex', gap: 24, alignItems: 'center', flexWrap: 'wrap' }}>
                        <Stat label="Job Cards" value={data.count} />
                        <Stat label="Labour" value={'PKR ' + fmt(data.totals.labour)} />
                        <Stat label="Parts"  value={'PKR ' + fmt(data.totals.parts)} />
                        <Stat label="Sublet" value={'PKR ' + fmt(data.totals.sublet)} />
                        <Stat label="Total"  value={'PKR ' + fmt(data.totals.total)} strong />
                    </div>

                    <div className="card">
                        <div className="table-wrapper"><table>
                            <thead><tr>
                                <th>Job Card</th><th>Business Unit</th><th>Date</th>
                                <th>Customer</th><th>Reg #</th><th>KM</th>
                                <th>Payment</th><th>Status</th>
                                <th style={{ textAlign: 'right' }}>Labour</th>
                                <th style={{ textAlign: 'right' }}>Parts</th>
                                <th style={{ textAlign: 'right' }}>Sublet</th>
                                <th style={{ textAlign: 'right' }}>Total</th>
                                <th></th>
                            </tr></thead>
                            <tbody>
                                {data.rows.length === 0 && (
                                    <tr><td colSpan={13} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                        No prior job cards for this vehicle.
                                    </td></tr>
                                )}
                                {data.rows.map(j => (
                                    <tr key={j.JobCardId} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td><strong style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>{j.JobCardNo}</strong></td>
                                        <td>{j.JobTypeCode ? `${j.JobTypeCode} — ${j.JobTypeName}` : '—'}</td>
                                        <td>{fmtDate(j.JobCardDate)}</td>
                                        <td>{j.CustomerName || '—'}</td>
                                        <td style={{ fontFamily: 'monospace' }}>{j.VehicleRegNo || '—'}</td>
                                        <td style={{ textAlign: 'right' }}>{j.Odometer ? Number(j.Odometer).toLocaleString() : '—'}</td>
                                        <td>{j.PaymentType || '—'}</td>
                                        <td>{j.IsFinalized
                                            ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: '#d1fae5', color: '#065f46', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}><Lock size={11} /> Finalized</span>
                                            : <span style={{ background: '#fef3c7', color: '#92400e', padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 700 }}>Draft</span>}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(j.LabourAmount)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(j.PartsAmount)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace' }}>{fmt(j.SubletAmount)}</td>
                                        <td style={{ textAlign: 'right', fontFamily: 'monospace', fontWeight: 700 }}>{fmt(j.TotalAmount)}</td>
                                        <td><button title="Open Job Card"
                                            onClick={() => navigate(`/workshop/jobs/${j.JobCardId}`)}
                                            style={{ background: 'none', border: '1px solid #e2e8f0', borderRadius: 6, padding: 6, cursor: 'pointer' }}>
                                            <Eye size={16} />
                                        </button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table></div>
                    </div>
                </>
            )}
        </div>
    );
}

function Stat({ label, value, strong }) {
    return (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.4 }}>{label}</span>
            <span style={{ fontSize: strong ? '1.05rem' : '0.95rem', fontWeight: strong ? 800 : 600, color: '#0f172a' }}>{value}</span>
        </div>
    );
}
