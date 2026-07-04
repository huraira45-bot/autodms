/**
 * Job Card — Issue Spares With Depreciation print (owner ask 2026-07-05).
 *
 * Matches the sample dep.pdf layout:
 *   - Business band (left) + Print Date / Date In (right)
 *   - RO# / big italic title / Status
 *   - Customer / Vehicle / Color / Engine
 *   - Party / Company (broker) / Reg# / Chassis#
 *   - Parts-only table with ItemNumber, Item Name, Qty, SalesRate,
 *     Total Amount, Dep %, Dep Amount
 *   - Totals row (Total Items count + Qty / Total / Dep sums)
 *   - Terms & conditions + signature block
 *
 * Labour lines are EXCLUDED per owner spec — this slip is only for the
 * parts issued to the insurance-JC (that's what depreciates).
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../components/PrintBusinessHeader';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 1, maximumFractionDigits: 2 });
const fmtQ = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const d   = v => v ? new Date(v).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' }) : '';

export default function JobCardDepreciationPrint() {
    const { id } = useParams();
    const [jc, setJc]           = useState(null);
    const [insurance, setIns]   = useState(null);
    const [err, setErr]         = useState(null);

    useEffect(() => {
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

    // Insurance endpoint returns parts + labour combined in `parts` with a
    // LineType field. Filter to parts only per owner spec.
    const parts = (insurance.parts || []).filter(p => p.LineType === 'Part');

    const totals = parts.reduce((a, p) => ({
        items: a.items + 1,
        qty:   a.qty   + Number(p.Qty || 0),
        total: a.total + Number(p.TotalAmount || 0),
        dep:   a.dep   + Number(p.DepAmount || 0),
    }), { items: 0, qty: 0, total: 0, dep: 0 });

    // Vehicle description built from whatever the view exposes. vw_WorkshopJobCards
    // has BrandName / VersionName / ModelName variants across setups; fall back
    // sensibly.
    const vehicleName = jc.VehicleName
        || [jc.BrandName, jc.VersionName || jc.ModelName].filter(Boolean).join(' ')
        || jc.Vehicle
        || '';

    const rowStatus = jc.IsFinalized ? 'Complete' : (jc.Status || 'Open');

    return (
        <div className="dep-print">
            {/* Top band — business info left, print + entry date right */}
            <div className="top">
                <div className="top-biz"><PrintBusinessHeader showOnScreen /></div>
                <div className="top-dates">
                    <div><label>Print Date:</label><span>{d(new Date())}</span></div>
                    <div><label>Date in:</label><span>{d(jc.JobCardDate)}</span></div>
                </div>
            </div>

            {/* Title bar — RO# / Title / Status */}
            <div className="title-bar">
                <div><label>RO#</label><span>{jc.jobCode || jc.JobCardNo || ''}</span></div>
                <div className="title-text">Issue Spares With Depreciation</div>
                <div><label>Status</label><span>{rowStatus}</span></div>
            </div>

            {/* Party info block */}
            <table className="party">
                <colgroup>
                    <col style={{ width: '14%' }}/><col style={{ width: '22%' }}/>
                    <col style={{ width: '8%' }}/><col style={{ width: '22%' }}/>
                    <col style={{ width: '8%' }}/><col style={{ width: '13%' }}/>
                    <col style={{ width: '8%' }}/><col style={{ width: 'auto' }}/>
                </colgroup>
                <tbody>
                    <tr>
                        <td className="lbl">Customer Name:</td>
                        <td className="val">{jc.CustomerName || jc.PartyName || ''}</td>
                        <td className="lbl">Vehicle:</td>
                        <td className="val">{vehicleName}</td>
                        <td className="lbl">Color:</td>
                        <td className="val">{jc.VehicleColor || ''}</td>
                        <td className="lbl">Engine#</td>
                        <td className="val">{jc.EngineNo || ''}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Party</td>
                        <td className="val">{insurance.header?.CompanyName || ''}</td>
                        <td className="lbl">Compay</td>
                        <td className="val">{jc.PartyName || ''}</td>
                        <td className="lbl">Reg #</td>
                        <td className="val">{jc.VehicleRegNo || ''}</td>
                        <td className="lbl">Chasis #</td>
                        <td className="val">{jc.ChasisNo || ''}</td>
                    </tr>
                </tbody>
            </table>

            {/* Line items — parts only */}
            <table className="items">
                <thead>
                    <tr>
                        <th style={{ width: 140 }}>ItemNumber</th>
                        <th>Item Name</th>
                        <th style={{ width: 55 }}>Qty</th>
                        <th style={{ width: 90 }}>SalesRate</th>
                        <th style={{ width: 110 }}>Total Amount</th>
                        <th style={{ width: 55 }}>Dep %</th>
                        <th style={{ width: 90 }}>Dep Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map((p, i) => (
                        <tr key={i}>
                            <td className="mono">{p.ItemNumber || ''}</td>
                            <td>{p.ItemName || ''}</td>
                            <td className="r">{fmt(p.Qty)}</td>
                            <td className="r">{fmt(p.Rate)}</td>
                            <td className="r">{fmt(p.TotalAmount)}</td>
                            <td className="r">{fmtQ(p.DepreciationPct)}</td>
                            <td className="r">{fmt(p.DepAmount)}</td>
                        </tr>
                    ))}
                    {parts.length === 0 && (
                        <tr><td colSpan={7} className="c empty">No parts issued to this Job Card.</td></tr>
                    )}
                </tbody>
                <tfoot>
                    <tr className="tot">
                        <td className="b">Total Items</td>
                        <td className="c b">{totals.items}</td>
                        <td className="c b box">{fmt(totals.qty)}</td>
                        <td></td>
                        <td className="c b box">{fmt(totals.total)}</td>
                        <td></td>
                        <td className="c b box">{fmt(totals.dep)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Footer — terms + signature */}
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
                    <div className="sig-for">For: CHANGAN MULTAN MOTORS</div>
                </div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    width: 210mm; margin: 0; background: white !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .dep-print {
                    font-family: Arial, Tahoma, sans-serif;
                    color: #000;
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 8mm 6mm 6mm;
                    box-sizing: border-box;
                    font-size: 10px;
                }
                .top { display: grid; grid-template-columns: 1fr 130px; gap: 8px; align-items: flex-start; }
                .top-biz .pbh { padding: 0; }
                .top-dates { font-size: 10px; text-align: right; padding-top: 4px; }
                .top-dates > div { padding: 1px 0; }
                .top-dates label { font-weight: 700; margin-right: 4px; }
                .title-bar {
                    display: grid;
                    grid-template-columns: 200px 1fr 130px;
                    gap: 8px;
                    align-items: center;
                    margin: 6px 0 6px;
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
                .party {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 4px;
                    font-size: 10px;
                }
                .party td { border: 1px solid #000; padding: 2px 5px; vertical-align: middle; }
                .party td.lbl { font-weight: 700; background: #fafafa; white-space: nowrap; }
                .items {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 10px;
                }
                .items th, .items td { border: 1px solid #000; padding: 3px 5px; vertical-align: middle; }
                .items th { background: #f2f2f2; font-weight: 700; text-align: left; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .items td.b { font-weight: 700; }
                .items td.mono { font-family: 'Consolas', 'Courier New', monospace; font-size: 9.5px; }
                .items td.empty { padding: 14px; color: #666; font-style: italic; }
                .items tfoot .tot { background: white; }
                .items tfoot .tot td.box { border: 2px solid #000; }
                .items tfoot .tot td:first-child {
                    font-family: 'Georgia', 'Times New Roman', serif;
                    font-style: italic;
                    font-size: 11px;
                    color: #666;
                }
                .footer {
                    display: grid;
                    grid-template-columns: 1fr 200px;
                    gap: 20px;
                    margin-top: 28mm;
                    font-size: 8.5px;
                }
                .terms .terms-h { font-weight: 700; font-size: 10px; margin-bottom: 3px; }
                .terms ol { margin: 0; padding-left: 16px; }
                .terms li { padding: 1px 0; }
                .sig { text-align: center; }
                .sig .sig-line { border-top: 1px solid #000; margin: 24px 8px 4px; }
                .sig .sig-for { margin-top: 20px; }
            `}</style>
        </div>
    );
}
