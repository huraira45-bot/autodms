/**
 * Intake + estimate builder — service tablet app, Phase 1 (plan 2026-09-14).
 *
 * One estimate, four steps, in the order the advisor works at the car:
 *   1. Walk-around video (and photos)
 *   2. Customer and vehicle: find, or add if new, plus odometer, job type
 *      and what the customer asked for
 *   3. Jobs from the labour catalog, and parts with live stock
 *   4. Review, print, or cancel if the customer walks away
 *
 * Every change saves itself a moment later, so a tablet that sleeps or loses
 * Wi-Fi loses nothing already saved. The tablet sends only WHICH customer,
 * vehicle and items; the server fills in descriptions, prices and tax, so the
 * totals on screen are always the server's.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    Video, Image as ImageIcon, Trash2, Loader2, Search, UserPlus, Car, Plus, Minus, X,
    ChevronLeft, ChevronRight, Printer, AlertTriangle, CheckCircle2, RefreshCw, Package, Wrench, ClipboardList, PenLine,
} from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import MissingCustomerDetails from '../../tablet/MissingCustomerDetails';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import SearchableSelect from '../../components/SearchableSelect';
import {
    API, MAX_MEDIA_BYTES, money, mb, rateLabel, errText, fmtDateTime, statusStyle, pill,
} from '../../tablet/estimateFormat';

const STEPS = ['Video', 'Customer & vehicle', 'Jobs & parts', 'Review & print'];

const CANCEL_REASONS = [
    'Customer declined the estimate',
    'Customer will come back later',
    'Price too high',
    'Created by mistake',
];

let keySeq = 0;
const newKey = () => `n${++keySeq}`;

// The desk form's own lists, word for word (JobCardForm), so an advisor sees
// the same choices at the vehicle as at the counter.
const FUEL_LEVELS = ['Empty', '1/8', '1/4', '3/8', '1/2', '5/8', '3/4', '7/8', 'Full'];
const PAYMENT_TYPES = ['Cash', 'Credit', 'POS', 'Bank Transfer'];

const fromEstimate = (e) => ({
    customer: e.EndUserID
        ? { ProfileID: e.EndUserID, CustomerName: e.CustomerName, PhoneNo: e.CustomerPhone,
            HasCNIC: !!e.CustomerHasCNIC, HasDOB: !!e.CustomerHasDOB }
        : null,
    vehicleId: e.VehicleID || null,
    KiloMeter: e.KiloMeter == null ? '' : String(Number(e.KiloMeter)),
    JobTypeId: e.JobTypeId ? String(e.JobTypeId) : '',
    CustomerRemarks: e.CustomerRemarks || '',
    // Seen at the vehicle during the walk-around; the job card has always had
    // a fuel gauge, the tablet simply had nowhere to record it.
    FuelLevel: e.FuelLevel || '',
    // Before this existed the tablet sent nothing and every job card it opened
    // was written as Cash, so credit work posted to the wrong ledger.
    PaymentType: e.PaymentType || 'Cash',
    PartyID: e.PartyID ? String(e.PartyID) : '',
    PaymentCO: e.PaymentCO || '',
    PaymentBankID: e.PaymentBankID ? String(e.PaymentBankID) : '',
    lines: (e.Lines || []).map(l => ({
        key: `s${l.LineID}`, LineType: l.LineType, ItemID: l.ItemID, Description: l.Description,
        PartNumber: l.PartNumber, Quantity: Number(l.Quantity), Rate: Number(l.Rate),
        OnHand: l.OnHand == null ? null : Number(l.OnHand),
    })),
});

const toPayload = (d) => ({
    EndUserID: d.customer?.ProfileID || null,
    VehicleID: d.vehicleId || null,
    KiloMeter: d.KiloMeter === '' ? null : Number(d.KiloMeter),
    JobTypeId: d.JobTypeId ? Number(d.JobTypeId) : null,
    CustomerRemarks: d.CustomerRemarks || null,
    FuelLevel: d.FuelLevel || null,
    PaymentType: d.PaymentType || 'Cash',
    // The server drops whatever does not belong to the chosen mode; sending it
    // anyway keeps a half-typed party from vanishing while the advisor is still
    // deciding.
    PartyID: d.PartyID ? Number(d.PartyID) : null,
    PaymentCO: d.PaymentCO || null,
    PaymentBankID: d.PaymentBankID ? Number(d.PaymentBankID) : null,
    Lines: d.lines.map(l => ({ LineType: l.LineType, ItemID: l.ItemID, Quantity: Number(l.Quantity) })),
});

const firstStep = (e) => {
    if (e.Status !== 'Draft') return 3;
    if (!e.EndUserID && !(e.Media || []).length) return 0;
    if (!e.EndUserID || !e.VehicleID) return 1;
    return 2;
};

export default function TabletEstimateEditor() {
    const { id } = useParams();
    const [est, setEst] = useState(null);
    const [loadError, setLoadError] = useState('');
    const [draft, setDraft] = useState(null);
    const [step, setStep] = useState(0);
    const [saveState, setSaveState] = useState('saved');   // saved | dirty | saving | error | invalid | locked
    const [saveError, setSaveError] = useState('');

    const draftRef = useRef(null);
    const version = useRef(0);
    const savedVersion = useRef(0);
    const inFlight = useRef(null);

    const load = useCallback(async (pickStep) => {
        try {
            const { data } = await axios.get(`${API}/estimates/${id}`);
            const d = fromEstimate(data);
            draftRef.current = d;
            version.current = 0;
            savedVersion.current = 0;
            setEst(data);
            setDraft(d);
            setSaveState('saved');
            setSaveError('');
            setLoadError('');
            if (pickStep) setStep(firstStep(data));
        } catch (err) {
            setLoadError(errText(err));
        }
    }, [id]);

    useEffect(() => { load(true); }, [load]);

    // Saves until the server holds the latest draft. A second call while a
    // save is running joins it; the loop picks up any change made meanwhile.
    const save = useCallback(() => {
        if (inFlight.current) return inFlight.current;
        const run = async () => {
            while (version.current !== savedVersion.current) {
                if (draftRef.current.lines.some(l => !(Number(l.Quantity) > 0))) {
                    setSaveState('invalid');
                    setSaveError('Enter a quantity for every part.');
                    return false;
                }
                const v = version.current;
                setSaveState('saving');
                try {
                    const { data } = await axios.put(`${API}/estimates/${id}`, toPayload(draftRef.current));
                    savedVersion.current = v;
                    setEst(data);
                    setSaveError('');
                } catch (err) {
                    setSaveState(err.response?.status === 423 ? 'locked' : 'error');
                    setSaveError(errText(err));
                    return false;
                }
            }
            setSaveState('saved');
            return true;
        };
        inFlight.current = run().finally(() => { inFlight.current = null; });
        return inFlight.current;
    }, [id]);

    const change = useCallback((fn) => {
        const next = fn(draftRef.current);
        if (next === draftRef.current) return;
        draftRef.current = next;
        version.current += 1;
        setDraft(next);
        setSaveState('dirty');
    }, []);

    useEffect(() => {
        if (saveState !== 'dirty') return undefined;
        const t = setTimeout(save, 800);
        return () => clearTimeout(t);
    }, [draft, saveState, save]);

    // Leaving the screen mid-edit still saves the last change.
    useEffect(() => () => {
        if (version.current !== savedVersion.current) save();
    }, [save]);

    const flush = useCallback(async () => {
        if (version.current === savedVersion.current && !inFlight.current) return true;
        return (await save()) && version.current === savedVersion.current;
    }, [save]);

    const editable = est?.Status === 'Draft';

    const goStep = async (n) => {
        if (n === 3 && editable && !(await flush())) return;
        setStep(n);
        window.scrollTo(0, 0);
    };

    if (loadError) {
        return (
            <div style={S.body}>
                <div style={S.result('bad')}>{loadError}</div>
                <Link to="/tablet/estimates" style={{ ...S.btnGhost, textDecoration: 'none', marginTop: 14 }}>
                    <ChevronLeft size={20} /> Estimates
                </Link>
            </div>
        );
    }
    if (!est || !draft) {
        return <div style={{ ...S.body, display: 'grid', placeItems: 'center', minHeight: 300 }}><Loader2 className="animate-spin" /></div>;
    }

    const st = statusStyle(est.Status);
    const done = [
        (est.Media || []).length > 0,
        !!(draft.customer && draft.vehicleId),
        draft.lines.length > 0,
        false,
    ];

    return (
        <div style={{ ...S.body, paddingBottom: 110 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <Link to="/tablet/estimates" style={{ ...S.btnGhost, minHeight: 44, padding: '0 14px', textDecoration: 'none' }}>
                    <ChevronLeft size={20} /> Estimates
                </Link>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{est.EstimateNo}</div>
                <span style={pill(st)}>{st.label}</span>
                {est.JobCardID && est.Status === 'Draft' && (
                    <span style={{ fontSize: 16, color: T.muted }}>Additional work for {est.JobCardNo}</span>
                )}
                {editable && (
                    <SaveIndicator state={saveState} error={saveError} onRetry={save} onReload={() => load(false)} />
                )}
            </div>

            {est.Status === 'Converted' && (
                <div style={{ ...S.result('ok'), marginTop: 0, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                    <span style={{ flex: 1 }}>
                        Signed{est.Signature ? ` by ${est.Signature.SignerName}, ${fmtDateTime(est.Signature.SignedAt)}` : ''}.
                        {' '}Job card <strong>{est.JobCardNo}</strong>{est.BayName ? `, ${est.BayName}` : ''}.
                    </span>
                    <Link to={`/tablet/job-cards/${est.JobCardID}`} style={{ ...S.btnGhost, minHeight: 44, textDecoration: 'none' }}>
                        <ClipboardList size={18} /> Open job card
                    </Link>
                </div>
            )}
            {!editable && est.Status !== 'Converted' && (
                <div style={{ ...S.result('warn'), marginTop: 0, marginBottom: 12 }}>
                    This estimate is <strong>{st.label.toLowerCase()}</strong>
                    {est.CancelReason ? ` (${est.CancelReason})` : ''} — it can be viewed and printed but not changed.
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
                {STEPS.map((label, i) => (
                    <button key={label} type="button" onClick={() => goStep(i)}
                            style={{
                                ...S.btnGhost, minHeight: 56, padding: '6px 8px', fontSize: 15, flexDirection: 'column', gap: 2,
                                ...(step === i ? { background: T.brand, color: '#fff', borderColor: T.brand } : {}),
                            }}>
                        <span style={{ fontSize: 13, opacity: 0.85, display: 'flex', alignItems: 'center', gap: 4 }}>
                            {done[i] ? <CheckCircle2 size={14} /> : `Step ${i + 1}`}
                        </span>
                        <span style={{ lineHeight: 1.15, textAlign: 'center' }}>{label}</span>
                    </button>
                ))}
            </div>

            {step === 0 && <VideoStep est={est} setEst={setEst} editable={editable} />}
            {step === 1 && <CustomerStep draft={draft} change={change} editable={editable && !est.JobCardID} />}
            {step === 2 && <JobsStep draft={draft} change={change} editable={editable} est={est} saveState={saveState} />}
            {step === 3 && (
                <ReviewStep est={est} editable={editable} flush={flush}
                            onCancelled={(data) => { setEst(data); const d = fromEstimate(data); draftRef.current = d; setDraft(d); }} />
            )}

            <div style={{
                position: 'fixed', left: 0, right: 0, bottom: 0, background: '#fff', borderTop: `1px solid ${T.line}`,
                padding: '12px 20px', display: 'flex', gap: 12, justifyContent: 'space-between', zIndex: 20,
            }}>
                <button type="button" style={{ ...S.btnGhost, visibility: step > 0 ? 'visible' : 'hidden' }} onClick={() => goStep(step - 1)}>
                    <ChevronLeft size={20} /> Back
                </button>
                {step < STEPS.length - 1 && (
                    <button type="button" style={S.btn} onClick={() => goStep(step + 1)}>
                        {STEPS[step + 1]} <ChevronRight size={20} />
                    </button>
                )}
            </div>
        </div>
    );
}

function SaveIndicator({ state, error, onRetry, onReload }) {
    const base = { display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 15, marginLeft: 'auto' };
    if (state === 'saved') return <span style={{ ...base, color: T.ok }}><CheckCircle2 size={18} /> Saved</span>;
    if (state === 'dirty' || state === 'saving') {
        return <span style={{ ...base, color: T.muted }}><Loader2 size={18} className="animate-spin" /> Saving…</span>;
    }
    if (state === 'invalid') return <span style={{ ...base, color: T.warn }}><AlertTriangle size={18} /> {error}</span>;
    if (state === 'locked') {
        return (
            <span style={{ ...base, color: T.bad }}>
                <AlertTriangle size={18} /> {error}
                <button type="button" style={{ ...S.btnGhost, minHeight: 40, padding: '0 12px', fontSize: 14 }} onClick={onReload}>
                    <RefreshCw size={16} /> Reload
                </button>
            </span>
        );
    }
    return (
        <span style={{ ...base, color: T.bad }}>
            <AlertTriangle size={18} /> Not saved: {error}
            <button type="button" style={{ ...S.btnGhost, minHeight: 40, padding: '0 12px', fontSize: 14 }} onClick={onRetry}>
                <RefreshCw size={16} /> Retry
            </button>
        </span>
    );
}

// ---------------------------------------------------------------------------
// Step 1 — walk-around video and photos
// ---------------------------------------------------------------------------
function VideoStep({ est, setEst, editable }) {
    const { confirm, error } = useFeedback();
    const [upload, setUpload] = useState(null);   // { name, size, pct }
    const [failed, setFailed] = useState(null);   // the File that failed, for retry
    const media = est.Media || [];

    const send = async (file) => {
        if (!file) return;
        if (file.size > MAX_MEDIA_BYTES) {
            error('File too large', `This recording is ${mb(file.size)}; the limit is ${mb(MAX_MEDIA_BYTES)}. Record a shorter walk-around.`);
            return;
        }
        const fd = new FormData();
        fd.append('media', file, file.name || (String(file.type).startsWith('image/') ? 'photo.jpg' : 'walkaround.mp4'));
        setFailed(null);
        setUpload({ name: file.name, size: file.size, pct: 0 });
        try {
            const { data } = await axios.post(`${API}/estimates/${est.EstimateID}/media`, fd, {
                timeout: 0,   // a long video over Wi-Fi can take minutes
                onUploadProgress: (e) => {
                    if (e.total) setUpload(u => u && { ...u, pct: Math.round((e.loaded * 100) / e.total) });
                },
            });
            setEst(e => ({ ...e, Media: [...(e.Media || []), data] }));
        } catch (err) {
            setFailed(file);
            error('Upload failed', errText(err));
        } finally {
            setUpload(null);
        }
    };

    const pick = (e) => {
        const f = e.target.files?.[0];
        e.target.value = '';   // lets the same file be chosen again
        send(f);
    };

    const remove = async (m) => {
        const ok = await confirm({
            title: 'Delete this recording?',
            message: `${m.MediaType === 'VIDEO' ? 'Video' : 'Photo'} of ${mb(m.SizeBytes)} taken ${fmtDateTime(m.CapturedAt)} will be deleted.`,
            confirmLabel: 'Delete',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await axios.delete(`${API}/estimates/${est.EstimateID}/media/${m.MediaID}`);
            setEst(e => ({ ...e, Media: (e.Media || []).filter(x => x.MediaID !== m.MediaID) }));
        } catch (err) {
            error('Could not delete', errText(err));
        }
    };

    return (
        <div style={S.card}>
            <h2 style={S.h2}><Video size={20} /> Walk-around video</h2>
            <p style={S.p}>
                Walk slowly round the whole car before the customer leaves it: every panel, the wheels and glass,
                then the odometer and fuel gauge. It is the record of the car's condition on arrival.
            </p>

            {editable && (
                <div style={{ ...S.row, marginBottom: 14 }}>
                    <label style={{ ...S.btn, opacity: upload ? 0.6 : 1, pointerEvents: upload ? 'none' : 'auto' }}>
                        <Video size={20} /> Record video
                        <input type="file" accept="video/*" capture="environment" style={{ display: 'none' }} onChange={pick} />
                    </label>
                    <label style={{ ...S.btnGhost, opacity: upload ? 0.6 : 1, pointerEvents: upload ? 'none' : 'auto' }}>
                        <ImageIcon size={20} /> Take photo
                        <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={pick} />
                    </label>
                </div>
            )}

            {upload && (
                <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 15, marginBottom: 6 }}>
                        <Loader2 size={16} className="animate-spin" style={{ verticalAlign: -3 }} /> Uploading {mb(upload.size)} — {upload.pct}%.
                        {' '}You can carry on to the customer step while it uploads.
                    </div>
                    <div style={{ height: 14, background: T.line, borderRadius: 7, overflow: 'hidden' }}>
                        <div style={{ width: `${upload.pct}%`, height: '100%', background: T.brand, transition: 'width 0.2s' }} />
                    </div>
                </div>
            )}

            {failed && !upload && (
                <div style={{ ...S.result('bad'), display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                    <span style={{ flex: 1 }}>The last recording ({mb(failed.size)}) did not upload.</span>
                    <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => send(failed)}>
                        <RefreshCw size={18} /> Try again
                    </button>
                </div>
            )}

            {!media.length && !upload && (
                <div style={S.result('warn')}>No video recorded yet.</div>
            )}

            {media.map(m => (
                <div key={m.MediaID} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${T.line}` }}>
                    {m.MediaType === 'VIDEO' ? <Video size={24} color={T.brand} /> : <ImageIcon size={24} color={T.brand} />}
                    <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>
                            {m.MediaType === 'VIDEO' ? 'Video' : 'Photo'} · {mb(m.SizeBytes)}
                        </div>
                        <div style={{ fontSize: 14, color: T.muted }}>{fmtDateTime(m.CapturedAt)}{m.CapturedByName ? ` · ${m.CapturedByName}` : ''}</div>
                    </div>
                    <CheckCircle2 size={20} color={T.ok} />
                    {editable && (
                        <button type="button" onClick={() => remove(m)} title="Delete"
                                style={{ ...S.btnGhost, minHeight: 44, padding: '0 12px', color: T.bad }}>
                            <Trash2 size={18} />
                        </button>
                    )}
                </div>
            ))}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 2 — customer, vehicle and visit details
// ---------------------------------------------------------------------------
const EMPTY_CUSTOMER = { CustomerName: '', PhoneNo: '', CNIC: '', DOB: '', Address: '' };
const EMPTY_VEHICLE = { RegistrationNo: '', ChasisNo: '', EngineNo: '', BrandName: 'CHANGAN', VehicleModel: '', VehicleColor: '' };

function CustomerStep({ draft, change, editable }) {
    const { error, warning } = useFeedback();
    const [q, setQ] = useState('');
    const [results, setResults] = useState(null);
    const [searching, setSearching] = useState(false);
    const [newCust, setNewCust] = useState(null);
    const [custDup, setCustDup] = useState(null);
    const [vehicles, setVehicles] = useState(null);
    const [newVeh, setNewVeh] = useState(null);
    const [vehDup, setVehDup] = useState(null);
    const [jobTypes, setJobTypes] = useState([]);
    const [parties, setParties] = useState([]);
    const [banks, setBanks] = useState([]);
    const [busy, setBusy] = useState(false);
    const justPicked = useRef(false);

    const customer = draft.customer;
    const custId = customer?.ProfileID;

    useEffect(() => {
        axios.get(`${API}/lookups/job-types`).then(r => setJobTypes(r.data)).catch(() => setJobTypes([]));
        // Only needed for Credit and Bank Transfer, but fetched up front: the
        // advisor is at the vehicle and may be on a weak corner of the Wi-Fi.
        axios.get(`${API}/lookups/parties`).then(r => setParties(r.data || [])).catch(() => setParties([]));
        axios.get(`${API}/lookups/banks`).then(r => setBanks(r.data || [])).catch(() => setBanks([]));
    }, []);

    useEffect(() => {
        const term = q.trim();
        if (customer || term.length < 2) { setResults(null); setSearching(false); return undefined; }
        let live = true;
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const { data } = await axios.get(`${API}/customers`, { params: { search: term, limit: 25 } });
                if (live) setResults(data);
            } catch (err) {
                if (live) setResults({ rows: [], total: 0, error: errText(err) });
            } finally {
                if (live) setSearching(false);
            }
        }, 350);
        return () => { live = false; clearTimeout(t); };
    }, [q, customer]);

    useEffect(() => {
        if (!custId) { setVehicles(null); return undefined; }
        let live = true;
        axios.get(`${API}/customers/${custId}/vehicles`)
            .then(r => {
                if (!live) return;
                setVehicles(r.data);
                // A customer just picked with a single vehicle: that is the car.
                if (justPicked.current && r.data.length === 1) {
                    change(d => (d.vehicleId ? d : { ...d, vehicleId: r.data[0].VehicleID }));
                }
                justPicked.current = false;
            })
            .catch(err => { if (live) { setVehicles([]); error('Could not load vehicles', errText(err)); } });
        return () => { live = false; };
    }, [custId, change, error]);

    const pickCustomer = (c) => {
        justPicked.current = true;
        change(d => ({
            ...d,
            customer: {
                ProfileID: c.ProfileID, CustomerName: c.CustomerName, PhoneNo: c.PhoneNo,
                HasCNIC: c.HasCNIC !== undefined ? !!c.HasCNIC : !!String(c.CNIC || '').trim(),
                HasDOB: c.HasDOB !== undefined ? !!c.HasDOB : !!c.DOB,
            },
            vehicleId: null,
        }));
        setNewCust(null);
        setCustDup(null);
        setQ('');
    };

    const clearCustomer = () => {
        change(d => ({ ...d, customer: null, vehicleId: null }));
        setNewVeh(null);
        setVehDup(null);
    };

    const saveNewCustomer = async (force = false) => {
        if (busy) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/customers`, { ...newCust, force });
            pickCustomer({
                ProfileID: data.ProfileID, CustomerName: newCust.CustomerName.trim(), PhoneNo: newCust.PhoneNo.trim(),
                HasCNIC: !!newCust.CNIC.trim(), HasDOB: !!newCust.DOB,
            });
            setNewVeh({ ...EMPTY_VEHICLE });   // a new customer's car is never on file yet
        } catch (err) {
            const body = err.response?.data;
            if (err.response?.status === 409 && body?.existing) setCustDup(body.existing);
            else error('Could not add the customer', errText(err));
        } finally {
            setBusy(false);
        }
    };

    const saveNewVehicle = async (force = false) => {
        if (busy) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/customers/${custId}/vehicles`, { ...newVeh, force });
            setVehicles(v => [data, ...(v || [])]);
            change(d => ({ ...d, vehicleId: data.VehicleID }));
            setNewVeh(null);
            setVehDup(null);
        } catch (err) {
            const body = err.response?.data;
            if (err.response?.status === 409 && body?.existingVehicle) {
                change(d => ({ ...d, vehicleId: body.existingVehicle.VehicleID }));
                setNewVeh(null);
                warning('Already on file', 'This vehicle is already on this customer; it has been selected.');
            } else if (err.response?.status === 409 && body?.others) {
                setVehDup(body);
            } else {
                error('Could not add the vehicle', errText(err));
            }
        } finally {
            setBusy(false);
        }
    };

    const field = (obj, setObj, key, label, props = {}) => (
        <div style={{ marginBottom: 12 }}>
            <label style={S.label}>{label}</label>
            <input style={S.input} value={obj[key]} onChange={e => setObj(o => ({ ...o, [key]: e.target.value }))} {...props} />
        </div>
    );

    return (
        <fieldset disabled={!editable} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
            {/* Customer */}
            <div style={S.card}>
                <h2 style={S.h2}><UserPlus size={20} /> Customer</h2>

                {customer && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 14, borderRadius: 10, background: T.okBg, border: '1px solid #bbf7d0' }}>
                        <CheckCircle2 size={22} color={T.ok} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 18, fontWeight: 700 }}>{customer.CustomerName}</div>
                            <div style={{ fontSize: 15, color: T.muted }}>{customer.PhoneNo}</div>
                        </div>
                        {editable && <button type="button" style={S.btnGhost} onClick={clearCustomer}>Change</button>}
                    </div>
                )}
                {customer && (
                    <MissingCustomerDetails
                        customerId={customer.ProfileID} hasCNIC={customer.HasCNIC} hasDOB={customer.HasDOB}
                        title="Add these now, or the job card can't be finalized later:"
                        onSaved={(flags) => change(d => (d.customer?.ProfileID === customer.ProfileID
                            ? { ...d, customer: { ...d.customer, ...flags } }
                            : d))} />
                )}

                {!customer && !newCust && (
                    <>
                        <div style={{ position: 'relative', marginBottom: 10 }}>
                            <Search size={20} color={T.muted} style={{ position: 'absolute', left: 14, top: 17 }} />
                            <input style={{ ...S.input, paddingLeft: 44 }} value={q} onChange={e => setQ(e.target.value)} autoFocus
                                   placeholder="Mobile, name, registration, chassis or CNIC" />
                        </div>
                        {searching && <div style={{ color: T.muted, fontSize: 15 }}><Loader2 size={16} className="animate-spin" style={{ verticalAlign: -3 }} /> Searching…</div>}
                        {results?.error && <div style={S.result('bad')}>{results.error}</div>}
                        {results && !searching && !results.error && !results.rows.length && (
                            <div style={{ ...S.result('warn'), marginTop: 0 }}>No customer found for “{q.trim()}”.</div>
                        )}
                        {results?.rows?.map(c => (
                            <button key={c.ProfileID} type="button" onClick={() => pickCustomer(c)}
                                    style={{ ...S.btnGhost, width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginTop: 8, padding: '10px 16px', minHeight: 64 }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 17 }}>{c.CustomerName}</div>
                                    <div style={{ fontSize: 14, color: T.muted, fontWeight: 400 }}>
                                        {[c.PhoneNo, c.RegistrationNo, c.VehicleModel, c.CustomerCode].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                <ChevronRight size={20} color={T.muted} />
                            </button>
                        ))}
                        {results?.total > results?.rows?.length && (
                            <div style={{ fontSize: 14, color: T.muted, marginTop: 8 }}>
                                Showing {results.rows.length} of {results.total}. Type more to narrow it down.
                            </div>
                        )}
                        <button type="button" style={{ ...S.btnGhost, marginTop: 14 }}
                                onClick={() => setNewCust({ ...EMPTY_CUSTOMER, PhoneNo: /^[\d\s+-]+$/.test(q.trim()) ? q.trim() : '' })}>
                            <UserPlus size={20} /> New customer
                        </button>
                    </>
                )}

                {!customer && newCust && (
                    <>
                        {field(newCust, setNewCust, 'CustomerName', 'Name *', { autoFocus: true })}
                        {field(newCust, setNewCust, 'PhoneNo', 'Mobile *', { inputMode: 'tel' })}
                        {field(newCust, setNewCust, 'CNIC', 'CNIC', { inputMode: 'numeric', placeholder: '36302-1234567-1' })}
                        {field(newCust, setNewCust, 'DOB', 'Date of birth', { type: 'date', max: new Date().toISOString().slice(0, 10) })}
                        {field(newCust, setNewCust, 'Address', 'Address')}

                        {custDup && (
                            <div style={{ ...S.result('warn'), marginBottom: 12 }}>
                                <strong>This mobile number is already on file:</strong>
                                {custDup.map(c => (
                                    <div key={c.ProfileID} style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 8 }}>
                                        <span style={{ flex: 1 }}>{c.CustomerName} · {c.PhoneNo}</span>
                                        <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => pickCustomer(c)}>Use this customer</button>
                                    </div>
                                ))}
                                <button type="button" style={{ ...S.btnGhost, minHeight: 44, marginTop: 10 }} onClick={() => saveNewCustomer(true)}>
                                    Add as a different customer anyway
                                </button>
                            </div>
                        )}

                        <div style={S.row}>
                            <button type="button" style={S.btn} onClick={() => saveNewCustomer(false)}
                                    disabled={busy || !newCust.CustomerName.trim() || !newCust.PhoneNo.trim()}>
                                {busy ? <Loader2 size={20} className="animate-spin" /> : 'Add customer'}
                            </button>
                            <button type="button" style={S.btnGhost} onClick={() => { setNewCust(null); setCustDup(null); }}>Back to search</button>
                        </div>
                    </>
                )}
            </div>

            {/* Vehicle */}
            {customer && (
                <div style={S.card}>
                    <h2 style={S.h2}><Car size={20} /> Vehicle</h2>
                    {vehicles === null && <Loader2 className="animate-spin" />}
                    {vehicles?.map(v => {
                        const on = draft.vehicleId === v.VehicleID;
                        return (
                            <button key={v.VehicleID} type="button" onClick={() => change(d => ({ ...d, vehicleId: v.VehicleID }))}
                                    style={{
                                        ...S.btnGhost, width: '100%', justifyContent: 'flex-start', textAlign: 'left', marginBottom: 8,
                                        padding: '10px 16px', minHeight: 64,
                                        ...(on ? { borderColor: T.brand, boxShadow: `0 0 0 2px ${T.brand}` } : {}),
                                    }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 18 }}>{v.RegistrationNo || 'No registration'}</div>
                                    <div style={{ fontSize: 14, color: T.muted, fontWeight: 400 }}>
                                        {[v.BrandName, v.VehicleModel, v.VehicleColor, v.ChasisNo && `Chassis ${v.ChasisNo}`].filter(Boolean).join(' · ')}
                                    </div>
                                </div>
                                {on && <CheckCircle2 size={22} color={T.brand} />}
                            </button>
                        );
                    })}
                    {vehicles && !vehicles.length && !newVeh && (
                        <div style={{ ...S.result('warn'), marginTop: 0, marginBottom: 10 }}>No vehicle on file for this customer.</div>
                    )}

                    {!newVeh && editable && (
                        <button type="button" style={S.btnGhost} onClick={() => setNewVeh({ ...EMPTY_VEHICLE })}>
                            <Plus size={20} /> Add vehicle
                        </button>
                    )}

                    {newVeh && (
                        <div style={{ marginTop: 8 }}>
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', columnGap: 12 }}>
                                {field(newVeh, setNewVeh, 'RegistrationNo', 'Registration no', { autoCapitalize: 'characters' })}
                                {field(newVeh, setNewVeh, 'ChasisNo', 'Chassis no', { autoCapitalize: 'characters' })}
                                {field(newVeh, setNewVeh, 'EngineNo', 'Engine no', { autoCapitalize: 'characters' })}
                                {field(newVeh, setNewVeh, 'BrandName', 'Make')}
                                {field(newVeh, setNewVeh, 'VehicleModel', 'Model / variant')}
                                {field(newVeh, setNewVeh, 'VehicleColor', 'Colour')}
                            </div>

                            {vehDup && (
                                <div style={{ ...S.result('warn'), marginBottom: 12 }}>
                                    <strong>{vehDup.error}</strong> If the car has changed hands, you can still add it to this customer.
                                    <div style={{ marginTop: 10 }}>
                                        <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => saveNewVehicle(true)}>
                                            Add to this customer anyway
                                        </button>
                                    </div>
                                </div>
                            )}

                            <div style={S.row}>
                                <button type="button" style={S.btn} onClick={() => saveNewVehicle(false)}
                                        disabled={busy || (!newVeh.RegistrationNo.trim() && !newVeh.ChasisNo.trim())}>
                                    {busy ? <Loader2 size={20} className="animate-spin" /> : 'Add vehicle'}
                                </button>
                                <button type="button" style={S.btnGhost} onClick={() => { setNewVeh(null); setVehDup(null); }}>Cancel</button>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Visit */}
            <div style={S.card}>
                <h2 style={S.h2}>Visit details</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                        <label style={S.label}>Odometer (km)</label>
                        <input style={S.input} inputMode="numeric" value={draft.KiloMeter}
                               onChange={e => {
                                   const v = e.target.value.replace(/\D/g, '').slice(0, 9);
                                   change(d => ({ ...d, KiloMeter: v }));
                               }} />
                    </div>
                    <div>
                        <label style={S.label}>Job type</label>
                        <select style={S.input} value={draft.JobTypeId} onChange={e => change(d => ({ ...d, JobTypeId: e.target.value }))}>
                            <option value="">— Select —</option>
                            {jobTypes.map(j => <option key={j.JobCardTypeId} value={String(j.JobCardTypeId)}>{j.Title}</option>)}
                        </select>
                    </div>
                    {/* Read off the gauge during the walk-around, while the
                        advisor is still standing at the car (owner ask
                        2026-09-25). */}
                    <div>
                        <label style={S.label}>Fuel level</label>
                        <select style={S.input} value={draft.FuelLevel}
                                onChange={e => { const v = e.target.value; change(d => ({ ...d, FuelLevel: v })); }}>
                            <option value="">— Not recorded —</option>
                            {FUEL_LEVELS.map(l => <option key={l} value={l}>{l}</option>)}
                        </select>
                    </div>
                    {/* Until now the tablet wrote every job card as Cash, so a
                        credit customer's work posted to the wrong ledger. */}
                    <div>
                        <label style={S.label}>Payment mode</label>
                        <select style={S.input} value={draft.PaymentType}
                                onChange={e => {
                                    const v = e.target.value;
                                    change(d => ({
                                        ...d,
                                        PaymentType: v,
                                        // Clear what no longer applies, so a party picked
                                        // while drafting Credit cannot ride along on a
                                        // Cash job card and print.
                                        PartyID: v === 'Credit' ? d.PartyID : '',
                                        PaymentCO: v === 'Credit' ? d.PaymentCO : '',
                                        PaymentBankID: v === 'Bank Transfer' ? d.PaymentBankID : '',
                                    }));
                                }}>
                            {PAYMENT_TYPES.map(pt => (
                                <option key={pt} value={pt}>{pt === 'POS' ? 'POS CLEAR' : pt}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {draft.PaymentType === 'Credit' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
                                  gap: 12, marginBottom: 12 }}>
                        <div>
                            <label style={S.label}>Party charged *</label>
                            <SearchableSelect touch
                                value={draft.PartyID}
                                onChange={v => change(d => ({ ...d, PartyID: v ? String(v) : '' }))}
                                placeholder="Search parties..."
                                title="Pick the party charged"
                                options={parties.map(p => ({
                                    id: p.PartyID,
                                    label: p.PartyName,
                                    sub: p.PhoneOne || undefined,
                                }))} />
                        </div>
                        <div>
                            <label style={S.label}>C/O</label>
                            <input style={S.input} value={draft.PaymentCO}
                                   onChange={e => { const v = e.target.value; change(d => ({ ...d, PaymentCO: v })); }} />
                        </div>
                    </div>
                )}

                {draft.PaymentType === 'Bank Transfer' && (
                    <div style={{ marginBottom: 12 }}>
                        <label style={S.label}>Bank account *</label>
                        <SearchableSelect touch
                            value={draft.PaymentBankID}
                            onChange={v => change(d => ({ ...d, PaymentBankID: v ? String(v) : '' }))}
                            placeholder="Search bank accounts..."
                            title="Pick the bank account"
                            options={banks.map(b => ({ id: b.GLCAID, label: b.GLTitle, sub: b.GLCode }))} />
                        {!banks.length && (
                            <div style={{ fontSize: 13, color: '#a16207', marginTop: 4 }}>
                                No bank accounts are set up. Mark them as banks in Chart of Accounts.
                            </div>
                        )}
                    </div>
                )}
                <label style={S.label}>What the customer asked for / complaint</label>
                <textarea style={{ ...S.input, minHeight: 110, resize: 'vertical' }} value={draft.CustomerRemarks}
                          onChange={e => { const v = e.target.value; change(d => ({ ...d, CustomerRemarks: v })); }} />
            </div>
        </fieldset>
    );
}

// ---------------------------------------------------------------------------
// Step 3 — jobs and parts
// ---------------------------------------------------------------------------
function JobsStep({ draft, change, editable, est, saveState }) {
    const { warning } = useFeedback();
    const labour = draft.lines.filter(l => l.LineType === 'LABOUR');
    const parts = draft.lines.filter(l => l.LineType === 'PART');

    const addLabour = (item) => {
        if (draft.lines.some(l => l.LineType === 'LABOUR' && l.ItemID === item.ItemId)) {
            warning('Already added', item.ItenName);
            return;
        }
        change(d => ({
            ...d,
            lines: [...d.lines, {
                key: newKey(), LineType: 'LABOUR', ItemID: item.ItemId, Description: item.ItenName,
                PartNumber: null, Quantity: 1, Rate: item.ItemSalesPrice, OnHand: null,
            }],
        }));
    };

    const addPart = (item) => {
        change(d => {
            const i = d.lines.findIndex(l => l.LineType === 'PART' && l.ItemID === item.ItemId);
            if (i >= 0) {
                const lines = [...d.lines];
                lines[i] = { ...lines[i], Quantity: (Number(lines[i].Quantity) || 0) + 1 };
                return { ...d, lines };
            }
            return {
                ...d,
                lines: [...d.lines, {
                    key: newKey(), LineType: 'PART', ItemID: item.ItemId, Description: item.ItenName,
                    PartNumber: item.ManualNumber || (item.ItemNumber != null ? String(item.ItemNumber) : null),
                    Quantity: 1, Rate: item.ItemSalesPrice, OnHand: item.OnHand,
                }],
            };
        });
    };

    const setQty = (key, qty) => change(d => ({ ...d, lines: d.lines.map(l => (l.key === key ? { ...l, Quantity: qty } : l)) }));
    const removeLine = (key) => change(d => ({ ...d, lines: d.lines.filter(l => l.key !== key) }));

    const removeBtn = (key) => editable && (
        <button type="button" onClick={() => removeLine(key)} title="Remove"
                style={{ ...S.btnGhost, minHeight: 44, padding: '0 12px', color: T.bad }}>
            <Trash2 size={18} />
        </button>
    );

    return (
        <>
            <div style={S.card}>
                <h2 style={S.h2}><Wrench size={20} /> Jobs</h2>
                {editable && <CatalogPicker type="LABOUR" onAdd={addLabour} placeholder="Search the labour catalog" />}
                {!labour.length && <div style={{ color: T.muted, fontSize: 15, marginTop: 10 }}>No jobs added.</div>}
                {labour.map(l => (
                    <div key={l.key} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${T.line}` }}>
                        <div style={{ flex: 1, fontSize: 16 }}>{l.Description}</div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{money(l.Rate)}</div>
                        {removeBtn(l.key)}
                    </div>
                ))}
            </div>

            <div style={S.card}>
                <h2 style={S.h2}><Package size={20} /> Parts</h2>
                <p style={{ ...S.p, marginBottom: 10 }}>
                    Parts are only estimated here. Once the customer signs, the request goes to the parts counter, which issues them.
                </p>
                {editable && <CatalogPicker type="PART" onAdd={addPart} placeholder="Search by part number or name" />}
                {!parts.length && <div style={{ color: T.muted, fontSize: 15, marginTop: 10 }}>No parts added.</div>}
                {parts.map(l => {
                    const qty = Number(l.Quantity) || 0;
                    const short = l.OnHand != null && l.OnHand < qty;
                    return (
                        <div key={l.key} style={{ padding: '12px 0', borderTop: `1px solid ${T.line}` }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <div style={{ flex: 1, minWidth: 200 }}>
                                    <div style={{ fontSize: 16 }}>{l.Description}</div>
                                    <div style={{ fontSize: 14, color: T.muted }}>
                                        {l.PartNumber || '—'} · {money(l.Rate)} each
                                        {l.OnHand != null && (
                                            <span style={{ marginLeft: 8, fontWeight: 600, color: short ? T.warn : T.ok }}>
                                                {short ? `only ${l.OnHand} in stock` : `${l.OnHand} in stock`}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {editable ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <button type="button" style={{ ...S.btnGhost, minHeight: 44, padding: '0 12px' }}
                                                onClick={() => setQty(l.key, Math.max(1, qty - 1))} disabled={qty <= 1}>
                                            <Minus size={18} />
                                        </button>
                                        <input style={{ ...S.input, width: 80, textAlign: 'center', padding: '10px 6px' }}
                                               inputMode="decimal" value={l.Quantity}
                                               onChange={e => setQty(l.key, e.target.value.replace(/[^\d.]/g, '').slice(0, 8))}
                                               onBlur={() => { if (!(Number(l.Quantity) > 0)) setQty(l.key, 1); }} />
                                        <button type="button" style={{ ...S.btnGhost, minHeight: 44, padding: '0 12px' }}
                                                onClick={() => setQty(l.key, qty + 1)}>
                                            <Plus size={18} />
                                        </button>
                                    </div>
                                ) : <span style={{ fontSize: 16 }}>× {qty}</span>}
                                <div style={{ fontSize: 16, fontWeight: 600, minWidth: 100, textAlign: 'right' }}>{money(qty * l.Rate)}</div>
                                {removeBtn(l.key)}
                            </div>
                        </div>
                    );
                })}
            </div>

            <Totals est={est} pending={editable && saveState !== 'saved'} />
        </>
    );
}

function CatalogPicker({ type, onAdd, placeholder }) {
    const [q, setQ] = useState('');
    const [open, setOpen] = useState(false);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return undefined;
        let live = true;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await axios.get(`${API}/catalog`, { params: { type, search: q.trim() || undefined, limit: 30 } });
                if (live) setData(r.data);
            } catch (err) {
                if (live) setData({ rows: [], error: errText(err) });
            } finally {
                if (live) setLoading(false);
            }
        }, 300);
        return () => { live = false; clearTimeout(t); };
    }, [q, open, type]);

    return (
        <div style={{ marginBottom: 8 }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ position: 'relative', flex: 1 }}>
                    <Search size={20} color={T.muted} style={{ position: 'absolute', left: 14, top: 17 }} />
                    <input style={{ ...S.input, paddingLeft: 44 }} value={q} placeholder={placeholder}
                           onFocus={() => setOpen(true)} onChange={e => { setQ(e.target.value); setOpen(true); }} />
                </div>
                {open && (
                    <button type="button" style={{ ...S.btnGhost, padding: '0 14px' }} onClick={() => { setOpen(false); setQ(''); }} title="Close">
                        <X size={20} />
                    </button>
                )}
            </div>

            {open && (
                <div style={{ border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 8, maxHeight: 360, overflowY: 'auto' }}>
                    {loading && !data && <div style={{ padding: 14 }}><Loader2 className="animate-spin" /></div>}
                    {data?.error && <div style={{ ...S.result('bad'), margin: 10 }}>{data.error}</div>}
                    {data && !data.error && !data.rows.length && (
                        <div style={{ padding: 14, color: T.muted }}>Nothing found{q.trim() ? ` for “${q.trim()}”` : ''}.</div>
                    )}
                    {data?.rows?.map(item => {
                        const out = type === 'PART' && item.OnHand <= 0;
                        return (
                            <button key={item.ItemId} type="button" onClick={() => onAdd(item)}
                                    style={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px',
                                        border: 'none', borderBottom: `1px solid ${T.line}`, background: '#fff',
                                        textAlign: 'left', cursor: 'pointer', minHeight: 60, color: T.ink,
                                    }}>
                                <Plus size={20} color={T.brand} />
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: 16 }}>{item.ItenName}</div>
                                    {type === 'PART' && (
                                        <div style={{ fontSize: 14, color: T.muted }}>
                                            {item.ManualNumber || item.ItemNumber}
                                            {item.SupersededByNumber ? ` · superseded by ${item.SupersededByNumber}` : ''}
                                        </div>
                                    )}
                                </div>
                                {type === 'PART' && (
                                    <span style={{ fontSize: 14, fontWeight: 600, color: out ? T.bad : T.ok, whiteSpace: 'nowrap' }}>
                                        {out ? 'Out of stock' : `${item.OnHand} in stock`}
                                    </span>
                                )}
                                <span style={{ fontSize: 16, fontWeight: 600, minWidth: 90, textAlign: 'right' }}>{money(item.ItemSalesPrice)}</span>
                            </button>
                        );
                    })}
                    {data && !data.error && (
                        <div style={{ padding: '8px 14px', fontSize: 13, color: T.muted }}>
                            Prices before tax · {type === 'LABOUR' ? 'PST' : 'GST'} {rateLabel(data.taxRate)} is added on the estimate
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function Totals({ est, pending }) {
    const row = (label, value, strong) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 400 }}>
            <span>{label}</span><span>{money(value)}</span>
        </div>
    );
    return (
        <div style={{ ...S.card, opacity: pending ? 0.55 : 1, transition: 'opacity 0.2s' }}>
            {row('Labour', est.LabourTotal)}
            {row(`PST ${rateLabel(est.PSTRate)} on labour`, est.LabourTax)}
            {row('Parts', est.PartsTotal)}
            {row(`GST ${rateLabel(est.GSTRate)} on parts`, est.PartsTax)}
            <div style={{ borderTop: `2px solid ${T.ink}`, marginTop: 6 }} />
            {row('Estimated total', est.GrandTotal, true)}
            {pending && <div style={{ fontSize: 13, color: T.muted }}>Updating…</div>}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Step 4 — review, print, cancel
// ---------------------------------------------------------------------------
function ReviewStep({ est, editable, flush, onCancelled }) {
    const navigate = useNavigate();
    const { confirm, error, success } = useFeedback();
    const [reason, setReason] = useState(CANCEL_REASONS[0]);
    const [busy, setBusy] = useState(false);

    const lines = est.Lines || [];
    const labour = lines.filter(l => l.LineType === 'LABOUR');
    const parts = lines.filter(l => l.LineType === 'PART');
    const missing = [];
    if (!est.EndUserID) missing.push('the customer');
    if (!est.VehicleID) missing.push('the vehicle');
    if (!lines.length) missing.push('at least one job or part');
    const signMissing = [...missing];
    if (!est.JobCardID && !est.JobTypeId) signMissing.push('the job type');
    const hasVideo = (est.Media || []).some(m => m.MediaType === 'VIDEO');

    const print = async () => {
        if (editable && !(await flush())) return;
        navigate(`/tablet/estimates/${est.EstimateID}/print`);
    };

    const sign = async () => {
        if (!(await flush())) return;
        navigate(`/tablet/estimates/${est.EstimateID}/sign`);
    };

    const cancel = async () => {
        const ok = await confirm({
            title: `Cancel ${est.EstimateNo}?`,
            message: `The estimate will be closed as “${reason}”. It stays on record but can no longer be changed.`,
            confirmLabel: 'Cancel estimate',
            cancelLabel: 'Keep it',
            tone: 'danger',
        });
        if (!ok) return;
        setBusy(true);
        try {
            await flush();
            const { data } = await axios.post(`${API}/estimates/${est.EstimateID}/cancel`, { Reason: reason });
            onCancelled(data);
            success('Estimate cancelled', est.EstimateNo);
        } catch (err) {
            error('Could not cancel', errText(err));
        } finally {
            setBusy(false);
        }
    };

    const kv = (k, v) => (
        <div style={{ display: 'flex', gap: 10, fontSize: 16, padding: '3px 0' }}>
            <span style={{ color: T.muted, minWidth: 110 }}>{k}</span><span style={{ fontWeight: 600 }}>{v || '—'}</span>
        </div>
    );

    return (
        <>
            {!hasVideo && <div style={{ ...S.result('warn'), marginTop: 0, marginBottom: 12 }}>No walk-around video has been recorded.</div>}
            {missing.length > 0 && (
                <div style={{ ...S.result('bad'), marginTop: 0, marginBottom: 12 }}>Still needed before printing: {missing.join(', ')}.</div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div style={S.card}>
                    <h2 style={S.h2}>Customer</h2>
                    {kv('Name', est.CustomerName)}
                    {kv('Mobile', est.CustomerPhone)}
                    {kv('CNIC', est.CustomerCNIC)}
                </div>
                <div style={S.card}>
                    <h2 style={S.h2}>Vehicle</h2>
                    {kv('Registration', est.VehicleRegNo)}
                    {kv('Model', est.VehicleModel)}
                    {kv('Chassis', est.ChasisNo)}
                    {kv('Odometer', est.KiloMeter != null ? `${Number(est.KiloMeter).toLocaleString('en-PK')} km` : null)}
                    {kv('Job type', est.JobTypeName)}
                </div>
            </div>

            {est.CustomerRemarks && (
                <div style={S.card}>
                    <h2 style={S.h2}>Customer request</h2>
                    <div style={{ fontSize: 16, whiteSpace: 'pre-wrap' }}>{est.CustomerRemarks}</div>
                </div>
            )}

            <div style={S.card}>
                <h2 style={S.h2}><Wrench size={20} /> Jobs</h2>
                {!labour.length && <div style={{ color: T.muted }}>None</div>}
                {labour.map(l => (
                    <div key={l.LineID} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: `1px solid ${T.line}`, fontSize: 16 }}>
                        <span style={{ flex: 1 }}>{l.Description}</span>
                        <span>{money(l.Rate)}</span>
                    </div>
                ))}
                <h2 style={{ ...S.h2, marginTop: 18 }}><Package size={20} /> Parts</h2>
                {!parts.length && <div style={{ color: T.muted }}>None</div>}
                {parts.map(l => (
                    <div key={l.LineID} style={{ display: 'flex', gap: 12, padding: '8px 0', borderTop: `1px solid ${T.line}`, fontSize: 16 }}>
                        <span style={{ flex: 1 }}>{l.Description} <span style={{ color: T.muted }}>{l.PartNumber}</span></span>
                        <span>{Number(l.Quantity)} × {money(l.Rate)}</span>
                        <span style={{ minWidth: 100, textAlign: 'right' }}>{money(Number(l.Quantity) * Number(l.Rate))}</span>
                    </div>
                ))}
            </div>

            <Totals est={est} pending={false} />

            <div style={S.card}>
                <div style={S.row}>
                    <button type="button" style={S.btnGhost} onClick={print} disabled={missing.length > 0}>
                        <Printer size={20} /> Print estimate
                    </button>
                    {editable && (
                        <button type="button" style={S.btn} onClick={sign} disabled={signMissing.length > 0}>
                            <PenLine size={20} /> {est.JobCardID ? 'Customer signs for the additional work' : 'Customer signature'}
                        </button>
                    )}
                </div>
                {editable && signMissing.length > missing.length && (
                    <div style={{ fontSize: 14, color: T.warn, marginTop: 10 }}>Pick the job type in step 2 before the customer signs.</div>
                )}
            </div>

            {editable && (
                <div style={{ ...S.card, borderColor: '#fecaca' }}>
                    <h2 style={{ ...S.h2, color: T.bad }}>Customer not going ahead?</h2>
                    <div style={S.row}>
                        <select style={{ ...S.input, width: 'auto', flex: 1, minWidth: 240 }} value={reason} onChange={e => setReason(e.target.value)}>
                            {CANCEL_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <button type="button" style={{ ...S.btnGhost, color: T.bad, borderColor: '#fecaca' }} onClick={cancel} disabled={busy}>
                            {busy ? <Loader2 size={20} className="animate-spin" /> : 'Cancel estimate'}
                        </button>
                    </div>
                </div>
            )}
        </>
    );
}
