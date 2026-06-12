/**
 * Public survey response page — accessed via tokenized link, no login required.
 *
 * Route: /survey/:token
 *
 * Renders the questions from the active template snapshot stored on the survey
 * row, collects answers, and POSTs to the public endpoint. Designed to look
 * dealership-y on a phone screen — single column, big tap targets.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { Loader2, CheckCircle2, AlertTriangle, Send, Star } from 'lucide-react';

const API = '/api';

export default function SurveyPublic() {
    const { token } = useParams();
    const [survey, setSurvey] = useState(null);
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [done, setDone] = useState(null);  // {OverallRating}
    const [err, setErr] = useState(null);
    const [answers, setAnswers] = useState({});

    const load = useCallback(async () => {
        setLoading(true); setErr(null);
        try {
            const r = await axios.get(`${API}/cro/surveys/public/${token}`);
            setSurvey(r.data);
        } catch (e) {
            setErr({ msg: e.response?.data?.error || e.message, status: e.response?.data?.status });
        }
        setLoading(false);
    }, [token]);

    useEffect(() => { load(); }, [load]);

    const setAnswer = (qid, val) => setAnswers(a => ({ ...a, [qid]: val }));

    const allRequiredAnswered = (() => {
        if (!survey?.Questions) return false;
        for (const q of survey.Questions) {
            if (q.type === 'text') continue; // optional
            if (answers[q.id] === undefined || answers[q.id] === '') return false;
        }
        return true;
    })();

    const submit = async () => {
        setSubmitting(true);
        try {
            const responses = survey.Questions.map(q => ({ id: q.id, answer: answers[q.id] ?? '' }));
            const r = await axios.post(`${API}/cro/surveys/public/${token}/respond`, { responses });
            setDone(r.data);
        } catch (e) {
            setErr({ msg: e.response?.data?.error || e.message });
        }
        setSubmitting(false);
    };

    // --- States: loading / error / done / form -------------
    if (loading) return (
        <Wrap><div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="animate-spin" size={32} /></div></Wrap>
    );

    if (err) return (
        <Wrap>
            <div style={{ padding: 32, textAlign: 'center' }}>
                <AlertTriangle size={40} color="#dc2626" />
                <h2 style={{ marginTop: 12, color: '#0f172a' }}>{err.status === 'Responded' ? 'Already submitted' : 'Cannot show this survey'}</h2>
                <p style={{ color: '#64748b' }}>{err.msg}</p>
            </div>
        </Wrap>
    );

    if (done) return (
        <Wrap>
            <div style={{ padding: 40, textAlign: 'center' }}>
                <CheckCircle2 size={56} color="#15803d" />
                <h2 style={{ marginTop: 12, color: '#0f172a' }}>Thank you!</h2>
                <p style={{ color: '#64748b' }}>Your feedback has been submitted.</p>
                {done.OverallRating != null && (
                    <div style={{ marginTop: 16, fontSize: '0.9rem', color: '#475569' }}>
                        Your overall rating: <strong>{done.OverallRating} / 5</strong>
                    </div>
                )}
            </div>
        </Wrap>
    );

    return (
        <Wrap>
            <div style={{ padding: 24 }}>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    {survey.SurveyType === 'PostJobCard' ? 'Service Feedback' : 'Complaint Resolution Feedback'}
                    {survey.JobCardNo && ` · ${survey.JobCardNo}`}
                    {survey.ComplaintNo && ` · ${survey.ComplaintNo}`}
                </div>
                <h1 style={{ margin: '8px 0 24px', fontSize: '1.4rem', color: '#0f172a' }}>
                    {survey.SurveyType === 'PostJobCard' ? 'How was your service?' : 'Was your complaint handled well?'}
                </h1>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {survey.Questions.map((q, idx) => (
                        <Question key={q.id} q={q} idx={idx + 1} value={answers[q.id]} onChange={v => setAnswer(q.id, v)} />
                    ))}
                </div>

                <button onClick={submit} disabled={!allRequiredAnswered || submitting}
                    style={{
                        marginTop: 28, width: '100%',
                        padding: 14, fontSize: '1rem', fontWeight: 600,
                        background: allRequiredAnswered ? '#1e40af' : '#cbd5e1',
                        color: 'white', border: 'none', borderRadius: 8,
                        cursor: allRequiredAnswered ? 'pointer' : 'not-allowed',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    }}>
                    {submitting ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                    Submit feedback
                </button>
                {!allRequiredAnswered && (
                    <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#94a3b8', textAlign: 'center' }}>
                        Please answer the rating and yes/no questions to submit.
                    </div>
                )}
            </div>
        </Wrap>
    );
}

function Wrap({ children }) {
    return (
        <div style={{ minHeight: '100vh', background: '#f8fafc', padding: 16, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
            <div style={{ maxWidth: 480, margin: '24px auto', background: 'white', borderRadius: 14, boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
                {children}
            </div>
        </div>
    );
}

function Question({ q, idx, value, onChange }) {
    return (
        <div>
            <div style={{ fontWeight: 600, color: '#0f172a', fontSize: '0.95rem', marginBottom: 10 }}>
                {idx}. {q.text}
                {q.type !== 'text' && <span style={{ color: '#dc2626', marginLeft: 4 }}>*</span>}
            </div>
            {q.type === 'rating' && <Rating scale={q.scale || 5} value={value} onChange={onChange} />}
            {q.type === 'yesno'  && <YesNo value={value} onChange={onChange} />}
            {q.type === 'text'   && (
                <textarea rows={3} value={value || ''} onChange={e => onChange(e.target.value)}
                    placeholder="Optional — your comments here…"
                    style={{ width: '100%', padding: 10, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.95rem', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
            )}
        </div>
    );
}

function Rating({ scale, value, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 6, justifyContent: 'space-between' }}>
            {Array.from({ length: scale }, (_, i) => i + 1).map(n => {
                const active = Number(value) >= n;
                return (
                    <button key={n} type="button" onClick={() => onChange(n)}
                        style={{
                            flex: 1, padding: '12px 0',
                            border: '2px solid ' + (active ? '#f59e0b' : '#e2e8f0'),
                            background: active ? '#fef3c7' : 'white',
                            color: active ? '#92400e' : '#94a3b8',
                            borderRadius: 8, cursor: 'pointer', fontWeight: 700, fontSize: '1.1rem',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4,
                        }}>
                        <Star size={16} fill={active ? '#f59e0b' : 'none'} />
                        {n}
                    </button>
                );
            })}
        </div>
    );
}

function YesNo({ value, onChange }) {
    return (
        <div style={{ display: 'flex', gap: 8 }}>
            {['yes', 'no'].map(v => {
                const active = value === v;
                const c = v === 'yes' ? '#15803d' : '#b91c1c';
                return (
                    <button key={v} type="button" onClick={() => onChange(v)}
                        style={{
                            flex: 1, padding: '12px 0', fontWeight: 600, fontSize: '0.95rem',
                            border: '2px solid ' + (active ? c : '#e2e8f0'),
                            background: active ? (v === 'yes' ? '#dcfce7' : '#fee2e2') : 'white',
                            color: active ? c : '#475569', borderRadius: 8, cursor: 'pointer',
                        }}>
                        {v === 'yes' ? 'Yes' : 'No'}
                    </button>
                );
            })}
        </div>
    );
}
