import { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { Building2, Save, Upload, Trash2, Loader2, Image } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { useAuth } from '../context/AuthContext';

const API = '/api/settings/business-profile';

const FIELDS = [
    { section: 'IDENTITY',        cols: [
        { k: 'CompanyName', label: 'Company Name *', required: true, placeholder: 'CHANGAN MULTAN MOTORS' },
        { k: 'LegalName',   label: 'Legal Name',      placeholder: 'M/s Changan Multan Motors' },
    ]},
    { section: 'ADDRESS',         cols: [
        { k: 'Address1',    label: 'Address Line 1',   placeholder: 'NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD' },
        { k: 'Address2',    label: 'Address Line 2',   placeholder: '' },
        { k: 'City',        label: 'City',             placeholder: 'MULTAN' },
        { k: 'Country',     label: 'Country',          placeholder: 'PAKISTAN' },
    ]},
    { section: 'CONTACT',         cols: [
        { k: 'PhoneNumbers', label: 'Phone',           placeholder: '061-111-222-388' },
        { k: 'FaxNumber',    label: 'Fax',             placeholder: '' },
        { k: 'Email',        label: 'Email',           placeholder: 'info@company.com', type: 'email' },
        { k: 'Website',      label: 'Website',         placeholder: 'https://company.com' },
    ]},
    { section: 'TAX IDs (for Sales Tax Invoice)', cols: [
        { k: 'NTN',   label: 'NTN',   placeholder: '1234567-8' },
        { k: 'STRN',  label: 'STRN',  placeholder: '12-34-5678-901-23' },
        { k: 'CNIC',  label: 'CNIC',  placeholder: '' },
    ]},
    { section: 'BANK (for Payment Instructions)', cols: [
        { k: 'BankName',      label: 'Bank Name',       placeholder: 'e.g. Bank Al Habib' },
        { k: 'BankAccountNo', label: 'Account #',       placeholder: '' },
        { k: 'IBAN',          label: 'IBAN',            placeholder: 'PK00 XXXX 0000 0000 0000 0000' },
    ]},
];

const emptyForm = () => {
    const o = {};
    for (const g of FIELDS) for (const f of g.cols) o[f.k] = '';
    return o;
};

export default function BusinessProfile() {
    const { notify, confirm } = useFeedback();
    const { hasPermission } = useAuth();
    const canEdit = hasPermission && hasPermission('settings_business_profile:edit');

    const [profile, setProfile] = useState(null);
    const [form, setForm] = useState(emptyForm());
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(true);
    const fileRef = useRef(null);

    const load = async () => {
        setLoading(true);
        try {
            const r = await axios.get(API);
            if (r.data) {
                setProfile(r.data);
                const next = emptyForm();
                for (const g of FIELDS) for (const f of g.cols) next[f.k] = r.data[f.k] ?? '';
                setForm(next);
            }
        } catch (e) { notify({ type: 'error', title: 'Load failed', message: e.response?.data?.error || e.message }); }
        setLoading(false);
    };
    useEffect(() => { load(); }, []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const save = async () => {
        if (!form.CompanyName?.trim()) { notify({ type: 'error', title: 'Company Name is required' }); return; }
        setSaving(true);
        try {
            const r = await axios.put(API, form);
            setProfile(r.data);
            notify({ type: 'success', title: 'Profile saved' });
        } catch (e) { notify({ type: 'error', title: 'Save failed', message: e.response?.data?.error || e.message }); }
        setSaving(false);
    };

    const onLogo = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const fd = new FormData();
        fd.append('logo', file);
        setUploading(true);
        try {
            const r = await axios.post(`${API}/logo`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
            notify({ type: 'success', title: 'Logo uploaded' });
            setProfile(p => ({ ...(p || {}), LogoPath: r.data.LogoPath }));
        } catch (err) { notify({ type: 'error', title: 'Upload failed', message: err.response?.data?.error || err.message }); }
        setUploading(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeLogo = async () => {
        const ok = await confirm({ title: 'Remove logo?', message: 'The invoice will fall back to plain text until you upload another logo.' });
        if (!ok) return;
        try {
            await axios.delete(`${API}/logo`);
            setProfile(p => ({ ...(p || {}), LogoPath: null }));
            notify({ type: 'success', title: 'Logo removed' });
        } catch (e) { notify({ type: 'error', title: 'Delete failed', message: e.response?.data?.error || e.message }); }
    };

    if (loading) {
        return <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}><Loader2 size={20} className="animate-spin" /> Loading…</div>;
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div className="card-header">
                <div>
                    <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Building2 size={22} color="var(--primary)" /> Business Profile
                    </h1>
                    <p className="page-subtitle">Company details + logo used on Sales Tax Invoices and other printed documents.</p>
                </div>
                {canEdit && (
                    <button onClick={save} disabled={saving} className="btn" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save
                    </button>
                )}
            </div>

            {/* Logo card */}
            <div className="card" style={{ padding: 16, display: 'flex', gap: 20, alignItems: 'flex-start' }}>
                <div style={{ width: 160, height: 120, border: '1px dashed #cbd5e1', borderRadius: 6,
                              display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
                    {profile?.LogoPath
                        ? <img src={`/uploads/${profile.LogoPath}`} alt="logo" style={{ maxWidth: '100%', maxHeight: '100%' }} />
                        : <div style={{ color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                            <Image size={28} /><span style={{ fontSize: 11 }}>No logo yet</span>
                          </div>
                    }
                </div>
                <div style={{ flex: 1 }}>
                    <h3 style={{ margin: '0 0 6px', fontSize: '0.95rem' }}>Logo</h3>
                    <p style={{ margin: '0 0 12px', color: '#64748b', fontSize: '0.85rem' }}>
                        PNG, JPG, WEBP, or SVG. Recommended around 400×300 px so it prints cleanly. Max 5 MB.
                    </p>
                    {canEdit && (
                        <div style={{ display: 'flex', gap: 8 }}>
                            <label className="btn" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: uploading ? 'wait' : 'pointer' }}>
                                {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                                {profile?.LogoPath ? 'Replace logo' : 'Upload logo'}
                                <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} style={{ display: 'none' }} disabled={uploading} />
                            </label>
                            {profile?.LogoPath && (
                                <button onClick={removeLogo} className="btn" style={{ background: '#fee2e2', color: '#b91c1c', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                    <Trash2 size={16} /> Remove
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Fields grouped by section */}
            {FIELDS.map(group => (
                <div key={group.section} className="card" style={{ padding: 16 }}>
                    <h3 style={{ margin: '0 0 12px', fontSize: '0.9rem', color: '#334155', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {group.section}
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                        {group.cols.map(f => (
                            <div key={f.k} className="form-group">
                                <label>{f.label}</label>
                                <input
                                    type={f.type || 'text'}
                                    value={form[f.k] ?? ''}
                                    onChange={e => set(f.k, e.target.value)}
                                    placeholder={f.placeholder}
                                    disabled={!canEdit}
                                    required={f.required}
                                />
                            </div>
                        ))}
                    </div>
                </div>
            ))}

            {profile?.UpdatedAt && (
                <p style={{ margin: 0, fontSize: 12, color: '#64748b', textAlign: 'right' }}>
                    Last updated {new Date(profile.UpdatedAt).toLocaleString('en-PK', { timeZone: 'UTC' })}
                    {profile.UpdatedByName ? ` by ${profile.UpdatedByName}` : ''}
                </p>
            )}
        </div>
    );
}
