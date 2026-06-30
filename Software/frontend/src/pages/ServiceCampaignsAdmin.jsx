/**
 * Service & Parts Campaigns — admin master.
 *
 * Workflow:
 *   1. Click "+ New Campaign" — form with name, type (Service/Parts/Both),
 *      borne-by (Us / MCML), benefit, validity, and eligibility (which parts
 *      and labour codes qualify).
 *   2. If BorneBy=MCML, the backend AUTO-CREATES a new GL leaf under 102006
 *      (next free 102006xxx code) and shows it in the success message.
 *   3. If BorneBy=Us, the user picks an existing Expense (5xxx) GL account.
 *
 * The actual auto-suggest-on-JobCard / discount-line creation lives in the
 * Job Card and Store Sale screens (Phase 2 — not built yet).
 */
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Plus, RefreshCw, Loader2, X, Save, Pause, Play, CheckSquare, Square, Search,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const API = '/api';

const TYPE_PILL = {
    Service: { bg: '#dbeafe', col: '#1e40af' },
    Parts:   { bg: '#fef3c7', col: '#92400e' },
    Both:    { bg: '#ede9fe', col: '#6d28d9' },
};
const BORNE_PILL = {
    Us:   { bg: '#fee2e2', col: '#b91c1c', label: 'Our expense' },
    MCML: { bg: '#dcfce7', col: '#15803d', label: 'MCML claim' },
};
const STATUS_PILL = {
    Active: { bg: '#dcfce7', col: '#15803d' },
    Paused: { bg: '#fef3c7', col: '#92400e' },
    Closed: { bg: '#e2e8f0', col: '#475569' },
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_FORM = {
    CampaignCode: '', CampaignName: '', Description: '',
    CampaignType: 'Service', BorneBy: 'MCML',
    ExpenseGLAccountID: '',
    BenefitDescription: '',
    IncludesTax: false,
    // Split benefit — each side independently None / Percent / Fixed / Free
    LabourBenefitType: 'None',  LabourBenefitPercent: '', LabourBenefitAmount: '',
    PartsBenefitType:  'None',  PartsBenefitPercent:  '', PartsBenefitAmount:  '',
    ApplicableJobCardTypes: '',
    ValidFrom: new Date().toISOString().slice(0,10),
    ValidTo: new Date(Date.now() + 90 * 86400000).toISOString().slice(0,10),
    PolicyDocPath: '', Remarks: '',
    EligibleItemIds: [], EligibleJobInfoIds: [],
};

function Pill({ palette, value, label }) {
    const sty = palette[value] || { bg: '#f1f5f9', col: '#475569' };
    return <span style={{ background: sty.bg, color: sty.col, padding: '2px 8px',
                          borderRadius: 99, fontSize: '0.72rem', fontWeight: 600 }}>{label || value}</span>;
}

export default function ServiceCampaignsAdmin() {
    const { confirm: confirmAction } = useFeedback();
    const [campaigns, setCampaigns] = useState([]);
    const [jobTypes, setJobTypes] = useState([]);
    const [jobInfo, setJobInfo] = useState([]);
    const [items, setItems] = useState([]);
    const [expenseAccounts, setExpenseAccounts] = useState([]);

    const [showForm, setShowForm] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const [loading, setLoading] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [c, jt, ji, it, ex] = await Promise.all([
                axios.get(`${API}/service-campaigns`),
                axios.get(`${API}/workshop/job-types`).catch(() => ({ data: [] })),
                axios.get(`${API}/service-campaigns/lookups/job-info`).catch(() => ({ data: [] })),
                axios.get(`${API}/items`).catch(() => ({ data: [] })),
                axios.get(`${API}/service-campaigns/lookups/expense-accounts`).catch(() => ({ data: [] })),
            ]);
            setCampaigns(c.data || []);
            setJobTypes(jt.data || []);
            setJobInfo(ji.data || []);
            setItems(Array.isArray(it.data) ? it.data : (it.data?.items || []));
            setExpenseAccounts(ex.data || []);
        } catch (e) { console.error(e); }
        setLoading(false);
    }, []);

    useEffect(() => { load(); }, [load]);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 5000); };
    const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const openNew = () => { setEditingId(null); setForm(EMPTY_FORM); setShowForm(true); };

    const openEdit = async (row) => {
        try {
            const r = await axios.get(`${API}/service-campaigns/${row.CampaignID}`);
            const d = r.data;
            setForm({
                CampaignCode: d.CampaignCode || '', CampaignName: d.CampaignName || '',
                Description: d.Description || '',
                CampaignType: d.CampaignType, BorneBy: d.BorneBy,
                ExpenseGLAccountID: d.BorneBy === 'Us' ? (d.GLAccountID || '') : '',
                BenefitDescription: d.BenefitDescription || '',
                IncludesTax: !!d.IncludesTax,
                LabourBenefitType:    d.LabourBenefitType    || 'None',
                LabourBenefitPercent: d.LabourBenefitPercent || '',
                LabourBenefitAmount:  d.LabourBenefitAmount  || '',
                PartsBenefitType:     d.PartsBenefitType     || 'None',
                PartsBenefitPercent:  d.PartsBenefitPercent  || '',
                PartsBenefitAmount:   d.PartsBenefitAmount   || '',
                ApplicableJobCardTypes: d.ApplicableJobCardTypes || '',
                ValidFrom: d.ValidFrom?.slice(0,10) || '',
                ValidTo: d.ValidTo?.slice(0,10) || '',
                PolicyDocPath: d.PolicyDocPath || '',
                Remarks: d.Remarks || '',
                EligibleItemIds: (d.EligibleItems || []).map(x => x.ItemId),
                EligibleJobInfoIds: (d.EligibleJobs || []).map(x => x.JobInfoId),
            });
            setEditingId(d.CampaignID);
            setShowForm(true);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const save = async () => {
        setBusy(true);
        try {
            const body = { ...form };
            ['BenefitPercent','BenefitAmount','ExpenseGLAccountID']
                .forEach(k => { if (body[k] === '') body[k] = null; });
            const r = editingId
                ? await axios.put(`${API}/service-campaigns/${editingId}`, body)
                : await axios.post(`${API}/service-campaigns`, body);
            flash('ok', r.data.message || 'Saved.');
            setShowForm(false); load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const changeStatus = async (row, newStatus) => {
        try {
            await axios.post(`${API}/service-campaigns/${row.CampaignID}/status`, { Status: newStatus });
            flash('ok', `Set to ${newStatus}.`); load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const closeCampaign = async (row) => {
        const ok = await confirmAction({
            title: 'Close campaign?',
            message: 'Closed campaigns can no longer be applied to new job cards or sales.',
            confirmLabel: 'Close campaign',
            tone: 'warning'
        });
        if (ok) changeStatus(row, 'Closed');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title">Service & Parts Campaigns</h1>
                    <p className="page-subtitle">
                        Promotional offers on workshop services and parts sales. MCML-borne campaigns auto-create a
                        new sub-account under 102006 Master Changan Motors for the receivable.
                    </p>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn-sm" onClick={load} disabled={loading}>
                        {loading ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                    </button>
                    <button className="btn" onClick={openNew}><Plus size={16} /> New Campaign</button>
                </div>
            </div>

            {msg && (
                <div className="card" style={{
                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca'),
                    color: msg.kind === 'ok' ? '#15803d' : '#b91c1c', padding: 12 }}>
                    {msg.text}
                </div>
            )}

            <div className="card" style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                    <thead>
                        <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                            <th style={th}>Code</th><th style={th}>Name</th>
                            <th style={th}>Type</th><th style={th}>Borne by</th>
                            <th style={th}>Benefit</th><th style={th}>GL Account</th>
                            <th style={th}>Validity</th>
                            <th style={th}>Eligible</th>
                            <th style={th}>Used</th><th style={th}>Given (PKR)</th>
                            <th style={th}>Status</th><th style={th}></th>
                        </tr>
                    </thead>
                    <tbody>
                        {campaigns.length === 0 && (
                            <tr><td colSpan={12} style={{ padding: 40, textAlign: 'center', color: '#94a3b8', fontStyle: 'italic' }}>
                                No campaigns yet. Click <strong>+ New Campaign</strong> to create one.
                            </td></tr>
                        )}
                        {campaigns.map(c => (
                            <tr key={c.CampaignID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                <td style={td}><code>{c.CampaignCode}</code></td>
                                <td style={td}><strong>{c.CampaignName}</strong>
                                    {c.BenefitDescription && <div style={subText}>{c.BenefitDescription}</div>}
                                </td>
                                <td style={td}><Pill palette={TYPE_PILL} value={c.CampaignType} /></td>
                                <td style={td}><Pill palette={BORNE_PILL} value={c.BorneBy} label={BORNE_PILL[c.BorneBy]?.label} /></td>
                                <td style={td}>
                                    <SideBenefitText label="Labour" type={c.LabourBenefitType} pct={c.LabourBenefitPercent} amt={c.LabourBenefitAmount} />
                                    <SideBenefitText label="Parts"  type={c.PartsBenefitType}  pct={c.PartsBenefitPercent}  amt={c.PartsBenefitAmount}  />
                                </td>
                                <td style={td}>
                                    {c.GLCode ? (
                                        <div>
                                            <code>{c.GLCode}</code>
                                            <div style={subText}>{c.GLTitle}</div>
                                        </div>
                                    ) : <span style={subText}>—</span>}
                                </td>
                                <td style={td}>
                                    {c.ValidFrom?.slice(0,10)} →
                                    <div style={subText}>{c.ValidTo?.slice(0,10)}</div>
                                </td>
                                <td style={td}>
                                    <div style={{ fontSize: '0.78rem' }}>
                                        {c.ItemCount} item{c.ItemCount === 1 ? '' : 's'},{' '}
                                        {c.JobCount} job{c.JobCount === 1 ? '' : 's'}
                                    </div>
                                </td>
                                <td style={{ ...td, textAlign: 'right' }}>{c.UsedCount}</td>
                                <td style={{ ...td, textAlign: 'right', fontFamily: 'monospace' }}>{fmt(c.TotalGiven)}</td>
                                <td style={td}><Pill palette={STATUS_PILL} value={c.Status} /></td>
                                <td style={td}>
                                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                                        <button className="btn-sm" onClick={() => openEdit(c)}>Edit</button>
                                        {c.Status === 'Active' && (
                                            <button className="btn-sm" onClick={() => changeStatus(c, 'Paused')} title="Pause">
                                                <Pause size={12} />
                                            </button>
                                        )}
                                        {c.Status === 'Paused' && (
                                            <button className="btn-sm" onClick={() => changeStatus(c, 'Active')} title="Resume">
                                                <Play size={12} />
                                            </button>
                                        )}
                                        {c.Status !== 'Closed' && (
                                            <button className="btn-sm" onClick={() => closeCampaign(c)}>Close</button>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {showForm && (
                <CampaignForm
                    form={form} setForm={setForm} update={update}
                    jobTypes={jobTypes} jobInfo={jobInfo} items={items} expenseAccounts={expenseAccounts}
                    busy={busy} editing={!!editingId}
                    onSave={save} onCancel={() => setShowForm(false)} />
            )}
        </div>
    );
}

const th = { padding: '10px', textAlign: 'left', fontSize: '0.7rem',
              color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap' };
const td = { padding: '8px 10px', verticalAlign: 'top' };
const subText = { fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 };

// =====================================================================
// Form modal
// =====================================================================
function CampaignForm({ form, update, jobTypes, jobInfo, items, expenseAccounts, busy, editing, onSave, onCancel }) {
    return (
        <div style={modalOverlay}>
            <div className="card" style={modalCard}>
                <div style={modalHeader}>
                    <h2 style={{ margin: 0 }}>{editing ? 'Edit campaign' : 'New campaign'}</h2>
                    <button className="btn-sm" onClick={onCancel}><X size={14} /></button>
                </div>

                <Section title="Identity">
                    <div style={grid2}>
                        <Field label="Campaign code *"><input value={form.CampaignCode}
                            onChange={e => update('CampaignCode', e.target.value)}
                            disabled={editing}
                            placeholder="FREE_OIL_JUN26"
                            style={inputStyle} /></Field>
                        <Field label="Campaign name *"><input value={form.CampaignName}
                            onChange={e => update('CampaignName', e.target.value)}
                            placeholder="Free oil change with filter purchase"
                            style={inputStyle} /></Field>
                    </div>
                    <Field label="Description">
                        <textarea rows={2} value={form.Description}
                            onChange={e => update('Description', e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                    </Field>
                </Section>

                <Section title="Scope">
                    <div style={grid2}>
                        <Field label="Campaign type *">
                            <select value={form.CampaignType} onChange={e => update('CampaignType', e.target.value)} style={inputStyle}>
                                <option value="Service">Service (workshop jobs)</option>
                                <option value="Parts">Parts (store sales)</option>
                                <option value="Both">Both</option>
                            </select>
                        </Field>
                        <Field label="Applicable Business Types">
                            <BusinessTypePicker types={jobTypes}
                                value={form.ApplicableJobCardTypes}
                                onChange={v => update('ApplicableJobCardTypes', v)} />
                        </Field>
                    </div>
                </Section>

                <Section title="Who pays?">
                    <div style={grid2}>
                        <Field label="Borne by *">
                            <select value={form.BorneBy} onChange={e => update('BorneBy', e.target.value)}
                                    disabled={editing} style={inputStyle}>
                                <option value="MCML">MCML — claimable (auto-create sub-account under 102006)</option>
                                <option value="Us">Us — our marketing expense</option>
                            </select>
                            {editing && <div style={hint}>BorneBy can't change after creation. Close + recreate if needed.</div>}
                        </Field>
                        {form.BorneBy === 'Us' && (
                            <Field label="Expense GL Account *">
                                <select value={form.ExpenseGLAccountID}
                                        onChange={e => update('ExpenseGLAccountID', e.target.value)}
                                        style={inputStyle}>
                                    <option value="">— Pick an expense account —</option>
                                    {expenseAccounts.map(a => (
                                        <option key={a.GLCAID} value={a.GLCAID}>
                                            {a.GLCode} · {a.GLTitle}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                        )}
                        {form.BorneBy === 'MCML' && !editing && (
                            <div style={{ alignSelf: 'flex-end', fontSize: '0.78rem', color: '#15803d', padding: 8,
                                          background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6 }}>
                                On save: new GL sub-account will be created under <code>102006</code>.
                            </div>
                        )}
                    </div>
                </Section>

                <Section title="Benefit (Labour + Parts can each be set independently)">
                    <div style={grid2}>
                        <SideBenefit
                            label="Service / Labour benefit"
                            type={form.LabourBenefitType}
                            pct={form.LabourBenefitPercent}
                            amt={form.LabourBenefitAmount}
                            setType={v => update('LabourBenefitType', v)}
                            setPct={v => update('LabourBenefitPercent', v)}
                            setAmt={v => update('LabourBenefitAmount', v)}
                            freeLabel="Free Service (100% off labour)"
                        />
                        <SideBenefit
                            label="Parts benefit"
                            type={form.PartsBenefitType}
                            pct={form.PartsBenefitPercent}
                            amt={form.PartsBenefitAmount}
                            setType={v => update('PartsBenefitType', v)}
                            setPct={v => update('PartsBenefitPercent', v)}
                            setAmt={v => update('PartsBenefitAmount', v)}
                            freeLabel="Free Parts (100% off parts)"
                        />
                    </div>
                    <Field label="Benefit description (shown on JC line)">
                        <input value={form.BenefitDescription}
                            onChange={e => update('BenefitDescription', e.target.value)}
                            placeholder="e.g. Free oil filter + 20% off labour"
                            style={inputStyle} />
                    </Field>
                    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginTop: 8,
                                    padding: 10, background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6 }}>
                        <input type="checkbox" checked={form.IncludesTax}
                               onChange={e => update('IncludesTax', e.target.checked)}
                               style={{ marginTop: 2 }} />
                        <div>
                            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e40af' }}>
                                Campaign also covers PST / GST
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#475569', marginTop: 2 }}>
                                Tick this when MCML (or we) absorb the tax too. At apply time the auto-computed
                                benefit will include tax — customer pays 0. Leave unticked when the campaign
                                only covers the labour/parts and customer still pays the tax portion.
                            </div>
                        </div>
                    </label>
                </Section>

                <Section title="Eligibility — which items / labour codes qualify">
                    <div style={grid2}>
                        <MultiSelectPicker
                            label={`Eligible Items / Parts (${form.EligibleItemIds.length} selected)`}
                            options={items.map(i => ({ id: i.ItemId, label: `${i.ItemNumber} · ${i.ItenName}` }))}
                            selected={form.EligibleItemIds}
                            onChange={ids => update('EligibleItemIds', ids)} />
                        <MultiSelectPicker
                            label={`Eligible Labour / Jobs (${form.EligibleJobInfoIds.length} selected)`}
                            options={jobInfo.map(j => ({ id: j.JobInfoId, label: j.JobInfoName }))}
                            selected={form.EligibleJobInfoIds}
                            onChange={ids => update('EligibleJobInfoIds', ids)} />
                    </div>
                    <div style={hint}>Leave both lists empty to apply campaign to any item / job.</div>
                </Section>

                <Section title="Validity">
                    <div style={grid2}>
                        <Field label="Valid from *">
                            <input type="date" value={form.ValidFrom} onChange={e => update('ValidFrom', e.target.value)} style={inputStyle} />
                        </Field>
                        <Field label="Valid to *">
                            <input type="date" value={form.ValidTo} onChange={e => update('ValidTo', e.target.value)} style={inputStyle} />
                        </Field>
                    </div>
                </Section>

                <Section title="Documentation">
                    <Field label="Policy doc path / link (MCML letter, internal memo, etc.)">
                        <input value={form.PolicyDocPath}
                            onChange={e => update('PolicyDocPath', e.target.value)} style={inputStyle} />
                    </Field>
                    <Field label="Remarks">
                        <textarea rows={2} value={form.Remarks}
                            onChange={e => update('Remarks', e.target.value)}
                            style={{ ...inputStyle, resize: 'vertical' }} />
                    </Field>
                </Section>

                <div style={modalFooter}>
                    <button className="btn-sm" onClick={onCancel}>Cancel</button>
                    <button className="btn" onClick={onSave} disabled={busy}>
                        {busy ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                        {editing ? 'Save changes' : 'Create campaign'}
                    </button>
                </div>
            </div>
        </div>
    );
}

function BusinessTypePicker({ types, value, onChange }) {
    const selected = (value || '').split(',').filter(Boolean).map(Number);
    const toggle = (id) => {
        const next = selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id];
        onChange(next.join(',') || '');
    };
    return (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {types.length === 0 && <span style={hint}>No business types defined yet.</span>}
            {types.map(t => {
                const on = selected.includes(t.JobCardTypeId);
                return (
                    <button key={t.JobCardTypeId} type="button" onClick={() => toggle(t.JobCardTypeId)}
                        style={{
                            background: on ? '#1e40af' : '#f1f5f9', color: on ? 'white' : '#475569',
                            border: 'none', padding: '4px 10px', borderRadius: 6, fontSize: '0.78rem',
                            fontWeight: 600, cursor: 'pointer',
                        }}>{t.CardCode}</button>
                );
            })}
            <div style={hint}>{selected.length === 0 ? 'No selection = all business types' : `${selected.length} selected`}</div>
        </div>
    );
}

function MultiSelectPicker({ label, options, selected, onChange }) {
    const [q, setQ] = useState('');
    const set = new Set(selected);
    const filtered = q ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase())) : options.slice(0, 200);
    const toggle = (id) => {
        const ns = new Set(set);
        if (ns.has(id)) ns.delete(id); else ns.add(id);
        onChange(Array.from(ns));
    };
    return (
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column' }}>
            <label>{label}</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #cbd5e1', borderRadius: 6,
                          padding: '4px 8px', marginBottom: 4, gap: 4 }}>
                <Search size={14} color="#94a3b8" />
                <input value={q} onChange={e => setQ(e.target.value)}
                    placeholder="Search..."
                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.85rem' }} />
            </div>
            <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                {filtered.length === 0 && <div style={{ padding: 12, color: '#94a3b8', fontStyle: 'italic', fontSize: '0.8rem' }}>No matches.</div>}
                {filtered.map(o => (
                    <div key={o.id} onClick={() => toggle(o.id)}
                        style={{ padding: '5px 8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6,
                                 background: set.has(o.id) ? '#eff6ff' : undefined, fontSize: '0.8rem',
                                 borderBottom: '1px solid #f1f5f9' }}>
                        {set.has(o.id)
                            ? <CheckSquare size={14} color="#1e40af" />
                            : <Square size={14} color="#cbd5e1" />}
                        <span>{o.label}</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function SideBenefitText({ label, type, pct, amt }) {
    if (!type || type === 'None') return null;
    let body = '';
    if (type === 'Percent') body = `${pct}% off`;
    else if (type === 'Fixed') body = `PKR ${fmt(amt)} off`;
    else if (type === 'Free')  body = 'Free';
    return (
        <div style={{ fontSize: '0.78rem', color: '#475569' }}>
            <span style={{ color: '#94a3b8' }}>{label}:</span> <strong>{body}</strong>
        </div>
    );
}

function SideBenefit({ label, type, pct, amt, setType, setPct, setAmt, freeLabel }) {
    return (
        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: 12 }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', color: '#1e40af', marginBottom: 8 }}>{label}</div>
            <select value={type} onChange={e => setType(e.target.value)} style={inputStyle}>
                <option value="None">No benefit on this side</option>
                <option value="Percent">% Discount</option>
                <option value="Fixed">Fixed amount discount</option>
                <option value="Free">{freeLabel}</option>
            </select>
            {type === 'Percent' && (
                <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: '0.75rem', color: '#475569' }}>Discount %</label>
                    <input type="number" step="0.1" value={pct}
                        onChange={e => setPct(e.target.value)}
                        placeholder="e.g. 20" style={inputStyle} />
                </div>
            )}
            {type === 'Fixed' && (
                <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: '0.75rem', color: '#475569' }}>Fixed discount (PKR)</label>
                    <input type="number" value={amt}
                        onChange={e => setAmt(e.target.value)}
                        placeholder="e.g. 500" style={inputStyle} />
                </div>
            )}
            {type === 'Free' && (
                <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#15803d', fontStyle: 'italic' }}>
                    100% off — this side is fully covered.
                </div>
            )}
        </div>
    );
}

function Section({ title, children }) {
    return (
        <div style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.82rem',
                          paddingBottom: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 10 }}>
                {title}
            </div>
            {children}
        </div>
    );
}
function Field({ label, children }) {
    return (
        <div className="form-group">
            <label>{label}</label>
            {children}
        </div>
    );
}

const grid2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 };
const inputStyle = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.85rem' };
const hint = { fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000,
                        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 20 };
const modalCard    = { width: '100%', maxWidth: 900, marginTop: 30 };
const modalHeader  = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 };
const modalFooter  = { display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 20, paddingTop: 16, borderTop: '1px solid #e2e8f0' };
