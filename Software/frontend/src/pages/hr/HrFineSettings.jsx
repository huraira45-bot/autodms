import { useEffect, useState } from 'react';
import axios from 'axios';
import { Save } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import { useCan } from '../../context/AuthContext';
import { ErpControlPanel } from '../../components/erp';

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
        <div className="erp-page hr-page" style={{ maxWidth: 1100 }}>
            <ErpControlPanel title="HR Fine Settings" subtitle="Late & absent fine rates — global and per-month overrides"/>

            <section className="hr-card">
                <div className="hr-card-head">Global Rates</div>
                <div className="hr-card-body">
                    <div className="hr-form-row">
                        <label>
                            <div className="hr-lbl">Late Fine per Minute</div>
                            <input type="number" step="0.01" min={0} disabled={!canEdit}
                                value={global.LateFinePerMinute}
                                onChange={e => setGlobal({ ...global, LateFinePerMinute: Number(e.target.value) })}
                                className="hr-inp" style={{ width: 160 }}/>
                        </label>
                        <label>
                            <div className="hr-lbl">Absent Fine per Day</div>
                            <input type="number" step="0.01" min={0} disabled={!canEdit}
                                value={global.AbsentFinePerDay}
                                onChange={e => setGlobal({ ...global, AbsentFinePerDay: Number(e.target.value) })}
                                className="hr-inp" style={{ width: 160 }}/>
                        </label>
                        {canEdit && <button className="erp-btn erp-btn-primary" onClick={saveGlobal}><Save size={13}/> Save Global</button>}
                    </div>
                    <p className="hr-hint">
                        Global rates apply to any month that doesn't have a per-month snapshot.
                        Changes here retroactively affect any unposted month that hasn't been locked with a snapshot yet.
                    </p>
                </div>
            </section>

            <section className="hr-card">
                <div className="hr-card-head">Per-Month Snapshot</div>
                <div className="hr-card-body">
                    <p className="hr-hint" style={{ marginTop: 0 }}>
                        Lock rates for a specific month so future global changes don't affect it, or set month-specific overrides.
                    </p>
                    {canEdit && (
                        <div className="hr-form-row">
                            <label>
                                <div className="hr-lbl">Month</div>
                                <input type="month" value={monthDraft.MonthID}
                                    onChange={e => setMonthDraft({ ...monthDraft, MonthID: e.target.value })}
                                    className="hr-inp" style={{ width: 140 }}/>
                            </label>
                            <label>
                                <div className="hr-lbl">Late Fine/min</div>
                                <input type="number" step="0.01" min={0}
                                    placeholder={String(global.LateFinePerMinute)}
                                    value={monthDraft.LateFinePerMinute}
                                    onChange={e => setMonthDraft({ ...monthDraft, LateFinePerMinute: e.target.value })}
                                    className="hr-inp" style={{ width: 140 }}/>
                            </label>
                            <label>
                                <div className="hr-lbl">Absent Fine/day</div>
                                <input type="number" step="0.01" min={0}
                                    placeholder={String(global.AbsentFinePerDay)}
                                    value={monthDraft.AbsentFinePerDay}
                                    onChange={e => setMonthDraft({ ...monthDraft, AbsentFinePerDay: e.target.value })}
                                    className="hr-inp" style={{ width: 140 }}/>
                            </label>
                            <button className="erp-btn erp-btn-primary" onClick={saveMonthly}><Save size={13}/> Save Snapshot</button>
                        </div>
                    )}

                    <div className="hr-sheet-tbl-wrap" style={{ marginTop: 12 }}>
                        <table className="hr-sheet-tbl">
                            <thead>
                                <tr>
                                    <th style={{ width: 120 }}>Month</th>
                                    <th className="num" style={{ width: 140 }}>Late Fine / min</th>
                                    <th className="num" style={{ width: 140 }}>Absent Fine / day</th>
                                    <th style={{ width: 130 }}>Updated</th>
                                    <th>Updated By</th>
                                </tr>
                            </thead>
                            <tbody>
                                {monthlyList.map(m => (
                                    <tr key={m.MonthID}>
                                        <td><b>{m.MonthID}</b></td>
                                        <td className="num">{Number(m.LateFinePerMinute).toFixed(2)}</td>
                                        <td className="num">{Number(m.AbsentFinePerDay).toFixed(2)}</td>
                                        <td className="muted">{new Date(m.UpdatedAt).toLocaleDateString('en-PK', { dateStyle: 'medium' })}</td>
                                        <td className="muted">{m.UpdatedByName || '—'}</td>
                                    </tr>
                                ))}
                                {!monthlyList.length && (
                                    <tr><td colSpan={5} style={{ padding: 20, textAlign: 'center', color: 'var(--erp-text-muted)' }}>
                                        No monthly snapshots yet.
                                    </td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </section>

            <style>{`
                .hr-page { padding: 12px 16px 20px; margin: 0 auto; }
                .hr-card { background: var(--erp-surface); border: 1px solid var(--erp-border);
                           border-radius: var(--erp-radius); overflow: hidden; box-shadow: var(--erp-shadow-sm); margin-top: 12px; }
                .hr-card-head { padding: 8px 14px; background: linear-gradient(180deg, #f7f7f9, #f0f0f2);
                                border-bottom: 1px solid var(--erp-border); font-weight: 700; font-size: 12.5px;
                                text-transform: uppercase; letter-spacing: 0.4px; color: var(--erp-text); }
                .hr-card-body { padding: 14px; }
                .hr-form-row { display: flex; gap: 14px; align-items: flex-end; flex-wrap: wrap; }
                .hr-lbl { font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.3px;
                          color: var(--erp-text-muted); margin-bottom: 3px; font-weight: 600; }
                .hr-inp { height: 30px; padding: 0 8px; font-size: 13px; border: 1px solid var(--erp-border);
                          border-radius: var(--erp-radius); background: var(--erp-surface); color: var(--erp-text);
                          font-variant-numeric: tabular-nums; }
                .hr-inp:focus { outline: none; border-color: var(--erp-brand); box-shadow: 0 0 0 2px rgba(124, 58, 237, 0.1); }
                .hr-hint { font-size: 12px; color: var(--erp-text-muted); margin: 12px 0 0; line-height: 1.5; }
                .hr-sheet-tbl-wrap { overflow-x: auto; border: 1px solid var(--erp-border); border-radius: var(--erp-radius); }
                .hr-sheet-tbl { width: 100%; border-collapse: collapse; font-size: 12px; }
                .hr-sheet-tbl thead th { padding: 6px 10px; background: #fafafb; border-bottom: 1px solid var(--erp-border);
                                         text-align: left; font-size: 10.5px; font-weight: 600; color: var(--erp-text-muted);
                                         text-transform: uppercase; letter-spacing: 0.3px; }
                .hr-sheet-tbl thead th.num { text-align: right; }
                .hr-sheet-tbl tbody td { padding: 5px 10px; border-bottom: 1px solid #f4f4f6; }
                .hr-sheet-tbl tbody td.num { text-align: right; font-variant-numeric: tabular-nums; }
                .hr-sheet-tbl tbody td.muted { color: var(--erp-text-muted); }
                .hr-sheet-tbl tbody tr:hover { background: var(--erp-surface-hover); }
            `}</style>
        </div>
    );
}
