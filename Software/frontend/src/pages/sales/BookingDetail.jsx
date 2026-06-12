/**
 * Sales — Booking Detail page.
 *
 * Shows the full booking: header card, payment list + record-payment form,
 * negotiation history, state-transition timeline.
 * Allocation + Master invoice + delivery actions get their own panels (Phase 3+).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import {
    ArrowLeft, Loader2, RefreshCw, Plus, DollarSign, Ban, Car,
    User, FileText, XCircle, Briefcase, Clock, Link2, FileCheck2, Send, AlertTriangle,
    Upload, Trash2, Paperclip,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
    inputStyle, Field, Err, Actions, Shell, FlashMsg, Pill, Th, Td,
} from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');

const STATUS_STYLE = {
    Draft:                { bg: '#e2e8f0', col: '#475569', label: 'Draft' },
    PendingApproval:      { bg: '#fef3c7', col: '#92400e', label: 'Pending Discount Approval' },
    PendingPayment:       { bg: '#dbeafe', col: '#1e40af', label: 'Pending Payment' },
    Allocated:            { bg: '#fed7aa', col: '#9a3412', label: 'Allocated' },
    MasterInvoicePending: { bg: '#fef3c7', col: '#b45309', label: 'Awaiting Master Invoice' },
    MasterInvoicePosted:  { bg: '#e0e7ff', col: '#3730a3', label: 'Master Invoice Posted' },
    ReadyForDelivery:     { bg: '#dbeafe', col: '#1e40af', label: 'Ready for Delivery' },
    DeliveryApproved:     { bg: '#dcfce7', col: '#15803d', label: 'Delivery Approved' },
    GatePassIssued:       { bg: '#dcfce7', col: '#15803d', label: 'Gate Pass Issued' },
    Closed:               { bg: '#dcfce7', col: '#15803d', label: 'Closed' },
    Cancelled:            { bg: '#fee2e2', col: '#b91c1c', label: 'Cancelled' },
};

export default function BookingDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasModule } = useAuth();
    const [data, setData] = useState(null);
    const [documents, setDocuments] = useState([]);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState(null);
    const [showUploadDoc, setShowUploadDoc] = useState(false);
    const [showPayment, setShowPayment] = useState(false);
    const [showCancel, setShowCancel] = useState(false);
    const [showAllocate, setShowAllocate] = useState(false);
    const [showMasterInvoice, setShowMasterInvoice] = useState(false);
    const [showGatePass, setShowGatePass] = useState(false);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const [r, d] = await Promise.all([
                axios.get(`${API}/sales/bookings/${id}`),
                axios.get(`${API}/sales/bookings/${id}/documents`),
            ]);
            setData(r.data);
            setDocuments(d.data);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setLoading(false);
    }, [id]);
    useEffect(() => { load(); }, [load]);

    const hasDoc = (type) => documents.some(d => d.DocType === type && !d.DeletedAt);

    if (loading) return <div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div>;
    if (!data) return <div style={{ padding: 40, color: '#dc2626' }}>Booking not found</div>;

    const sty = STATUS_STYLE[data.Status] || STATUS_STYLE.Draft;
    const remaining = (data.NegotiatedPrice || 0) - (data.AmountPaidToDate || 0);
    const paidPct = data.NegotiatedPrice > 0 ? (data.AmountPaidToDate / data.NegotiatedPrice * 100) : 0;
    const canPay = ['PendingPayment', 'Allocated', 'MasterInvoicePending', 'MasterInvoicePosted', 'ReadyForDelivery'].includes(data.Status);
    const canCancel = !['Closed', 'Cancelled', 'GatePassIssued', 'Delivered'].includes(data.Status) &&
        (hasModule('sales_executive') || hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_pricing'));
    const canAllocate = ['PendingPayment', 'MasterInvoicePending'].includes(data.Status) &&
        !data.AllocatedVehicleID && (hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_settings'));
    const canPostMasterInvoice = data.AllocatedVehicleID && data.Status === 'Allocated' && hasModule('sales_master_settlement');
    const canIssueGatePass = data.AllocatedVehicleID && ['MasterInvoicePosted', 'ReadyForDelivery'].includes(data.Status) &&
        (hasModule('sales_agm') || hasModule('sales_gm') || hasModule('sales_admin_settings'));

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 1100, margin: '0 auto' }}>
            <div className="card-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <button onClick={() => navigate('/sales/bookings')} className="btn-sm"><ArrowLeft size={14} /> Back</button>
                    <div>
                        <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {data.BookingNo}
                            <Pill bg={sty.bg} col={sty.col}>{sty.label}</Pill>
                        </h1>
                        <p className="page-subtitle">{data.PartyName} · {data.VariantCode} {data.VariantName}</p>
                    </div>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                    {canCancel && (
                        <button className="btn-sm" onClick={() => setShowCancel(true)} style={{ color: '#b91c1c' }}><Ban size={14} /> Cancel</button>
                    )}
                    <button className="btn-sm" onClick={load}><RefreshCw size={14} /></button>
                </div>
            </div>

            {msg && <FlashMsg msg={msg} />}

            {/* Header card */}
            <div className="card">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
                    <Block icon={User} title="Customer">
                        <div style={{ fontWeight: 600 }}>{data.PartyName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{data.PartyType}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{data.PhoneOne}</div>
                        {data.CorporatePONumber && <div style={{ marginTop: 6, fontSize: '0.78rem' }}>PO: <strong>{data.CorporatePONumber}</strong></div>}
                    </Block>
                    <Block icon={Car} title="Vehicle">
                        <div style={{ fontWeight: 600 }}>{data.BrandName} · {data.ModelCode}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>{data.VariantCode} {data.VariantName}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Wholesale PKR {fmtN(data.WholesalePrice)}</div>
                        {data.AllocatedChasisNo && (
                            <div style={{ marginTop: 6, padding: 6, background: '#dcfce7', borderRadius: 4, fontSize: '0.78rem' }}>
                                Chassis: <strong style={{ fontFamily: 'monospace' }}>{data.AllocatedChasisNo}</strong>
                                {data.AllocatedColor && <span> · {data.AllocatedColor}</span>}
                            </div>
                        )}
                    </Block>
                    <Block icon={Briefcase} title="Sales Executive">
                        <div style={{ fontWeight: 600 }}>{(data.SalesExecutiveName || '').trim() || '—'}</div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>Created {new Date(data.CreatedAt).toLocaleString()}</div>
                    </Block>
                </div>

                {/* Money row */}
                <div style={{ marginTop: 16, padding: 14, background: '#f8fafc', borderRadius: 8, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 16 }}>
                    <Stat label="Standard" value={fmtN(data.StandardPrice)} />
                    <Stat label="Negotiated" value={fmtN(data.NegotiatedPrice)} color="#1e40af" />
                    {data.DiscountAmount > 0 && <Stat label="Discount" value={fmtN(data.DiscountAmount)} color="#b91c1c" sub={`${Number(data.DiscountPct).toFixed(2)}%`} />}
                    <Stat label="Paid to date" value={fmtN(data.AmountPaidToDate)} color="#15803d" sub={`${paidPct.toFixed(1)}%`} />
                    <Stat label="Remaining" value={fmtN(remaining)} color={remaining > 0 ? '#b45309' : '#94a3b8'} />
                    {data.PremiumAmount > 0 && <Stat label="Premium" value={fmtN(data.PremiumAmount)} color="#7c3aed" />}
                </div>

                {/* Progress bar */}
                <div style={{ marginTop: 10, height: 8, background: '#f1f5f9', borderRadius: 4, overflow: 'hidden' }}>
                    <div style={{ width: `${Math.min(100, paidPct)}%`, height: '100%', background: paidPct >= 100 ? '#15803d' : '#1e40af', transition: 'width .3s' }} />
                </div>
            </div>

            {/* Workflow actions row */}
            {(canAllocate || canPostMasterInvoice || canIssueGatePass) && (
                <div className="card" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>Next steps:</div>
                    {canAllocate && (
                        <button onClick={() => setShowAllocate(true)}
                            style={{ padding: '8px 14px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Link2 size={14} /> Allocate Vehicle
                        </button>
                    )}
                    {canPostMasterInvoice && (
                        <button onClick={() => setShowMasterInvoice(true)}
                            style={{ padding: '8px 14px', background: '#7c3aed', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <FileCheck2 size={14} /> Post Master Invoice
                        </button>
                    )}
                    {canIssueGatePass && (
                        <button onClick={() => setShowGatePass(true)}
                            style={{ padding: '8px 14px', background: '#15803d', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                            <Send size={14} /> Issue Gate Pass
                        </button>
                    )}
                </div>
            )}

            {/* Documents panel */}
            <div className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h3 style={{ margin: 0, fontSize: '1rem' }}>
                        <Paperclip size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Documents ({documents.filter(d => !d.DeletedAt).length})
                    </h3>
                    <button className="btn" onClick={() => setShowUploadDoc(true)}>
                        <Upload size={14} /> Upload Document
                    </button>
                </div>

                {/* Required-doc checklist */}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {['ProofOfPayment', 'PBO', 'CNIC', 'AuthorityLetter'].map(t => {
                        const has = hasDoc(t);
                        const required = t === 'PBO' || t === 'CNIC';   // for allocation gate
                        return (
                            <div key={t} style={{
                                padding: '6px 10px', borderRadius: 6, fontSize: '0.78rem', fontWeight: 600,
                                background: has ? '#dcfce7' : (required ? '#fef2f2' : '#f1f5f9'),
                                color:      has ? '#15803d' : (required ? '#b91c1c' : '#64748b'),
                                border: '1px solid ' + (has ? '#bbf7d0' : (required ? '#fecaca' : '#e2e8f0')),
                                display: 'flex', alignItems: 'center', gap: 6,
                            }}>
                                {has ? '✓' : (required ? '✕' : '○')} {t} {required && !has && <span style={{ fontSize: '0.7rem' }}>(required for allocation)</span>}
                            </div>
                        );
                    })}
                </div>

                {documents.filter(d => !d.DeletedAt).length === 0 ? (
                    <div style={{ padding: 16, color: '#94a3b8', textAlign: 'center', fontSize: '0.85rem' }}>No documents uploaded yet.</div>
                ) : (
                    <table style={{ width: '100%', fontSize: '0.82rem' }}>
                        <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <Th>Type</Th><Th>Description</Th><Th>File</Th><Th>Uploaded</Th><Th>Actions</Th>
                        </tr></thead>
                        <tbody>
                            {documents.filter(d => !d.DeletedAt).map(d => (
                                <tr key={d.DocumentID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td>
                                        <Pill bg={d.DocType === 'ProofOfPayment' ? '#dcfce7' : d.DocType === 'PBO' || d.DocType === 'CNIC' ? '#dbeafe' : '#f1f5f9'}
                                              col={d.DocType === 'ProofOfPayment' ? '#15803d' : d.DocType === 'PBO' || d.DocType === 'CNIC' ? '#1e40af' : '#475569'}>{d.DocType}</Pill>
                                    </Td>
                                    <Td>{d.Description}</Td>
                                    <Td>
                                        <a href={`/${d.FilePath}`} target="_blank" rel="noreferrer"
                                            style={{ color: '#1e40af', textDecoration: 'underline', fontSize: '0.78rem' }}>
                                            {d.OriginalFileName} ({Math.round(d.SizeBytes / 1024)} KB)
                                        </a>
                                    </Td>
                                    <Td style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                        {d.UploadedByName}<br />{new Date(d.UploadedAt).toLocaleDateString()}
                                    </Td>
                                    <Td>
                                        <button className="btn-icon" title="Delete document"
                                            onClick={async () => {
                                                if (!window.confirm(`Delete this ${d.DocType} document?`)) return;
                                                try { await axios.delete(`${API}/sales/bookings/${id}/documents/${d.DocumentID}`); flash('ok', 'Deleted'); load(); }
                                                catch (e) { flash('err', e.response?.data?.error || e.message); }
                                            }}
                                            style={{ color: '#b91c1c' }}><Trash2 size={14} /></button>
                                    </Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {/* Two-column: payments | timeline */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <h3 style={{ margin: 0, fontSize: '1rem' }}><DollarSign size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Payments ({data.payments?.length || 0})</h3>
                        {canPay && <button className="btn" onClick={() => setShowPayment(true)}><Plus size={14} /> Record</button>}
                    </div>
                    {data.payments?.length === 0 ? (
                        <div style={{ padding: 20, color: '#94a3b8', textAlign: 'center', fontSize: '0.85rem' }}>No payments yet</div>
                    ) : (
                        <table style={{ width: '100%', fontSize: '0.82rem' }}>
                            <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <Th>Date</Th><Th>Path</Th><Th>Mode</Th><Th align="right">Amount</Th>
                            </tr></thead>
                            <tbody>
                                {data.payments?.map(p => (
                                    <tr key={p.PaymentID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <Td style={{ fontSize: '0.75rem' }}>{new Date(p.ReceivedAt).toLocaleString()}</Td>
                                        <Td>{p.PaymentPath}</Td>
                                        <Td>{p.PaymentMode}</Td>
                                        <Td align="right" style={{ fontWeight: 600, color: '#15803d' }}>{fmtN(p.Amount)}</Td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="card">
                    <h3 style={{ marginTop: 0, fontSize: '1rem' }}><Clock size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> Activity Timeline</h3>
                    <div style={{ maxHeight: 400, overflowY: 'auto' }}>
                        {data.transitions?.map(t => (
                            <div key={t.TransitionID} style={{ padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                                <div style={{ fontSize: '0.85rem' }}>
                                    <span style={{ color: '#94a3b8' }}>{t.FromState}</span> →{' '}
                                    <strong>{t.ToState}</strong>
                                </div>
                                <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: 2 }}>
                                    {t.ActorName} {t.ActorRole && `(${t.ActorRole})`} · {new Date(t.At).toLocaleString()}
                                </div>
                                {t.Reason && <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: 4 }}>{t.Reason}</div>}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Negotiations history if any */}
            {data.negotiations?.length > 0 && (
                <div className="card">
                    <h3 style={{ marginTop: 0, fontSize: '1rem' }}>Discount History</h3>
                    <table style={{ width: '100%', fontSize: '0.82rem' }}>
                        <thead><tr style={{ borderBottom: '1px solid #e2e8f0' }}>
                            <Th>Proposed</Th><Th align="right">Standard</Th><Th align="right">Proposed Price</Th>
                            <Th align="right">Discount</Th><Th>Status</Th><Th>Reason / Decision</Th>
                        </tr></thead>
                        <tbody>
                            {data.negotiations.map(n => (
                                <tr key={n.RequestID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    <Td style={{ fontSize: '0.75rem' }}>{new Date(n.ProposedAt).toLocaleString()}<div style={{ color: '#94a3b8' }}>by {n.ProposerName}</div></Td>
                                    <Td align="right">{fmtN(n.StandardPrice)}</Td>
                                    <Td align="right" style={{ fontWeight: 600 }}>{fmtN(n.ProposedPrice)}</Td>
                                    <Td align="right" style={{ color: '#b91c1c' }}>{fmtN(n.DiscountAmount)}<div style={{ fontSize: '0.7rem' }}>{Number(n.DiscountPct).toFixed(2)}%</div></Td>
                                    <Td>
                                        <span style={{ color: n.Status === 'Approved' ? '#15803d' : n.Status === 'Rejected' ? '#b91c1c' : '#b45309', fontWeight: 600, fontSize: '0.78rem' }}>{n.Status}</span>
                                        {n.ApproverName && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>by {n.ApproverName}</div>}
                                    </Td>
                                    <Td style={{ fontSize: '0.78rem', maxWidth: 320 }}>{n.Reason || n.ApproverComments}</Td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}

            {showPayment && (
                <PaymentModal booking={data}
                    onClose={() => setShowPayment(false)}
                    onSaved={() => { setShowPayment(false); flash('ok', 'Payment recorded'); load(); }} />
            )}
            {showCancel && (
                <CancelModal booking={data}
                    onClose={() => setShowCancel(false)}
                    onSaved={() => { setShowCancel(false); flash('ok', 'Cancelled'); load(); }} />
            )}
            {showAllocate && (
                <AllocateModal booking={data}
                    onClose={() => setShowAllocate(false)}
                    onSaved={() => { setShowAllocate(false); flash('ok', 'Vehicle allocated'); load(); }} />
            )}
            {showMasterInvoice && (
                <MasterInvoiceModal booking={data}
                    onClose={() => setShowMasterInvoice(false)}
                    onSaved={(out) => { setShowMasterInvoice(false); flash('ok', `Master invoice posted — accrued PKR ${Number(out.IncentiveAccrued?.total || 0).toLocaleString()}`); load(); }} />
            )}
            {showGatePass && (
                <GatePassModal booking={data}
                    onClose={() => setShowGatePass(false)}
                    onSaved={() => { setShowGatePass(false); flash('ok', 'Gate pass issued — booking closed'); load(); }} />
            )}
            {showUploadDoc && (
                <UploadDocModal bookingId={id}
                    onClose={() => setShowUploadDoc(false)}
                    onSaved={() => { setShowUploadDoc(false); flash('ok', 'Document uploaded'); load(); }} />
            )}
        </div>
    );
}

function UploadDocModal({ bookingId, onClose, onSaved }) {
    const [docType, setDocType] = useState('PBO');
    const [description, setDescription] = useState('');
    const [file, setFile] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const DOC_TYPES = [
        { value: 'PBO', label: 'PBO (Purchase Booking Order)', hint: 'Required for allocation' },
        { value: 'CNIC', label: 'CNIC (Customer ID Card)', hint: 'Required for allocation' },
        { value: 'AuthorityLetter', label: 'Authority Letter', hint: 'For corporate bookings' },
        { value: 'ProofOfPayment', label: 'Proof of Payment', hint: 'Tip: prefer attaching via the Payment form so it links to the payment row' },
        { value: 'Other', label: 'Other', hint: 'Any other supporting document' },
    ];

    const save = async () => {
        if (!file) { setErr('File is required.'); return; }
        if (description.trim().length < 5) { setErr('Description is required (min 5 chars).'); return; }
        setBusy(true); setErr(null);
        try {
            const fd = new FormData();
            fd.append('DocType', docType);
            fd.append('Description', description.trim());
            fd.append('file', file);
            await axios.post(`${API}/sales/bookings/${bookingId}/documents`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const selectedHint = DOC_TYPES.find(d => d.value === docType)?.hint;

    return (
        <Shell title="Upload Booking Document" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Attach supporting paperwork. <strong>PBO</strong> and <strong>CNIC</strong> are mandatory before this booking can be allocated.
            </p>
            <Field label="Document Type *">
                <select value={docType} onChange={e => setDocType(e.target.value)} style={inputStyle}>
                    {DOC_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
                </select>
                {selectedHint && <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>{selectedHint}</div>}
            </Field>
            <Field label="Description * (min 5 chars)">
                <input value={description} onChange={e => setDescription(e.target.value)}
                    placeholder={docType === 'PBO' ? 'e.g. Signed PBO dated 16-May-2026' : docType === 'CNIC' ? 'e.g. CNIC front & back — 35202-XXXXXXX-X' : 'Briefly describe this document'}
                    style={inputStyle} />
            </Field>
            <Field label="File (JPG / PNG / WEBP / PDF, max 10 MB) *">
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => setFile(e.target.files?.[0] || null)} style={inputStyle} />
                {file && <div style={{ fontSize: '0.78rem', color: '#15803d', marginTop: 4 }}>✓ {file.name} ({Math.round(file.size / 1024)} KB)</div>}
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Upload" busy={busy}
                disabled={!file || description.trim().length < 5} />
        </Shell>
    );
}

function AllocateModal({ booking, onClose, onSaved }) {
    const [vehicles, setVehicles] = useState([]);
    const [vehicleId, setVehicleId] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const [loading, setLoading] = useState(true);
    const [readiness, setReadiness] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const [ready, veh] = await Promise.all([
                    axios.get(`${API}/sales/bookings/${booking.BookingID}/allocation-readiness`),
                    axios.get(`${API}/sales/vehicles`, { params: { variantId: booking.VehicleVariantID, status: 'AtDealer' } }),
                ]);
                setReadiness(ready.data);
                setVehicles(veh.data.filter(v => !v.CurrentBookingID));
            } catch (e) { setErr(e.response?.data?.error || e.message); }
            setLoading(false);
        })();
    }, [booking.BookingID, booking.VehicleVariantID]);

    const save = async () => {
        if (!vehicleId) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/bookings/${booking.BookingID}/allocate`, { VehicleID: Number(vehicleId), Notes: notes });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const blocking = readiness && !readiness.ready;

    return (
        <Shell title="Allocate Vehicle" onClose={onClose}>
            {err && <Err>{err}</Err>}
            {loading ? <Loader2 className="animate-spin" /> : (
                <>
                    {/* Readiness banner */}
                    {blocking ? (
                        <div style={{ padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.85rem', color: '#b91c1c', marginBottom: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}>
                                <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle' }} /> Cannot allocate yet — blocking issues:
                            </div>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {readiness.blockingReasons?.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                            <div style={{ marginTop: 8, padding: 8, background: 'white', borderRadius: 4, color: '#475569', fontSize: '0.78rem' }}>
                                <div>Paid to date: <strong>PKR {fmtN(readiness.paidAmount)}</strong></div>
                                {readiness.minimumRequired > 0 && (
                                    <div>Minimum required: <strong>PKR {fmtN(readiness.minimumRequired)}</strong></div>
                                )}
                                {readiness.missingDocuments?.length > 0 && (
                                    <div>Missing documents: <strong>{readiness.missingDocuments.join(', ')}</strong> — upload from the Documents panel above.</div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: '0.85rem', color: '#15803d', marginBottom: 12 }}>
                            ✓ Booking is ready for allocation. Pick an unallocated chassis for variant <strong>{booking.VariantCode}</strong>.
                        </div>
                    )}

                    {vehicles.length === 0 ? (
                        <div style={{ padding: 14, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontSize: '0.85rem', color: '#9a3412' }}>
                            No unallocated chassis available for this variant. Receive a new one via <Link to="/sales/inventory" style={{ color: '#1e40af', textDecoration: 'underline' }}>Vehicle Inventory</Link>.
                        </div>
                    ) : (
                        <>
                            <Field label="Chassis *">
                                <select value={vehicleId} onChange={e => setVehicleId(e.target.value)} style={inputStyle} disabled={blocking}>
                                    <option value="">— Pick chassis —</option>
                                    {vehicles.map(v => (
                                        <option key={v.VehicleID} value={v.VehicleID}>
                                            {v.ChasisNo} · {v.Color || 'no color'} · {v.AllocationType} · {v.Location || ''}
                                        </option>
                                    ))}
                                </select>
                            </Field>
                            <Field label="Notes (optional)">
                                <textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} disabled={blocking} style={{ ...inputStyle, resize: 'vertical' }} />
                            </Field>
                        </>
                    )}
                </>
            )}
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Allocate" busy={busy} disabled={!vehicleId || blocking} />
        </Shell>
    );
}

function MasterInvoiceModal({ booking, onClose, onSaved }) {
    const [invoiceNo, setInvoiceNo] = useState('');
    const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
    const [wholesale, setWholesale] = useState(booking.WholesalePrice || '');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        if (!invoiceNo.trim() || !invoiceDate) return;
        setBusy(true); setErr(null);
        try {
            const r = await axios.post(`${API}/sales/bookings/${booking.BookingID}/post-master-invoice`, {
                MasterInvoiceNo: invoiceNo.trim(),
                MasterInvoiceDate: invoiceDate,
                WholesalePrice: wholesale ? Number(wholesale) : undefined,
                Notes: notes || undefined,
            });
            onSaved(r.data);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Post Master Changan Invoice" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Posting Master's invoice transfers ownership of <strong>{booking.AllocatedChasisNo}</strong> to us and accrues Master incentive (Standard + active campaigns).
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Master Invoice # *" flex><input value={invoiceNo} onChange={e => setInvoiceNo(e.target.value)} placeholder="MCI-2026-XXXX" style={inputStyle} /></Field>
                <Field label="Invoice Date *" flex><input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={inputStyle} /></Field>
            </div>
            <Field label={`Wholesale Price (PKR) — default ${Number(booking.WholesalePrice || 0).toLocaleString('en-PK')}`}>
                <input type="number" value={wholesale} onChange={e => setWholesale(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Notes (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
            <div style={{ padding: 8, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 6, fontSize: '0.78rem', color: '#475569', marginBottom: 10 }}>
                <strong>Std Master incentive on this variant:</strong> PKR {Number(booking.StandardIncentiveAmount || 0).toLocaleString('en-PK')} · {booking.StandardIncentiveTaxTreatment}
            </div>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Post Invoice" busy={busy} disabled={!invoiceNo || !invoiceDate} />
        </Shell>
    );
}

function GatePassModal({ booking, onClose, onSaved }) {
    const [readiness, setReadiness] = useState(null);
    const [gatePassNo, setGatePassNo] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    useEffect(() => {
        (async () => {
            try {
                const r = await axios.get(`${API}/sales/bookings/${booking.BookingID}/delivery-readiness`);
                setReadiness(r.data);
            } catch (e) { setErr(e.response?.data?.error || e.message); }
        })();
    }, [booking.BookingID]);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/bookings/${booking.BookingID}/issue-gate-pass`, {
                GatePassNumber: gatePassNo || undefined,
                Notes: notes || undefined,
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title="Issue Gate Pass" onClose={onClose}>
            {err && <Err>{err}</Err>}
            {!readiness ? <Loader2 className="animate-spin" /> : (
                <>
                    {readiness.ready ? (
                        <div style={{ padding: 10, background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 6, fontSize: '0.85rem', color: '#15803d', marginBottom: 12 }}>
                            ✅ Ready for delivery. Customer paid {readiness.paidPercentage}% of negotiated price.
                        </div>
                    ) : (
                        <div style={{ padding: 10, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 6, fontSize: '0.85rem', color: '#b91c1c', marginBottom: 12 }}>
                            <div style={{ fontWeight: 600, marginBottom: 6 }}><AlertTriangle size={14} style={{ display: 'inline' }} /> Cannot issue gate pass — blocking issues:</div>
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                {readiness.blockingReasons.map((r, i) => <li key={i}>{r}</li>)}
                            </ul>
                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 8 }}>Paid: {readiness.paidPercentage}%. For partial delivery: GM Sales must enable + Finance must co-sign (use the API directly for now; UI in a follow-up).</div>
                        </div>
                    )}
                    <Field label="Gate Pass # (optional — auto-generated if blank)">
                        <input value={gatePassNo} onChange={e => setGatePassNo(e.target.value)} placeholder="GP-2026-XXXX" style={inputStyle} />
                    </Field>
                    <Field label="Notes (optional)"><textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} /></Field>
                </>
            )}
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Issue Gate Pass" busy={busy} disabled={!readiness?.ready} />
        </Shell>
    );
}

function PaymentModal({ booking, onClose, onSaved }) {
    const [path, setPath] = useState('Direct');
    const [mode, setMode] = useState('Cash');
    const [amount, setAmount] = useState('');
    const [premium, setPremium] = useState('0');
    const [refField, setRefField] = useState('');
    const [bankAccountId, setBankAccountId] = useState('');
    const [banks, setBanks] = useState([]);
    const [proofFile, setProofFile] = useState(null);
    const [proofDescription, setProofDescription] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const remaining = (booking.NegotiatedPrice || 0) - (booking.AmountPaidToDate || 0);

    // Mode options depend on path
    const modeOptions = path === 'Direct' ? ['Cash', 'BankTransfer', 'Cheque', 'POS'] : ['PayOrder'];
    useEffect(() => { if (!modeOptions.includes(mode)) setMode(modeOptions[0]); }, [path]);

    // Load active banks once for the bank dropdown (BankTransfer / Cheque / POS / PayOrder all hit a bank account)
    useEffect(() => {
        (async () => {
            try { const r = await axios.get(`${API}/accounting/banks`); setBanks(r.data || []); }
            catch { /* dropdown will just be empty; admin must mark banks in Accounting > Banks */ }
        })();
    }, []);

    // Modes that require a bank to be selected
    const needsBank = ['BankTransfer', 'Cheque', 'POS'].includes(mode) || path === 'PayOrder';

    // Reset bank when switching to Cash
    useEffect(() => { if (!needsBank) setBankAccountId(''); }, [needsBank]);

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            const fd = new FormData();
            fd.append('PaymentPath', path);
            fd.append('PaymentMode', path === 'PayOrder' ? 'PayOrder' : mode);
            fd.append('Amount', String(Number(amount)));
            fd.append('PremiumPortion', String(Number(premium) || 0));
            if (needsBank && bankAccountId) fd.append('BankAccountID', String(Number(bankAccountId)));
            if (mode === 'Cheque')   fd.append('ChequeNumber', refField);
            if (mode === 'POS')      fd.append('POSTransactionRef', refField);
            if (path === 'PayOrder') fd.append('PayOrderNumber', refField);
            if (proofDescription)    fd.append('ProofDescription', proofDescription);
            fd.append('proof', proofFile);
            await axios.post(`${API}/sales/bookings/${booking.BookingID}/payments`, fd, {
                headers: { 'Content-Type': 'multipart/form-data' },
            });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const ready = Number(amount) > 0 && proofFile && (!needsBank || bankAccountId);
    const overage = Number(amount) + Number(premium) > remaining;

    return (
        <Shell title="Record Payment" onClose={onClose}>
            {err && <Err>{err}</Err>}
            <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: '0.85rem' }}>
                <div>Remaining: <strong>PKR {fmtN(remaining)}</strong></div>
            </div>
            <Field label="Payment Path">
                <div style={{ display: 'flex', gap: 6 }}>
                    {['Direct', 'PayOrder'].map(p => (
                        <button key={p} type="button" onClick={() => setPath(p)}
                            style={{ flex: 1, padding: 8, border: '2px solid ' + (path === p ? '#1e40af' : '#cbd5e1'), background: path === p ? '#dbeafe' : 'white', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                            {p === 'Direct' ? 'Direct to us' : 'Pay Order → Master'}
                        </button>
                    ))}
                </div>
            </Field>
            <Field label="Mode">
                <select value={mode} onChange={e => setMode(e.target.value)} style={inputStyle}>
                    {modeOptions.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
            </Field>

            {/* Bank dropdown — appears whenever the payment lands in a bank (transfer / cheque / POS / pay-order) */}
            {needsBank && (
                <Field label={mode === 'POS' ? 'POS terminal bank account *' : mode === 'Cheque' ? 'Bank account this cheque is deposited into *' : path === 'PayOrder' ? 'Bank that issued the Pay Order *' : 'Bank account receiving the transfer *'}>
                    <select value={bankAccountId} onChange={e => setBankAccountId(e.target.value)} style={inputStyle}>
                        <option value="">— Pick a bank account —</option>
                        {banks.map(b => (
                            <option key={b.GLCAID} value={b.GLCAID}>
                                {b.GLCode} — {b.GLTitle}
                            </option>
                        ))}
                    </select>
                    {banks.length === 0 && (
                        <div style={{ fontSize: '0.72rem', color: '#b45309', marginTop: 4 }}>
                            No active bank accounts. Admin must mark COA leaf accounts as banks under <strong>Accounting › Banks</strong> first.
                        </div>
                    )}
                </Field>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Amount (PKR) *" flex>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Premium portion (if any)" flex>
                    <input type="number" value={premium} onChange={e => setPremium(e.target.value)} style={inputStyle} />
                </Field>
            </div>
            {(mode === 'Cheque' || mode === 'POS' || path === 'PayOrder') && (
                <Field label={mode === 'Cheque' ? 'Cheque number' : path === 'PayOrder' ? 'Pay Order #' : 'POS transaction ref'}>
                    <input value={refField} onChange={e => setRefField(e.target.value)} style={inputStyle} />
                </Field>
            )}

            {/* MANDATORY proof-of-payment upload */}
            <Field label="Proof of payment (JPG / PNG / PDF) *">
                <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={e => setProofFile(e.target.files?.[0] || null)} style={inputStyle} />
                {proofFile && <div style={{ fontSize: '0.78rem', color: '#15803d', marginTop: 4 }}>✓ {proofFile.name} ({Math.round(proofFile.size / 1024)} KB)</div>}
            </Field>
            <Field label="Proof description (optional — auto-generated if blank)">
                <input value={proofDescription} onChange={e => setProofDescription(e.target.value)} placeholder="e.g. 'Bank deposit slip — HBL'" style={inputStyle} />
            </Field>

            {overage && <Err>Amount + premium exceeds remaining balance. Consider splitting.</Err>}
            {!proofFile && Number(amount) > 0 && <div style={{ padding: 8, background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: 6, fontSize: '0.78rem', color: '#9a3412', marginBottom: 10 }}>Upload required: a picture of the receipt / bank slip is mandatory before this payment can be saved.</div>}
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Record" busy={busy} disabled={!ready} />
        </Shell>
    );
}

function CancelModal({ booking, onClose, onSaved }) {
    const [reason, setReason] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const save = async () => {
        if (!reason.trim()) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/bookings/${booking.BookingID}/cancel`, { Reason: reason.trim() });
            onSaved();
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    return (
        <Shell title={`Cancel ${booking.BookingNo}`} onClose={onClose}>
            {err && <Err>{err}</Err>}
            <p style={{ fontSize: '0.85rem', color: '#475569' }}>
                Reason mandatory. Any pending discount approval gets withdrawn. Recorded payments are NOT auto-refunded — handle refund manually via Accounts.
            </p>
            <Field label="Reason *">
                <textarea rows={3} value={reason} onChange={e => setReason(e.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
            </Field>
            <Actions onCancel={onClose} onConfirm={save} confirmLabel="Confirm Cancel" busy={busy} disabled={!reason.trim()} />
        </Shell>
    );
}

function Block({ icon: Icon, title, children }) {
    return (
        <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--primary)', fontWeight: 600, fontSize: '0.85rem', marginBottom: 8, borderBottom: '1px solid #e2e8f0', paddingBottom: 6 }}>
                <Icon size={14} /> {title}
            </div>
            {children}
        </div>
    );
}

function Stat({ label, value, color = '#475569', sub }) {
    return (
        <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 600 }}>{label}</div>
            <div style={{ fontWeight: 700, fontSize: '1.2rem', color }}>{value}</div>
            {sub && <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>{sub}</div>}
        </div>
    );
}
