/**
 * Estimate print — service tablet app, Phase 1 (plan 2026-09-14).
 * A4 portrait: letterhead, customer and vehicle, jobs with PST, parts with
 * GST, totals and signature lines.
 *
 * Works from a browser today. Whether the Android app prints it directly or
 * hands it to Chrome depends on the Phase 0 print test on the real tablet.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, Printer, Loader2 } from 'lucide-react';
import { businessHeaderHtml } from '../../utils/businessProfile';
import { isNativeApp, serverPageUrl } from '../../tablet/serverConfig';
import { tStyles as S } from '../../tablet/tabletStyles';
import { API, money, rateLabel, errText, fmtDate, fmtDateTime } from '../../tablet/estimateFormat';

const CSS = `
.est-page { background: #e2e8f0; min-height: 100vh; }
.est-toolbar { position: sticky; top: 0; z-index: 5; display: flex; gap: 10px; align-items: center; padding: 12px 16px; background: #714b67; color: #fff; }
.est-sheet { background: #fff; color: #000; width: 210mm; min-height: 297mm; margin: 16px auto; padding: 12mm; box-sizing: border-box;
             font-family: 'Inter', Arial, sans-serif; font-size: 9.5pt; line-height: 1.35; position: relative; box-shadow: 0 2px 12px rgba(0,0,0,.15); }
.est-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 6pt; margin-top: 6pt; }
.est-box { border: 1px solid #94a3b8; border-radius: 3pt; padding: 5pt 7pt; }
.est-box h4, .est-sec { margin: 0 0 3pt; font-size: 7.5pt; letter-spacing: .5pt; text-transform: uppercase; color: #475569; }
.est-sec { margin-top: 9pt; }
.est-kv { display: grid; grid-template-columns: 24mm 1fr; row-gap: 1pt; }
.est-kv span:nth-child(odd) { color: #475569; }
.est-table { width: 100%; border-collapse: collapse; }
.est-table th, .est-table td { border: 1px solid #94a3b8; padding: 2.5pt 4pt; vertical-align: top; }
.est-table th { background: #f1f5f9; font-size: 8pt; text-align: left; }
.est-num { text-align: right; white-space: nowrap; }
.est-totals { width: 78mm; margin: 8pt 0 0 auto; border-collapse: collapse; }
.est-totals td { padding: 2pt 4pt; }
.est-totals tr.grand td { border-top: 1.5px solid #000; font-size: 11pt; font-weight: 700; padding-top: 4pt; }
.est-note { margin-top: 10pt; font-size: 8pt; color: #334155; border-top: 1px dashed #94a3b8; padding-top: 5pt; }
.est-auth { margin-top: 10pt; font-size: 9pt; color: #0f172a; line-height: 1.45;
            border: 1pt solid #0f172a; padding: 6pt 8pt; }
.est-sign { display: grid; grid-template-columns: 1fr 1fr; gap: 24mm; margin-top: 20mm; }
.est-sign div { border-top: 1px solid #000; padding-top: 3pt; text-align: center; font-size: 8.5pt; }
.est-void { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 64pt; font-weight: 800;
            color: rgba(185, 28, 28, .16); transform: rotate(-24deg); pointer-events: none; }
@media screen and (max-width: 840px) { .est-sheet { width: auto; min-height: 0; margin: 12px; } }
@media print {
  @page { size: A4 portrait; margin: 0; }
  .est-toolbar { display: none !important; }
  .est-page { background: #fff; }
  .est-sheet { margin: 0; box-shadow: none; width: 210mm; min-height: 0; }
}
`;

export default function TabletEstimatePrint() {
    const { id } = useParams();
    const navigate = useNavigate();
    const [data, setData] = useState(null);
    const [err, setErr] = useState('');
    const [sigUrl, setSigUrl] = useState(null);

    useEffect(() => {
        axios.get(`${API}/estimates/${id}/print-data`)
            .then(r => setData(r.data))
            .catch(e => setErr(errText(e)));
    }, [id]);

    // The signature image needs the login, so it is fetched with the session
    // and shown from memory rather than linked by URL.
    const signed = !!data?.estimate?.Signature;
    useEffect(() => {
        if (!signed) return undefined;
        let url = null;
        axios.get(`${API}/estimates/${id}/signature`, { responseType: 'blob' })
            .then(r => { url = URL.createObjectURL(r.data); setSigUrl(url); })
            .catch(() => setSigUrl(null));
        return () => { if (url) URL.revokeObjectURL(url); };
    }, [id, signed]);

    // The document title becomes the default file name when saving as PDF.
    useEffect(() => {
        if (!data?.estimate) return undefined;
        const prev = document.title;
        document.title = data.estimate.EstimateNo;
        return () => { document.title = prev; };
    }, [data]);

    const toolbar = (
        <div className="est-toolbar">
            <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => navigate(`/tablet/estimates/${id}`)}>
                <ChevronLeft size={20} /> Back
            </button>
            <button type="button" style={{ ...S.btnGhost, minHeight: 44 }} onClick={() => window.print()} disabled={!data}>
                <Printer size={20} /> Print
            </button>
            {isNativeApp() && (
                <span style={{ fontSize: 14, opacity: 0.9 }}>
                    If no print window opens, this tablet cannot print from inside the app yet (see Tablet tests).
                </span>
            )}
        </div>
    );

    if (err) {
        return <div className="est-page"><style>{CSS}</style>{toolbar}<div style={{ ...S.result('bad'), margin: 16 }}>{err}</div></div>;
    }
    if (!data) {
        return <div className="est-page"><style>{CSS}</style>{toolbar}<div style={{ padding: 40, textAlign: 'center' }}><Loader2 className="animate-spin" /></div></div>;
    }

    const e = data.estimate;
    const lines = e.Lines || [];
    const labour = lines.filter(l => l.LineType === 'LABOUR');
    const parts = lines.filter(l => l.LineType === 'PART');

    const header = businessHeaderHtml(data.business, {
        // Once the customer has signed, this paper is no longer a quotation —
        // it is what they authorised, and the heading has to say so (owner ask
        // 2026-09-25). Unsigned, it stays an estimate.
        docTitle: signed ? 'Service Estimate — Authorised' : 'Service Estimate',
        docSubtitle: e.EstimateNo + (e.RevisionNo > 1 ? ` · Revision ${e.RevisionNo}` : '') + (e.JobCardNo ? ` · Job card ${e.JobCardNo}` : ''),
        docMetaLeft: `Date: ${fmtDate(e.UpdatedAt || e.CreatedAt)}`,
        docMetaRight: e.AdvisorName ? `Service advisor: ${e.AdvisorName}` : '',
        logoBase: isNativeApp() ? serverPageUrl('/uploads/') : '/uploads/',
    });

    return (
        <div className="est-page">
            <style>{CSS}</style>
            {toolbar}
            <div className="est-sheet">
                {e.Status === 'Cancelled' && <div className="est-void">CANCELLED</div>}

                {/* businessHeaderHtml escapes every value it inserts. */}
                <div dangerouslySetInnerHTML={{ __html: header }} />

                <div className="est-grid">
                    <div className="est-box">
                        <h4>Customer</h4>
                        <div className="est-kv">
                            <span>Name</span><span>{e.CustomerName || '—'}</span>
                            <span>Mobile</span><span>{e.CustomerPhone || '—'}</span>
                            {e.CustomerCNIC && <><span>CNIC</span><span>{e.CustomerCNIC}</span></>}
                            {e.CustomerAddress && <><span>Address</span><span>{e.CustomerAddress}</span></>}
                        </div>
                    </div>
                    <div className="est-box">
                        <h4>Vehicle</h4>
                        <div className="est-kv">
                            <span>Registration</span><span>{e.VehicleRegNo || '—'}</span>
                            <span>Model</span><span>{e.VehicleModel || '—'}</span>
                            <span>Chassis</span><span>{e.ChasisNo || '—'}</span>
                            {e.EngineNo && <><span>Engine</span><span>{e.EngineNo}</span></>}
                            <span>Odometer</span><span>{e.KiloMeter != null ? `${Number(e.KiloMeter).toLocaleString('en-PK')} km` : '—'}</span>
                            {e.JobTypeName && <><span>Job type</span><span>{e.JobTypeName}</span></>}
                        </div>
                    </div>
                </div>

                {e.CustomerRemarks && (
                    <>
                        <div className="est-sec">Customer request</div>
                        <div className="est-box" style={{ whiteSpace: 'pre-wrap' }}>{e.CustomerRemarks}</div>
                    </>
                )}

                <div className="est-sec">Labour</div>
                <table className="est-table">
                    <thead>
                        <tr>
                            <th style={{ width: '6%' }}>#</th>
                            <th>Job</th>
                            <th className="est-num" style={{ width: '15%' }}>Amount</th>
                            <th className="est-num" style={{ width: '14%' }}>PST {rateLabel(e.PSTRate)}</th>
                            <th className="est-num" style={{ width: '15%' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!labour.length && <tr><td colSpan={5} style={{ color: '#64748b' }}>No labour</td></tr>}
                        {labour.map((l, i) => (
                            <tr key={l.LineID}>
                                <td>{i + 1}</td>
                                <td>{l.Description}</td>
                                <td className="est-num">{money(Number(l.Rate) * Number(l.Quantity))}</td>
                                <td className="est-num">{money(l.TaxAmount)}</td>
                                <td className="est-num">{money(l.LineTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="est-sec">Parts</div>
                <table className="est-table">
                    <thead>
                        <tr>
                            <th style={{ width: '5%' }}>#</th>
                            <th style={{ width: '17%' }}>Part no</th>
                            <th>Description</th>
                            <th className="est-num" style={{ width: '7%' }}>Qty</th>
                            <th className="est-num" style={{ width: '12%' }}>Rate</th>
                            <th className="est-num" style={{ width: '13%' }}>Amount</th>
                            <th className="est-num" style={{ width: '11%' }}>GST {rateLabel(e.GSTRate)}</th>
                            <th className="est-num" style={{ width: '13%' }}>Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {!parts.length && <tr><td colSpan={8} style={{ color: '#64748b' }}>No parts</td></tr>}
                        {parts.map((l, i) => (
                            <tr key={l.LineID}>
                                <td>{i + 1}</td>
                                <td>{l.PartNumber || ''}</td>
                                <td>{l.Description}</td>
                                <td className="est-num">{+Number(l.Quantity).toFixed(2)}</td>
                                <td className="est-num">{money(l.Rate)}</td>
                                <td className="est-num">{money(Number(l.Rate) * Number(l.Quantity))}</td>
                                <td className="est-num">{money(l.TaxAmount)}</td>
                                <td className="est-num">{money(l.LineTotal)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <table className="est-totals">
                    <tbody>
                        <tr><td>Labour</td><td className="est-num">{money(e.LabourTotal)}</td></tr>
                        <tr><td>PST {rateLabel(e.PSTRate)}</td><td className="est-num">{money(e.LabourTax)}</td></tr>
                        <tr><td>Parts</td><td className="est-num">{money(e.PartsTotal)}</td></tr>
                        <tr><td>GST {rateLabel(e.GSTRate)}</td><td className="est-num">{money(e.PartsTax)}</td></tr>
                        <tr className="grand"><td>Estimated total (Rs)</td><td className="est-num">{money(e.GrandTotal)}</td></tr>
                    </tbody>
                </table>

                {signed && (
                    <div className="est-auth">
                        I hereby authorize the repair work set forth to be done along with necessary parts &amp; material.
                        I grant you and your employee permission to operate the vehicle in your premises &amp; public area
                        for road testing at my risk. I agree with terms &amp; conditions overleaf.
                    </div>
                )}

                <div className="est-note">
                    This is an estimate, not an invoice. Prices are at today's rates and include tax as shown; parts are subject
                    to availability. If more work is found during the repair, it will only be carried out with your approval.
                </div>

                <div className="est-sign">
                    <div style={{ position: 'relative' }}>
                        {sigUrl && (
                            <img src={sigUrl} alt="" style={{
                                position: 'absolute', left: 0, right: 0, bottom: '100%', margin: '0 auto',
                                maxHeight: '18mm', maxWidth: '100%',
                            }} />
                        )}
                        Customer signature
                        {e.Signature && (
                            <div style={{ border: 0, padding: 0, fontSize: '8pt' }}>
                                {e.Signature.SignerName} · {fmtDateTime(e.Signature.SignedAt)}
                            </div>
                        )}
                    </div>
                    <div>
                        Service advisor
                        {e.AdvisorName && <div style={{ border: 0, padding: 0, fontSize: '8pt' }}>{e.AdvisorName}</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}
