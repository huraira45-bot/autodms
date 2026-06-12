import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Building, Plus, Search, X, Loader2, Save, Edit3, Landmark,
    UserCircle, FileText, Phone, MapPin, Briefcase
} from 'lucide-react';

const API_BASE = '/api';

const PARTY_TYPES = [
    { key: 'Customer',  label: 'Customer',  hint: 'Credit customer. Posts against Trade Debtors.' },
    { key: 'Supplier',  label: 'Supplier',  hint: 'Vendor / supplier. Posts against Trade Creditors.' },
    { key: 'Insurance', label: 'Insurance', hint: 'Insurance company. Posts against Trade Debtors (split-receivable lands with §14.10).' },
    { key: 'Both',      label: 'Both',      hint: 'Used as both customer and supplier. Defaults to Trade Debtors.' }
];

const TYPE_BADGE = {
    Customer:  { bg: '#dbeafe', col: '#1e40af' },
    Supplier:  { bg: '#fef3c7', col: '#a16207' },
    Insurance: { bg: '#ede9fe', col: '#6d28d9' },
    Both:      { bg: '#d1fae5', col: '#047857' }
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_FORM = {
    PartyType: 'Customer',
    PartyName: '', PhoneOne: '', PhoneTwo: '', Email: '',
    CNIC: '', NTNNO: '', SaleTaxRegNo: '',
    AddressOne: '', AddressTwo: '', CityNameManual: '',
    ContactPerson: '', ContactPersonMobile: '', ContactPersonEmail: '',
    CreditLimit: '', LicenseNo: '', LicenseExpiryDate: '',
    PartyGroupID: '', Remarks: ''
};

function TypeBadge({ type }) {
    const s = TYPE_BADGE[type] || TYPE_BADGE.Customer;
    return (
        <span style={{
            background: s.bg, color: s.col, padding: '2px 8px',
            borderRadius: 99, fontSize: '0.7rem', fontWeight: 700
        }}>{type || 'Customer'}</span>
    );
}

function Section({ icon: Icon, title, children }) {
    return (
        <div style={{ marginBottom: 20 }}>
            <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem',
                marginBottom: 10, paddingBottom: 6, borderBottom: '1px solid #e2e8f0'
            }}>
                <Icon size={16} /> {title}
            </div>
            {children}
        </div>
    );
}

export default function Customers() {
    const [parties, setParties] = useState([]);
    const [groups, setGroups] = useState([]);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
    const [glPreview, setGlPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);

    const fetchParties = useCallback(async () => {
        try {
            const params = {};
            if (filterType) params.type = filterType;
            if (search)     params.search = search;
            const r = await axios.get(`${API_BASE}/parties`, { params });
            setParties(r.data);
        } catch (err) { console.error(err); }
    }, [filterType, search]);

    const fetchGroups = useCallback(async () => {
        try {
            const r = await axios.get(`${API_BASE}/parties/groups`);
            setGroups(r.data);
        } catch (err) { console.error(err); }
    }, []);

    useEffect(() => { fetchParties(); }, [fetchParties]);
    useEffect(() => { fetchGroups(); }, [fetchGroups]);

    // Preview which control account this party will be linked to
    useEffect(() => {
        let cancel = false;
        axios.get(`${API_BASE}/parties/control-account`, { params: { type: form.PartyType } })
            .then(r => { if (!cancel) setGlPreview(r.data); })
            .catch(() => { if (!cancel) setGlPreview(null); });
        return () => { cancel = true; };
    }, [form.PartyType]);

    const update = (k, v) => setForm(f => ({ ...f, [k]: v }));

    const openCreate = () => {
        setForm(EMPTY_FORM); setEditingId(null); setMsg(null); setShowModal(true);
    };

    const openEdit = async (party) => {
        try {
            const r = await axios.get(`${API_BASE}/parties/${party.PartyID}`);
            const p = r.data;
            setForm({
                PartyType: p.PartyType || 'Customer',
                PartyName: p.PartyName || '',
                PhoneOne: p.PhoneOne || '', PhoneTwo: p.PhoneTwo || '',
                Email: p.Email || '',
                CNIC: p.CNIC || '', NTNNO: p.NTNNO || '', SaleTaxRegNo: p.SaleTaxRegNo || '',
                AddressOne: p.AddressOne || '', AddressTwo: p.AddressTwo || '',
                CityNameManual: p.CityNameManual || '',
                ContactPerson: p.ContactPerson || '',
                ContactPersonMobile: p.ContactPersonMobile || '',
                ContactPersonEmail: p.ContactPersonEmail || '',
                CreditLimit: p.CreditLimit ?? '',
                LicenseNo: p.LicenseNo || '',
                LicenseExpiryDate: p.LicenseExpiryDate ? p.LicenseExpiryDate.slice(0, 10) : '',
                PartyGroupID: p.PartyGroupID ?? '',
                Remarks: p.Remarks || ''
            });
            setEditingId(p.PartyID);
            setMsg(null);
            setShowModal(true);
        } catch (err) {
            alert('Failed to load party: ' + (err.response?.data?.error || err.message));
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.PartyName.trim()) return alert('Party Name is required.');
        setBusy(true); setMsg(null);
        try {
            if (editingId) {
                await axios.put(`${API_BASE}/parties/${editingId}`, form);
                setMsg({ kind: 'ok', text: 'Party updated.' });
            } else {
                const r = await axios.post(`${API_BASE}/parties`, form);
                setMsg({ kind: 'ok', text: `Party "${form.PartyName}" created (#${r.data.PartyID}, linked to ${r.data.PartyGLCode} ${r.data.PartyGLTitle}).` });
            }
            await fetchParties();
            setTimeout(() => { setShowModal(false); setMsg(null); }, 1500);
        } catch (err) {
            setMsg({ kind: 'err', text: err.response?.data?.error || err.response?.data?.details || err.message });
        }
        setBusy(false);
    };

    return (
        <div>
            <div className="card-header" style={{ marginBottom: 20 }}>
                <div>
                    <h1 className="page-title">Parties</h1>
                    <p className="page-subtitle">
                        Customers, Suppliers, and Insurance companies — with automatic GL control-account linkage.
                        Per-party balances tracked via subsidiary ledger.
                    </p>
                </div>
                <button className="btn" onClick={openCreate}><Plus size={18} /> New Party</button>
            </div>

            {/* Filter bar */}
            <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="search-box" style={{ width: 280 }}>
                    <Search size={16} />
                    <input
                        type="text"
                        placeholder="Search name, phone, CNIC, NTN..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }}
                    />
                </div>
                <select value={filterType} onChange={e => setFilterType(e.target.value)}
                    style={{ padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.875rem' }}>
                    <option value="">All Types</option>
                    {PARTY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
                <div style={{ color: '#64748b', fontSize: '0.85rem', marginLeft: 'auto' }}>
                    {parties.length} parties
                </div>
            </div>

            {/* Directory table */}
            <div className="card">
                <div className="table-wrapper">
                    <table>
                        <thead>
                            <tr>
                                <th>ID</th><th>Name</th><th>Type</th><th>Phone</th>
                                <th>CNIC</th><th>NTN</th><th>Group</th>
                                <th style={{ textAlign: 'right' }}>Credit Limit</th>
                                <th>GL Account</th><th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {parties.length === 0 ? (
                                <tr><td colSpan={10} style={{ padding: 24, textAlign: 'center', color: '#64748b' }}>No parties match the filter.</td></tr>
                            ) : parties.slice(0, 100).map(p => (
                                <tr key={p.PartyID}>
                                    <td>#{p.PartyID}</td>
                                    <td style={{ fontWeight: 500 }}>{p.PartyName}</td>
                                    <td><TypeBadge type={p.PartyType} /></td>
                                    <td>{p.PhoneOne || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.CNIC || '—'}</td>
                                    <td style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}>{p.NTNNO || '—'}</td>
                                    <td style={{ color: '#64748b', fontSize: '0.85rem' }}>{p.PartyGroupName || '—'}</td>
                                    <td style={{ textAlign: 'right' }}>{p.CreditLimit ? fmt(p.CreditLimit) : '—'}</td>
                                    <td style={{ fontSize: '0.8rem', color: '#64748b' }}>
                                        {p.PartyGLCode ? <><span style={{ fontFamily: 'monospace' }}>{p.PartyGLCode}</span> {p.PartyGLTitle}</> : '—'}
                                    </td>
                                    <td>
                                        <button onClick={() => openEdit(p)} className="btn-sm" style={{ padding: '4px 8px' }}>
                                            <Edit3 size={12} /> Edit
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal */}
            {showModal && (
                <div className="modal-overlay" onClick={() => setShowModal(false)}>
                    <div className="modal-card" style={{ width: 720, maxHeight: '92vh', overflowY: 'auto' }}
                         onClick={e => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3>{editingId ? `Edit Party #${editingId}` : 'New Party'}</h3>
                            <button onClick={() => setShowModal(false)}><X size={18} /></button>
                        </div>

                        <form onSubmit={handleSubmit} style={{ padding: 20 }}>
                            {msg && (
                                <div style={{
                                    padding: 10, borderRadius: 6, marginBottom: 16, fontSize: '0.875rem',
                                    background: msg.kind === 'ok' ? '#f0fdf4' : '#fef2f2',
                                    color: msg.kind === 'ok' ? '#15803d' : '#b91c1c',
                                    border: '1px solid ' + (msg.kind === 'ok' ? '#bbf7d0' : '#fecaca')
                                }}>
                                    {msg.text}
                                </div>
                            )}

                            {/* Type + GL preview */}
                            <Section icon={Briefcase} title="Party Type & GL Link">
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, alignItems: 'start' }}>
                                    <div>
                                        <label style={{ fontSize: '0.85rem', fontWeight: 600, display: 'block', marginBottom: 6 }}>Party Type *</label>
                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                            {PARTY_TYPES.map(t => (
                                                <label key={t.key} style={{
                                                    display: 'flex', alignItems: 'flex-start', gap: 8,
                                                    padding: 8, borderRadius: 6, cursor: 'pointer',
                                                    border: '1px solid ' + (form.PartyType === t.key ? 'var(--primary)' : '#e2e8f0'),
                                                    background: form.PartyType === t.key ? '#eff6ff' : 'white'
                                                }}>
                                                    <input type="radio" name="partyType" value={t.key}
                                                        checked={form.PartyType === t.key}
                                                        onChange={() => update('PartyType', t.key)} />
                                                    <div>
                                                        <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.label}</div>
                                                        <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{t.hint}</div>
                                                    </div>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                    <div style={{
                                        background: '#f8fafc', border: '1px solid #cbd5e1',
                                        borderRadius: 8, padding: 14
                                    }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#475569', fontSize: '0.75rem', textTransform: 'uppercase', marginBottom: 8 }}>
                                            <Landmark size={14} /> Auto-Linked Control Account
                                        </div>
                                        {glPreview ? (
                                            <>
                                                <div style={{ fontFamily: 'monospace', fontWeight: 600, color: '#1e40af', fontSize: '0.95rem' }}>
                                                    {glPreview.GLCode}
                                                </div>
                                                <div style={{ fontWeight: 500 }}>{glPreview.GLTitle}</div>
                                                <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: 6 }}>
                                                    Postings will hit this account; per-party balance lives in <strong>dms_PartyLedger</strong>.
                                                </div>
                                            </>
                                        ) : (
                                            <div style={{ color: '#94a3b8', fontStyle: 'italic' }}>Resolving...</div>
                                        )}
                                    </div>
                                </div>
                            </Section>

                            {/* Identity */}
                            <Section icon={UserCircle} title="Identity & Contact">
                                <div className="grid-2">
                                    <div className="form-group">
                                        <label>Party Name *</label>
                                        <input required type="text" value={form.PartyName} onChange={e => update('PartyName', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Party Group</label>
                                        <select value={form.PartyGroupID} onChange={e => update('PartyGroupID', e.target.value)}>
                                            <option value="">(none)</option>
                                            {groups.map(g => <option key={g.PartyGroupID} value={g.PartyGroupID}>{g.GroupName}</option>)}
                                        </select>
                                        <small style={{ color: '#64748b' }}>Use for grouping multi-branch parties (e.g. EFU Central / South).</small>
                                    </div>
                                    <div className="form-group">
                                        <label>Phone (Primary)</label>
                                        <input type="text" value={form.PhoneOne} onChange={e => update('PhoneOne', e.target.value)} placeholder="0300-1234567" />
                                    </div>
                                    <div className="form-group">
                                        <label>Phone (Secondary)</label>
                                        <input type="text" value={form.PhoneTwo} onChange={e => update('PhoneTwo', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input type="email" value={form.Email} onChange={e => update('Email', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>City</label>
                                        <input type="text" value={form.CityNameManual} onChange={e => update('CityNameManual', e.target.value)} placeholder="Karachi, Lahore, ..." />
                                    </div>
                                </div>
                            </Section>

                            {/* Tax */}
                            <Section icon={FileText} title="Tax Registration (FBR)">
                                <div className="grid-3">
                                    <div className="form-group">
                                        <label>CNIC</label>
                                        <input type="text" value={form.CNIC} onChange={e => update('CNIC', e.target.value)} placeholder="13 digits" />
                                        <small style={{ color: '#64748b' }}>Auto-formatted as 12345-1234567-1.</small>
                                    </div>
                                    <div className="form-group">
                                        <label>NTN</label>
                                        <input type="text" value={form.NTNNO} onChange={e => update('NTNNO', e.target.value)} placeholder="7–9 digits" />
                                    </div>
                                    <div className="form-group">
                                        <label>Sales Tax Reg. No.</label>
                                        <input type="text" value={form.SaleTaxRegNo} onChange={e => update('SaleTaxRegNo', e.target.value)} placeholder="STRN..." />
                                    </div>
                                </div>
                            </Section>

                            {/* Address */}
                            <Section icon={MapPin} title="Address">
                                <div className="grid-2">
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Address Line 1</label>
                                        <input type="text" value={form.AddressOne} onChange={e => update('AddressOne', e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Address Line 2</label>
                                        <input type="text" value={form.AddressTwo} onChange={e => update('AddressTwo', e.target.value)} />
                                    </div>
                                </div>
                            </Section>

                            {/* Contact Person */}
                            <Section icon={Phone} title="Designated Contact Person">
                                <div className="grid-3">
                                    <div className="form-group">
                                        <label>Name</label>
                                        <input type="text" value={form.ContactPerson} onChange={e => update('ContactPerson', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Mobile</label>
                                        <input type="text" value={form.ContactPersonMobile} onChange={e => update('ContactPersonMobile', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>Email</label>
                                        <input type="email" value={form.ContactPersonEmail} onChange={e => update('ContactPersonEmail', e.target.value)} />
                                    </div>
                                </div>
                            </Section>

                            {/* Commercial */}
                            <Section icon={Building} title="Commercial / License">
                                <div className="grid-3">
                                    <div className="form-group">
                                        <label>Credit Limit (PKR)</label>
                                        <input type="number" step="0.01" min="0" value={form.CreditLimit} onChange={e => update('CreditLimit', e.target.value)} placeholder="0.00" />
                                    </div>
                                    <div className="form-group">
                                        <label>License No.</label>
                                        <input type="text" value={form.LicenseNo} onChange={e => update('LicenseNo', e.target.value)} />
                                    </div>
                                    <div className="form-group">
                                        <label>License Expiry</label>
                                        <input type="date" value={form.LicenseExpiryDate} onChange={e => update('LicenseExpiryDate', e.target.value)} />
                                    </div>
                                    <div className="form-group" style={{ gridColumn: '1 / -1' }}>
                                        <label>Remarks</label>
                                        <textarea rows={2} value={form.Remarks} onChange={e => update('Remarks', e.target.value)} style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }} />
                                    </div>
                                </div>
                            </Section>

                            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 16 }}>
                                <button type="button" className="btn-sm" onClick={() => setShowModal(false)}>Cancel</button>
                                <button type="submit" className="btn" disabled={busy}>
                                    {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                                    {editingId ? 'Update Party' : 'Create Party'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <style>{`
                .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: flex; align-items: center; justify-content: center; z-index: 1000; }
                .modal-card { background: white; border-radius: 12px; overflow: hidden; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); }
                .modal-header { padding: 16px 20px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; display: flex; justify-content: space-between; align-items: center; }
                .modal-header h3 { margin: 0; font-size: 1rem; }
                .modal-header button { background: transparent; border: none; cursor: pointer; }
                .search-box { display: flex; align-items: center; gap: 8px; background: white; padding: 0 12px; border: 1px solid #cbd5e1; border-radius: 8px; height: 40px; }
            `}</style>
        </div>
    );
}
