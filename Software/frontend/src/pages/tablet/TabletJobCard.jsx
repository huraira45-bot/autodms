/**
 * One job card opened on the tablet — service tablet app, Phase 4
 * (plan 2026-09-14).
 *
 * Follows the car after signing: jobs as the bay screen starts and finishes
 * them, parts as the counter issues them, every signed estimate. From here
 * the advisor adds work (the customer signs again), finalizes, and prints the
 * job card for the customer. Updates live.
 */
import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
    ChevronLeft, Loader2, Wrench, Package, PenLine, Printer, Lock, CheckCircle2, Clock, AlertTriangle, PlusCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { useServiceEvents } from '../../tablet/useServiceEvents';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, money, errText, fmtDateTime, statusStyle, pill } from '../../tablet/estimateFormat';
import WorkOrderPrint from '../WorkOrderPrint';
import MissingCustomerDetails from '../../tablet/MissingCustomerDetails';
import ServiceAuthorisation from '../../components/ServiceAuthorisation';
import QCChecksheet from '../../components/QCChecksheet';
import PaymentModeBox from '../../components/PaymentModeBox';
import CampaignBox from '../../components/CampaignBox';

const qty = (n) => String(+Number(n || 0).toFixed(2));

const REQ_TONE = {
    'Pending':          { bg: T.warnBg, fg: T.warn },
    'Partially issued': { bg: '#dbeafe', fg: '#1e40af' },
    'Issued':           { bg: T.okBg,   fg: T.ok },
    'Cancelled':        { bg: T.badBg,  fg: T.bad },
};

export default function TabletJobCard() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { hasPermission } = useAuth();
    const { confirm, error, success } = useFeedback();
    const [jc, setJc] = useState(null);
    const [loadErr, setLoadErr] = useState('');
    const [busy, setBusy] = useState('');

    const load = useCallback(async () => {
        try {
            const { data } = await axios.get(`${API}/job-cards/${id}`);
            setJc(data);
            setLoadErr('');
        } catch (err) {
            setLoadErr(errText(err));
        }
    }, [id]);

    useEffect(() => {
        load();
        const t = setInterval(load, 20000);
        return () => clearInterval(t);
    }, [load]);

    useServiceEvents(localStorage.getItem('dms_token'), {
        'jobcard:changed': (p) => { if (!p?.JobCardId || String(p.JobCardId) === String(id)) load(); },
    });

    if (loadErr && !jc) {
        return (
            <div style={S.body}>
                <div style={S.result('bad')}>{loadErr}</div>
                <Link to="/tablet/job-cards" style={{ ...S.btnGhost, textDecoration: 'none', marginTop: 14 }}><ChevronLeft size={20} /> Job cards</Link>
            </div>
        );
    }
    if (!jc) return <div style={{ ...S.body, display: 'grid', placeItems: 'center', minHeight: 300 }}><Loader2 className="animate-spin" /></div>;

    const unsigned = jc.Estimates.find(e => e.Status === 'Draft');
    const canFinalize = hasPermission('finalize') && !jc.IsFinalized;

    const addWork = async () => {
        setBusy('work');
        try {
            const { data } = await axios.post(`${API}/job-cards/${id}/additional-work`);
            navigate(`/tablet/estimates/${data.EstimateID}`);
        } catch (err) {
            error('Could not start additional work', errText(err));
            setBusy('');
        }
    };

    const finalize = async () => {
        const ok = await confirm({
            title: `Finalize ${jc.JobCardNo}?`,
            message: 'The job card is locked and posted to the accounts. Any change after this needs an unfinalize request.',
            confirmLabel: 'Finalize',
        });
        if (!ok) return;
        let skipDmsWarning = false;
        for (;;) {
            setBusy('finalize');
            try {
                await axios.post(`${API}/job-cards/${id}/finalize`, skipDmsWarning ? { skipDmsWarning: true } : {});
                setBusy('');
                success('Job card finalized', `${jc.JobCardNo} is ready to print for the customer.`);
                await load();
                return;
            } catch (err) {
                setBusy('');
                if (err.response?.status === 428 && !skipDmsWarning) {
                    const again = await confirm({
                        title: 'DMS job card number is empty',
                        message: 'Finalize without it? It can only be added later by unfinalizing the job card.',
                        confirmLabel: 'Finalize anyway',
                    });
                    if (!again) return;
                    skipDmsWarning = true;
                    continue;
                }
                error('Could not finalize', errText(err));
                load();
                return;
            }
        }
    };

    const kv = (k, v) => (
        <div style={{ display: 'flex', gap: 10, fontSize: 16, padding: '3px 0' }}>
            <span style={{ color: T.muted, minWidth: 120 }}>{k}</span><span style={{ fontWeight: 600 }}>{v || '—'}</span>
        </div>
    );

    return (
        <div style={{ ...S.body, paddingBottom: 40 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                <Link to="/tablet/job-cards" style={{ ...S.btnGhost, minHeight: 44, padding: '0 14px', textDecoration: 'none' }}>
                    <ChevronLeft size={20} /> Job cards
                </Link>
                <div style={{ fontSize: 24, fontWeight: 700 }}>{jc.JobCardNo}</div>
                <span style={{ fontSize: 20, fontWeight: 600 }}>{jc.VehicleRegNo}</span>
                {jc.IsFinalized
                    ? <span style={pill({ bg: T.okBg, fg: T.ok })}><Lock size={12} style={{ verticalAlign: -1 }} /> Finalized</span>
                    : <span style={pill({ bg: '#e2e8f0', fg: '#334155' })}>{jc.WorkshopStatus}</span>}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16 }}>
                <div style={S.card}>
                    <h2 style={S.h2}>Customer & vehicle</h2>
                    {kv('Customer', jc.CustomerName)}
                    {kv('Mobile', jc.CustomerPhone)}
                    {kv('Vehicle', [jc.VehicleRegNo, jc.VehicleModel].filter(Boolean).join(' · '))}
                    {kv('Odometer', jc.KiloMeter != null ? `${Number(jc.KiloMeter).toLocaleString('en-PK')} km` : null)}
                </div>
                <div style={S.card}>
                    <h2 style={S.h2}>Job card</h2>
                    {kv('Job number', jc.jobCode)}
                    {kv('DMS job card no', jc.DMSJobCardNo)}
                    {kv('Job type', jc.JobTypeName)}
                    {kv('Advisor', jc.ServiceAdvisor)}
                    {kv('Opened', fmtDateTime(jc.OpenedAt))}
                    {kv('Promised', jc.PromisedDate ? fmtDateTime(jc.PromisedDate) : null)}
                    {jc.IsFinalized && kv('Finalized', `${fmtDateTime(jc.FinalizedAt)}${jc.FinalizedByName ? ` by ${jc.FinalizedByName}` : ''}`)}
                </div>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}><Wrench size={20} /> Jobs</h2>
                {!jc.Labour.length && <div style={{ color: T.muted }}>No jobs.</div>}
                {jc.Labour.map(l => (
                    <div key={l.DetailId} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.line}` }}>
                        {l.State === 'done' ? <CheckCircle2 size={22} color={T.ok} />
                            : l.State === 'working' ? <Loader2 size={22} color="#2563eb" className="animate-spin" />
                                : <Clock size={22} color={T.muted} />}
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 16 }}>{l.Job}</div>
                            <div style={{ fontSize: 14, color: T.muted }}>
                                {l.BayNo || 'No bay'}
                                {l.State === 'waiting' && ' · not started'}
                                {l.State === 'working' && ` · started ${l.StartText}, ${l.Minutes} min`}
                                {l.State === 'done' && ` · done ${l.EndText} (${l.Minutes} min)`}
                                {l.PerformedByName ? ` · ${l.PerformedByName}` : ''}
                            </div>
                        </div>
                        <div style={{ fontSize: 16, fontWeight: 600 }}>{money(Number(l.Price) - Number(l.DiscAmt || 0))}</div>
                    </div>
                ))}
            </div>

            <div style={S.card}>
                <h2 style={S.h2}><Package size={20} /> Parts</h2>
                {!jc.Requisitions.length && !jc.Parts.length && <div style={{ color: T.muted }}>No parts.</div>}
                {jc.Requisitions.map(r => (
                    <div key={r.RequisitionID} style={{ padding: '8px 0', borderTop: `1px solid ${T.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <strong>{r.RequisitionNo}</strong>
                            <span style={pill(REQ_TONE[r.DisplayStatus] || REQ_TONE.Pending)}>{r.DisplayStatus}</span>
                            {r.CancelReason && <span style={{ fontSize: 14, color: T.muted }}>{r.CancelReason}</span>}
                        </div>
                        {r.Lines.map(l => (
                            <div key={l.RequisitionLineID} style={{ fontSize: 15, padding: '3px 0 3px 12px', color: l.Remaining > 0 && r.Status === 'Open' ? T.warn : T.ink }}>
                                {l.Description}: {qty(l.QtyIssued)} of {qty(l.QtyRequested)} issued
                            </div>
                        ))}
                    </div>
                ))}
                {jc.Parts.length > 0 && (
                    <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: T.muted, margin: '6px 0' }}>ON THE JOB CARD</div>
                        {jc.Parts.map(p => (
                            <div key={p.StockIssueDetailID} style={{ display: 'flex', gap: 12, fontSize: 15, padding: '4px 0' }}>
                                <span style={{ flex: 1 }}>{p.ItemName} <span style={{ color: T.muted }}>{p.PartNumber}</span></span>
                                <span>{qty(p.Quantity)} × {money(p.ItemRate)}</span>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div style={S.card}>
                <h2 style={S.h2}><PenLine size={20} /> Signed estimates</h2>
                {jc.Estimates.map(e => {
                    const st = statusStyle(e.Status);
                    return (
                        <div key={e.EstimateID} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: 220 }}>
                                <div style={{ fontSize: 16, fontWeight: 600 }}>
                                    {e.EstimateNo} {e.RevisionNo > 1 ? <span style={{ color: T.muted, fontWeight: 400 }}>· additional work</span> : null}
                                    {' '}<span style={pill(st)}>{e.Status === 'Converted' ? 'Signed' : st.label}</span>
                                </div>
                                <div style={{ fontSize: 14, color: T.muted }}>
                                    Rs {money(e.GrandTotal)}
                                    {e.SignerName ? ` · signed by ${e.SignerName}, ${fmtDateTime(e.SignedAt)}` : ''}
                                </div>
                            </div>
                            {e.Status === 'Converted' && (
                                <Link to={`/tablet/estimates/${e.EstimateID}/print`} style={{ ...S.btnGhost, minHeight: 44, textDecoration: 'none' }}>
                                    <Printer size={18} /> Print
                                </Link>
                            )}
                            {e.Status === 'Draft' && (
                                <Link to={`/tablet/estimates/${e.EstimateID}`} style={{ ...S.btn, minHeight: 44, textDecoration: 'none' }}>
                                    Continue
                                </Link>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* The signature itself and the walk-around video, alongside the
                list of estimates above (owner ask 2026-09-25). Draws nothing
                on a job card that has neither. */}
            <ServiceAuthorisation jobCardId={id} signatures={jc.Signatures || []} media={jc.Media || []}
                                  apiBase={`${API}/job-cards`} size="tablet" />

            {/* A service campaign the customer qualifies for. Campaigns attach
                to a job card rather than an estimate, so this lives here
                rather than in the estimate editor (owner ask 2026-09-26).
                It is the same component and the same endpoints the desk job
                card uses, so a campaign cannot be applied twice or differently
                depending on which screen it was done from. */}
            <div style={S.card}>
                <CampaignBox
                    type="jobcard"
                    id={id}
                    labourGross={jc.Totals?.labourNet || 0}
                    partsGross={jc.Totals?.partsNet || 0}
                    taxAmount={(jc.Totals?.labourTax || 0) + (jc.Totals?.partsTax || 0)}
                    grossAmount={(jc.Totals?.labourNet || 0) + (jc.Totals?.partsNet || 0)}
                    onChange={() => load()} />
            </div>

            {/* How the customer is paying, often only settled when they come
                back for the car (owner ask 2026-09-26). */}
            <PaymentModeBox jobCardId={id} apiBase={API} jobCard={jc} size="tablet" onChanged={load} />

            {/* The checksheet walked round the car before handing it back. */}
            <QCChecksheet jobCardId={id} apiBase={API} size="tablet" canEdit={!jc.IsFinalized} />

            <div style={S.card}>
                {[
                    ['Labour', jc.Totals.labourNet], ['PST', jc.Totals.labourTax],
                    ['Parts issued', jc.Totals.partsNet], ['GST', jc.Totals.partsTax],
                ].map(([k, v]) => (
                    <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 16, padding: '4px 0' }}><span>{k}</span><span>{money(v)}</span></div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 20, fontWeight: 700, borderTop: `2px solid ${T.ink}`, marginTop: 6, paddingTop: 6 }}>
                    <span>Job card total so far</span><span>{money(jc.Totals.total)}</span>
                </div>
            </div>

            <div style={S.card}>
                <div style={S.row}>
                    {!jc.IsFinalized && (unsigned ? (
                        <Link to={`/tablet/estimates/${unsigned.EstimateID}`} style={{ ...S.btnGhost, textDecoration: 'none' }}>
                            <PenLine size={20} /> Continue additional work ({unsigned.EstimateNo})
                        </Link>
                    ) : (
                        <button type="button" style={S.btnGhost} onClick={addWork} disabled={busy === 'work'}>
                            {busy === 'work' ? <Loader2 size={20} className="animate-spin" /> : <PlusCircle size={20} />} Add work (customer signs again)
                        </button>
                    ))}
                    <Link to={`/tablet/job-cards/${id}/print`} style={{ ...S.btnGhost, textDecoration: 'none' }}>
                        <Printer size={20} /> {jc.IsFinalized ? 'Print job card for the customer' : 'Print work order'}
                    </Link>
                    {canFinalize && (
                        <button type="button" style={S.btn} onClick={finalize}
                                disabled={busy === 'finalize' || jc.Finalize.blockers.length > 0 || jc.Finalize.customerMissing.length > 0}>
                            {busy === 'finalize' ? <Loader2 size={20} className="animate-spin" /> : <Lock size={20} />} Finalize
                        </button>
                    )}
                </div>
                {!jc.IsFinalized && jc.Finalize.blockers.map(b => (
                    <div key={b} style={{ ...S.result('bad'), marginTop: 10 }}><AlertTriangle size={16} style={{ verticalAlign: -3 }} /> {b}</div>
                ))}
                {!jc.IsFinalized && (
                    <MissingCustomerDetails customerId={jc.CustomerID} hasCNIC={!!jc.HasCNIC} hasDOB={!!jc.HasDOB} onSaved={load} />
                )}
                {jc.Finalize.dmsMissing && <DmsNumberForm jobCardId={id} jobCardNo={jc.JobCardNo} onSaved={load} />}
                {!jc.IsFinalized && jc.Finalize.warnings.map(w => (
                    <div key={w} style={{ ...S.result('warn'), marginTop: 10 }}>{w}</div>
                ))}
                {!jc.IsFinalized && !hasPermission('finalize') && (
                    <div style={{ fontSize: 14, color: T.muted, marginTop: 10 }}>Your role cannot finalize job cards; ask someone who can.</div>
                )}
            </div>
        </div>
    );
}

function DmsNumberForm({ jobCardId, jobCardNo, onSaved }) {
    const { error, success } = useFeedback();
    const [value, setValue] = useState('');
    const [busy, setBusy] = useState(false);

    const save = async () => {
        setBusy(true);
        try {
            await axios.post(`${API}/job-cards/${jobCardId}/dms-number`, { DMSJobCardNo: value.trim() });
            success('DMS job card number saved', jobCardNo);
            setValue('');
            onSaved?.();
        } catch (err) {
            error('Could not save', errText(err));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ ...S.result('warn'), marginTop: 10 }}>
            <strong>The DMS job card number is empty.</strong> Enter it now, or finalize without it.
            <div style={{ ...S.row, marginTop: 10 }}>
                <input style={{ ...S.input, flex: 1, minWidth: 200 }} value={value} maxLength={50}
                       onChange={e => setValue(e.target.value)} placeholder="DMS job card number" />
                <button type="button" style={S.btn} onClick={save} disabled={busy || !value.trim()}>
                    {busy ? <Loader2 size={20} className="animate-spin" /> : 'Save'}
                </button>
            </div>
        </div>
    );
}

/** /tablet/job-cards/:id/print — the desk Work Order print, fed through the tablet API. */
export function TabletJobCardPrint() {
    const { id } = useParams();
    const navigate = useNavigate();
    return (
        <>
            <style>{'@media print { .tjc-toolbar { display: none !important; } }'}</style>
            <div className="tjc-toolbar" style={{ display: 'flex', gap: 10, padding: '10px 16px', background: T.brand }}>
                <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => navigate(`/tablet/job-cards/${id}`)}>
                    <ChevronLeft size={20} /> Back
                </button>
                <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => window.print()}>
                    <Printer size={20} /> Print
                </button>
            </div>
            <WorkOrderPrint apiBase={`${API}/job-cards`} />
        </>
    );
}
