/**
 * Reusable survey-capture panel.
 *
 * Used by SurveysAdmin (inside its capture modal) and CRDFollowUps (inline in
 * the contact modal). Loads the survey by id, renders questions, posts to
 * /api/cro/surveys/:id/capture, calls onSaved() with the response.
 *
 * Props:
 *   surveyId   — required
 *   onSaved({SurveyID, OverallRating, Status})
 *   onError(msg)
 *   compact    — when true: smaller spacing for embedding inside another modal
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Loader2, MessageSquare } from 'lucide-react';

const API = '/api';

export default function SurveyCapturePanel({ surveyId, onSaved, onError, compact = false }) {
    const [survey, setSurvey]     = useState(null);
    const [answers, setAnswers]   = useState({});
    const [busy, setBusy]         = useState(false);
    const [loadErr, setLoadErr]   = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/cro/surveys/${surveyId}`);
                setSurvey(r.data);
                // Preload existing responses if survey is already responded (edit mode)
                if (r.data.ResponsesJSON) {
                    try {
                        const existing = JSON.parse(r.data.ResponsesJSON);
                        const ans = {};
                        for (const x of existing) ans[x.id] = x.answer;
                        setAnswers(ans);
                    } catch {}
                }
            } catch (e) { setLoadErr(e.response?.data?.error || e.message); }
        })();
    }, [surveyId]);

    const questions = survey ? safeJSON(survey.QuestionsJSON) : [];
    const ready = (() => {
        for (const q of questions) {
            if (q.type === 'text') continue;
            if (answers[q.id] === undefined || answers[q.id] === '') return false;
        }
        return questions.length > 0;
    })();

    const submit = async () => {
        setBusy(true);
        try {
            const responses = questions.map(q => ({ id: q.id, answer: answers[q.id] ?? '' }));
            const url = survey.Status === 'Responded'
                ? `${API}/cro/surveys/${surveyId}`              // PUT to edit existing responses
                : `${API}/cro/surveys/${surveyId}/capture`;     // POST to capture for the first time
            const method = survey.Status === 'Responded' ? 'put' : 'post';
            const body = survey.Status === 'Responded' ? { Responses: responses } : { responses };
            const r = await axios[method](url, body);
            onSaved?.(r.data);
        } catch (e) {
            const msg = e.response?.data?.error || e.message;
            onError?.(msg);
        }
        setBusy(false);
    };

    if (loadErr) return <div style={{ padding: 10, color: '#b91c1c', fontSize: '0.85rem' }}>{loadErr}</div>;
    if (!survey) return <div style={{ padding: 10, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 6 }}><Loader2 size={14} className="animate-spin" /> Loading survey…</div>;

    const gap = compact ? 10 : 16;
    const isEdit = survey.Status === 'Responded';

    return (
        <div>
            {isEdit && (
                <div style={{ padding: 6, background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', borderRadius: 6, fontSize: '0.75rem', marginBottom: 8 }}>
                    Editing previously captured responses. Saving will overwrite.
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap }}>
                {questions.map((q, i) => (
                    <div key={q.id}>
                        <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: 6 }}>
                            {i + 1}. {q.text}
                            {q.type !== 'text' && <span style={{ color: '#dc2626' }}> *</span>}
                        </div>
                        {q.type === 'rating' && <Rating scale={q.scale || 5} value={answers[q.id]} onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))} />}
                        {q.type === 'yesno'  && <YesNo value={answers[q.id]} onChange={v => setAnswers(a => ({ ...a, [q.id]: v }))} />}
                        {q.type === 'text'   && (
                            <textarea rows={2} value={answers[q.id] || ''} onChange={e => setAnswers(a => ({ ...a, [q.id]: e.target.value }))}
                                style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.85rem', boxSizing: 'border-box' }} />
                        )}
                    </div>
                ))}
            </div>
            <div style={{ marginTop: 12, textAlign: 'right' }}>
                <button onClick={submit} disabled={busy || !ready}
                    style={{
                        padding: '8px 16px', borderRadius: 6, fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed',
                        background: ready ? '#1e40af' : '#cbd5e1', color: 'white', border: 'none',
                        display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.875rem',
                    }}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                    {isEdit ? 'Save Updated Responses' : 'Save Responses'}
                </button>
            </div>
        </div>
    );
}

function Rating({ scale, value, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 4 }}>
            {Array.from({ length: scale }, (_, i) => i + 1).map(n => {
                const active = Number(value) >= n;
                return (
                    <button key={n} type="button" onClick={() => onChange(n)}
                        style={{ flex: 1, padding: 8, border: '2px solid ' + (active ? '#f59e0b' : '#e2e8f0'), background: active ? '#fef3c7' : 'white', color: active ? '#92400e' : '#475569', borderRadius: 6, fontWeight: 700, cursor: 'pointer' }}>
                        {n}
                    </button>
                );
            })}
        </div>
    );
}
function YesNo({ value, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 6 }}>
            {['yes', 'no'].map(v => {
                const active = value === v;
                const c = v === 'yes' ? '#15803d' : '#b91c1c';
                return (
                    <button key={v} type="button" onClick={() => onChange(v)}
                        style={{ flex: 1, padding: 8, border: '2px solid ' + (active ? c : '#e2e8f0'), background: active ? (v === 'yes' ? '#dcfce7' : '#fee2e2') : 'white', color: active ? c : '#475569', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                        {v === 'yes' ? 'Yes' : 'No'}
                    </button>
                );
            })}
        </div>
    );
}

function safeJSON(s) { try { return JSON.parse(s || '[]'); } catch { return []; } }
