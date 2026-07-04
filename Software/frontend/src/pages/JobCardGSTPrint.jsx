/**
 * Job Card — GST Invoice print (owner ask 2026-07-05).
 *
 * Recreates the CamScanner sample: A4 portrait, compact old-software
 * invoice layout. Business header pulled from Business Profile via the
 * shared PrintBusinessHeader. Recipient block resolves insurance company
 * first, then party, then customer.
 *
 * Includes ONLY parts issued to the Job Card. TaxAmount snapshotted at
 * issue time is the GST for that line — no re-computation here.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../components/PrintBusinessHeader';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function JobCardGSTPrint() {
    const { id } = useParams();
    const [d, setD]     = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/workshop/job-cards/${id}/invoice-data`)
            .then(r => { setD(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!d)  return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const parts = d.Parts || [];
    const totalWoGST = parts.reduce((s, p) => s + Number(p.Amount || 0), 0);
    const totalGST   = parts.reduce((s, p) => s + Number(p.TaxAmount || 0), 0);
    const totalIncl  = totalWoGST + totalGST;
    // Rate to display next to "Total GST on Parts". Prefer the rate that
    // appears on the actual lines; fall back to the current configured rate.
    const linesRate = parts.find(p => Number(p.TaxRate) > 0)?.TaxRate;
    const shownRate = Number(linesRate ?? d.TaxRates?.GSTRate ?? 0);

    return (
        <div className="tax-invoice">
            {/* Two-column header: business band left, big INVOICE title right */}
            <div className="head">
                <div className="head-biz"><PrintBusinessHeader showOnScreen /></div>
                <div className="head-title">GST<br/>INVOICE</div>
            </div>

            {/* Recipient table */}
            <table className="party">
                <tbody>
                    <tr>
                        <td className="lbl">Company Name</td>
                        <td className="val">{d.Recipient?.name || ''}</td>
                        <td className="lbl">Invoice #</td>
                        <td className="val" colSpan={2}>{d.InvoiceNo}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Address</td>
                        <td className="val">{d.Recipient?.address || ''}</td>
                        <td className="lbl">GST NO</td>
                        <td className="val">{d.Recipient?.gst || ''}</td>
                        <td className="lbl">NTN NO</td>
                    </tr>
                </tbody>
            </table>

            {/* Parts table */}
            <table className="items">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'center' }}>Parts</th>
                        <th style={{ width: 60, textAlign: 'center' }}>Qty</th>
                        <th style={{ width: 140, textAlign: 'center' }}>Amount w/o Gst</th>
                        <th style={{ width: 140, textAlign: 'center' }}>Total w/o Gst</th>
                    </tr>
                </thead>
                <tbody>
                    {parts.map(p => (
                        <tr key={p.LineID}>
                            <td className="pname">{p.ItemName || ''}</td>
                            <td className="c">{Number(p.Qty).toLocaleString('en-PK')}</td>
                            <td className="r">{fmt(Number(p.UnitRate))}</td>
                            <td className="r">{fmt(Number(p.Amount))}</td>
                        </tr>
                    ))}
                    {parts.length === 0 && (
                        <tr>
                            <td colSpan={4} className="c empty">No parts on this Job Card.</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {/* Totals — three rows, bold labels + right-aligned amounts */}
            <table className="totals">
                <tbody>
                    <tr>
                        <td className="lbl">Total Parts Amount Without GST</td>
                        <td className="r">{fmt(totalWoGST)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Total GST on Parts &nbsp;&nbsp; {shownRate.toFixed(0)} %</td>
                        <td className="r">{fmt(totalGST)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Total Parts including GST</td>
                        <td className="r">{fmt(totalIncl)}</td>
                    </tr>
                </tbody>
            </table>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    width: 210mm; margin: 0; background: white !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .tax-invoice {
                    font-family: Arial, Tahoma, sans-serif;
                    color: #000;
                    max-width: 210mm;
                    margin: 0 auto;
                    padding: 10mm 8mm 8mm;
                    box-sizing: border-box;
                    font-size: 11px;
                }
                /* Head band — business block on the left, big italic title right */
                .head {
                    display: grid;
                    grid-template-columns: 1fr 130px;
                    gap: 10px;
                    align-items: flex-start;
                    margin-bottom: 6px;
                }
                .head-biz .pbh { padding: 0; }
                .head-title {
                    font-family: 'Arial Black', Arial, sans-serif;
                    font-style: italic;
                    font-size: 22px;
                    font-weight: 800;
                    text-align: right;
                    line-height: 1.05;
                    letter-spacing: 0.5px;
                    color: #333;
                    padding-top: 4px;
                }
                /* Recipient block */
                .party {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 4px;
                    font-size: 11px;
                }
                .party td { border: 1px solid #000; padding: 3px 6px; }
                .party td.lbl { font-weight: 700; background: #f2f2f2; white-space: nowrap; }
                .party td.val { min-width: 90px; }
                /* Parts items table */
                .items {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                .items th, .items td { border: 1px solid #000; padding: 3px 6px; vertical-align: middle; }
                .items th { background: #f2f2f2; font-weight: 700; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .items td.pname { font-weight: 600; text-transform: uppercase; }
                .items td.empty { padding: 14px; color: #666; font-style: italic; }
                /* Totals footer */
                .totals {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                    margin-top: 0;
                }
                .totals td { border: 1px solid #000; padding: 4px 8px; }
                .totals td.lbl { font-weight: 700; background: #f2f2f2; }
                .totals td.r { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; width: 140px; }
            `}</style>
        </div>
    );
}
