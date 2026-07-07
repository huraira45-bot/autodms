/**
 * Job Card — Issue Spares With Depreciation print.
 * Matches C:\Users\ServerDeskop\Desktop\dep.pdf (owner ask 2026-07-05).
 *
 * Rules enforced here (per spec):
 *   - Includes ONLY spare parts that carry depreciation data
 *     (DepAmount > 0 or DepreciationPct > 0). Labour is skipped.
 *   - Numeric columns right-aligned; ItemNumber monospace + ellipsis;
 *     ItemName wraps within column, no overflow past page edge.
 *   - A4 portrait, no card / shadow / colored UI chrome.
 *   - Footer (terms + signature) glued near the bottom of the last page:
 *     the whole page is a flex column so `.footer { margin-top: auto }`
 *     pushes it down for short lists, and the browser's natural page
 *     break still relocates it to page 2/3 when the line list spills.
 *   - Business band is the shared PrintBusinessHeader (Business Profile);
 *     no company name / address / NTN / GST hard-coded.
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

    // Vehicle description — vw_WorkshopJobCards exposes different fields
    // depending on the setup; try the common ones and fall back to blank.
    const vehicleName = jc.VehicleName
        || [jc.BrandName, jc.VersionName || jc.ModelName].filter(Boolean).join(' ')
        || jc.Vehicle
        || '';

    const rowStatus = jc.IsFinalized ? 'Complete' : (jc.Status || 'Open');
    const companyName = profile?.CompanyName || '';

    return (
        <div className="dep-print-page">
            {/* Top band — shared business header (logo left, company centered)
                with the Print Date + Date In stacked at the top-right. */}
            <div className="top">
                <div className="top-biz"><PrintBusinessHeader showOnScreen /></div>
                <div className="top-dates">
                    <div><label>Print Date:</label><span>{d(new Date())}</span></div>
                    <div><label>Date in:</label><span>{d(jc.JobCardDate)}</span></div>
                </div>
            </div>

            {/* Title bar */}
            <div className="title-bar">
                <div><label>RO#</label><span>{jc.jobCode || jc.JobCardNo || ''}</span></div>
                <div className="title-text">Issue Spares With Depreciation</div>
                <div><label>Status</label><span>{rowStatus}</span></div>
            </div>

            {/* Header field block — customer / vehicle / insurance / IDs.
                Fixed 8-col grid (4 label/value pairs per row). Labels are
                bold and fixed-width; values wrap freely so long chassis /
                engine / company names never get ellipsised. */}
            <table className="party">
                <colgroup>
                    <col style={{ width: '11%' }}/><col style={{ width: '14%' }}/>
                    <col style={{ width: '9%' }}/><col style={{ width: '19%' }}/>
                    <col style={{ width: '7%' }}/><col style={{ width: '14%' }}/>
                    <col style={{ width: '9%' }}/><col style={{ width: '17%' }}/>
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
                        <td className="val">{insurance.header?.CompanyName || ''}</td>
                        <td className="lbl">Company:</td>
                        <td className="val">{jc.PartyName || ''}</td>
                        <td className="lbl">Reg #:</td>
                        <td className="val">{jc.VehicleRegNo || ''}</td>
                        <td className="lbl">Chassis #:</td>
                        <td className="val">{jc.ChasisNo || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Line items — parts with depreciation only.
                Column widths (spec): 20 / 28 / 8 / 13 / 15 / 7 / 13 %. */}
            <table className="items">
                <colgroup>
                    <col style={{ width: '20%' }}/>
                    <col style={{ width: '28%' }}/>
                    <col style={{ width: '8%' }}/>
                    <col style={{ width: '13%' }}/>
                    <col style={{ width: '15%' }}/>
                    <col style={{ width: '7%' }}/>
                    <col style={{ width: '13%' }}/>
                </colgroup>
                <thead>
                    <tr>
                        <th>ItemNumber</th>
                        <th>Item Name</th>
                        <th className="c">Qty</th>
                        <th className="r">SalesRate</th>
                        <th className="r">Total Amount</th>
                        <th className="c">Dep %</th>
                        <th className="r">Dep Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map((p, i) => {
                        const qty = Number(p.Qty) || 0;
                        const totalIncl = Number(p.TotalWithTax) || 0;
                        const rateIncl  = qty > 0 ? totalIncl / qty : Number(p.Rate) || 0;
                        return (
                        <tr key={i}>
                            <td className="mono wrap">{p.ItemNumber || ''}</td>
                            <td className="wrap">{p.ItemName || ''}</td>
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
                        <td className="c b box">{fmt(totals.qty)}</td>
                        <td></td>
                        <td className="r b box">{fmt(totals.total)}</td>
                        <td></td>
                        <td className="r b box">{fmt(totals.dep)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Footer — terms bottom-left, signature bottom-right. `margin-top:
                auto` keeps it glued to the bottom of the last page even for
                short line lists; long lists let the browser page-break
                naturally and the footer lands on the final page. */}
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
                /* ── A4 page hard-sizing ─────────────────────────────── */
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    margin: 0; padding: 0;
                    background: #e5e7eb;               /* soft grey around the sheet on screen */
                    -webkit-print-color-adjust: exact;
                    print-color-adjust: exact;
                }
                @media print {
                    html, body { background: white !important; }
                }
                /* Full A4 sheet — flex column so the footer glues to the bottom
                   of the last page for short lists, and browser page-break
                   relocates it to page 2 when the row list spills over. */
                .dep-print-page {
                    width: 210mm;
                    min-height: 297mm;
                    margin: 8px auto;                  /* screen preview only */
                    padding: 8mm 9mm;
                    box-sizing: border-box;
                    background: white;
                    color: #000;
                    font-family: Arial, Tahoma, sans-serif;
                    font-size: 10px;
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.15);  /* screen preview only */
                }
                @media print {
                    .dep-print-page {
                        margin: 0;
                        box-shadow: none;
                        width: 210mm;
                        min-height: 297mm;
                    }
                }

                /* ── Header band ─────────────────────────────────────── */
                /* Give the business band all the room it needs — the dates
                   block is narrow enough not to squeeze the company header. */
                .top {
                    display: grid;
                    grid-template-columns: 1fr 100px;
                    gap: 10px;
                    align-items: flex-start;
                }
                .top-biz .pbh { padding: 0; }
                .top-dates {
                    font-size: 10px;
                    text-align: right;
                    padding-top: 4px;
                    white-space: nowrap;
                }
                .top-dates > div { padding: 1px 0; }
                .top-dates label { font-weight: 700; margin-right: 4px; }

                /* Title bar */
                .title-bar {
                    display: grid;
                    grid-template-columns: 200px 1fr 130px;
                    gap: 8px;
                    align-items: center;
                    margin: 6px 0;
                    padding: 4px 8px;
                    background: #f2f2f2;
                    border: 1px solid #000;
                }
                .title-bar > div { display: flex; align-items: center; gap: 6px; font-size: 11px; }
                .title-bar label { font-weight: 700; }
                .title-text {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    font-style: italic;
                    font-weight: 700;
                    font-size: 17px;
                    text-align: center;
                    color: #444;
                }

                /* Party header block — values wrap; NO ellipsis in print. */
                .party {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 4px;
                    font-size: 9.5px;
                    table-layout: fixed;
                }
                .party td {
                    border: 1px solid #000;
                    padding: 2px 4px;
                    vertical-align: top;
                    /* Long chassis / engine / company strings must wrap onto
                       a second line instead of being ellipsised. */
                    overflow: visible;
                    text-overflow: clip;
                    white-space: normal;
                    word-break: break-word;
                    line-height: 1.25;
                }
                .party td.lbl {
                    font-weight: 700;
                    background: #fafafa;
                    white-space: nowrap;    /* labels themselves stay on one line */
                    color: #333;
                }
                .party td.val { min-height: 14px; }

                /* ── Items table — spec column widths ────────────────── */
                .items {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                    table-layout: fixed;
                }
                .items th, .items td {
                    border: 1px solid #000;
                    padding: 3px 5px;
                    vertical-align: middle;
                }
                .items th { background: #f2f2f2; font-weight: 700; text-align: left; }
                .items th.c, .items td.c { text-align: center; }
                .items th.r, .items td.r {
                    text-align: right;
                    font-variant-numeric: tabular-nums;
                    white-space: nowrap;
                }
                .items td.b { font-weight: 700; }
                .items td.mono {
                    font-family: 'Consolas', 'Courier New', monospace;
                    font-size: 9.5px;
                }
                /* Never truncate values in print — wrap onto the next line. */
                .items td.wrap {
                    overflow: visible;
                    word-break: break-word;
                    white-space: normal;
                    line-height: 1.25;
                    vertical-align: top;
                }
                .items td.empty {
                    padding: 14px;
                    color: #666;
                    font-style: italic;
                    text-align: center;
                }
                .items tfoot .tot { background: white; }
                .items tfoot .tot td.box { border: 2px solid #000; }
                .items tfoot .tot td:first-child {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    font-style: italic;
                    font-size: 11px;
                    color: #666;
                }

                /* ── Footer glued to bottom of the last page ─────────── */
                .footer {
                    display: grid;
                    grid-template-columns: 1fr 220px;
                    gap: 20px;
                    margin-top: auto;                   /* pushes to bottom in flex column */
                    padding-top: 6mm;
                    font-size: 8.5px;
                    page-break-inside: avoid;
                }
                .terms .terms-h { font-weight: 700; font-size: 10px; margin-bottom: 3px; }
                .terms ol { margin: 0; padding-left: 16px; }
                .terms li { padding: 1px 0; }
                .sig { text-align: center; }
                .sig .sig-line { border-top: 1px solid #000; margin: 24px 8px 4px; }
                .sig .sig-for { margin-top: 20px; }

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
