import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { X, Search, Loader2, Save, AlertTriangle } from 'lucide-react';

const API = '/api';

const SOURCES   = ['Phone', 'WalkIn', 'Online', 'WhatsApp', 'Inquiry', 'PostJobSurvey', 'CRO_OutboundCall'];
const TYPES     = ['Service', 'Product'];
const SEVERITY  = ['Low', 'Normal', 'High', 'Critical'];

export default function NewComplaintModal({ onClose, onCreated }) {
    const [step, setStep] = useState(1);

    // Customer picker (step 1)
    const [custQuery, setCustQuery] = useState('');
    const [custResults, setCustResults] = useState([]);
    const [custBusy, setCustBusy] = useState(false);
    const [picked, setPicked] = useState(null);  // { ProfileID, endUserName, PhoneNo, ChasisNo, EngineNo, ...}

    // JC picker (step 2)
    const [jcList, setJcList] = useState([]);
    const [jcBusy, setJcBusy] = useState(false);
    const [chosenJC, setChosenJC] = useState(null);

    // Form (step 3)
    const [form, setForm] = useState({
        ComplaintType: 'Service',
        Source: 'Phone',
        Severity: 'Normal',
        Subject: '',
        Description: '',
        ContactName: '',
        ContactPhone: '',
    });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    // ---- Customer search ----
    useEffect(() => {
        if (custQuery.trim().length < 2) { setCustResults([]); return; }
        let cancelled = false;
        setCustBusy(true);
        const t = setTimeout(async () => {
            try {
                const r = await axios.get(`${API}/workshop/customers`, { params: { search: custQuery } });
                if (!cancelled) setCustResults(r.data.slice(0, 12));
            } catch (e) {
                if (!cancelled) setCustResults([]);
            }
            if (!cancelled) setCustBusy(false);
        }, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [custQuery]);

    // ---- Load customer's recent JCs ----
    const loadJCs = useCallback(async (profileId) => {
        setJcBusy(true);
        try {
            const r = await axios.get(`${API}/cro/customers/${profileId}/jobcards`);
            setJcList(r.data);
        } catch (e) { console.error(e); setJcList([]); }
        setJcBusy(false);
    }, []);

    const handlePickCustomer = (c) => {
        setPicked(c);
        setForm(f => ({
            ...f,
            ContactName: c.endUserName || c.CustomerName || '',
            ContactPhone: c.PhoneNo || c.CustomerPhone || ''
        }));
        loadJCs(c.ProfileID);
        setStep(2);
    };

    const handlePickJC = (jc) => {
        setChosenJC(jc);
        // Default complaint type by JC business type — BP/WR usually Service, others by user choice
        setForm(f => ({ ...f, ComplaintType: f.ComplaintType || 'Service' }));
        setStep(3);
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!chosenJC) return;
        if (!form.Subject.trim()) return setError('Subject is required.');
        if (!form.ContactName.trim()) return setError('Contact name is required.');
        if (!form.ContactPhone.trim()) return setError('Contact phone is required.');

        setSubmitting(true); setError(null);
        try {
            const res = await axios.post(`${API}/cro/complaints`, {
                JobCardID: chosenJC.JobCardId,
                ComplaintType: form.ComplaintType,
                Source: form.Source,
                Severity: form.Severity,
                Subject: form.Subject.trim(),
                Description: form.Description.trim() || null,
                ContactName: form.ContactName.trim(),
                ContactPhone: form.ContactPhone.trim(),
            });
            onCreated(res.data);
        } catch (e) {
            setError(e.response?.data?.error || e.message);
        }
        setSubmitting(false);
    };

    return (
        <div style={overlay} onClick={onClose}>
            <div style={modalCard} onClick={e => e.stopPropagation()}>
                <Header step={step} onClose={onClose} picked={picked} chosenJC={chosenJC} onBack={() => setStep(s => Math.max(1, s - 1))} />

                {step === 1 && (
                    <div style={{ padding: 20 }}>
                        <SectionTitle>1 · Pick the customer</SectionTitle>
                        <div style={searchBox}>
                            <Search size={14} color="#64748b" />
                            <input
                                value={custQuery}
                                onChange={e => setCustQuery(e.target.value)}
                                placeholder="Search by name, phone, registration #, chassis…"
                                autoFocus
                                style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.9rem' }}
                            />
                            {custBusy && <Loader2 size={14} className="animate-spin" />}
                        </div>
                        <div style={{ marginTop: 12, maxHeight: 360, overflowY: 'auto' }}>
                            {custQuery.length < 2 && <Hint>Type at least 2 characters to search.</Hint>}
                            {custQuery.length >= 2 && !custBusy && custResults.length === 0 &&
                                <Hint>No customers match "{custQuery}".</Hint>}
                            {custResults.map(c => (
                                <div key={c.ProfileID} onClick={() => handlePickCustomer(c)} style={pickRow}
                                     onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                     onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div style={{ fontWeight: 600 }}>{c.endUserName || c.CustomerName}</div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                        {c.PhoneNo || c.CustomerPhone || '—'}
                                        {c.RegistrationNo && ` · ${c.RegistrationNo}`}
                                        {c.ChasisNo && ` · ${c.ChasisNo}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 2 && picked && (
                    <div style={{ padding: 20 }}>
                        <SectionTitle>2 · Pick the Job Card</SectionTitle>
                        <div style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: 8 }}>
                            Every complaint links to an existing JC (decision #1). Pick the one this complaint is about.
                        </div>
                        {jcBusy && <Hint><Loader2 size={12} className="animate-spin" style={{ display: 'inline', marginRight: 6 }} /> Loading recent JCs…</Hint>}
                        {!jcBusy && jcList.length === 0 && (
                            <div style={{ padding: 16, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, display: 'flex', gap: 8 }}>
                                <AlertTriangle size={18} />
                                <div>
                                    No Job Cards on file for this customer. Per decision #1, a complaint cannot be filed without an existing JC. Open a new JC first via Workshop &gt; New Job Card.
                                </div>
                            </div>
                        )}
                        <div style={{ maxHeight: 360, overflowY: 'auto' }}>
                            {jcList.map(jc => (
                                <div key={jc.JobCardId} onClick={() => handlePickJC(jc)} style={pickRow}
                                     onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
                                     onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                        <span style={{ fontFamily: 'monospace', fontWeight: 700, color: '#1e40af' }}>{jc.JobCardNo}</span>
                                        <span style={{ fontSize: '0.7rem', color: '#64748b' }}>
                                            {jc.JobCardDate ? new Date(jc.JobCardDate).toLocaleDateString() : ''}
                                            {jc.IsFinalized ? ' · Finalized' : ' · Open'}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                                        {jc.BusinessType && <span style={{ background: '#eff6ff', color: '#1e40af', padding: '1px 6px', borderRadius: 4, marginRight: 6 }}>{jc.BusinessType}</span>}
                                        {jc.VehicleRegNo && `${jc.VehicleRegNo} · `}
                                        {jc.ServiceAdvisor && `Advisor: ${jc.ServiceAdvisor}`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {step === 3 && picked && chosenJC && (
                    <form onSubmit={submit} style={{ padding: 20 }}>
                        <SectionTitle>3 · Complaint details</SectionTitle>
                        {error && <div style={{ padding: 10, background: '#fef2f2', color: '#b91c1c', border: '1px solid #fecaca', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>{error}</div>}

                        <div style={grid2}>
                            <Field label="Type">
                                <select value={form.ComplaintType} onChange={e => setForm({ ...form, ComplaintType: e.target.value })} style={inp}>
                                    {TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                                </select>
                            </Field>
                            <Field label="Source">
                                <select value={form.Source} onChange={e => setForm({ ...form, Source: e.target.value })} style={inp}>
                                    {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="Severity">
                                <select value={form.Severity} onChange={e => setForm({ ...form, Severity: e.target.value })} style={inp}>
                                    {SEVERITY.map(s => <option key={s} value={s}>{s}</option>)}
                                </select>
                            </Field>
                            <Field label="JC (locked)">
                                <input value={chosenJC.JobCardNo} disabled style={{ ...inp, background: '#f1f5f9' }} />
                            </Field>
                            <Field label="Contact name *" full>
                                <input value={form.ContactName} onChange={e => setForm({ ...form, ContactName: e.target.value })} style={inp} required />
                            </Field>
                            <Field label="Contact phone *" full>
                                <input value={form.ContactPhone} onChange={e => setForm({ ...form, ContactPhone: e.target.value })} style={inp} required />
                            </Field>
                            <Field label="Subject *" full>
                                <input value={form.Subject} onChange={e => setForm({ ...form, Subject: e.target.value })} placeholder="One-liner describing the issue" style={inp} required />
                            </Field>
                            <Field label="Description" full>
                                <textarea value={form.Description} onChange={e => setForm({ ...form, Description: e.target.value })}
                                    rows={4} placeholder="What did the customer say? What's the problem?"
                                    style={{ ...inp, resize: 'vertical', fontFamily: 'inherit' }} />
                            </Field>
                        </div>

                        <div style={{ marginTop: 16, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                            <button type="button" className="btn-sm" onClick={onClose}>Cancel</button>
                            <button type="submit" className="btn" disabled={submitting} style={{ background: '#15803d' }}>
                                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                                File Complaint
                            </button>
                        </div>
                    </form>
                )}
            </div>
        </div>
    );
}

function Header({ step, picked, chosenJC, onClose, onBack }) {
    return (
        <div style={hdr}>
            <div>
                <h3 style={{ margin: 0 }}>New Complaint — Step {step} of 3</h3>
                <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2 }}>
                    {picked && `${picked.endUserName || picked.CustomerName} · ${picked.PhoneNo || picked.CustomerPhone || ''}`}
                    {chosenJC && ` · ${chosenJC.JobCardNo}`}
                </div>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
                {step > 1 && <button onClick={onBack} className="btn-sm">Back</button>}
                <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
        </div>
    );
}

const Field = ({ label, children, full }) => (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
        <label style={{ fontSize: '0.78rem', fontWeight: 600, color: '#475569', display: 'block', marginBottom: 4 }}>{label}</label>
        {children}
    </div>
);

const SectionTitle = ({ children }) => (
    <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 12, fontSize: '0.95rem' }}>{children}</div>
);

const Hint = ({ children }) => (
    <div style={{ padding: 16, color: '#94a3b8', textAlign: 'center', fontSize: '0.85rem' }}>{children}</div>
);

const overlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modalCard = { background: 'white', borderRadius: 12, width: 640, maxHeight: '92vh', overflowY: 'auto', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)' };
const hdr = { padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' };
const searchBox = { display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, background: 'white' };
const pickRow = { padding: '10px 12px', border: '1px solid #e2e8f0', borderRadius: 6, marginBottom: 6, cursor: 'pointer', background: 'transparent' };
const inp = { width: '100%', padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem', boxSizing: 'border-box' };
const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
