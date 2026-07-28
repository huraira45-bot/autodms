import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';

const API = '/api/hr';
const currentMonth = () => new Date().toISOString().slice(0, 7);

export default function HrFineSettings() {
    const { notify } = useFeedback();
    const canEdit = useCan('hr_settings').canEdit;
    const [global, setGlobal] = useState({ LateFinePerMinute: 10, AbsentFinePerDay: 500 });
    const [monthlyList, setMonthlyList] = useState([]);
    const [monthDraft, setMonthDraft] = useState({ MonthID: currentMonth(), LateFinePerMinute: '', AbsentFinePerDay: '' });

    const load = async () => {
        try {
            const [gRes, mRes] = await Promise.all([
                axios.get(`${API}/fine-settings`),
                axios.get(`${API}/monthly-settings`),
            ]);
            setGlobal(gRes.data);
            setMonthlyList(mRes.data);
        } catch (err) {
            notify({ type: 'error', title: 'Load failed', message: err.response?.data?.error || err.message });
        }
    };
    useEffect(() => { load(); }, []);

    const saveGlobal = async () => {
        try {
            await axios.post(`${API}/fine-settings`, global);
            notify({ type: 'success', title: 'Global fine settings saved', message: '' });
            load();
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
        }
    };

    const saveMonthly = async () => {
        if (!monthDraft.MonthID) return;
        try {
            await axios.post(`${API}/monthly-settings`, {
                MonthID: monthDraft.MonthID,
                LateFinePerMinute: monthDraft.LateFinePerMinute === '' ? global.LateFinePerMinute : monthDraft.LateFinePerMinute,
                AbsentFinePerDay:  monthDraft.AbsentFinePerDay  === '' ? global.AbsentFinePerDay  : monthDraft.AbsentFinePerDay,
            });
            notify({ type: 'success', title: `Snapshot saved for ${monthDraft.MonthID}`, message: '' });
            setMonthDraft({ MonthID: currentMonth(), LateFinePerMinute: '', AbsentFinePerDay: '' });
            load();
        } catch (err) {
            notify({ type: 'error', title: 'Save failed', message: err.response?.data?.error || err.message });
        }
    };

    return (
        <div style={{ padding: '16px 20px', maxWidth: 900 }}>
            <h2 style={{ margin: '0 0 12px 0', fontSize: 18 }}>HR Fine Settings</h2>

            <section style={S.card}>
                <h3 style={S.h3}>Global Rates</h3>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div>
                        <label style={S.lbl}>Late Fine per Minute</label>
                        <input type="number" step="0.01" min={0} disabled={!canEdit}
                            value={global.LateFinePerMinute}
                            onChange={e => setGlobal({ ...global, LateFinePerMinute: Number(e.target.value) })}
                            style={S.inp}/>
                    </div>
                    <div>
                        <label style={S.lbl}>Absent Fine per Day</label>
                        <input type="number" step="0.01" min={0} disabled={!canEdit}
                            value={global.AbsentFinePerDay}
                            onChange={e => setGlobal({ ...global, AbsentFinePerDay: Number(e.target.value) })}
                            style={S.inp}/>
                    </div>
                    {canEdit && <button style={S.btnPrimary} onClick={saveGlobal}><Save size={13}/> Save</button>}
                </div>
                <p style={S.hint}>
                    Global rates apply to any month that doesn't have a per-month snapshot.
                    Changing them retroactively affects unposted months only if no snapshot exists.
                </p>
            </section>

            <section style={S.card}>
                <h3 style={S.h3}>Per-Month Snapshot</h3>
                <p style={S.hint}>
                    Lock rates for a specific month so future changes to global rates don't affect it.
                    Also used when a specific month's late-fine rate should differ from global.
                </p>
                {canEdit && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', marginBottom: 12 }}>
                        <div>
                            <label style={S.lbl}>Month</label>
                            <input type="month" value={monthDraft.MonthID}
                                onChange={e => setMonthDraft({ ...monthDraft, MonthID: e.target.value })}
                                style={S.inp}/>
                        </div>
                        <div>
                            <label style={S.lbl}>Late Fine/min</label>
                            <input type="number" step="0.01" min={0}
                                placeholder={String(global.LateFinePerMinute)}
                                value={monthDraft.LateFinePerMinute}
                                onChange={e => setMonthDraft({ ...monthDraft, LateFinePerMinute: e.target.value })}
                                style={S.inp}/>
                        </div>
                        <div>
                            <label style={S.lbl}>Absent Fine/day</label>
                            <input type="number" step="0.01" min={0}
                                placeholder={String(global.AbsentFinePerDay)}
                                value={monthDraft.AbsentFinePerDay}
                                onChange={e => setMonthDraft({ ...monthDraft, AbsentFinePerDay: e.target.value })}
                                style={S.inp}/>
                        </div>
                        <button style={S.btnPrimary} onClick={saveMonthly}><Save size={13}/> Save Snapshot</button>
                    </div>
                )}

                <table style={S.tbl}>
                    <thead>
                        <tr>
                            <th style={S.th}>Month</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Late/min</th>
                            <th style={{ ...S.th, textAlign: 'right' }}>Absent/day</th>
                            <th style={S.th}>Updated</th>
                            <th style={S.th}>By</th>
                        </tr>
                    </thead>
                    <tbody>
                        {monthlyList.map(m => (
                            <tr key={m.MonthID}>
                                <td style={S.td}>{m.MonthID}</td>
                                <td style={{ ...S.td, textAlign: 'right' }}>{Number(m.LateFinePerMinute).toFixed(2)}</td>
                                <td style={{ ...S.td, textAlign: 'right' }}>{Number(m.AbsentFinePerDay).toFixed(2)}</td>
                                <td style={S.td}>{new Date(m.UpdatedAt).toLocaleDateString('en-PK')}</td>
                                <td style={S.td}>{m.UpdatedByName || '—'}</td>
                            </tr>
                        ))}
                        {!monthlyList.length && (
                            <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#94a3b8' }}>No monthly snapshots yet</td></tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}

const S = {
    card: { padding: 16, background: '#fff', border: '1px solid #e5e7eb', borderRadius: 8, marginBottom: 16 },
    h3: { margin: '0 0 10px 0', fontSize: 14, color: '#0f172a' },
    lbl: { display: 'block', fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 3 },
    inp: { padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 13, width: 160 },
    hint: { fontSize: 11, color: '#64748b', margin: '8px 0 0 0' },
    btnPrimary: { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', fontSize: 12,
                  background: '#7c3aed', border: '1px solid #6d28d9', borderRadius: 4, cursor: 'pointer', color: '#fff' },
    tbl: { width: '100%', borderCollapse: 'collapse', fontSize: 12, marginTop: 8 },
    th: { padding: '6px 8px', background: '#f1f5f9', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#334155', borderBottom: '1px solid #cbd5e1' },
    td: { padding: '5px 8px', borderBottom: '1px solid #f1f5f9' },
};
