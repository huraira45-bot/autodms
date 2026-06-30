/**
 * Survey Templates admin — CRUD over the question sets.
 *
 * Versioning rule (server-enforced):
 *   - Activating a template auto-deactivates other rows of the same SurveyType.
 *   - Hard-delete only works when no surveys reference the template; otherwise
 *     UI nudges admin to "Deactivate" instead.
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    FileText, Plus, RefreshCw, Loader2, Pencil, Trash2, Power,
    XCircle,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const TYPE_LABEL = {
    PostJobCard:   'Post Job Card',
    PostComplaint: 'Post Complaint',
    PostCampaign:  'Post Campaign',
};

export default function SurveyTemplatesAdmin() {
    const { hasModule } = useAuth();
    const { confirm: confirmAction } = useFeedback();
    const canEdit = hasModule('cro_admin');

    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(false);
    const [editItem, setEditItem] = useState(null);
    const [showCreate, setShowCreate] = useState(false);
    const [msg, setMsg] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try { const r = await axios.get(`${API}/cro/survey-templates`); setRows(r.data); }
        catch { /* noop */ }
        setLoading(false);
    }, []);
    useEffect(() => { load(); }, [load]);

    const toggleActive = async (t) => {
        try {
            await axios.put(`${API}/cro/survey-templates/${t.TemplateID}`, { IsActive: !t.IsActive });
            flash('ok', !t.IsActive ? 'Activated (others deactivated)' : 'Deactivated');
            load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const remove = async (t) => {
        const ok = await confirmAction({
            title: 'Delete survey template?',
            message: `Permanently delete template #${t.TemplateID}? This only works when no surveys reference it.`,
            confirmLabel: 'Delete',
            tone: 'danger'
        });
        if (!ok) return;
        try {
            await axios.delete(`${API}/cro/survey-templates/${t.TemplateID}`);
            flash('ok', 'Deleted');
            load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Survey Templates</h1>
                    <p className="page-subtitle">Define the questions asked on Post-Job-Card and Post-Complaint surveys. Only the active template per type is used for new surveys; in-flight surveys keep the questions they were created with.</p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canEdit && (
                        <button className="btn" onClick={() => setShowCreate(true)}>
                            <Plus size={16} /> New template
                        </button>
                    )}
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                </div>
            </div>

            {msg && (
                <div style={{ padding: 10, borderRadius: 8, fontSize: '0.875rem',
                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                    color:      msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca') }}>
                    {msg.text}
                </div>
            )}

            <div className="card">
                {rows.length === 0 ? (
                    <div style={{ padding: 32, textAlign: 'center', color: '#64748b' }}>
                        <FileText size={32} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>{loading ? 'Loading…' : 'No templates yet.'}</div>
                    </div>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {rows.map(t => {
                            const qs = safeJSON(t.QuestionsJSON);
                            return (
                                <div key={t.TemplateID} style={{
                                    padding: 14, border: '1px solid #e2e8f0', borderRadius: 8,
                                    background: t.IsActive ? '#f0fdf4' : 'white',
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                <span style={{ fontWeight: 700 }}>{TYPE_LABEL[t.SurveyType] || t.SurveyType}</span>
                                                <span style={{ fontSize: '0.78rem', color: '#64748b' }}>v{t.Version}</span>
                                                {t.IsActive ? (
                                                    <span style={{ background: '#dcfce7', color: '#15803d', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>ACTIVE</span>
                                                ) : (
                                                    <span style={{ background: '#e2e8f0', color: '#475569', padding: '2px 8px', borderRadius: 99, fontSize: '0.7rem', fontWeight: 700 }}>inactive</span>
                                                )}
                                            </div>
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                                {qs.length} question{qs.length === 1 ? '' : 's'} · created {new Date(t.CreatedAt).toLocaleDateString()}{t.CreatedByName ? ` by ${t.CreatedByName}` : ''}
                                            </div>
                                        </div>
                                        <div style={{ display: 'flex', gap: 6 }}>
                                            <button onClick={() => setEditItem(t)} className="btn-sm"><Pencil size={14} /> {canEdit ? 'Edit' : 'View'}</button>
                                            {canEdit && (
                                                <button onClick={() => toggleActive(t)} className="btn-sm"
                                                    title={t.IsActive ? 'Deactivate' : 'Activate (deactivates other versions of this type)'}
                                                    style={{ color: t.IsActive ? '#b45309' : '#15803d' }}>
                                                    <Power size={14} /> {t.IsActive ? 'Deactivate' : 'Activate'}
                                                </button>
                                            )}
                                            {canEdit && (
                                                <button onClick={() => remove(t)} className="btn-sm" style={{ color: '#b91c1c' }}>
                                                    <Trash2 size={14} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                    {/* Questions preview */}
                                    <div style={{ marginTop: 10, padding: 10, background: '#f8fafc', borderRadius: 6, fontSize: '0.82rem' }}>
                                        {qs.length === 0 ? <span style={{ color: '#94a3b8' }}>(no questions)</span> : (
                                            <ol style={{ margin: 0, paddingLeft: 22, color: '#0f172a' }}>
                                                {qs.map(q => (
                                                    <li key={q.id} style={{ marginBottom: 4 }}>
                                                        {q.text}
                                                        <span style={{ color: '#64748b', fontSize: '0.72rem', marginLeft: 6 }}>[{q.type}{q.type === 'rating' ? ` 1-${q.scale || 5}` : ''}]</span>
                                                    </li>
                                                ))}
                                            </ol>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {(editItem || showCreate) && (
                <TemplateEditor
                    template={editItem}
                    onClose={() => { setEditItem(null); setShowCreate(false); }}
                    onSaved={() => { setEditItem(null); setShowCreate(false); flash('ok', 'Saved'); load(); }}
                    readOnly={!canEdit}
                />
            )}
        </div>
    );
}

function TemplateEditor({ template, onClose, onSaved, readOnly }) {
    const isNew = !template;
    const [surveyType, setSurveyType] = useState(template?.SurveyType || 'PostJobCard');
    const [isActive, setIsActive]     = useState(template ? !!template.IsActive : true);
    const [questions, setQuestions]   = useState(template ? safeJSON(template.QuestionsJSON) : [
        { id: 'q1', type: 'rating', scale: 5, text: '' },
    ]);
    const [busy, setBusy] = useState(false);
    const [err, setErr]   = useState(null);

    const addQuestion = () => {
        const nextId = `q${questions.length + 1}`;
        setQuestions(qs => [...qs, { id: nextId, type: 'rating', scale: 5, text: '' }]);
    };
    const removeQuestion = (idx) => setQuestions(qs => qs.filter((_, i) => i !== idx));
    const patchQuestion = (idx, patch) => setQuestions(qs => qs.map((q, i) => i === idx ? { ...q, ...patch } : q));
    const moveUp = (idx) => idx > 0 && setQuestions(qs => {
        const a = [...qs]; [a[idx-1], a[idx]] = [a[idx], a[idx-1]]; return a;
    });
    const moveDown = (idx) => idx < questions.length - 1 && setQuestions(qs => {
        const a = [...qs]; [a[idx+1], a[idx]] = [a[idx], a[idx+1]]; return a;
    });

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            if (isNew) {
                await axios.post(`${API}/cro/survey-templates`, { SurveyType: surveyType, IsActive: isActive, Questions: questions });
            } else {
                await axios.put(`${API}/cro/survey-templates/${template.TemplateID}`, { Questions: questions, IsActive: isActive });
            }
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onClose}>
            <div style={{ background: 'white', borderRadius: 10, width: 600, maxHeight: '90vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
                <div style={{ padding: '14px 18px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontWeight: 700 }}>
                        {readOnly ? 'View' : isNew ? 'New template' : `Edit template #${template.TemplateID} (v${template.Version})`}
                    </div>
                    <button onClick={onClose} className="btn-icon"><XCircle size={18} /></button>
                </div>
                <div style={{ padding: 18 }}>
                    {err && <div style={{ padding: 8, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 10, fontSize: '0.85rem' }}>{err}</div>}

                    {isNew && (
                        <div style={{ marginBottom: 14 }}>
                            <label style={{ fontSize: '0.78rem', fontWeight: 600, display: 'block', marginBottom: 4, color: '#475569' }}>Survey type</label>
                            <select value={surveyType} onChange={e => setSurveyType(e.target.value)} disabled={readOnly}
                                style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                                <option value="PostJobCard">Post Job Card</option>
                                <option value="PostComplaint">Post Complaint</option>
                                <option value="PostCampaign">Post Campaign</option>
                            </select>
                        </div>
                    )}

                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.85rem', marginBottom: 14 }}>
                        <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} disabled={readOnly} />
                        Make this the active template (deactivates other versions of the same type)
                    </label>

                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 8 }}>Questions</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {questions.map((q, idx) => (
                            <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 6, padding: 10 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#64748b', minWidth: 32 }}>{idx + 1}.</span>
                                    <input value={q.id} onChange={e => patchQuestion(idx, { id: e.target.value })} disabled={readOnly}
                                        placeholder="id" style={{ width: 60, padding: 4, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.78rem', fontFamily: 'monospace' }} />
                                    <select value={q.type} onChange={e => patchQuestion(idx, { type: e.target.value })} disabled={readOnly}
                                        style={{ padding: 4, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.78rem' }}>
                                        <option value="rating">rating</option>
                                        <option value="yesno">yes/no</option>
                                        <option value="text">text</option>
                                    </select>
                                    {q.type === 'rating' && (
                                        <>
                                            <span style={{ fontSize: '0.78rem', color: '#64748b' }}>scale</span>
                                            <input type="number" min={2} max={10} value={q.scale || 5}
                                                onChange={e => patchQuestion(idx, { scale: parseInt(e.target.value) })}
                                                disabled={readOnly}
                                                style={{ width: 50, padding: 4, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.78rem' }} />
                                        </>
                                    )}
                                    {!readOnly && (
                                        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
                                            <button onClick={() => moveUp(idx)} disabled={idx === 0} title="Move up" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>▲</button>
                                            <button onClick={() => moveDown(idx)} disabled={idx === questions.length - 1} title="Move down" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', padding: 2 }}>▼</button>
                                            <button onClick={() => removeQuestion(idx)} title="Remove" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#b91c1c', padding: 2 }}><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </div>
                                <input value={q.text} onChange={e => patchQuestion(idx, { text: e.target.value })} disabled={readOnly}
                                    placeholder="Question text shown to the customer"
                                    style={{ width: '100%', padding: 6, border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.875rem', boxSizing: 'border-box' }} />
                            </div>
                        ))}
                    </div>
                    {!readOnly && (
                        <button onClick={addQuestion} className="btn-sm" style={{ marginTop: 10 }}>
                            <Plus size={14} /> Add question
                        </button>
                    )}
                </div>
                <div style={{ padding: '12px 18px', borderTop: '1px solid #e2e8f0', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn-sm" onClick={onClose}>{readOnly ? 'Close' : 'Cancel'}</button>
                    {!readOnly && (
                        <button onClick={save} disabled={busy || questions.length === 0}
                            style={{ padding: '8px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer' }}>
                            {busy ? <Loader2 size={14} className="animate-spin" /> : null} {isNew ? 'Create' : 'Save'}
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

function safeJSON(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }
