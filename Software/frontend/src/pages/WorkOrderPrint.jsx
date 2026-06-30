import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = v => v ? new Date(v).toLocaleDateString('en-GB') : '';

export default function WorkOrderPrint() {
    const { id } = useParams();
    const [jc, setJc] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/workshop/job-cards/${id}/print-data`)
            .then(r => { setJc(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!jc) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    // Totals from labour + parts items
    const labourGross = (jc.LabourItems || []).reduce((s, l) => s + (Number(l.Price) || 0) * (Number(l.Quantity) || 1), 0);
    const labourDisc  = (jc.LabourItems || []).reduce((s, l) => s + (Number(l.DiscAmt) || 0), 0);
    const labourNet   = labourGross - labourDisc;
    const partsGross  = (jc.PartsItems || []).reduce((s, p) => s + (Number(p.StockRate || p.ItemRate) || 0) * (Number(p.IssueQuantity || p.Quantity) || 1), 0);
    const partsDisc   = 0;   // not tracked per-line in current schema
    const partsNet    = partsGross - partsDisc;
    const sublet      = (jc.SubletItems || []).reduce((s, x) => s + (Number(x.Amount) || 0), 0);
    const pst         = Math.round(labourNet * 0.16 * 100) / 100;   // 16% PST on labour (Punjab) — TODO confirm rate
    // GST = sum of TaxAmount on labour AND parts lines (stored per-line)
    const gstLabour   = (jc.LabourItems || []).reduce((s, l) => s + (Number(l.TaxAmount) || 0), 0);
    const gstParts    = (jc.PartsItems  || []).reduce((s, p) => s + (Number(p.TaxAmount) || 0), 0);
    const gst         = gstLabour + gstParts;
    const total       = labourNet + partsNet + sublet + pst + gst;

    return (
        <div className="wo-print">
            {/* TOP BANNER */}
            <div className="banner">
                <div style={{ flex: 1 }} />
                <div className="banner-title">
                    <div className="company">CHANGAN MULTAN MOTORS</div>
                    <div className="subtitle"><em>Work Order Print Report</em></div>
                </div>
                <div className="logo-box">
                    <div className="logo-letter">⌖</div>
                    <div className="logo-text">CHANGAN AUTO<br/>MULTAN</div>
                </div>
            </div>
            <div className="address-row">
                NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN.&nbsp;&nbsp;
                <b>Mobile :</b>&nbsp;&nbsp;<b>Phone#:</b> 061-111-222-388
            </div>

            {/* HEADER GRID */}
            <table className="hdr">
                <tbody>
                    <tr>
                        <td className="lbl">Customer Name</td><td colSpan={3} className="val">{jc.CustomerName || jc.BringByName || jc.PartyName || ''}</td>
                        <td className="lbl">Party Name</td><td colSpan={2} className="val">{jc.PartyName || ''}</td>
                        <td className="lbl wo-lbl" rowSpan={2}>WO Number</td>
                        <td className="val wo-val" rowSpan={2}>{jc.JobCardNo || ''}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Delivered By</td><td colSpan={3} className="val">{jc.DeliveredTo || ''}</td>
                        <td className="lbl">Mobile #</td><td colSpan={2} className="val">{jc.BringByMobile || jc.CustomerPhone || ''}
                            <span style={{ float: 'right' }}>
                                <b>PM</b> [{jc.PMType === 'PM' ? '✓' : ' '}] &nbsp; <b>GR</b> [{(jc.JobTypeCode||'').includes('GR') ? '✓' : ' '}]
                            </span>
                        </td>
                    </tr>
                    <tr>
                        <td className="lbl">Reg #</td><td className="val">{jc.VehicleRegNo || ''}</td>
                        <td className="lbl">Type</td><td className="val">{jc.JobTypeCode || jc.CustomerType || ''}</td>
                        <td className="lbl">Odometer</td><td colSpan={2} className="val">{Number(jc.Odometer || 0).toLocaleString()}
                            <span style={{ float: 'right' }}>
                                <b>Warranty</b> [{(jc.JobTypeCode||'').includes('WR') ? '✓' : ' '}] &nbsp; <b>Other</b> [ ]
                            </span>
                        </td>
                        <td className="lbl wo-lbl">WO Date</td>
                        <td className="val wo-val">{d(jc.JobCardDate)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Frame #</td><td className="val">{jc.ChasisNo || ''}</td>
                        <td className="lbl">V. Type</td><td className="val">{jc.VehicleCode || ''}</td>
                        <td className="lbl">S.A Name</td><td colSpan={2} className="val">{jc.ServiceAdvisor || ''}</td>
                        <td colSpan={2} className="val">&nbsp;</td>
                    </tr>
                    <tr>
                        <td className="lbl">Eng #</td><td className="val">{jc.EngineNo || ''}</td>
                        <td className="lbl">Model</td><td className="val">{jc.VersionCode || ''}</td>
                        <td className="lbl">Care Of</td><td colSpan={2} className="val">{jc.CareOffName || ''}</td>
                        <td colSpan={2} className="val">
                            <b>Cash</b> [{jc.PaymentType === 'Cash' ? '✓' : ' '}] &nbsp; <b>Credit</b> [{jc.PaymentType === 'Credit' ? '✓' : ' '}]
                        </td>
                    </tr>
                    <tr>
                        <td className="lbl">Address</td><td colSpan={6} className="val">{jc.CustomerAddress || ''}
                            <span style={{ float: 'right' }}><b>Job No:</b> {fmt(labourGross + partsGross + sublet)}</span>
                        </td>
                        <td colSpan={2} className="val"><b>Is Appointment</b> [ ]</td>
                    </tr>
                    <tr>
                        <td className="lbl">CNIC #</td><td colSpan={3} className="val">{jc.CustomerCNIC || '- -'}</td>
                        <td className="lbl">DOB</td><td colSpan={4} className="val">&nbsp;</td>
                    </tr>
                </tbody>
            </table>

            {/* MIDDLE BLOCK: diagram + VOC + authorization */}
            <table className="mid">
                <tbody>
                    <tr>
                        <td className="diagram-cell" style={{ width: 220, verticalAlign: 'top' }}>
                            <CarDiagram marks={jc.DamageMarks || []} />
                        </td>
                        <td className="voc-cell" style={{ verticalAlign: 'top' }}>
                            <div className="sec-head"><b>Jobs Requested / Voice Of Customer</b></div>
                            <div className="voc">{jc.VOCRemarks || jc.Remarks || ''}</div>
                        </td>
                        <td className="auth-cell" style={{ width: 280, verticalAlign: 'top' }}>
                            <div style={{ fontSize: 9, padding: 4 }}>
                                I hereby authorize the repair work set forth to be done along with necessary parts &amp; material.
                                I grant you and your employee permission to operate the vehicle in your premises &amp; public area
                                for road testing at my risk. I agree with terms &amp; conditions overleaf.
                            </div>
                            <table className="sig-tbl">
                                <thead><tr><th>Customer Name</th><th>Signature</th><th>Date</th></tr></thead>
                                <tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody>
                            </table>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* CHECKLIST + INVOICE + ACK */}
            <table className="lower">
                <tbody>
                    <tr>
                        <td style={{ width: 230, verticalAlign: 'top' }}>
                            <div className="fuel">Fuel Quantity&nbsp;&nbsp;<b>{jc.FuelLevel || '—'}</b></div>
                            <div className="sec-head"><b>Pre Delivery Confirmation</b></div>
                            <ul className="checklist">
                                <li>Cleanliness (interior / exterior)<span>☑</span></li>
                                <li>Courtesy Item Removal<span>☑</span></li>
                                <li>Outer Mirror Position<span>☑</span></li>
                                <li>Clock Adjustment / Radio Setting<span>☑</span></li>
                                <li>Job Detail Explanation<span>☑</span></li>
                                <li>Fee Explanation<span>☑</span></li>
                                <li>Result Confirmation with Customer<span>☑</span></li>
                                <li>Walk Around Check<span>☑</span></li>
                            </ul>
                        </td>
                        <td style={{ verticalAlign: 'top' }}>
                            <div className="sec-head" style={{ textAlign: 'center' }}><b>INVOICE Parts &amp; Labour Amount</b></div>
                            <table className="amt-tbl">
                                <tbody>
                                    <tr><td>Parts Amount</td><td>{fmt(partsGross)}</td></tr>
                                    <tr><td>Parts Discount</td><td>{fmt(partsDisc)}</td></tr>
                                    <tr><td>Parts Total Net</td><td><b>{fmt(partsNet)}</b></td></tr>
                                    <tr><td>Labour Amount</td><td>{fmt(labourGross)}</td></tr>
                                    <tr><td>Labour Discount</td><td>{fmt(labourDisc)}</td></tr>
                                    <tr><td>PST</td><td>{fmt(pst)}</td></tr>
                                    <tr><td>Labour Total Net</td><td><b>{fmt(labourNet + pst)}</b></td></tr>
                                    <tr><td>Sublet Amount</td><td>{fmt(sublet)}</td></tr>
                                    {gst > 0 && <tr><td>GST</td><td>{fmt(gst)}</td></tr>}
                                    <tr className="grand"><td>Total Amount</td><td><b>{fmt(total)}</b></td></tr>
                                </tbody>
                            </table>
                        </td>
                        <td style={{ width: 280, verticalAlign: 'top' }}>
                            <div style={{ fontSize: 9, padding: 4 }}>
                                Received the car along with all tolls &amp; accessories. The repair have been performed to my satisfaction.
                            </div>
                            <table className="sig-tbl">
                                <thead><tr><th>Customer Name</th><th>Signature</th><th>Date</th></tr></thead>
                                <tbody><tr><td>&nbsp;</td><td>&nbsp;</td><td>&nbsp;</td></tr></tbody>
                            </table>
                            <table className="qa-tbl">
                                <tbody>
                                    <tr><td><b>Checked By :</b></td><td>{jc.CheckedByName || ''}</td></tr>
                                    <tr><td><b>Confirm By :</b></td><td>{jc.ConfirmByName || ''}</td></tr>
                                </tbody>
                            </table>
                            <div className="qa-flags">
                                <span><b>Fixed</b> [{jc.JobResult==='Fixed'?'✓':' '}]</span>
                                <span><b>No Fixed</b> [{jc.JobResult==='NotFixed'?'✓':' '}]</span>
                                <span><b>Level Up</b> [ ]</span>
                                <span><b>PSFU Plan</b> [✓]</span>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* JOBS TABLE */}
            <div className="sec-head"><b>Jobs</b></div>
            <table className="line-tbl">
                <thead><tr><th style={{ width: 90 }}>Date</th><th>Description</th><th style={{ width: 60, textAlign: 'right' }}>Qty</th><th style={{ width: 100, textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                    {(jc.LabourItems || []).map((l, i) => (
                        <tr key={i}>
                            <td>{d(jc.JobCardDate)}</td>
                            <td>{l.Remarks || l.PartNumber || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(l.Quantity || 1).toFixed(1)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt((Number(l.Price)||0)*(Number(l.Quantity)||1) - (Number(l.DiscAmt)||0))}</td>
                        </tr>
                    ))}
                    {(!jc.LabourItems || jc.LabourItems.length === 0) && (
                        <tr><td colSpan={4} style={{ color: '#999', fontStyle: 'italic' }}>No labour lines.</td></tr>
                    )}
                    <tr className="line-total"><td colSpan={3} style={{ textAlign: 'right' }}><b>Total :</b></td><td style={{ textAlign: 'right' }}><b>{fmt(labourNet)}</b></td></tr>
                </tbody>
            </table>

            {/* PARTS TABLE */}
            <div className="sec-head"><b>Parts</b></div>
            <table className="line-tbl">
                <thead><tr><th style={{ width: 90 }}>Date</th><th>Description</th><th style={{ width: 60, textAlign: 'right' }}>Qty</th><th style={{ width: 100, textAlign: 'right' }}>Amount</th></tr></thead>
                <tbody>
                    {(jc.PartsItems || []).map((p, i) => (
                        <tr key={i}>
                            <td>{d(p.IssueDate || jc.JobCardDate)}</td>
                            <td>{p.ItemName || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(p.IssueQuantity || p.Quantity || 1).toFixed(1)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt((Number(p.StockRate || p.ItemRate) || 0) * (Number(p.IssueQuantity || p.Quantity) || 1))}</td>
                        </tr>
                    ))}
                    {(!jc.PartsItems || jc.PartsItems.length === 0) && (
                        <tr><td colSpan={4} style={{ color: '#999', fontStyle: 'italic' }}>No parts issued.</td></tr>
                    )}
                    <tr className="line-total"><td colSpan={3} style={{ textAlign: 'right' }}><b>Total :</b></td><td style={{ textAlign: 'right' }}><b>{fmt(partsNet)}</b></td></tr>
                </tbody>
            </table>

            {/* TERMS */}
            <div className="terms">
                <b>Terms &amp; Conditions</b>
                <ol>
                    <li>COMPANY EMPLOYEE MAY OPERATE VEHICLE FOR THE PURPOSE OF TESTING, INSPECTION AND / OR DELIVERY AT CUSTOMER RISK.</li>
                    <li>THE COMPANY WILL NOT BE HELD RESPONSIBLE FOR THE LOSS OR DAMAGE TO THE VEHICLE OR ARTICLES LEFT IN THE VEHICLE IN CASE OF FIRE, THEFT, ACCIDENT OR ANY OTHER CAUSE BEYOND THE COMPANY'S CONTROL.</li>
                    <li>NO CLAIM FOR UNSATISFACTORY WORK TO THE VEHICLE UNDER THIS REPAIR ORDER WILL BE CONSIDERED UNLESS RECEIVED BY THE COMPANY WITHIN FIVE WORKING DAYS AFTER THE VEHICLE HAS BEEN DELIVERED.</li>
                    <li>CUSTOMER AGREES TO PAY INTEREST AT THE RATE OF 20% PER MONTH ON ALL ACCOUNTS NOT PAID WHEN DUE.</li>
                    <li>IN CASE OF LITIGATION OR NON-PAYMENT OF THIS REPAIR ORDER, CUSTOMER AGREES TO SUBMIT HIMSELF / HERSELF TO THE JURISDICTION OF THE COURTS.</li>
                </ol>
            </div>

            <style>{`
                /* margin: 0 — no room for browser-injected URL / page-# header */
                @page { size: A4 portrait; margin: 0; }
                html, body { width: 210mm; margin: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .wo-print { font-family: Arial, sans-serif; color: #000; font-size: 10px; max-width: 210mm; margin: 0 auto; padding: 10mm 8mm; box-sizing: border-box; }
                .banner { display: flex; align-items: center; padding: 4px 0; }
                .banner-title { text-align: center; flex: 2; }
                .banner-title .company { font-size: 18px; font-weight: 700; }
                .banner-title .subtitle { font-size: 12px; color: #444; }
                .logo-box { width: 80px; height: 60px; border: 1px solid #999; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                .logo-letter { font-size: 22px; }
                .logo-text { font-size: 7px; text-align: center; }
                .address-row { text-align: center; font-size: 10px; padding-bottom: 4px; border-bottom: 1px solid #000; margin-bottom: 4px; }
                .hdr { width: 100%; border-collapse: collapse; }
                .hdr td { border: 1px solid #000; padding: 2px 4px; font-size: 9.5px; }
                .hdr .lbl { background: #f0f0f0; font-weight: 700; white-space: nowrap; width: 8%; }
                .hdr .val { font-weight: 500; }
                .hdr .wo-lbl { background: #f0f0f0; text-align: center; font-weight: 700; }
                .hdr .wo-val { text-align: center; font-weight: 700; font-size: 11px; }
                .mid { width: 100%; border-collapse: collapse; margin-top: 4px; }
                .mid td { border: 1px solid #000; vertical-align: top; }
                .sec-head { background: #f0f0f0; padding: 2px 4px; font-size: 10px; border-bottom: 1px solid #999; }
                .voc { padding: 6px; min-height: 70px; }
                .diagram-cell { padding: 4px; text-align: center; }
                .sig-tbl { width: 100%; border-collapse: collapse; margin-top: 4px; }
                .sig-tbl th, .sig-tbl td { border: 1px solid #000; padding: 4px; font-size: 8.5px; text-align: center; }
                .sig-tbl tbody tr { height: 30px; }
                .lower { width: 100%; border-collapse: collapse; margin-top: 2px; }
                .lower > tbody > tr > td { border: 1px solid #000; }
                .fuel { padding: 4px; border-bottom: 1px solid #999; }
                .checklist { list-style: none; padding: 4px 8px; margin: 0; }
                .checklist li { font-size: 9px; padding: 2px 0; display: flex; justify-content: space-between; border-bottom: 1px dotted #ccc; }
                .checklist li span { font-weight: 700; }
                .amt-tbl { width: 100%; border-collapse: collapse; }
                .amt-tbl td { padding: 3px 6px; font-size: 10px; border-bottom: 1px dotted #999; }
                .amt-tbl td:nth-child(2) { text-align: right; }
                .amt-tbl tr.grand td { background: #f0f0f0; font-size: 11px; padding: 5px 6px; }
                .qa-tbl { width: 100%; border-collapse: collapse; margin-top: 4px; }
                .qa-tbl td { padding: 3px 6px; font-size: 9px; border-bottom: 1px dotted #aaa; }
                .qa-flags { display: flex; justify-content: space-around; font-size: 9px; padding: 4px; flex-wrap: wrap; gap: 6px; }
                .line-tbl { width: 100%; border-collapse: collapse; margin: 4px 0; }
                .line-tbl th, .line-tbl td { border: 1px solid #000; padding: 3px 6px; font-size: 9.5px; }
                .line-tbl th { background: #e8e8e8; text-align: left; }
                .line-tbl .line-total td { background: #f6f6f6; border-top: 2px solid #000; }
                .terms { margin-top: 6px; border: 1px solid #000; padding: 4px 8px; font-size: 9px; }
                .terms ol { margin: 4px 0 0 16px; padding: 0; }
                .terms li { padding: 1px 0; }
                @media screen { .wo-print { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
                @media print  { .wo-print { box-shadow: none; } }
            `}</style>
        </div>
    );
}

// Compact car-damage diagram (Right / Front / Back / Left) — pure SVG, no asset files.
function CarDiagram({ marks }) {
    // Top-down car silhouette matching the printed Work Order layout:
    //   • "Right" label up top, "Left" at bottom    (the car's right/left side faces up/down)
    //   • "Front" vertical text on the left edge, "Back" on the right edge
    //   • Car oriented horizontally: hood on the LEFT of the SVG, trunk on the RIGHT
    //   • Front + rear windshields as trapezoids; 4 wheels; side mirrors at front
    return (
        <svg viewBox="0 0 220 200" style={{ width: '100%', maxWidth: 220 }}>
            {/* Compass labels */}
            <text x="110" y="13"  textAnchor="middle" fontSize="11" fontWeight="700" fill="#b91c1c">Right</text>
            <text x="110" y="194" textAnchor="middle" fontSize="11" fontWeight="700" fill="#b91c1c">Left</text>
            {/* Vertical "F r o n t" — letters stacked vertically on left edge */}
            {['F','r','o','n','t'].map((c, i) => (
                <text key={`f-${i}`} x="8" y={75 + i * 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#b91c1c">{c}</text>
            ))}
            {['B','a','c','k'].map((c, i) => (
                <text key={`b-${i}`} x="212" y={75 + i * 14} textAnchor="middle" fontSize="10" fontWeight="700" fill="#b91c1c">{c}</text>
            ))}

            <g fill="none" stroke="#b91c1c" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                {/* Outer body silhouette — horizontal capsule */}
                <rect x="22" y="35" width="176" height="130" rx="28" ry="28" />

                {/* Front bumper (curved line near the hood) */}
                <path d="M 30 55 Q 28 100 30 145" />
                {/* Rear bumper (mirror on the right) */}
                <path d="M 190 55 Q 192 100 190 145" />

                {/* Hood crease lines (subtle) */}
                <line x1="30" y1="80" x2="52" y2="80" />
                <line x1="30" y1="120" x2="52" y2="120" />

                {/* Cabin block — passenger compartment in the middle */}
                <rect x="62" y="58" width="96" height="84" />

                {/* Front windshield — trapezoid between hood and cabin */}
                <polygon points="52,52 62,58 62,142 52,148" />

                {/* Rear windshield — trapezoid between trunk and cabin */}
                <polygon points="168,52 158,58 158,142 168,148" />

                {/* Center pillar separating front and rear seats */}
                <line x1="110" y1="58" x2="110" y2="142" />

                {/* Side mirrors — small ovals near front edges */}
                <ellipse cx="64"  cy="48"  rx="6"  ry="3" />
                <ellipse cx="64"  cy="152" rx="6"  ry="3" />

                {/* Wheels — rounded rectangles at the four corners */}
                <rect x="44"  y="28"  width="14" height="10" rx="2" ry="2" />
                <rect x="162" y="28"  width="14" height="10" rx="2" ry="2" />
                <rect x="44"  y="162" width="14" height="10" rx="2" ry="2" />
                <rect x="162" y="162" width="14" height="10" rx="2" ry="2" />

                {/* Headlights — small circles at the front corners */}
                <circle cx="33" cy="50"  r="3" />
                <circle cx="33" cy="150" r="3" />

                {/* Tail lights — at the rear corners */}
                <circle cx="187" cy="50"  r="3" />
                <circle cx="187" cy="150" r="3" />
            </g>

            {/* Damage marks plotted in red */}
            {(marks || []).map((m, i) => (
                <text key={i} x={m.X || 110} y={m.Y || 100}
                      fontSize="14" fontWeight="700" fill="#b91c1c" textAnchor="middle">✗</text>
            ))}
        </svg>
    );
}
