/**
 * Job cards opened on the tablet — service tablet app, Phase 4
 * (plan 2026-09-14). The advisor's open job cards with job and parts
 * progress, updated live.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link } from 'react-router-dom';
import { Search, Loader2, ChevronRight, Wrench, Package, PenLine, Lock } from 'lucide-react';
import { useServiceEvents } from '../../tablet/useServiceEvents';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, errText, fmtDateTime, pill } from '../../tablet/estimateFormat';

const chip = (on) => ({
    ...S.btnGhost, minHeight: 44, padding: '0 16px', fontSize: 15,
    ...(on ? { background: T.brand, color: '#fff', borderColor: T.brand } : {}),
});

const qty = (n) => String(+Number(n || 0).toFixed(2));

export default function TabletJobCards() {
    const [q, setQ] = useState('');
    const [mine, setMine] = useState(true);
    const [openOnly, setOpenOnly] = useState(true);
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState('');

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/job-cards`, {
                params: { search: q.trim() || undefined, scope: mine ? 'mine' : 'all', status: openOnly ? 'open' : 'all' },
            });
            setRows(data);
            setErr('');
        } catch (e) {
            setErr(errText(e));
        }
    }, [q, mine, openOnly]);

    useEffect(() => {
        const t = setTimeout(load, 300);
        return () => clearTimeout(t);
    }, [load]);

    useEffect(() => {
        const t = setInterval(load, 30000);
        return () => clearInterval(t);
    }, [load]);

    useServiceEvents(localStorage.getItem('dms_token'), { 'jobcard:changed': load });

    return (
        <div style={S.body}>
            <h1 style={{ ...S.h1, marginBottom: 14 }}>Job cards</h1>
            <div style={S.card}>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={20} color={T.muted} style={{ position: 'absolute', left: 14, top: 17 }} />
                    <input style={{ ...S.input, paddingLeft: 44 }} value={q} onChange={e => setQ(e.target.value)}
                           placeholder="Job card, job number, registration, customer or mobile" />
                </div>
                <div style={S.row}>
                    <button type="button" style={chip(mine)} onClick={() => setMine(true)}>Mine</button>
                    <button type="button" style={chip(!mine)} onClick={() => setMine(false)}>All advisors</button>
                    <span style={{ width: 12 }} />
                    <button type="button" style={chip(openOnly)} onClick={() => setOpenOnly(true)}>Open</button>
                    <button type="button" style={chip(!openOnly)} onClick={() => setOpenOnly(false)}>Include finalized</button>
                </div>
            </div>

            {err && <div style={S.result('bad')}>{err}</div>}
            {rows === null && !err && <div style={{ textAlign: 'center', padding: 30 }}><Loader2 className="animate-spin" /></div>}
            {rows && !rows.length && <div style={{ ...S.card, textAlign: 'center', color: T.muted }}>No job cards found.</div>}

            {rows?.map(r => {
                const partsWaiting = r.PartsLinesWaiting > 0;
                return (
                    <Link key={r.JobCardId} to={`/tablet/job-cards/${r.JobCardId}`}
                          style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: T.ink }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: 18 }}>{r.JobCardNo}</strong>
                                <span style={{ fontSize: 17, fontWeight: 600 }}>{r.VehicleRegNo}</span>
                                {r.IsFinalized
                                    ? <span style={pill({ bg: T.okBg, fg: T.ok })}><Lock size={12} style={{ verticalAlign: -1 }} /> Finalized</span>
                                    : <span style={pill({ bg: '#e2e8f0', fg: '#334155' })}>{r.WorkshopStatus}</span>}
                            </div>
                            <div style={{ fontSize: 15, color: T.muted, marginTop: 4 }}>
                                {[r.CustomerName, r.VehicleModel, r.ServiceAdvisor].filter(Boolean).join(' · ')}
                            </div>
                            <div style={{ fontSize: 14, marginTop: 6, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                                <span style={{ color: r.JobsDone === r.JobsTotal && r.JobsTotal > 0 ? T.ok : T.ink }}>
                                    <Wrench size={14} style={{ verticalAlign: -2 }} /> Jobs {r.JobsDone}/{r.JobsTotal} done{r.JobsWorking ? ` · ${r.JobsWorking} in progress` : ''}
                                </span>
                                {r.PartsRequested > 0 && (
                                    <span style={{ color: partsWaiting ? T.warn : T.ok }}>
                                        <Package size={14} style={{ verticalAlign: -2 }} /> Parts {qty(r.PartsIssued)}/{qty(r.PartsRequested)} issued
                                    </span>
                                )}
                                {r.UnsignedWorkNo && (
                                    <span style={{ color: T.warn }}><PenLine size={14} style={{ verticalAlign: -2 }} /> {r.UnsignedWorkNo} not signed</span>
                                )}
                                <span style={{ color: T.muted }}>Opened {fmtDateTime(r.OpenedAt)}</span>
                            </div>
                        </div>
                        <ChevronRight size={22} color={T.muted} />
                    </Link>
                );
            })}
        </div>
    );
}
