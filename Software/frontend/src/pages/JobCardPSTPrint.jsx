/**
 * Job Card — PST Invoice print (owner ask 2026-07-05).
 *
 * Recreates the sample: A4 portrait, compact invoice with a single
 * "Job Description & Remarks" cell + Total Labour column. Business
 * header pulled from Business Profile via PrintBusinessHeader.
 *
 * Includes ONLY labour/service lines. TaxAmount snapshotted at save
 * time is the PST for that line — no re-computation here.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../components/PrintBusinessHeader';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function JobCardPSTPrint() {
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

    const labour = d.Labour || [];
    // The sample shows a single "Job Description & Remarks" cell with the
    // total labour on the right — matching that layout: aggregate labour
    // amount + description block. If labour lines have their own remarks,
    // fall through to show each line stacked; the header JobDescription is
    // used as the top-of-block estimate reference.
    const totalWoPST = labour.reduce((s, l) => s + Number(l.Amount || 0), 0);
    const totalPST   = labour.reduce((s, l) => s + Number(l.TaxAmount || 0), 0);
    const totalIncl  = totalWoPST + totalPST;
    const linesRate  = labour.find(l => Number(l.TaxRate) > 0)?.TaxRate;
    const shownRate  = Number(linesRate ?? d.TaxRates?.PSTRate ?? 0);

    // Description: prefer the JC.Remarks-style block; else concat per-line
    // remarks; else "AS PER ESTIMATE …" fallback.
    const descLines = [];
    if (d.JobDescription) descLines.push(d.JobDescription);
    for (const l of labour) {
        const t = (l.Description || '').trim();
        if (t && !descLines.includes(t)) descLines.push(t);
    }

    return (
        <div className="tax-invoice">
            <div className="head">
                <div className="head-biz"><PrintBusinessHeader showOnScreen /></div>
                <div className="head-title">PST<br/>INVOICE</div>
            </div>

            <table className="party">
                <colgroup>
                    <col style={{ width: '15%' }} /><col style={{ width: '22%' }} />
                    <col style={{ width: '13%' }} /><col style={{ width: '18%' }} />
                    <col style={{ width: '13%' }} /><col style={{ width: '19%' }} />
                </colgroup>
                <tbody>
                    <tr>
                        <td className="lbl">Company Name</td>
                        <td className="val" colSpan={3}>{d.Recipient?.name || ''}</td>
                        <td className="lbl">Invoice #</td>
                        <td className="val">{d.InvoiceNo}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Address</td>
                        <td className="val">{d.Recipient?.address || ''}</td>
                        <td className="lbl">GST NO</td>
                        <td className="val">{d.Recipient?.gst || ''}</td>
                        <td className="lbl">NTN NO</td>
                        <td className="val">{d.Recipient?.ntn || ''}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Phone</td>
                        <td className="val">{d.Recipient?.phone || ''}</td>
                        <td className="lbl">CNIC</td>
                        <td className="val" colSpan={3}>{d.Recipient?.cnic || ''}</td>
                    </tr>
                    {(d.Recipient?.contactPerson || d.Recipient?.contactMobile || d.Recipient?.email) && (
                        <tr>
                            <td className="lbl">Contact</td>
                            <td className="val">
                                {[d.Recipient?.contactPerson, d.Recipient?.contactMobile].filter(Boolean).join(' · ')}
                            </td>
                            <td className="lbl">Email</td>
                            <td className="val" colSpan={3}>{d.Recipient?.email || ''}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <table className="items">
                <thead>
                    <tr>
                        <th style={{ textAlign: 'center' }}>Job Description &amp; Remarks</th>
                        <th style={{ width: 140, textAlign: 'center' }}>Total Labour</th>
                    </tr>
                </thead>
                <tbody>
                    {labour.length === 0 ? (
                        <tr><td colSpan={2} className="c empty">No labour or service lines on this Job Card.</td></tr>
                    ) : (
                        <tr>
                            <td className="desc">
                                {descLines.length
                                    ? descLines.map((t, i) => <div key={i}>{t.toUpperCase()}</div>)
                                    : ''}
                            </td>
                            <td className="r">{fmt(totalWoPST)}</td>
                        </tr>
                    )}
                </tbody>
            </table>

            <table className="totals">
                <tbody>
                    <tr>
                        <td className="lbl">Total Amount Without PST on Services</td>
                        <td className="r">{fmt(totalWoPST)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Total {shownRate.toFixed(0)}% PST on Services</td>
                        <td className="r">{fmt(totalPST)}</td>
                    </tr>
                    <tr>
                        <td className="lbl">Total Amount including PST on Services</td>
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
                .party {
                    width: 100%;
                    border-collapse: collapse;
                    margin-bottom: 4px;
                    font-size: 11px;
                }
                .party td { border: 1px solid #000; padding: 3px 6px; }
                .party td.lbl { font-weight: 700; background: #f2f2f2; white-space: nowrap; }
                .party td.val { min-width: 90px; }
                .items {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                .items th, .items td { border: 1px solid #000; padding: 3px 6px; vertical-align: top; }
                .items th { background: #f2f2f2; font-weight: 700; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; vertical-align: top; }
                .items td.desc { min-height: 60px; padding: 6px; }
                .items td.desc > div { padding: 1px 0; }
                .items td.empty { padding: 14px; color: #666; font-style: italic; }
                .totals {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 11px;
                }
                .totals td { border: 1px solid #000; padding: 4px 8px; }
                .totals td.lbl { font-weight: 700; background: #f2f2f2; }
                .totals td.r { text-align: right; font-weight: 700; font-variant-numeric: tabular-nums; width: 140px; }
            `}</style>
        </div>
    );
}
