/**
 * Paint Issue print — internal document showing paint drawn against a JC.
 * Portrait A4, shared business header.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = v => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase() : '';

export default function PaintIssuePrint() {
    const { id } = useParams();
    const [g, setG]   = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/paint/issue/${id}/print-data`)
            .then(r => { setG(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!g)  return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const lines = g.Lines || [];
    const totals = lines.reduce((a, x) => ({
        qty: a.qty + Number(x.Quantity),
        line: a.line + Number(x.LineTotal),
    }), { qty: 0, line: 0 });

    return (
        <div className="paint-issue-print">
            <PrintBusinessHeader docTitle="Paint Issue — Internal Costing" showOnScreen />

            <div className="hdr">
                <div className="hdr-col">
                    <div><label>Job Card</label><span><strong>{g.JobCardNo}</strong>{g.JCFinalized ? ' · Finalized' : ''}</span></div>
                    <div><label>Vehicle</label><span>{g.VehicleRegNo || '—'}</span></div>
                    <div><label>Customer</label><span>{g.CustomerName || '—'}</span></div>
                    <div><label>Warehouse</label><span>{g.WHDesc}{g.WHCode ? ` (${g.WHCode})` : ''}</span></div>
                    <div><label>Remarks</label><span>{g.Remarks || '—'}</span></div>
                </div>
                <div className="hdr-col">
                    <div><label>Issue No</label><span><strong>{g.IssueNo}</strong></span></div>
                    <div><label>Date</label><span>{d(g.IssueDate)}</span></div>
                    <div><label>Status</label><span>{g.Locked ? 'Locked (JC finalized)' : 'Open'}</span></div>
                    <div><label>Total Cost</label><span><strong>{fmt(g.TotalCost)}</strong></span></div>
                </div>
            </div>

            <table className="items">
                <thead>
                    <tr>
                        <th>S#</th>
                        <th>Code</th>
                        <th>Paint Name</th>
                        <th>UOM</th>
                        <th>Qty</th>
                        <th>Unit Cost</th>
                        <th>Line Total</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => (
                        <tr key={i}>
                            <td className="c">{i + 1}</td>
                            <td className="mono">{l.PaintCode || ''}</td>
                            <td>{l.PaintName || ''}</td>
                            <td className="c">{l.UOMName || ''}</td>
                            <td className="r">{fmt(l.Quantity)}</td>
                            <td className="r">{fmt(l.IssueUnitCost)}</td>
                            <td className="r b">{fmt(l.LineTotal)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="tot">
                        <td colSpan={4} className="r b">Totals</td>
                        <td className="r b">{fmt(totals.qty)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.line)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="note">
                <strong>Note:</strong> This slip is an internal costing document. Paint drawn is not billed to the customer.
                The GL consumption voucher (Dr Paint Consumption / Cr Paint Inventory) is posted when Job Card {g.JobCardNo} finalizes.
            </div>

            <div className="sigs">
                <div className="sig"><div className="line" />Issued By</div>
                <div className="sig"><div className="line" />Received By (Painter)</div>
                <div className="sig"><div className="line" />Store Keeper</div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body { width: 210mm; margin: 0; background: white !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .paint-issue-print { font-family: Arial, sans-serif; color: #000;
                    font-size: 10px; max-width: 210mm; margin: 0 auto; padding: 8mm 5mm; box-sizing: border-box; }
                .hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 12px 0; font-size: 10px; }
                .hdr-col > div { display: grid; grid-template-columns: 110px 1fr; padding: 1px 0; }
                .hdr-col label { font-weight: 700; }
                .items { width: 100%; border-collapse: collapse; font-size: 10px; }
                .items th, .items td { border: 1px solid #999; padding: 3px 4px; vertical-align: middle; }
                .items th { background: #f4f4f4; font-weight: 700; text-align: center; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .items td.b { font-weight: 700; }
                .items td.mono { font-family: 'Courier New', monospace; font-size: 9px; }
                .items tfoot .tot td { background: #f4f4f4; }
                .note { margin: 10px 0; padding: 8px; background: #fefce8; border-left: 3px solid #eab308; font-size: 9px; }
                .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 24mm; font-size: 10px; text-align: center; }
                .sigs .line { border-top: 1px solid #000; margin-bottom: 4px; }
            `}</style>
        </div>
    );
}
