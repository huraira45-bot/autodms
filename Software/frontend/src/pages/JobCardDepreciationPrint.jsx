/**
 * Job Card — Issue Spares With Depreciation print.
 * Matches C:\Users\ServerDeskop\Desktop\dep.pdf (owner ask 2026-07-05).
 * Alignment rewrite 2026-07-07:
 *   - Dedicated .jc-dep-print wrapper that resets inherited app styles.
 *   - Details area is a proper HTML table with fixed mm widths per column
 *     so labels can never overlap values and long text wraps in-cell.
 *   - vertical-align: top on every cell so a two-line value on one side
 *     doesn't push the label opposite it off-centre.
 *   - No overflow: hidden, no ellipsis, no flex/grid inside cells,
 *     no absolute positioning, no transforms.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../components/PrintBusinessHeader';
import { getBusinessProfile } from '../utils/businessProfile';

const fmt  = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const fmtQ = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const d    = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

export default function JobCardDepreciationPrint() {
    const { id } = useParams();
    const [jc, setJc]           = useState(null);
    const [insurance, setIns]   = useState(null);
    const [profile, setProfile] = useState(null);
    const [err, setErr]         = useState(null);

    useEffect(() => {
        getBusinessProfile().then(setProfile).catch(() => {});
        Promise.all([
            axios.get(`/api/workshop/job-cards/${id}`),
            axios.get(`/api/workshop/job-cards/${id}/insurance`),
        ]).then(([j, i]) => {
            setJc(j.data);
            setIns(i.data);
            setTimeout(() => window.print(), 500);
        }).catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!jc || !insurance) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    // Per spec: only include spare parts that actually have depreciation
    // recorded. Labour ('Service' LineType) is always excluded.
    const parts = (insurance.parts || []).filter(p =>
        p.LineType === 'Part'
        && ((Number(p.DepAmount) || 0) > 0 || (Number(p.DepreciationPct) || 0) > 0)
    );

    const totals = parts.reduce((a, p) => ({
        items: a.items + 1,
        qty:   a.qty   + Number(p.Qty || 0),
        total: a.total + Number(p.TotalWithTax || 0),
        dep:   a.dep   + Number(p.DepAmount || 0),
    }), { items: 0, qty: 0, total: 0, dep: 0 });

    // Vehicle description — vw_WorkshopJobCards stores the model text in
    // VersionCode (same field WorkOrderPrint uses on the Model row).
    const vehicleName = jc.VersionCode
        || [jc.BrandCode, jc.VehicleCode].filter(Boolean).join(' ')
        || jc.VehicleName
        || '';

    const rowStatus   = jc.IsFinalized ? 'Complete' : (jc.Status || 'Open');
    const companyName = profile?.CompanyName || '';

    return (
        <div className="jc-dep-print">
            {/* Top band — business header left, print + date-in stack right. */}
            <div className="top">
                <div className="top-biz"><PrintBusinessHeader showOnScreen /></div>
                <div className="top-dates">
                    <div><label>Print Date:</label><span>{d(new Date())}</span></div>
                    <div><label>Date in:</label><span>{d(jc.JobCardDate)}</span></div>
                </div>
            </div>

            {/* Title bar — RO# | title | Status */}
            <table className="title-bar">
                <colgroup>
                    <col style={{ width: '40mm' }}/>
                    <col />
                    <col style={{ width: '38mm' }}/>
                </colgroup>
                <tbody>
                    <tr>
                        <td className="title-side"><b>RO#</b>&nbsp;&nbsp;{jc.JobCardNo || jc.jobCode || ''}</td>
                        <td className="title-mid">Issue Spares With Depreciation</td>
                        <td className="title-side"><b>Status</b>&nbsp;&nbsp;{rowStatus}</td>
                    </tr>
                </tbody>
            </table>

            {/*
              Details section — one plain HTML table.
              8 columns per row (label, value × 4) with fixed mm widths.
              Row 1: Customer Name | Vehicle | Color | Engine #
              Row 2: Party         | Company | Reg # | Chassis #
              Content width available: 210mm − (9mm × 2 padding) = 192mm.
              Label/value column widths total exactly 192mm so the
              rightmost value cannot overflow the page.
            */}
            <table className="details">
                <colgroup>
                    <col style={{ width: '24mm' }}/>{/* label 1 */}
                    <col style={{ width: '40mm' }}/>{/* value 1 */}
                    <col style={{ width: '18mm' }}/>{/* label 2 */}
                    <col style={{ width: '40mm' }}/>{/* value 2 */}
                    <col style={{ width: '14mm' }}/>{/* label 3 */}
                    <col style={{ width: '20mm' }}/>{/* value 3 */}
                    <col style={{ width: '18mm' }}/>{/* label 4 */}
                    <col style={{ width: '18mm' }}/>{/* value 4 */}
                </colgroup>
                <tbody>
                    <tr>
                        <td className="lbl">Customer Name:</td>
                        <td className="val">{jc.CustomerName || jc.PartyName || ''}</td>
                        <td className="lbl">Vehicle:</td>
                        <td className="val">{vehicleName}</td>
                        <td className="lbl">Color:</td>
                        <td className="val">{jc.VehicleColor || ''}</td>
                        <td className="lbl">Engine #:</td>
                        <td className="val">{jc.EngineNo || ''}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Party:</td>
                        <td className="val">{jc.PartyName || ''}</td>
                        <td className="lbl">Company:</td>
                        <td className="val">{insurance.header?.CompanyName || ''}</td>
                        <td className="lbl">Reg #:</td>
                        <td className="val">{jc.VehicleRegNo || ''}</td>
                        <td className="lbl">Chassis #:</td>
                        <td className="val">{jc.ChasisNo || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/*
              Line items — fixed mm widths per spec.
              Content width 192mm. Fixed cols total 131mm; ITEM NAME
              (flexible) gets the remaining 61mm.
            */}
            <table className="items">
                <colgroup>
                    <col style={{ width: '29mm' }}/>{/* ITEMNUMBER   */}
                    <col style={{ width: '61mm' }}/>{/* ITEM NAME    */}
                    <col style={{ width: '12mm' }}/>{/* QTY          */}
                    <col style={{ width: '24mm' }}/>{/* SALESRATE    */}
                    <col style={{ width: '27mm' }}/>{/* TOTAL AMOUNT */}
                    <col style={{ width: '12mm' }}/>{/* DEP %        */}
                    <col style={{ width: '27mm' }}/>{/* DEP AMOUNT   */}
                </colgroup>
                <thead>
                    <tr>
                        <th>ITEMNUMBER</th>
                        <th>ITEM NAME</th>
                        <th className="c">QTY</th>
                        <th className="r">SALESRATE</th>
                        <th className="r">TOTAL AMOUNT</th>
                        <th className="c">DEP %</th>
                        <th className="r">DEP AMOUNT</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map((p, i) => {
                        const qty       = Number(p.Qty) || 0;
                        const totalIncl = Number(p.TotalWithTax) || 0;
                        const rateIncl  = qty > 0 ? totalIncl / qty : Number(p.Rate) || 0;
                        return (
                            <tr key={i}>
                                <td className="mono">{p.ItemNumber || ''}</td>
                                <td>{p.ItemName || ''}</td>
                                <td className="r">{fmt(p.Qty)}</td>
                                <td className="r">{fmt(rateIncl)}</td>
                                <td className="r">{fmt(totalIncl)}</td>
                                <td className="c">{fmtQ(p.DepreciationPct)}</td>
                                <td className="r">{fmt(p.DepAmount)}</td>
                            </tr>
                        );
                    })}
                    {parts.length === 0 && (
                        <tr><td colSpan={7} className="c empty">No parts with depreciation data on this Job Card.</td></tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="tot">
                        <td className="b">Total Items</td>
                        <td className="c b">{totals.items}</td>
                        <td className="c b">{fmt(totals.qty)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.total)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.dep)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Footer glued to bottom of last page (via margin-top:auto on the flex column). */}
            <div className="footer">
                <div className="terms">
                    <div className="terms-h">TERMS AND CONDITION</div>
                    <ol>
                        <li>Vehicle will be delivered to customer premises on his request in case of urgency case only. however, vehicle will be driver totally on customer risk &amp; cost.</li>
                        <li>Changan Multan Motors will not be held responsible for loss or damages to the vehicle or articles/belongings left in the vehicle in case of fire, theft, accident or any other case beyound the changan multan motors control.</li>
                        <li>No claims for unsatisfactory repair to vehicle under this repair order will be considered unless received by changan abc motors within five(5) days from the vehicle delivery under the repair order.</li>
                        <li>Customer agree to pay interest at the rate of 1% per month on all accounts and paid when due.</li>
                        <li>In case of litigation for non-payment of this repair order customer agrees submit himself to the jurisdiction of the courts.</li>
                    </ol>
                </div>
                <div className="sig">
                    <div className="sig-line"></div>
                    <div><strong>CUSTOMER SIGNATURE</strong></div>
                    <div className="sig-for">For: {companyName || 'CHANGAN MULTAN MOTORS'}</div>
                </div>
            </div>

            <style>{`
                /* ── A4 hard-sizing ──────────────────────────────────── */
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    margin: 0; padding: 0;
                    background: #e5e7eb;
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                @media print {
                    html, body { background: white !important; }
                }

                /* Dedicated wrapper — reset app-inherited styles so nothing
                   leaks in from cards / forms / inputs. */
                .jc-dep-print {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 8px auto;
                    padding: 8mm 9mm;
                    box-sizing: border-box;
                    background: white;
                    color: #000;
                    font-family: Arial, Tahoma, sans-serif;
                    font-size: 10pt;
                    line-height: 1.15;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.15);   /* preview only */
                }
                .jc-dep-print * { box-sizing: border-box; }
                .jc-dep-print table {
                    border-collapse: collapse;
                    width: 100%;
                    table-layout: fixed;
                }
                .jc-dep-print td, .jc-dep-print th { border: 1px solid #111; }

                @media print {
                    .jc-dep-print {
                        margin: 0;
                        box-shadow: none;
                    }
                }

                /* ── Top band (business header + dates) ─────────────── */
                .top {
                    display: table;
                    width: 100%;
                    border: 0;
                }
                .top .top-biz {
                    display: table-cell;
                    vertical-align: top;
                    border: 0;
                }
                .top .top-dates {
                    display: table-cell;
                    vertical-align: top;
                    text-align: right;
                    width: 40mm;
                    padding-top: 2mm;
                    font-size: 9pt;
                    white-space: nowrap;
                    border: 0;
                }
                .top .top-dates > div { padding: 0.4mm 0; }
                .top .top-dates label { font-weight: 700; margin-right: 1mm; }
                .top-biz .pbh { padding: 0; }

                /* ── Title bar ──────────────────────────────────────── */
                .title-bar {
                    margin: 3mm 0 2.5mm;
                    background: #f2f2f2;
                }
                .title-bar td {
                    padding: 2mm 3mm;
                    vertical-align: middle;
                    font-size: 10.5pt;
                }
                .title-bar .title-side { white-space: nowrap; }
                .title-bar .title-mid {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    font-style: italic;
                    font-weight: 700;
                    font-size: 13pt;
                    text-align: center;
                    color: #444;
                }
                .title-bar tr:nth-child(1) td:nth-child(3) { text-align: right; }

                /* ── Details table ──────────────────────────────────── */
                .details { margin-bottom: 3mm; }
                .details td {
                    padding: 2mm 1.5mm;
                    vertical-align: top;
                    line-height: 1.15;
                    /* Fully-visible values — long strings wrap onto the next
                       line within the same cell; nothing is ellipsised or
                       clipped and nothing bleeds into the next cell. */
                    overflow: visible;
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                }
                .details .lbl {
                    font-weight: 700;
                    background: #f5f5f5;
                    white-space: nowrap;      /* labels stay on one line */
                    color: #222;
                }

                /* ── Items table ────────────────────────────────────── */
                .items { margin-bottom: 3mm; }
                .items th, .items td {
                    padding: 1.8mm 2mm;
                    vertical-align: top;
                    line-height: 1.2;
                    overflow: visible;
                    white-space: normal;
                    word-break: break-word;
                    overflow-wrap: anywhere;
                }
                .items th {
                    background: #f2f2f2;
                    font-weight: 700;
                    text-align: left;
                    font-size: 9pt;
                    letter-spacing: 0.2px;
                    white-space: nowrap;
                }
                .items th.c, .items td.c { text-align: center; }
                .items th.r, .items td.r {
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                }
                .items td.mono {
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 9pt;
                }
                .items td.b { font-weight: 700; }
                .items td.empty {
                    padding: 14px;
                    color: #666;
                    font-style: italic;
                    text-align: center;
                }
                .items tfoot .tot { background: white; }
                .items tfoot .tot td:first-child {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    font-style: italic;
                    font-size: 10.5pt;
                    color: #666;
                }

                /* ── Footer (terms + signature) ─────────────────────── */
                .footer {
                    display: table;
                    width: 100%;
                    margin-top: auto;
                    padding-top: 5mm;
                    font-size: 8pt;
                    page-break-inside: avoid;
                }
                .footer .terms {
                    display: table-cell;
                    vertical-align: top;
                    width: auto;
                    padding-right: 6mm;
                }
                .footer .sig {
                    display: table-cell;
                    vertical-align: top;
                    width: 60mm;
                    text-align: center;
                }
                .terms .terms-h { font-weight: 700; font-size: 9.5pt; margin-bottom: 1mm; }
                .terms ol { margin: 0; padding-left: 4mm; }
                .terms li { padding: 0.4mm 0; }
                .sig .sig-line { border-top: 1px solid #000; margin: 8mm 3mm 1mm; }
                .sig .sig-for { margin-top: 6mm; }

                /* ── Print refinements ──────────────────────────────── */
                @media print {
                    .items thead { display: table-header-group; }
                    .items tfoot { display: table-row-group; }
                    tr { page-break-inside: avoid; }
                }
            `}</style>
        </div>
    );
}
