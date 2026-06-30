import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
    Building, Plus, X, Loader2, Save, Edit3, Landmark,
    UserCircle, FileText, Phone, MapPin, Briefcase
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { DataCard, EmptyState, FilterBar, PageHeader, SearchField, StatusPill } from '../components/UXPrimitives';
import SearchableSelect from '../components/SearchableSelect';
import Can from '../components/Can';

const API_BASE = '/api';

const PARTY_TYPES = [
    { key: 'Customer',  label: 'Customer',  hint: 'Credit customer. Posts against Trade Debtors.' },
    { key: 'Supplier',  label: 'Supplier',  hint: 'Vendor / supplier. Posts against Trade Creditors.' },
    { key: 'Insurance', label: 'Insurance', hint: 'Insurance company. Posts against Trade Debtors (split-receivable lands with §14.10).' },
    { key: 'Both',      label: 'Both',      hint: 'Used as both customer and supplier. Defaults to Trade Debtors.' }
];

const TYPE_BADGE = {
    Customer: 'blue',
    Supplier: 'amber',
    Insurance: 'indigo',
    Both: 'green'
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const EMPTY_FORM = {
    PartyType: 'Customer',
    PartyName: '', PhoneOne: '', PhoneTwo: '', Email: '',
    CNIC: '', NTNNO: '', SaleTaxRegNo: '',
    AddressOne: '', AddressTwo: '', CityNameManual: '',
    ContactPerson: '', ContactPersonMobile: '', ContactPersonEmail: '',
    CreditLimit: '', LicenseNo: '', LicenseExpiryDate: '',
    PartyGroupID: '', Remarks: '',
    PartyGLID: ''  // user picks at creation time; required
};

function TypeBadge({ type }) {
    return <StatusPill tone={TYPE_BADGE[type] || TYPE_BADGE.Customer}>{type || 'Customer'}</StatusPill>;
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
    const { notify } = useFeedback();
    const [parties, setParties] = useState([]);
    const [groups, setGroups] = useState([]);
    const [pickableGl, setPickableGl] = useState({});   // { 'parentCode title': [{GLCAID, GLCode, GLTitle, Nature}, ...] }
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [showModal, setShowModal] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [form, setForm] = useState(EMPTY_FORM);
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

    // Load the list of GL accounts available for party linkage (Current Assets +
    // Current Liabilities L4 leaves, grouped by their L3 parent)
    useEffect(() => {
        axios.get(`${API_BASE}/parties/coa-pickable`)
            .then(r => setPickableGl(r.data.groups || {}))
            .catch(() => setPickableGl({}));
    }, []);

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
                Remarks: p.Remarks || '',
                PartyGLID: p.PartyGLID ?? ''
            });
            setEditingId(p.PartyID);
            setMsg(null);
            setShowModal(true);
        } catch (err) {
            notify({ type: 'error', title: 'Could not load party', message: err.response?.data?.error || err.message });
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.PartyName.trim()) {
            notify({ type: 'warning', title: 'Party name required', message: 'Enter a party name before saving.' });
            return;
        }
        setBusy(true); setMsg(null);
        try {
            if (editingId) {
                await axios.put(`${API_BASE}/parties/${editingId}`, form);
                setMsg({ kind: 'ok', text: 'Party updated.' });
                notify({ type: 'success', title: 'Party updated', message: form.PartyName });
            } else {
                const r = await axios.post(`${API_BASE}/parties`, form);
                setMsg({ kind: 'ok', text: `Party "${form.PartyName}" created (#${r.data.PartyID}, linked to ${r.data.PartyGLCode} ${r.data.PartyGLTitle}).` });
                notify({ type: 'success', title: 'Party created', message: `${form.PartyName} linked to ${r.data.PartyGLCode}.` });
            }
            await fetchParties();
            setTimeout(() => { setShowModal(false); setMsg(null); }, 1500);
        } catch (err) {
            const text = err.response?.data?.error || err.response?.data?.details || err.message;
            setMsg({ kind: 'err', text });
            notify({ type: 'error', title: 'Party save failed', message: text });
        }
        setBusy(false);
    };

    return (
        <div className="ux-page-stack">
            <PageHeader
                icon={Building}
                eyebrow="Master data"
                title="Parties"
                subtitle="Customers, suppliers, and insurance companies linked directly to their GL accounts."
                actions={<Can perm="crm_parties" action="insert"><button className="btn" onClick={openCreate}><Plus size={18} /> New Party</button></Can>}
            />
            <FilterBar resultLabel={`${parties.length} parties`}>
                <SearchField
                    value={search}
                    onChange={setSearch}
                    placeholder="Search name, phone, CNIC, NTN..."
                    width={320}
                />
                <select value={filterType} onChange={e => setFilterType(e.target.value)} style={{ minWidth: 150 }}>
                    <option value="">All Types</option>
                    {PARTY_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                </select>
            </FilterBar>

            {/* Directory table */}
            <DataCard>
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
                                <tr>
                                    <td colSpan={10} className="table-empty-row">
                                        <EmptyState
                                            icon={Building}
                                            title="No parties found"
                                            message="Try a different search or create a new party."
                                            action={<Can perm="crm_parties" action="insert"><button className="btn-sm" onClick={openCreate}><Plus size={14} /> New Party</button></Can>}
                                        />
                                    </td>
                                </tr>
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
                                        <Can perm="crm_parties" action="edit">
                                            <button onClick={() => openEdit(p)} className="btn-sm" style={{ padding: '4px 8px' }}>
                                                <Edit3 size={12} /> Edit
                                            </button>
                                        </Can>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </DataCard>

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
                                            <Landmark size={14} /> GL Account (Required)
                                        </div>
                                        <SearchableSelect
                                            value={form.PartyGLID}
                                            onChange={v => update('PartyGLID', v)}
                                            options={Object.entries(pickableGl).flatMap(([parent, accts]) => accts.map(a => ({
                                                id: a.GLCAID,
                                                label: a.GLTitle,
                                                sub: a.GLCode + ' · ' + a.Nature,
                                                group: parent,
                                            })))}
                                            placeholder="Pick the GL account this party posts against" />
                                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 8 }}>
                                            All transactions for this party (job-card billing, payment, GRN, etc.) will hit the selected GL account, so the party ledger and the GL stay reconciled by design.
                                        </div>
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
        </div>
    );
}
