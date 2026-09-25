/**
 * QC Inspection Checksheet — worked through before the car goes back.
 *
 * Owner ask 2026-09-25, from the dealership's paper sheet. The same panel is
 * used at a desk and on the tablet the inspector carries round the car, so the
 * type and the touch targets scale rather than the screen being written twice.
 *
 * Two behaviours worth knowing, both deliberate:
 *
 *   * Each point is three-state. Untouched is not "passed" and not "failed" —
 *     a sheet half-walked must never read as a car signed off. Tapping the
 *     chosen answer a second time clears it back to untouched.
 *   * Answers save as they are given, a few hundred milliseconds after the
 *     last tap. The tablet is carried to the far corner of the workshop where
 *     the Wi-Fi is worst; a sheet that only saved at the end would lose the
 *     lot. The header says plainly when something has not reached the server.
 *
 * Completing a sheet does NOT require every point to be confirmed — the
 * owner's decision was record only, never block a job card from closing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, Check, X, Loader2, AlertTriangle, Printer } from 'lucide-react';

const when = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

const C = {
    line: '#dbe3ec', head: '#1a3a6a', muted: '#64748b',
    ok: '#16a34a', okBg: '#f0fdf4', bad: '#dc2626', badBg: '#fef2f2',
};

export default function QCChecksheet({
    jobCardId,
    apiBase = '/api/workshop',
    size = 'desk',
    canEdit = true,
}) {
    const big = size === 'tablet';
    const f = (n) => (big ? Math.round(n * 1.3) : n);

    const [sheets, setSheets] = useState(null);
    const [active, setActive] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [dirty, setDirty] = useState(false);

    // Debounced save. The ref holds the answers not yet sent, so a burst of
    // taps becomes one request rather than one per point.
    const pending = useRef(new Map());
    const timer = useRef(null);

    const load = useCallback(async () => {
        try {
            const r = await axios.get(`${apiBase}/job-cards/${jobCardId}/qc`);
            setSheets(r.data || []);
            setActive(prev => (r.data || []).find(s => s.InspectionID === prev?.InspectionID)
                              || (r.data || []).find(s => s.Status === 'InProgress')
                              || (r.data || [])[0] || null);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setSheets([]);
        }
    }, [apiBase, jobCardId]);

    useEffect(() => { load(); }, [load]);

    // Anything still unsent when the panel closes would be lost silently.
    useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

    const start = async () => {
        setBusy(true); setErr(null);
        try {
            const r = await axios.post(`${apiBase}/job-cards/${jobCardId}/qc`, {});
            setActive(r.data);
            await load();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        finally { setBusy(false); }
    };

    const flush = useCallback(async (extra = {}) => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        const Results = [...pending.current.values()];
        pending.current.clear();
        if (!Results.length && !Object.keys(extra).length) return;
        setBusy(true); setErr(null);
        try {
            const r = await axios.put(`${apiBase}/qc/${active.InspectionID}`, { Results, ...extra });
            setActive(r.data);
            setDirty(false);
            if (extra.Complete) await load();
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
            setDirty(true);   // say so rather than pretending it saved
        } finally { setBusy(false); }
    }, [apiBase, active, load]);

    const answer = (row, value) => {
        if (!canEdit || active?.Status === 'Completed') return;
        // Tapping the answer already given clears it — the way to undo a
        // mis-tap without a separate button.
        const next = row.Confirmed === value ? null : value;
        setActive(a => ({
            ...a,
            Results: a.Results.map(r => r.ResultID === row.ResultID
                ? { ...r, Confirmed: next, CheckedAt: next === null ? null : new Date().toISOString() } : r),
        }));
        pending.current.set(row.ResultID, { ResultID: row.ResultID, Confirmed: next, Remarks: row.Remarks || null });
        setDirty(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(), 600);
    };

    const remark = (row, text) => {
        if (!canEdit || active?.Status === 'Completed') return;
        setActive(a => ({
            ...a,
            Results: a.Results.map(r => r.ResultID === row.ResultID ? { ...r, Remarks: text } : r),
        }));
        pending.current.set(row.ResultID, { ResultID: row.ResultID, Confirmed: row.Confirmed, Remarks: text });
        setDirty(true);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => flush(), 900);
    };

    if (sheets === null) {
        return <div style={{ padding: 12, color: C.muted, fontSize: f(13) }}>
            <Loader2 size={f(15)} className="animate-spin" /> Loading the checksheet…
        </div>;
    }

    const done = active?.Status === 'Completed';
    const p = active?.Progress;

    // Group into the sections of the paper sheet, in its order.
    const sections = [];
    for (const row of (active?.Results || [])) {
        const last = sections[sections.length - 1];
        if (!last || last.name !== row.Section) sections.push({ name: row.Section, rows: [row] });
        else last.rows.push(row);
    }

    const btn = (row, value, label, Icon, colour, bg) => {
        const on = row.Confirmed === value;
        return (
            <button type="button" onClick={() => answer(row, value)}
                    disabled={!canEdit || done}
                    title={on ? 'Tap again to clear' : label}
                    style={{
                        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                        minWidth: big ? 58 : 40, minHeight: big ? 52 : 32,
                        border: `1px solid ${on ? colour : C.line}`, borderRadius: 5,
                        background: on ? bg : '#fff', color: on ? colour : '#94a3b8',
                        fontWeight: on ? 700 : 400, fontSize: f(12),
                        cursor: (!canEdit || done) ? 'default' : 'pointer',
                    }}>
                <Icon size={f(15)} />
            </button>
        );
    };

    return (
        <div style={{ border: `1px solid #c8d4e4`, borderRadius: 6, background: '#f7fafc',
                      padding: big ? 16 : 12, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap', marginBottom: 10 }}>
                <ClipboardCheck size={f(17)} color={C.head} />
                <span style={{ fontSize: f(13), fontWeight: 700, color: C.head }}>QC Inspection Checksheet</span>

                {sheets.length > 1 && (
                    <select value={active?.InspectionID || ''} style={{ fontSize: f(12), padding: '3px 6px' }}
                            onChange={e => setActive(sheets.find(s => String(s.InspectionID) === e.target.value))}>
                        {sheets.map((s, i) => (
                            <option key={s.InspectionID} value={s.InspectionID}>
                                Sheet {i + 1} — {s.Status === 'Completed' ? when(s.CompletedAt) : 'in progress'}
                            </option>
                        ))}
                    </select>
                )}

                {p && (
                    <span style={{ fontSize: f(12), color: C.muted }}>
                        <b style={{ color: C.ok }}>{p.confirmed} ok</b>
                        {p.failed > 0 && <> · <b style={{ color: C.bad }}>{p.failed} not ok</b></>}
                        {p.outstanding > 0 && <> · {p.outstanding} not checked</>}
                        {' '}of {p.total}
                    </span>
                )}

                <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {busy && <Loader2 size={f(14)} className="animate-spin" color={C.muted} />}
                    {!busy && dirty && <span style={{ fontSize: f(11), color: '#a16207' }}>not saved yet</span>}
                    {active && (
                        <a href={`${big ? '/tablet' : '/workshop'}/qc/${active.InspectionID}/print`}
                           target="_blank" rel="noreferrer"
                           style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: f(12),
                                    color: C.head, textDecoration: 'none', border: `1px solid ${C.line}`,
                                    borderRadius: 5, padding: big ? '9px 13px' : '5px 9px', background: '#fff' }}>
                            <Printer size={f(14)} /> Print
                        </a>
                    )}
                </span>
            </div>

            {err && (
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: f(12), color: '#92400e',
                              background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 4,
                              padding: '7px 10px', marginBottom: 8 }}>
                    <AlertTriangle size={f(15)} /> {err}
                </div>
            )}

            {!active && (
                <div>
                    <div style={{ fontSize: f(13), color: C.muted, marginBottom: 8 }}>
                        No checksheet has been started for this vehicle.
                    </div>
                    {canEdit && (
                        <button type="button" onClick={start} disabled={busy}
                                style={{ minHeight: big ? 56 : 34, padding: big ? '0 20px' : '0 14px',
                                         fontSize: f(13), fontWeight: 600, color: '#fff', background: C.head,
                                         border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                            {busy ? 'Starting…' : 'Start the checksheet'}
                        </button>
                    )}
                </div>
            )}

            {active && sections.map(sec => (
                <div key={sec.name} style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: f(11), fontWeight: 700, letterSpacing: 0.6, color: C.head,
                                  textTransform: 'uppercase', borderBottom: `1px solid ${C.line}`,
                                  paddingBottom: 3, marginBottom: 5 }}>
                        {sec.name}
                    </div>
                    {sec.rows.map(row => (
                        <div key={row.ResultID}
                             style={{ display: 'flex', alignItems: 'center', gap: 10, padding: big ? '7px 0' : '4px 0',
                                      borderBottom: `1px solid #eef2f7`, flexWrap: 'wrap',
                                      background: row.Confirmed === false ? C.badBg : 'transparent' }}>
                            <span style={{ flex: '1 1 240px', minWidth: 0, fontSize: f(13),
                                           color: row.Confirmed === null ? '#0f172a' : C.muted }}>
                                {row.PointText}
                            </span>
                            <span style={{ display: 'flex', gap: 6 }}>
                                {btn(row, true, 'OK', Check, C.ok, C.okBg)}
                                {btn(row, false, 'Not OK', X, C.bad, C.badBg)}
                            </span>
                            <input
                                value={row.Remarks || ''}
                                onChange={e => remark(row, e.target.value)}
                                onBlur={() => flush()}
                                disabled={!canEdit || done}
                                placeholder={row.Confirmed === false ? 'What is wrong?' : 'Remarks'}
                                style={{ flex: '1 1 170px', minWidth: 120, fontSize: f(12),
                                         minHeight: big ? 46 : 28, padding: '2px 7px',
                                         border: `1px solid ${row.Confirmed === false ? '#fca5a5' : C.line}`,
                                         borderRadius: 4, background: done ? '#f8fafc' : '#fff' }} />
                        </div>
                    ))}
                </div>
            ))}

            {active && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                              borderTop: `1px solid ${C.line}`, paddingTop: 10 }}>
                    <input
                        value={active.Notes || ''}
                        onChange={e => setActive(a => ({ ...a, Notes: e.target.value }))}
                        onBlur={e => canEdit && !done && flush({ Notes: e.target.value })}
                        disabled={!canEdit || done}
                        placeholder="Notes for the whole inspection"
                        style={{ flex: '1 1 260px', fontSize: f(12), minHeight: big ? 46 : 30,
                                 padding: '2px 8px', border: `1px solid ${C.line}`, borderRadius: 4,
                                 background: done ? '#f8fafc' : '#fff' }} />
                    {done ? (
                        <span style={{ fontSize: f(12), color: C.muted }}>
                            Completed {when(active.CompletedAt)}
                            {active.InspectedByName ? ` by ${active.InspectedByName}` : ''}
                        </span>
                    ) : canEdit && (
                        <button type="button" disabled={busy}
                                onClick={() => {
                                    const left = active.Progress?.outstanding || 0;
                                    const msg = left
                                        ? `${left} point${left === 1 ? ' has' : 's have'} not been checked. `
                                          + 'Complete the sheet anyway? It will be kept showing them as unchecked.'
                                        : 'Complete this checksheet? It cannot be changed afterwards.';
                                    if (window.confirm(msg)) flush({ Complete: true, Notes: active.Notes || null });
                                }}
                                style={{ minHeight: big ? 56 : 34, padding: big ? '0 22px' : '0 16px',
                                         fontSize: f(13), fontWeight: 600, color: '#fff', background: C.ok,
                                         border: 'none', borderRadius: 5, cursor: 'pointer' }}>
                            Complete the checksheet
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
