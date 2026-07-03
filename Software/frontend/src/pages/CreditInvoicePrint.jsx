/**
 * Credit Invoice — auto-print view for a finalized Job Card.
 * Layout mirrors the "credit invoice" sample the owner supplied 2026-07-02
 * (see docs at credit invoice.pdf). Data comes from:
 *   - /api/workshop/job-cards/:id/print-data (customer, vehicle, labour, parts, sublet, totals)
 *   - /api/workshop/job-cards/:id/insurance  (surveyor / claim / depreciation lines)
 *   - /api/settings/business-profile        (letterhead + logo)
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = (v) => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-') : '';

export default function CreditInvoicePrint() {
    const { id } = useParams();
    const [jc, setJc] = useState(null);
    const [ins, setIns] = useState(null);
    const [profile, setProfile] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        // Blank the tab title before printing so browsers (Chrome, Edge)
        // don't stamp "Job Card — AutoDMS" at the top of every printed page.
        // A single space still shows something in the tab bar without
        // dumping meaningful text on the printout. URL/date headers are
        // separate; the user must uncheck "Headers and footers" in the
        // print dialog to hide those.
        const oldTitle = document.title;
        document.title = ' ';
        Promise.all([
            axios.get(`/api/workshop/job-cards/${id}/print-data`),
            axios.get(`/api/workshop/job-cards/${id}/insurance`).catch(() => ({ data: null })),
            axios.get(`/api/settings/business-profile`).catch(() => ({ data: null })),
        ])
        .then(([jcRes, insRes, bpRes]) => {
            setJc(jcRes.data);
            setIns(insRes.data);
            setProfile(bpRes.data);
            setTimeout(() => window.print(), 500);
        })
        .catch(e => setErr(e.response?.data?.error || e.message));
        return () => { document.title = oldTitle; };
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!jc) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    // Split spares (Part) vs sublet — insurance-parts view has both mixed; the
    // classic PDF layout keeps them in separate tables.
    const insParts = (ins?.parts || []).filter(p => p.LineType === 'Part');
    const labourItems = jc.LabourItems || [];
    const subletItems = jc.SubletItems || [];

    // Totals (per the PDF's calc):
    //   Labour + Sublet without PST — sum of Price-Disc for labour + PayableAmount for sublet
    //   16% PST                     — sum of TaxAmount on labour lines
    //   Parts Without GST           — sum of parts amounts (raw)
    //   18% GST                     — sum of parts TaxAmount
    //   Depreciation                — sum of DepAmount from insurance grid (parts side)
    //   Total Payable by Party      = (Labour+Sublet) + PST + Parts + GST - Depreciation
    const labourNet = labourItems.reduce((s, l) => s + (Number(l.Price)||0) - (Number(l.DiscAmt)||0), 0);
    const sublet    = subletItems.reduce((s, x) => s + (Number(x.PayableAmount)||0), 0);
    const pst       = labourItems.reduce((s, l) => s + (Number(l.TaxAmount)||0), 0);
    // Parts figures pulled from insurance view when available (accurate,
    // includes GST separately). Falls back to jc.PartsItems.
    const partsRows = insParts.length ? insParts : (jc.PartsItems || []).map(p => ({
        ItemNumber: p.ItemNumber ?? p.ManualNumber, ItemName: p.ItemName,
        Qty: p.IssueQuantity, Rate: p.ItemRate,
        TotalAmount: (Number(p.IssueQuantity)||0) * (Number(p.ItemRate)||0),
        TaxAmount:   Number(p.TaxAmount)||0,
        DepreciationPct: 0, DepAmount: 0,
    }));
    const partsNet  = partsRows.reduce((s, p) => s + (Number(p.TotalAmount)||0), 0);
    const gst       = partsRows.reduce((s, p) => s + (Number(p.TaxAmount)||0), 0);
    const dep       = partsRows.reduce((s, p) => s + (Number(p.DepAmount)||0), 0);
    const totalPayable = (labourNet + sublet) + pst + partsNet + gst - dep;

    // Header letterhead — from Business Profile if configured
    const company = profile?.CompanyName || 'CHANGAN MULTAN MOTORS';
    const address = [profile?.Address1, profile?.Address2, profile?.City]
        .filter(Boolean).join(', ') || 'NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN.';
    const phone   = profile?.PhoneNumbers ? `UAN # ${profile.PhoneNumbers}` : 'UAN # 061-111-222-388';
    const ntn     = profile?.NTN  || '';
    const gstNo   = profile?.STRN || '';
    const logoUrl = profile?.LogoPath ? `/uploads/${profile.LogoPath}` : null;

    // Party name — for credit sales, prefer the linked party's name; falls
    // back to CustomerName for walk-in workshops that shouldn't really have
    // a credit invoice but the operator triggered it anyway.
    const partyName = jc.PartyName || jc.CustomerName || '';

    return (
        <div className="ci">
            {/* Letterhead */}
            <table className="head">
                <tbody>
                    <tr>
                        <td className="logo-cell">
                            {logoUrl
                                ? <img src={logoUrl} alt="logo" style={{ maxHeight: 80 }} />
                                : <div className="logo-fallback">
                                    <div className="lf-symbol">⌖</div>
                                    <div className="lf-label">CHANGAN AUTO<br/>MULTAN</div>
                                  </div>
                            }
                        </td>
                        <td className="cmp-cell">
                            <div className="cmp-name">{company}</div>
                            <div className="cmp-addr">{address}</div>
                            <div className="cmp-phone">{phone}</div>
                            <div className="cmp-tax">
                                <span>NTN # <b>{ntn || '—'}</b></span>
                                <span style={{ marginLeft: 40 }}>GST # <b>{gstNo || '—'}</b></span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Customer + invoice block */}
            <table className="cust">
                <tbody>
                    <tr>
                        <td className="lbl w-14">Customer Name</td>
                        <td className="val">{jc.CustomerName || jc.endUserName || '—'}</td>
                        <td className="lbl w-10" rowSpan={1}>Claim No</td>
                        <td className="val w-20">{ins?.header?.InsClaimNo || '—'}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Address</td>
                        <td className="val" rowSpan={2}>{jc.Address || jc.CustomerAddress || '—'}</td>
                        <td className="lbl">Date:</td>
                        <td className="val">{d(jc.JobCardDate || jc.CreatedAt)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Mobile</td>
                        <td className="lbl">Inv #</td>
                        <td className="val invno">{jc.JobCardNo || '—'}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Party / Insurance</td>
                        <td className="val">{ins?.header?.CompanyName || (jc.Status === 'Credit' ? partyName : '—')}</td>
                        <td className="lbl">BILL</td>
                        <td className="val">{partyName ? `(${partyName})` : '—'}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Surveyor Company</td>
                        <td className="val">
                            {ins?.header?.SurveyorName
                                ? <>{ins.header.SurveyorName}</>
                                : '—'}
                        </td>
                        <td className="lbl">&nbsp;</td>
                        <td className="val credit-flag">Credit</td>
                    </tr>
                </tbody>
            </table>

            {/* Vehicle row */}
            <table className="veh">
                <thead>
                    <tr>
                        <th>Vehicle</th>
                        <th>Registration #</th>
                        <th>Engine #</th>
                        <th>KM</th>
                        <th>Chasis #</th>
                        <th>Color</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>{jc.VehicleModel || jc.VehicleName || '—'}</td>
                        <td>{jc.VehicleRegNo || '—'}</td>
                        <td>{jc.EngineNo || '—'}</td>
                        <td>{jc.Odometer || jc.KiloMeter || jc.KM || '—'}</td>
                        <td>{jc.ChasisNo || jc.ChassisNo || '—'}</td>
                        <td>{jc.VehicleColor || '—'}</td>
                    </tr>
                </tbody>
            </table>

            {/* Jobs */}
            <div className="sec-lbl">Jobs</div>
            <table className="lines">
                <thead>
                    <tr><th style={{ textAlign: 'left' }}>JobDescription</th><th style={{ width: '18%', textAlign: 'right' }}>Total Amount</th></tr>
                </thead>
                <tbody>
                    {labourItems.length === 0 && <tr><td colSpan={2} className="empty">—</td></tr>}
                    {labourItems.map((l, i) => (
                        <tr key={i}>
                            <td>{l.Remarks || l.WorkDescription || l.Description || '—'}</td>
                            <td style={{ textAlign: 'right' }}>{fmt((Number(l.Price)||0) - (Number(l.DiscAmt)||0))}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Sublet */}
            <div className="sec-lbl">Sublet</div>
            <table className="lines">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'left' }}>Description</th>
                        <th style={{ width: '10%', textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '18%', textAlign: 'right' }}>Total Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {subletItems.length === 0 && <tr><td colSpan={3} className="empty">—</td></tr>}
                    {subletItems.map((s, i) => (
                        <tr key={i}>
                            <td>{s.Remarks || s.Description || '—'}</td>
                            <td style={{ textAlign: 'right' }}>1</td>
                            <td style={{ textAlign: 'right' }}>{fmt(s.PayableAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Spares */}
            <div className="sec-lbl">Spares</div>
            <table className="lines spares">
                <thead>
                    <tr>
                        <th>Item Number</th>
                        <th>Description</th>
                        <th style={{ textAlign: 'right' }}>Qty</th>
                        <th style={{ textAlign: 'right' }}>Rate</th>
                        <th style={{ textAlign: 'right' }}>Amnt with GST</th>
                        <th style={{ textAlign: 'right' }}>Dep %</th>
                        <th style={{ textAlign: 'right' }}>Dep Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {partsRows.length === 0 && <tr><td colSpan={7} className="empty">—</td></tr>}
                    {partsRows.map((p, i) => {
                        const withGst = (Number(p.TotalAmount)||0) + (Number(p.TaxAmount)||0);
                        return (
                            <tr key={i}>
                                <td>{p.ItemNumber || '—'}</td>
                                <td>{p.ItemName || '—'}</td>
                                <td style={{ textAlign: 'right' }}>{Number(p.Qty)||0}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(p.Rate)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(withGst)}</td>
                                <td style={{ textAlign: 'right' }}>{Number(p.DepreciationPct||0).toFixed(1)}</td>
                                <td style={{ textAlign: 'right' }}>{fmt(p.DepAmount)}</td>
                            </tr>
                        );
                    })}
                    {partsRows.length > 0 && (
                        <tr className="row-totals">
                            <td colSpan={4} />
                            <td style={{ textAlign: 'right' }}>{fmt(partsRows.reduce((s, p) => s + (Number(p.TotalAmount)||0) + (Number(p.TaxAmount)||0), 0))}</td>
                            <td />
                            <td style={{ textAlign: 'right' }}>{fmt(dep)}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals block */}
            <table className="tot">
                <tbody>
                    <tr>
                        <td rowSpan={6} className="tot-blank" />
                        <td className="tot-lbl">Labour + Sublet without PST</td>
                        <td className="tot-val">{fmt(labourNet + sublet)}</td>
                    </tr>
                    <tr><td className="tot-lbl">16% PST</td><td className="tot-val">{fmt(pst)}</td></tr>
                    <tr><td className="tot-lbl">Parts Without GST</td><td className="tot-val">{fmt(partsNet)}</td></tr>
                    <tr><td className="tot-lbl">18% GST</td><td className="tot-val">{fmt(gst)}</td></tr>
                    <tr><td className="tot-lbl">Depreciation</td><td className="tot-val">{fmt(dep)}</td></tr>
                    <tr><td className="tot-lbl b"><b>Total Payble by Party</b></td><td className="tot-val b"><b>{fmt(totalPayable)}</b></td></tr>
                </tbody>
            </table>

            {/* Signature block */}
            <div className="sigs">
                <div><b>Manager Service/Bodypaint</b></div>
                <div><b>Accounts Manager</b></div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { width: 210mm; margin: 0; background: #fff; color: #000; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .ci { font-family: Arial, sans-serif; font-size: 10pt; padding: 10mm 12mm; box-sizing: border-box; max-width: 210mm; }
                .head { width: 100%; border-collapse: collapse; margin-bottom: 6px; }
                .logo-cell { width: 90px; vertical-align: top; padding: 2px; }
                .logo-fallback { width: 78px; height: 60px; border: 1px solid #666; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .logo-fallback .lf-symbol { font-size: 24px; }
                .logo-fallback .lf-label { font-size: 7px; text-align: center; }
                .cmp-cell { text-align: center; vertical-align: top; }
                .cmp-name { font-size: 16pt; font-weight: 800; }
                .cmp-addr, .cmp-phone { font-size: 9pt; margin-top: 1px; }
                .cmp-tax { font-size: 9pt; margin-top: 3px; }
                .cust { width: 100%; border-collapse: collapse; margin-top: 6px; }
                .cust td { border: 1px solid #333; padding: 2px 6px; font-size: 9.5pt; }
                .cust .lbl { background: #e8edf2; font-weight: 600; width: 15%; }
                .cust .val { }
                .cust .val.invno { color: #b91c1c; font-weight: 800; font-size: 12pt; }
                .cust .val.credit-flag { color: #b91c1c; font-weight: 800; font-size: 11pt; }
                .veh { width: 100%; border-collapse: collapse; margin-top: 6px; }
                .veh th, .veh td { border: 1px solid #333; padding: 2px 6px; font-size: 9.5pt; }
                .veh th { background: #e8edf2; }
                .sec-lbl { font-size: 8pt; color: #64748b; margin-top: 6px; }
                .lines { width: 100%; border-collapse: collapse; margin-top: 2px; }
                .lines th, .lines td { border: 1px solid #333; padding: 2px 6px; font-size: 9pt; }
                .lines th { background: #e8edf2; }
                .lines .empty { text-align: center; color: #94a3b8; }
                .spares th, .spares td { font-size: 9pt; }
                .row-totals td { background: #e8edf2; font-weight: 700; }
                .tot { width: 100%; border-collapse: collapse; margin-top: 4px; }
                .tot td { border: 1px solid #333; padding: 3px 8px; font-size: 9.5pt; }
                .tot .tot-blank { border: 1px solid #333; }
                .tot .tot-lbl { background: #e8edf2; width: 22%; font-weight: 600; }
                .tot .tot-val { width: 12%; text-align: right; }
                .tot .b { background: #dcfce7; }
                .sigs { display: flex; gap: 40px; margin-top: 12px; }
                .sigs > div { flex: 1; text-align: center; border-top: 1px solid #000; padding-top: 4px; font-size: 10pt; }
                @media print { .no-print { display: none !important; } }
            `}</style>
        </div>
    );
}
