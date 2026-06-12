/**
 * Sales — New Booking form.
 *
 * Steps:
 *   1. Pick customer (existing Party or quick-create — quick-create deferred to v2)
 *   2. Pick Vehicle Variant (model first, then variant)
 *   3. Negotiated price (defaults to standard; any reduction triggers approval)
 *   4. Optional: Corporate PO number, Source Inquiry
 *   5. Submit → either advances to PendingPayment (no discount) or PendingApproval (with reason captured)
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, Loader2, Search, AlertTriangle, Car, User, UserPlus, XCircle, Headphones } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { inputStyle, Field, Err, FlashMsg, Shell, Actions } from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

export default function NewBooking() {
    const navigate = useNavigate();
    const { user } = useAuth();
    const [searchParams] = useSearchParams();
    const inquiryId = searchParams.get('inquiryId');
    const [inquiry, setInquiry] = useState(null);

    const [models, setModels] = useState([]);
    const [variants, setVariants] = useState([]);
    const [modelId, setModelId] = useState('');
    const [variantId, setVariantId] = useState('');
    const [selectedVariant, setSelectedVariant] = useState(null);

    // Customer (party) search/pick
    const [partySearch, setPartySearch] = useState('');
    const [partyResults, setPartyResults] = useState([]);
    const [pickedParty, setPickedParty] = useState(null);
    const [partyFocused, setPartyFocused] = useState(false);
    const [partyLoading, setPartyLoading] = useState(false);
    const [showCreateCustomer, setShowCreateCustomer] = useState(false);

    const [negotiatedPrice, setNegotiatedPrice] = useState('');
    const [negotiationReason, setNegotiationReason] = useState('');
    const [corpPO, setCorpPO] = useState('');

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [msg, setMsg] = useState(null);

    useEffect(() => {
        (async () => {
            const r = await axios.get(`${API}/sales/models`, { params: { activeOnly: 1 } });
            setModels(r.data);
        })();
    }, []);

    // If we were navigated here from the Inquiry queue, fetch the inquiry once and
    // pre-fill the customer search field with the contact phone so the user can
    // pick (or create) the matching party row.
    useEffect(() => {
        if (!inquiryId) return;
        (async () => {
            try {
                const r = await axios.get(`${API}/sales/inquiries`, { params: { filter: 'all' } });
                const found = (r.data || []).find(x => String(x.InquiryID) === String(inquiryId));
                if (found) {
                    setInquiry(found);
                    if (found.ContactPhone) setPartySearch(found.ContactPhone);
                }
            } catch {}
        })();
    }, [inquiryId]);

    useEffect(() => {
        if (!modelId) { setVariants([]); setVariantId(''); return; }
        (async () => {
            const r = await axios.get(`${API}/sales/variants`, { params: { modelId, activeOnly: 1 } });
            setVariants(r.data);
        })();
    }, [modelId]);

    useEffect(() => {
        if (!variantId) { setSelectedVariant(null); return; }
        const v = variants.find(x => x.VariantID === Number(variantId));
        setSelectedVariant(v);
        setNegotiatedPrice(v ? String(v.StandardPrice) : '');
    }, [variantId, variants]);

    // Party search (debounced) — also fetches a default recent list when input is focused but empty
    useEffect(() => {
        if (pickedParty) return;
        const t = setTimeout(async () => {
            setPartyLoading(true);
            try {
                const params = {};
                if (partySearch && partySearch.length >= 1) params.search = partySearch;
                const r = await axios.get(`${API}/parties`, { params });
                const rows = Array.isArray(r.data) ? r.data : (r.data.parties || []);
                // Filter to customer-side parties for the sales UX
                const customers = rows.filter(p => ['Customer', 'Both', 'CorporateCustomer'].includes(p.PartyType));
                setPartyResults(customers.slice(0, 15));
            } catch (e) { setPartyResults([]); }
            setPartyLoading(false);
        }, partySearch ? 250 : 0);
        return () => clearTimeout(t);
    }, [partySearch, pickedParty]);

    const discountAmount = selectedVariant && negotiatedPrice
        ? Math.max(0, selectedVariant.StandardPrice - Number(negotiatedPrice)) : 0;
    const discountPct = selectedVariant ? (discountAmount / selectedVariant.StandardPrice * 100) : 0;
    const needsApproval = discountAmount > 0;

    const ready = pickedParty && variantId && Number(negotiatedPrice) > 0 &&
                  Number(negotiatedPrice) <= (selectedVariant?.StandardPrice || 0) &&
                  (!needsApproval || negotiationReason.trim().length >= 5);

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const body = {
                PartyID: pickedParty.PartyID,
                VehicleVariantID: Number(variantId),
                NegotiatedPrice: Number(negotiatedPrice),
            };
            if (corpPO) body.CorporatePONumber = corpPO;
            if (needsApproval) body.NegotiationReason = negotiationReason.trim();
            if (inquiryId) body.SourceInquiryID = Number(inquiryId);
            const r = await axios.post(`${API}/sales/bookings`, body);
            setMsg({ kind: 'ok', text: `Booking ${r.data.BookingNo} created — ${r.data.Status}` });
            setTimeout(() => navigate(`/sales/bookings/${r.data.BookingID}`), 600);
        } catch (e) {
            setErr(e.response?.data?.error || e.message);
        }
        setBusy(false);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 920, margin: '0 auto' }}>
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate('/sales/bookings')} className="btn-sm"><ArrowLeft size={14} /> Back</button>
                    <div>
                        <h1 className="page-title">New Vehicle Booking</h1>
                        <p className="page-subtitle">Pick customer + variant + price. Any discount triggers admin approval (decision #14).</p>
                    </div>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}
            {err && <Err>{err}</Err>}

            {inquiry && (
                <div className="card" style={{ background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                        <Headphones size={20} style={{ color: '#1e40af', flexShrink: 0, marginTop: 2 }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 600, color: '#1e40af', fontSize: '0.9rem' }}>
                                Converting Inquiry #{inquiry.InquiryID}: {inquiry.Subject}
                            </div>
                            <div style={{ fontSize: '0.82rem', color: '#475569', marginTop: 4 }}>
                                <strong>{inquiry.ContactName}</strong> · {inquiry.ContactPhone}{inquiry.ContactEmail ? ` · ${inquiry.ContactEmail}` : ''}
                            </div>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 4 }}>{inquiry.Body}</div>
                            {inquiry.AssignmentNotes && (
                                <div style={{ marginTop: 6, padding: 6, background: 'white', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: '0.78rem', color: '#475569', whiteSpace: 'pre-wrap' }}>
                                    <strong>Manager notes:</strong> {inquiry.AssignmentNotes}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}><User size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Customer</h3>
                {pickedParty ? (
                    <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <strong>{pickedParty.PartyName}</strong>
                            <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                                {pickedParty.PartyType || 'Customer'}{pickedParty.PhoneOne ? ` · ${pickedParty.PhoneOne}` : ''}
                            </div>
                        </div>
                        <button className="btn-sm" onClick={() => { setPickedParty(null); setPartyResults([]); setPartySearch(''); }}>Change</button>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 12px', border: '1px solid #cbd5e1', borderRadius: 6, height: 38, flex: 1 }}>
                                <Search size={16} />
                                <input
                                    value={partySearch}
                                    onChange={e => setPartySearch(e.target.value)}
                                    onFocus={() => setPartyFocused(true)}
                                    placeholder="Search by name, phone, CNIC, or NTN — or browse below"
                                    style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.875rem' }} />
                                {partyLoading && <Loader2 size={14} className="animate-spin" style={{ color: '#94a3b8' }} />}
                            </div>
                            <button type="button" onClick={() => setShowCreateCustomer(true)}
                                style={{ padding: '0 12px', height: 38, background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <UserPlus size={14} /> New Customer
                            </button>
                        </div>
                        <div style={{ marginTop: 6, border: '1px solid #e2e8f0', borderRadius: 6, maxHeight: 260, overflowY: 'auto' }}>
                            {partyResults.length === 0 ? (
                                <div style={{ padding: 16, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                    {partyLoading ? 'Searching…' : (partySearch ? (
                                        <>
                                            No customer matches "<strong>{partySearch}</strong>".
                                            <button type="button" onClick={() => setShowCreateCustomer(true)}
                                                style={{ marginLeft: 8, padding: '4px 10px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 4, fontSize: '0.78rem', cursor: 'pointer' }}>
                                                + Create "{partySearch}"
                                            </button>
                                        </>
                                    ) : 'No customers yet. Click "New Customer" to create one.')}
                                </div>
                            ) : (
                                <>
                                    {!partySearch && (
                                        <div style={{ padding: '6px 12px', fontSize: '0.7rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600, background: '#f8fafc' }}>
                                            Recent customers
                                        </div>
                                    )}
                                    {partyResults.map(p => (
                                        <div key={p.PartyID} onClick={() => setPickedParty(p)}
                                            style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}
                                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                                            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                                            <div style={{ fontWeight: 500 }}>{p.PartyName}</div>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                {p.PartyType || 'Customer'}{p.PhoneOne ? ` · ${p.PhoneOne}` : ''}{p.CNIC ? ` · CNIC ${p.CNIC}` : ''}
                                            </div>
                                        </div>
                                    ))}
                                </>
                            )}
                        </div>
                    </div>
                )}
                {showCreateCustomer && (
                    <CreateCustomerModal
                        prefillName={partySearch}
                        onClose={() => setShowCreateCustomer(false)}
                        onCreated={(party) => {
                            setShowCreateCustomer(false);
                            setPickedParty(party);
                            setPartySearch('');
                        }} />
                )}
            </div>

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}><Car size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Vehicle</h3>
                <div style={{ display: 'flex', gap: 10 }}>
                    <Field label="Model" flex>
                        <select value={modelId} onChange={e => setModelId(e.target.value)} style={inputStyle}>
                            <option value="">— Pick model —</option>
                            {models.map(m => <option key={m.ModelID} value={m.ModelID}>{m.ModelCode} — {m.ModelName}</option>)}
                        </select>
                    </Field>
                    <Field label="Variant" flex>
                        <select value={variantId} onChange={e => setVariantId(e.target.value)} disabled={!modelId} style={inputStyle}>
                            <option value="">— Pick variant —</option>
                            {variants.map(v => <option key={v.VariantID} value={v.VariantID}>{v.VariantCode} — {v.VariantName}</option>)}
                        </select>
                    </Field>
                </div>

                {selectedVariant && (
                    <div style={{ padding: 12, background: '#f8fafc', borderRadius: 6, marginTop: 6, marginBottom: 6 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', color: '#475569' }}>
                            <span>Standard Price</span>
                            <strong>PKR {fmtN(selectedVariant.StandardPrice)}</strong>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>
                            <span>Std Master incentive · {selectedVariant.StandardIncentiveTaxTreatment}</span>
                            <span>PKR {fmtN(selectedVariant.StandardIncentiveAmount)}</span>
                        </div>
                    </div>
                )}

                <Field label={`Negotiated Price (PKR) ${selectedVariant ? `— Std: ${fmtN(selectedVariant.StandardPrice)}` : ''}`}>
                    <input type="number" value={negotiatedPrice} onChange={e => setNegotiatedPrice(e.target.value)} style={inputStyle} />
                </Field>

                {needsApproval && (
                    <div style={{ padding: 10, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, marginTop: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85rem', color: '#9a3412', fontWeight: 600 }}>
                            <AlertTriangle size={14} /> Discount: PKR {fmtN(discountAmount)} ({discountPct.toFixed(2)}%) — requires sales_admin_pricing approval before payment can be collected
                        </div>
                        <textarea rows={3} value={negotiationReason} onChange={e => setNegotiationReason(e.target.value)}
                            placeholder="Reason for the discount (mandatory, min 5 chars). Approver sees this verbatim."
                            style={{ ...inputStyle, marginTop: 8, resize: 'vertical' }} />
                    </div>
                )}

                <Field label="Corporate PO Number (optional)">
                    <input value={corpPO} onChange={e => setCorpPO(e.target.value)} placeholder="If part of a corporate purchase order" style={inputStyle} />
                </Field>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-sm" onClick={() => navigate('/sales/bookings')}>Cancel</button>
                <button onClick={submit} disabled={busy || !ready}
                    style={{ padding: '10px 20px', background: ready ? '#1e40af' : '#cbd5e1', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: ready ? 'pointer' : 'not-allowed' }}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : null}
                    {needsApproval ? 'Submit for approval' : 'Create booking'}
                </button>
            </div>
        </div>
    );
}

function CreateCustomerModal({ prefillName, onClose, onCreated }) {
    const [name, setName] = useState(prefillName || '');
    const [partyType, setPartyType] = useState('Customer');  // 'Customer' or 'Both' (corporate buyers)
    const [phone, setPhone] = useState('');
    const [cnic, setCnic] = useState('');
    const [ntn, setNtn] = useState('');
    const [address, setAddress] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        if (!name.trim()) { setErr('Name is required'); return; }
        setBusy(true); setErr(null);
        try {
            const r = await axios.post(`${API}/parties`, {
                PartyName: name.trim(),
                PartyType: partyType,
                PhoneOne: phone || null,
                CNIC: cnic || null,
                NTNNO: ntn || null,
                AddressOne: address || null,
            });
            const partyId = r.data?.PartyID;
            if (!partyId) throw new Error('Created but server did not return a PartyID.');
            // Fetch the full row so the booking form has name/phone/type to render
            const full = await axios.get(`${API}/parties/${partyId}`);
            onCreated(full.data);
        } catch (e) { setErr(e.response?.data?.error || e.response?.data?.details || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Create New Customer" onClose={onClose} width={520}>
            {err && <Err>{err}</Err>}
            <Field label="Customer Name *"><input value={name} onChange={e => setName(e.target.value)} style={inputStyle} placeholder="Full name or company name" /></Field>
            <Field label="Type">
                <select value={partyType} onChange={e => setPartyType(e.target.value)} style={inputStyle}>
                    <option value="Customer">Individual Customer</option>
                    <option value="Both">Corporate Customer (AR/AP both)</option>
                </select>
            </Field>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Phone" flex><input value={phone} onChange={e => setPhone(e.target.value)} style={inputStyle} placeholder="03001234567" /></Field>
                <Field label="CNIC" flex><input value={cnic} onChange={e => setCnic(e.target.value)} style={inputStyle} placeholder="00000-0000000-0" /></Field>
            </div>
            <Field label="NTN (for corporates)"><input value={ntn} onChange={e => setNtn(e.target.value)} style={inputStyle} /></Field>
            <Field label="Address"><textarea rows={2} value={address} onChange={e => setAddress(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Create Customer" busy={busy} disabled={!name.trim()} />
        </Shell>
    );
}
