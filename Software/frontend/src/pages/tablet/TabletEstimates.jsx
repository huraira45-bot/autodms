/**
 * Open estimates — service tablet app, Phase 1 (plan 2026-09-14).
 * The advisor's list of estimates still in progress, to continue, print or
 * cancel. Also exports the "New intake" button used on the home screen.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate } from 'react-router-dom';
import { Search, Loader2, Video, ChevronRight, PlusCircle } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, money, errText, fmtDateTime, statusStyle, pill } from '../../tablet/estimateFormat';

/** Starts a new draft estimate and opens it. */
export function NewIntakeButton({ style, children }) {
    const navigate = useNavigate();
    const { error } = useFeedback();
    const [busy, setBusy] = useState(false);

    const start = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/estimates`);
            navigate(`/tablet/estimates/${data.EstimateID}`);
        } catch (err) {
            error('Could not start a new intake', errText(err));
            setBusy(false);
        }
    };

    return (
        <button type="button" style={style || S.btn} onClick={start} disabled={busy}>
            {busy ? <Loader2 size={22} className="animate-spin" /> : children || <><PlusCircle size={20} /> New intake</>}
        </button>
    );
}

const chip = (on) => ({
    ...S.btnGhost, minHeight: 44, padding: '0 16px', fontSize: 15,
    ...(on ? { background: T.brand, color: '#fff', borderColor: T.brand } : {}),
});

export default function TabletEstimates() {
    const [q, setQ] = useState('');
    const [mine, setMine] = useState(true);
    const [openOnly, setOpenOnly] = useState(true);
    const [rows, setRows] = useState(null);
    const [err, setErr] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let live = true;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await axios.get(`${API}/estimates`, {
                    params: { search: q.trim() || undefined, mine: mine ? 1 : undefined, status: openOnly ? 'open' : 'all' },
                });
                if (live) { setRows(data); setErr(''); }
            } catch (e) {
                if (live) setErr(errText(e));
            } finally {
                if (live) setLoading(false);
            }
        }, 300);
        return () => { live = false; clearTimeout(t); };
    }, [q, mine, openOnly]);

    return (
        <div style={S.body}>
            <div style={{ ...S.row, justifyContent: 'space-between', marginBottom: 14 }}>
                <h1 style={{ ...S.h1, margin: 0 }}>Estimates</h1>
                <NewIntakeButton />
            </div>

            <div style={S.card}>
                <div style={{ position: 'relative', marginBottom: 12 }}>
                    <Search size={20} color={T.muted} style={{ position: 'absolute', left: 14, top: 17 }} />
                    <input style={{ ...S.input, paddingLeft: 44 }} value={q} onChange={e => setQ(e.target.value)}
                           placeholder="Estimate no, registration, customer name or mobile" />
                </div>
                <div style={S.row}>
                    <button type="button" style={chip(mine)} onClick={() => setMine(true)}>Mine</button>
                    <button type="button" style={chip(!mine)} onClick={() => setMine(false)}>All advisors</button>
                    <span style={{ width: 12 }} />
                    <button type="button" style={chip(openOnly)} onClick={() => setOpenOnly(true)}>Open</button>
                    <button type="button" style={chip(!openOnly)} onClick={() => setOpenOnly(false)}>Include closed</button>
                    {loading && <Loader2 size={20} className="animate-spin" color={T.muted} />}
                </div>
            </div>

            {err && <div style={S.result('bad')}>{err}</div>}

            {rows && !rows.length && !err && (
                <div style={{ ...S.card, textAlign: 'center', color: T.muted }}>No estimates found.</div>
            )}

            {rows?.map(r => {
                const st = statusStyle(r.Status);
                return (
                    <Link key={r.EstimateID} to={`/tablet/estimates/${r.EstimateID}`}
                          style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, textDecoration: 'none', color: T.ink }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                                <strong style={{ fontSize: 18 }}>{r.EstimateNo}</strong>
                                <span style={pill(st)}>{st.label}</span>
                                {r.VehicleRegNo && <span style={{ fontSize: 17, fontWeight: 600 }}>{r.VehicleRegNo}</span>}
                                {r.JobCardNo && (
                                    <span style={{ fontSize: 15, color: T.muted }}>
                                        {r.Status === 'Draft' ? 'Additional work' : 'Job card'} · {r.JobCardNo}
                                    </span>
                                )}
                            </div>
                            <div style={{ fontSize: 15, color: T.muted, marginTop: 4 }}>
                                {r.CustomerName || 'No customer yet'}{r.CustomerPhone ? ` · ${r.CustomerPhone}` : ''}
                                {r.VehicleModel ? ` · ${r.VehicleModel}` : ''}
                            </div>
                            <div style={{ fontSize: 14, color: T.muted, marginTop: 4, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                                <span>{fmtDateTime(r.UpdatedAt || r.CreatedAt)}</span>
                                {!mine && r.AdvisorName && <span>{r.AdvisorName}</span>}
                                <span>{r.LineCount} line{r.LineCount === 1 ? '' : 's'}</span>
                                <span style={{ color: r.MediaCount ? T.ok : T.warn }}>
                                    <Video size={14} style={{ verticalAlign: -2 }} /> {r.MediaCount || 'no'} recording{r.MediaCount === 1 ? '' : 's'}
                                </span>
                            </div>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 13, color: T.muted }}>Total</div>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{money(r.GrandTotal)}</div>
                        </div>
                        <ChevronRight size={22} color={T.muted} />
                    </Link>
                );
            })}
        </div>
    );
}
