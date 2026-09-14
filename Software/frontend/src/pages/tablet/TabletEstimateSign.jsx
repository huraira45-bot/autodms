/**
 * Customer signature — service tablet app, Phase 2 (plan 2026-09-14).
 *
 * The customer reads exactly what they are authorising and signs. The
 * advisor picks the bay (and, for a new visit, enters the job number, as on
 * the desk form). One tap then opens the job card — or, for additional work,
 * adds it to the existing job card — and sends the parts to the parts counter.
 *
 * The server refuses the signature if the estimate changed after this screen
 * loaded it, so a customer can never sign for something other than what they
 * were shown.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useParams } from 'react-router-dom';
import { ChevronLeft, Loader2, Eraser, PenLine, CheckCircle2, Printer, ClipboardList, Home, Wrench, Package } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';
import SignaturePad from '../../tablet/SignaturePad';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, money, rateLabel, errText } from '../../tablet/estimateFormat';

const resavePayload = (e) => ({
    EndUserID: e.EndUserID,
    VehicleID: e.VehicleID,
    KiloMeter: e.KiloMeter,
    JobTypeId: e.JobTypeId,
    CustomerRemarks: e.CustomerRemarks,
    Lines: (e.Lines || []).map(l => ({ LineType: l.LineType, ItemID: l.ItemID, Quantity: Number(l.Quantity) })),
});

export default function TabletEstimateSign() {
    const { id } = useParams();
    const { confirm, error, warning } = useFeedback();
    const padRef = useRef(null);
    const [est, setEst] = useState(null);
    const [loadErr, setLoadErr] = useState('');
    const [bays, setBays] = useState([]);
    const [hasInk, setHasInk] = useState(false);
    const [form, setForm] = useState({ SignerName: '', SignerMobile: '', BayID: '', JobCode: '', PromisedDate: '' });
    const [busy, setBusy] = useState(false);
    const [done, setDone] = useState(null);

    const load = useCallback(async () => {
        const [e, b] = await Promise.all([
            axios.get(`${API}/estimates/${id}`),
            axios.get(`${API}/lookups/bays`),
        ]);
        setEst(e.data);
        setBays(b.data);
        setForm(f => ({
            ...f,
            SignerName: f.SignerName || e.data.CustomerName || '',
            SignerMobile: f.SignerMobile || e.data.CustomerPhone || '',
            BayID: f.BayID || (e.data.BayID ? String(e.data.BayID) : ''),
        }));
    }, [id]);

    useEffect(() => { load().catch(err => setLoadErr(errText(err))); }, [load]);

    const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

    if (loadErr) return <div style={S.body}><div style={S.result('bad')}>{loadErr}</div></div>;
    if (!est) return <div style={{ ...S.body, display: 'grid', placeItems: 'center', minHeight: 300 }}><Loader2 className="animate-spin" /></div>;

    const isRevision = !!est.JobCardID && est.Status === 'Draft';
    const lines = est.Lines || [];
    const labour = lines.filter(l => l.LineType === 'LABOUR');
    const parts = lines.filter(l => l.LineType === 'PART');

    if (done) {
        return (
            <div style={S.body}>
                <div style={{ ...S.card, textAlign: 'center', padding: 32 }}>
                    <CheckCircle2 size={56} color={T.ok} />
                    <h1 style={{ ...S.h1, marginTop: 12 }}>
                        {done.isRevision ? `Work added to ${done.JobCardNo}` : `Job card ${done.JobCardNo} opened`}
                    </h1>
                    <p style={{ ...S.p, fontSize: 17 }}>
                        Signed by {done.estimate?.Signature?.SignerName}. Jobs sent to {done.BayName}.
                        {done.RequisitionNo
                            ? <><br />Parts request <strong>{done.RequisitionNo}</strong> sent to the parts counter.</>
                            : <><br />No parts on this estimate.</>}
                    </p>
                    <div style={{ ...S.row, justifyContent: 'center', marginTop: 18 }}>
                        <Link to={`/tablet/estimates/${id}/print`} style={{ ...S.btnGhost, textDecoration: 'none' }}>
                            <Printer size={20} /> Print signed estimate
                        </Link>
                        <Link to={`/tablet/job-cards/${done.JobCardId}`} style={{ ...S.btn, textDecoration: 'none' }}>
                            <ClipboardList size={20} /> Open job card
                        </Link>
                        <Link to="/tablet" style={{ ...S.btnGhost, textDecoration: 'none' }}>
                            <Home size={20} /> Home
                        </Link>
                    </div>
                </div>
            </div>
        );
    }

    if (est.Status !== 'Draft') {
        return (
            <div style={S.body}>
                <div style={S.result('warn')}>
                    {est.EstimateNo} is already {est.Status === 'Converted' ? 'signed' : est.Status.toLowerCase()}.
                </div>
                <div style={{ ...S.row, marginTop: 14 }}>
                    <Link to={`/tablet/estimates/${id}`} style={{ ...S.btnGhost, textDecoration: 'none' }}><ChevronLeft size={20} /> Estimate</Link>
                    {est.JobCardID && (
                        <Link to={`/tablet/job-cards/${est.JobCardID}`} style={{ ...S.btn, textDecoration: 'none' }}>
                            <ClipboardList size={20} /> Job card
                        </Link>
                    )}
                </div>
            </div>
        );
    }

    const submit = async () => {
        if (!form.SignerName.trim()) { warning('Name needed', 'Enter the name of the person signing.'); return; }
        if (!hasInk || padRef.current?.isEmpty()) { warning('Signature needed', 'Ask the customer to sign in the box.'); return; }
        if (!form.BayID) { warning('Bay needed', 'Pick the bay where the car will be worked on.'); return; }
        if (!isRevision && !form.JobCode.trim()) { warning('Job number needed', 'Enter the job number, as on the desk job card form.'); return; }

        const bayName = bays.find(b => String(b.BayID) === String(form.BayID))?.BayName;
        const ok = await confirm({
            title: isRevision ? `Add this work to ${est.JobCardNo}?` : 'Open the job card?',
            message: `${est.EstimateNo} for Rs ${money(est.GrandTotal)}, signed by ${form.SignerName.trim()}. `
                   + `Jobs go to ${bayName}${parts.length ? ' and the parts request goes to the parts counter' : ''}.`,
            confirmLabel: isRevision ? 'Add work' : 'Open job card',
        });
        if (!ok) return;

        setBusy(true);
        try {
            const blob = await padRef.current.toBlob();
            const fd = new FormData();
            fd.append('signature', blob, 'signature.png');
            fd.append('ContentHash', est.ContentHash);
            for (const [k, v] of Object.entries(form)) fd.append(k, String(v ?? '').trim());
            const { data } = await axios.post(`${API}/estimates/${id}/sign`, fd, { timeout: 60000 });
            setDone(data);
            window.scrollTo(0, 0);
        } catch (err) {
            const body = err.response?.data;
            if (err.response?.status === 409 && body?.code === 'rates_changed') {
                try {
                    await axios.put(`${API}/estimates/${id}`, resavePayload(est));
                    await load();
                    padRef.current?.clear();
                    warning('Tax rate changed', 'The totals were recalculated at today\'s rate. Show the customer the new total and ask them to sign again.');
                } catch (e2) {
                    error('Could not recalculate', errText(e2));
                }
            } else if (err.response?.status === 409) {
                await load().catch(() => {});
                padRef.current?.clear();
                warning('Estimate changed', body?.error || 'Show the customer the updated estimate and ask them to sign again.');
            } else {
                error('Could not sign', errText(err));
            }
        } finally {
            setBusy(false);
        }
    };

    const row = (label, value, strong) => (
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: strong ? 20 : 16, fontWeight: strong ? 700 : 400 }}>
            <span>{label}</span><span>{money(value)}</span>
        </div>
    );

    return (
        <div style={{ ...S.body, paddingBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <Link to={`/tablet/estimates/${id}`} style={{ ...S.btnGhost, minHeight: 44, padding: '0 14px', textDecoration: 'none' }}>
                    <ChevronLeft size={20} /> Estimate
                </Link>
                <div style={{ fontSize: 22, fontWeight: 700 }}>
                    {isRevision ? `Additional work for ${est.JobCardNo}` : 'Customer signature'}
                </div>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>{est.EstimateNo} · {est.CustomerName}</h2>
                <p style={{ ...S.p, marginBottom: 14 }}>{[est.VehicleRegNo, est.VehicleModel].filter(Boolean).join(' · ')}</p>

                {labour.length > 0 && <div style={{ fontWeight: 700, margin: '6px 0' }}><Wrench size={16} style={{ verticalAlign: -2 }} /> Jobs</div>}
                {labour.map(l => (
                    <div key={l.LineID} style={{ display: 'flex', gap: 12, padding: '6px 0', borderTop: `1px solid ${T.line}`, fontSize: 16 }}>
                        <span style={{ flex: 1 }}>{l.Description}</span><span>{money(l.Rate)}</span>
                    </div>
                ))}
                {parts.length > 0 && <div style={{ fontWeight: 700, margin: '12px 0 6px' }}><Package size={16} style={{ verticalAlign: -2 }} /> Parts</div>}
                {parts.map(l => (
                    <div key={l.LineID} style={{ display: 'flex', gap: 12, padding: '6px 0', borderTop: `1px solid ${T.line}`, fontSize: 16 }}>
                        <span style={{ flex: 1 }}>{l.Description}</span>
                        <span>{Number(l.Quantity)} × {money(l.Rate)}</span>
                    </div>
                ))}

                <div style={{ borderTop: `2px solid ${T.ink}`, marginTop: 10, paddingTop: 6 }}>
                    {row('Labour', est.LabourTotal)}
                    {row(`PST ${rateLabel(est.PSTRate)}`, est.LabourTax)}
                    {row('Parts', est.PartsTotal)}
                    {row(`GST ${rateLabel(est.GSTRate)}`, est.PartsTax)}
                    {row('Estimated total (Rs)', est.GrandTotal, true)}
                </div>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}><PenLine size={20} /> Customer authorisation</h2>
                <p style={{ ...S.p, color: T.ink, fontSize: 17 }}>
                    I authorise the workshop to carry out the {isRevision ? 'additional ' : ''}work above for an estimated
                    total of <strong>Rs {money(est.GrandTotal)}</strong>. Any further work will be done only after my approval.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 12 }}>
                    <div>
                        <label style={S.label}>Name of person signing *</label>
                        <input style={S.input} value={form.SignerName} onChange={set('SignerName')} />
                    </div>
                    <div>
                        <label style={S.label}>Mobile</label>
                        <input style={S.input} value={form.SignerMobile} onChange={set('SignerMobile')} inputMode="tel" />
                    </div>
                </div>
                <SignaturePad ref={padRef} height={230} onChange={setHasInk} />
                <button type="button" style={{ ...S.btnGhost, marginTop: 10, minHeight: 44 }} onClick={() => padRef.current?.clear()}>
                    <Eraser size={18} /> Clear signature
                </button>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>For the advisor</h2>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
                    <div>
                        <label style={S.label}>Bay *</label>
                        <select style={S.input} value={form.BayID} onChange={set('BayID')}>
                            <option value="">— Select bay —</option>
                            {bays.map(b => <option key={b.BayID} value={String(b.BayID)}>{b.BayName}</option>)}
                        </select>
                        {!bays.length && <div style={{ fontSize: 13, color: T.bad, marginTop: 4 }}>No active bays. Add them in Workshop Settings.</div>}
                    </div>
                    {!isRevision && (
                        <div>
                            <label style={S.label}>Job number *</label>
                            <input style={S.input} value={form.JobCode} onChange={set('JobCode')} placeholder="As on the desk form" />
                        </div>
                    )}
                    {!isRevision && (
                        <div>
                            <label style={S.label}>Promised delivery</label>
                            <input style={S.input} type="datetime-local" value={form.PromisedDate} onChange={set('PromisedDate')} />
                        </div>
                    )}
                </div>
            </div>

            <button type="button" style={{ ...S.btn, width: '100%', minHeight: 64, fontSize: 19 }} onClick={submit} disabled={busy}>
                {busy ? <Loader2 size={24} className="animate-spin" />
                      : <><CheckCircle2 size={22} /> {isRevision ? 'Sign and add work to job card' : 'Sign and open job card'}</>}
            </button>
        </div>
    );
}
