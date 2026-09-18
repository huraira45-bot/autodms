/**
 * Sales — enter a booking that happened before DealerDesk.
 *
 * Owner ask 2026-09-18. Same shape as New Booking, but for a past deal: it is
 * dated when it actually happened, lands in the state you choose, posts nothing
 * to the GL, and raises no staff incentive. Its payments are then linked, on
 * the booking screen, to the vouchers already sitting in the chart of accounts.
 */
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Loader2, Search, History, AlertTriangle, XCircle } from 'lucide-react';
import { ErpControlPanel } from '../../components/erp';
import SearchableSelect from '../../components/SearchableSelect';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');
const today = () => new Date().toISOString().slice(0, 10);

const inputStyle = {
    width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.9rem',
};

const STATE_HELP = {
    Closed: 'The deal is finished — vehicle delivered and the file closed.',
    GatePassIssued: 'The vehicle left on a gate pass but the file was never closed.',
    ReadyForDelivery: 'Paid and waiting for the customer to take the vehicle.',
    MasterInvoicePosted: 'Master invoiced it and the invoice was posted.',
    MasterInvoicePending: 'Allocated, Master invoice not yet received.',
    Allocated: 'A chassis was set aside for this customer.',
    PendingPayment: 'Fully booked, money still owed.',
    BookingConfirmed: 'Booking amount received, balance outstanding.',
    PendingBookingPayment: 'Booked, the minimum booking amount had not arrived.',
    Cancelled: 'The deal fell through.',
};

export default function HistoricalBooking() {
    const navigate = useNavigate();

    const [models, setModels] = useState([]);
    const [variants, setVariants] = useState([]);
    const [states, setStates] = useState([]);
    const [modelId, setModelId] = useState('');
    const [variantId, setVariantId] = useState('');
    const [selectedVariant, setSelectedVariant] = useState(null);

    const [partySearch, setPartySearch] = useState('');
    const [partyResults, setPartyResults] = useState([]);
    const [pickedParty, setPickedParty] = useState(null);
    const [partyLoading, setPartyLoading] = useState(false);

    const [bookingDate, setBookingDate] = useState('');
    const [priceAtTime, setPriceAtTime] = useState('');
    const [negotiatedPrice, setNegotiatedPrice] = useState('');
    const [status, setStatus] = useState('Closed');
    const [corpPO, setCorpPO] = useState('');

    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const [m, s] = await Promise.all([
                    axios.get(`${API}/sales/models`, { params: { activeOnly: 1 } }),
                    axios.get(`${API}/sales/historical/states`),
                ]);
                setModels(m.data);
                setStates(s.data);
            } catch (e) { setErr(e.response?.data?.error || e.message); }
        })();
    }, []);

    useEffect(() => {
        if (!modelId) { setVariants([]); setVariantId(''); return; }
        (async () => {
            try {
                const r = await axios.get(`${API}/sales/variants`, { params: { modelId, activeOnly: 1 } });
                setVariants(r.data);
            } catch { setVariants([]); }
        })();
    }, [modelId]);

    useEffect(() => {
        const v = variants.find(x => x.VariantID === Number(variantId));
        setSelectedVariant(v || null);
    }, [variantId, variants]);

    // Same customer search as the normal booking form.
    useEffect(() => {
        if (pickedParty) return;
        const t = setTimeout(async () => {
            setPartyLoading(true);
            try {
                const params = { glCode: '201002' };
                if (partySearch && partySearch.length >= 1) params.search = partySearch;
                const r = await axios.get(`${API}/parties`, { params });
                const rows = Array.isArray(r.data) ? r.data : (r.data.parties || []);
                setPartyResults(rows.filter(p => ['Customer', 'Both', 'CorporateCustomer'].includes(p.PartyType)).slice(0, 15));
            } catch { setPartyResults([]); }
            setPartyLoading(false);
        }, partySearch ? 250 : 0);
        return () => clearTimeout(t);
    }, [partySearch, pickedParty]);

    const agreed = Number(negotiatedPrice) || 0;
    const dayPrice = Number(priceAtTime) || 0;
    const ready = pickedParty && variantId && bookingDate && agreed > 0
                  && (!dayPrice || dayPrice >= agreed) && status;

    const submit = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await axios.post(`${API}/sales/historical/bookings`, {
                PartyID: pickedParty.PartyID,
                VehicleVariantID: Number(variantId),
                BookingDate: bookingDate,
                NegotiatedPrice: agreed,
                PriceAtTime: dayPrice || undefined,
                Status: status,
                CorporatePONumber: corpPO || undefined,
            });
            navigate(`/sales/bookings/${data.BookingID}`, { replace: true });
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900, margin: '0 auto' }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><History size={18} /> Historical Booking</span>}
                subtitle="A deal done before DealerDesk. Nothing is posted to the accounts — its payments are linked to vouchers already in your chart of accounts."
                actions={
                    <button type="button" className="erp-btn erp-btn-sm" onClick={() => navigate('/sales/bookings')}>
                        <ArrowLeft size={14} /> Back
                    </button>
                }
            />

            <div className="card" style={{ background: '#f0f9ff', borderLeft: '3px solid #0369a1', fontSize: '0.85rem', color: '#0c4a6e' }}>
                <strong>How this differs from a new booking:</strong> no voucher is posted, no approval is asked for,
                and no staff incentive is raised — the deal was commissioned at the time. You choose the state it ended
                in, and each payment is matched to a voucher that is already posted on this customer's account.
            </div>

            {err && (
                <div className="card" style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: '0.85rem' }}>
                    <XCircle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 6 }} />{err}
                </div>
            )}

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Customer</h3>
                {pickedParty ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 10, background: '#f8fafc', borderRadius: 6 }}>
                        <div>
                            <div style={{ fontWeight: 600 }}>{pickedParty.PartyName}</div>
                            <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                                {pickedParty.PhoneNo || pickedParty.Mobile || ''} {pickedParty.CNIC ? `· ${pickedParty.CNIC}` : ''}
                            </div>
                        </div>
                        <button className="btn-sm" onClick={() => { setPickedParty(null); setPartySearch(''); }}>Change</button>
                    </div>
                ) : (
                    <>
                        <div style={{ position: 'relative' }}>
                            <Search size={14} style={{ position: 'absolute', left: 8, top: 11, color: '#94a3b8' }} />
                            <input value={partySearch} onChange={e => setPartySearch(e.target.value)}
                                   placeholder="Search the customer by name, phone or CNIC"
                                   style={{ ...inputStyle, paddingLeft: 28 }} />
                        </div>
                        <div style={{ marginTop: 6, maxHeight: 180, overflowY: 'auto' }}>
                            {partyLoading && <div style={{ padding: 8, color: '#94a3b8', fontSize: '0.8rem' }}>Searching…</div>}
                            {partyResults.map(p => (
                                <div key={p.PartyID} onClick={() => setPickedParty(p)}
                                     style={{ padding: 8, borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '0.85rem' }}>
                                    <strong>{p.PartyName}</strong>
                                    <span style={{ color: '#94a3b8', marginLeft: 8, fontSize: '0.75rem' }}>
                                        {p.PhoneNo || p.Mobile || ''} {p.CNIC ? `· ${p.CNIC}` : ''}
                                    </span>
                                </div>
                            ))}
                            {!partyLoading && partyResults.length === 0 && (
                                <div style={{ padding: 8, color: '#94a3b8', fontSize: '0.8rem' }}>
                                    No customer found. Add them under Credit Parties first — the customer needs an
                                    account in the chart of accounts for their old vouchers to be matched.
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Vehicle and price</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Model *</label>
                        <SearchableSelect value={modelId} onChange={setModelId} placeholder="Pick a model" title="Model"
                                          options={models.map(m => ({ id: m.ModelID, label: `${m.ModelCode} ${m.ModelName}`, sub: m.BrandName }))} />
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Variant *</label>
                        <SearchableSelect value={variantId} onChange={setVariantId} placeholder={modelId ? 'Pick a variant' : 'Pick a model first'} title="Variant"
                                          options={variants.map(v => ({ id: v.VariantID, label: `${v.VariantCode} ${v.VariantName}`, sub: `list ${fmtN(v.StandardPrice)}` }))} />
                    </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginTop: 12 }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Booking date *</label>
                        <input type="date" value={bookingDate} max={today()}
                               onChange={e => setBookingDate(e.target.value)} style={inputStyle} />
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>The day the deal actually happened.</div>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Price of the day</label>
                        <input type="number" value={priceAtTime} onChange={e => setPriceAtTime(e.target.value)}
                               placeholder={selectedVariant ? String(selectedVariant.StandardPrice) : 'list price then'} style={inputStyle} />
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 2 }}>Leave blank to use the agreed price.</div>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Agreed price *</label>
                        <input type="number" value={negotiatedPrice} onChange={e => setNegotiatedPrice(e.target.value)} style={inputStyle} />
                    </div>
                </div>
                {dayPrice > 0 && agreed > 0 && dayPrice < agreed && (
                    <div style={{ marginTop: 8, fontSize: '0.8rem', color: '#b45309' }}>
                        <AlertTriangle size={13} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                        The price of the day cannot be less than the agreed price.
                    </div>
                )}
            </div>

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Where this booking ended up</h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>State *</label>
                        <select value={status} onChange={e => setStatus(e.target.value)} style={inputStyle}>
                            {states.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>{STATE_HELP[status] || ''}</div>
                    </div>
                    <div>
                        <label style={{ fontSize: '0.8rem', fontWeight: 600 }}>Corporate PO (optional)</label>
                        <input value={corpPO} onChange={e => setCorpPO(e.target.value)} style={inputStyle} />
                    </div>
                </div>
            </div>

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-sm" onClick={() => navigate('/sales/bookings')}>Cancel</button>
                <button className="btn" onClick={submit} disabled={busy || !ready}>
                    {busy ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : 'Record historical booking'}
                </button>
            </div>
        </div>
    );
}
