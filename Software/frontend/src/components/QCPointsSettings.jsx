/**
 * The QC checksheet's inspection points — the master list.
 *
 * Owner chose an editable list rather than 44 points fixed in code
 * (2026-09-25), so a point can be reworded or retired without a developer.
 *
 * Retiring never deletes. Sheets already filled name the point they checked,
 * and the wording on them was snapshotted when they were filled — so changing
 * a point here only affects sheets started from now on, and an old sheet keeps
 * saying exactly what was inspected at the time.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { ClipboardCheck, Plus, Trash2, Loader2, Check, X } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api/workshop';

export default function QCPointsSettings() {
    const { notify, confirm } = useFeedback();
    const [points, setPoints] = useState(null);
    const [showRetired, setShowRetired] = useState(false);
    const [busy, setBusy] = useState(false);
    const [adding, setAdding] = useState({ Section: '', PointText: '' });
    const [editing, setEditing] = useState(null);   // { PointID, Section, PointText }

    const load = useCallback(async () => {
        try {
            const r = await axios.get(`${API}/qc/points?all=1`);
            setPoints(r.data || []);
        } catch (e) {
            notify?.({ type: 'error', message: e.response?.data?.error || e.message });
            setPoints([]);
        }
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const add = async () => {
        if (!adding.Section.trim() || !adding.PointText.trim()) {
            notify?.({ type: 'error', message: 'Both the section and the point are needed.' });
            return;
        }
        setBusy(true);
        try {
            await axios.post(`${API}/qc/points`, adding);
            setAdding({ Section: adding.Section, PointText: '' });   // same section, ready for the next
            await load();
        } catch (e) {
            notify?.({ type: 'error', message: e.response?.data?.error || e.message });
        } finally { setBusy(false); }
    };

    const saveEdit = async () => {
        setBusy(true);
        try {
            await axios.put(`${API}/qc/points/${editing.PointID}`,
                            { Section: editing.Section, PointText: editing.PointText });
            setEditing(null);
            await load();
        } catch (e) {
            notify?.({ type: 'error', message: e.response?.data?.error || e.message });
        } finally { setBusy(false); }
    };

    const setActive = async (p, active) => {
        if (!active) {
            const ok = await (confirm
                ? confirm({
                    title: 'Retire this point?',
                    message: `"${p.PointText}" will stop appearing on new checksheets. `
                           + 'Sheets already filled keep it, exactly as it was worded then.',
                })
                : Promise.resolve(window.confirm('Retire this point?')));
            if (!ok) return;
        }
        setBusy(true);
        try {
            if (active) {
                await axios.put(`${API}/qc/points/${p.PointID}`,
                                { Section: p.Section, PointText: p.PointText, IsActive: true });
            } else {
                await axios.delete(`${API}/qc/points/${p.PointID}`);
            }
            await load();
        } catch (e) {
            notify?.({ type: 'error', message: e.response?.data?.error || e.message });
        } finally { setBusy(false); }
    };

    if (points === null) {
        return <div className="loading-state"><Loader2 className="animate-spin" /> Loading inspection points…</div>;
    }

    const shown = points.filter(p => showRetired || p.IsActive);
    const sections = [];
    for (const p of shown) {
        const last = sections[sections.length - 1];
        if (!last || last.name !== p.Section) sections.push({ name: p.Section, rows: [p] });
        else last.rows.push(p);
    }
    const knownSections = [...new Set(points.map(p => p.Section))];
    const activeCount = points.filter(p => p.IsActive).length;

    return (
        <div className="card">
            <div style={{ padding: 16, borderBottom: '1px solid #e2e8f0', display: 'flex',
                          justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: 8, margin: 0, color: 'var(--primary)' }}>
                    <ClipboardCheck size={18} /> QC Inspection Checksheet
                    <span style={{ fontSize: '0.8rem', fontWeight: 400, color: '#64748b' }}>
                        {activeCount} point{activeCount === 1 ? '' : 's'} in use
                    </span>
                </h3>
                <label style={{ fontSize: '0.85rem', color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <input type="checkbox" checked={showRetired} onChange={e => setShowRetired(e.target.checked)} />
                    Show retired
                </label>
            </div>

            <div style={{ padding: '10px 16px', fontSize: '0.83rem', color: '#64748b' }}>
                These are the points walked through before a car is handed back. Changing one here affects
                checksheets started from now on — sheets already filled keep the wording they were filled with.
            </div>

            <div style={{ padding: '0 16px 12px' }}>
                {sections.map(sec => (
                    <div key={sec.name} style={{ marginBottom: 12 }}>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, letterSpacing: 0.6, color: '#1a3a6a',
                                      textTransform: 'uppercase', borderBottom: '1px solid #e2e8f0',
                                      padding: '4px 0', marginBottom: 4 }}>
                            {sec.name}
                        </div>
                        {sec.rows.map(p => (
                            <div key={p.PointID}
                                 style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0',
                                          opacity: p.IsActive ? 1 : 0.5 }}>
                                {editing?.PointID === p.PointID ? (
                                    <>
                                        <input value={editing.PointText} autoFocus
                                               onChange={e => setEditing(x => ({ ...x, PointText: e.target.value }))}
                                               onKeyDown={e => { if (e.key === 'Enter') saveEdit();
                                                                 if (e.key === 'Escape') setEditing(null); }}
                                               style={{ flex: 1, fontSize: '0.88rem', padding: '4px 7px',
                                                        border: '1px solid #cbd5e1', borderRadius: 4 }} />
                                        <button className="btn" disabled={busy} onClick={saveEdit}
                                                style={{ padding: '4px 9px', fontSize: '0.8rem' }}>Save</button>
                                        <button disabled={busy} onClick={() => setEditing(null)}
                                                style={{ padding: '4px 9px', fontSize: '0.8rem', background: '#fff',
                                                         border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>
                                            Cancel
                                        </button>
                                    </>
                                ) : (
                                    <>
                                        <span style={{ flex: 1, fontSize: '0.88rem',
                                                       textDecoration: p.IsActive ? 'none' : 'line-through' }}>
                                            {p.PointText}
                                        </span>
                                        {p.IsActive ? (
                                            <>
                                                <button onClick={() => setEditing({ PointID: p.PointID, Section: p.Section, PointText: p.PointText })}
                                                        title="Reword this point"
                                                        style={{ padding: '3px 8px', fontSize: '0.78rem', background: '#fff',
                                                                 border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>
                                                    Edit
                                                </button>
                                                <button onClick={() => setActive(p, false)} disabled={busy}
                                                        title="Retire — kept on sheets already filled"
                                                        style={{ padding: '3px 8px', background: '#fff', color: '#dc2626',
                                                                 border: '1px solid #fca5a5', borderRadius: 4, cursor: 'pointer' }}>
                                                    <Trash2 size={13} />
                                                </button>
                                            </>
                                        ) : (
                                            <button onClick={() => setActive(p, true)} disabled={busy}
                                                    style={{ padding: '3px 8px', fontSize: '0.78rem', background: '#fff',
                                                             color: '#16a34a', border: '1px solid #86efac',
                                                             borderRadius: 4, cursor: 'pointer' }}>
                                                <Check size={13} /> Put back
                                            </button>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                ))}

                {!shown.length && (
                    <div style={{ fontSize: '0.85rem', color: '#64748b', padding: '8px 0' }}>
                        No inspection points yet. Add the first one below.
                    </div>
                )}
            </div>

            <div style={{ padding: 16, borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input list="qc-sections" placeholder="Section" value={adding.Section}
                       onChange={e => setAdding(a => ({ ...a, Section: e.target.value }))}
                       style={{ width: 190, fontSize: '0.88rem', padding: '6px 8px',
                                border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <datalist id="qc-sections">
                    {knownSections.map(sn => <option key={sn} value={sn} />)}
                </datalist>
                <input placeholder="What is being checked" value={adding.PointText}
                       onChange={e => setAdding(a => ({ ...a, PointText: e.target.value }))}
                       onKeyDown={e => { if (e.key === 'Enter') add(); }}
                       style={{ flex: 1, minWidth: 220, fontSize: '0.88rem', padding: '6px 8px',
                                border: '1px solid #cbd5e1', borderRadius: 4 }} />
                <button className="btn" onClick={add} disabled={busy}
                        style={{ padding: '6px 12px', fontSize: '0.85rem', display: 'flex',
                                 alignItems: 'center', gap: 4 }}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Add point
                </button>
            </div>
        </div>
    );
}
