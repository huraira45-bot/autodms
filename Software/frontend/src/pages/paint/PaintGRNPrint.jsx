/**
 * Paint GRN print — shared business header + supplier block + line table.
 * Portrait A4. Auto-triggers window.print() once data is loaded.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintBusinessHeader from '../../components/PrintBusinessHeader';
import { getBusinessProfile } from '../../utils/businessProfile';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = v => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase() : '';

export default function PaintGRNPrint() {
    const { id } = useParams();
    const [g, setG]         = useState(null);
    const [err, setErr]     = useState(null);
    const [profile, setP]   = useState(null);

    useEffect(() => {
        getBusinessProfile().then(setP);
        axios.get(`/api/paint/grn/${id}/print-data`)
            .then(r => { setG(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!g)  return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const lines = g.Lines || [];
    const totals = lines.reduce((a, x) => ({
        qty:  a.qty  + Number(x.Quantity),
        sub:  a.sub  + Number(x.Quantity) * Number(x.UnitRate),
        disc: a.disc + Number(x.DiscountAmt),
        gst:  a.gst  + Number(x.GSTAmount),
        line: a.line + Number(x.LineTotal),
    }), { qty: 0, sub: 0, disc: 0, gst: 0, line: 0 });

    const buyerName    = profile?.CompanyName || '';
    const buyerAddress = [profile?.Address1, profile?.Address2, profile?.City, profile?.Country].filter(Boolean).join(', ');
    const buyerNTN     = profile?.NTN  || '—';
    const buyerSTRN    = profile?.STRN || '—';

    return (
        <div className="paint-grn-print">
            <PrintBusinessHeader docTitle="Paint Purchase Voucher" showOnScreen />

            <div className="hdr">
                <div className="hdr-col">
                    <div><label>Supplier</label><span>{g.PartyName || ''}</span></div>
                    <div><label>Supplier Bill No</label><span>{g.SupplierBillNo || '—'}</span></div>
                    <div><label>Warehouse</label><span>{g.WHDesc}{g.WHCode ? ` (${g.WHCode})` : ''}</span></div>
                    <div><label>Remarks</label><span>{g.Remarks || '—'}</span></div>
                </div>
                <div className="hdr-col">
                    <div><label>GRN No</label><span><strong>{g.GRNNo}</strong></span></div>
                    <div><label>Date</label><span>{d(g.GRNDate)}</span></div>
                    <div><label>Buyer</label><span>{buyerName}</span></div>
                    <div><label>Address</label><span>{buyerAddress}</span></div>
                    <div><label>STRN</label><span>{buyerSTRN}</span></div>
                    <div><label>NTN</label><span>{buyerNTN}</span></div>
                    <div><label>Voucher #</label><span>{g.VoucherNo || (g.Status === 'Draft' ? 'Not posted' : '—')}</span></div>
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
                        <th>Rate</th>
                        <th>Disc %</th>
                        <th>Disc Amt</th>
                        <th>GST %</th>
                        <th>GST Amt</th>
                        <th>Line Total</th>
                    </tr>
                </thead>
                <tbody>
                    {lines.map((l, i) => {
                        const gross = Number(l.Quantity) * Number(l.UnitRate);
                        return (
                            <tr key={i}>
                                <td className="c">{i + 1}</td>
                                <td className="mono">{l.PaintCode || ''}</td>
                                <td>{l.PaintName || ''}</td>
                                <td className="c">{l.UOMName || ''}</td>
                                <td className="r">{fmt(l.Quantity)}</td>
                                <td className="r">{fmt(l.UnitRate)}</td>
                                <td className="r">{Number(l.DiscountPct).toFixed(2)}</td>
                                <td className="r">{fmt(l.DiscountAmt)}</td>
                                <td className="r">{l.GSTOn ? Number(l.GSTRate).toFixed(2) : '—'}</td>
                                <td className="r">{fmt(l.GSTAmount)}</td>
                                <td className="r b">{fmt(l.LineTotal)}</td>
                            </tr>
                        );
                    })}
                </tbody>
                <tfoot>
                    <tr className="tot">
                        <td colSpan={4} className="r b">Totals</td>
                        <td className="r b">{fmt(totals.qty)}</td>
                        <td></td>
                        <td></td>
                        <td className="r b">{fmt(totals.disc)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.gst)}</td>
                        <td className="r b">{fmt(totals.line)}</td>
                    </tr>
                </tfoot>
            </table>

            <div className="sigs">
                <div className="sig"><div className="line" />Received By</div>
                <div className="sig"><div className="line" />Verified By</div>
                <div className="sig"><div className="line" />Authorized By</div>
            </div>

            <style>{`
                @page { size: A4 portrait; margin: 0; }
                html, body {
                    width: 210mm; margin: 0; background: white !important;
                    -webkit-print-color-adjust: exact; print-color-adjust: exact;
                }
                .paint-grn-print {
                    font-family: Arial, sans-serif; color: #000;
                    font-size: 9px; max-width: 210mm;
                    margin: 0 auto; padding: 8mm 5mm; box-sizing: border-box;
                }
                .hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin: 12px 0; font-size: 10px; }
                .hdr-col > div { display: grid; grid-template-columns: 110px 1fr; padding: 1px 0; }
                .hdr-col label { font-weight: 700; }
                .items { width: 100%; border-collapse: collapse; font-size: 9px; }
                .items th, .items td { border: 1px solid #999; padding: 3px 4px; vertical-align: middle; }
                .items th { background: #f4f4f4; font-weight: 700; text-align: center; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .items td.b { font-weight: 700; }
                .items td.mono { font-family: 'Courier New', monospace; font-size: 8.5px; }
                .items tfoot .tot td { background: #f4f4f4; }
                .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 28mm; font-size: 10px; text-align: center; }
                .sigs .line { border-top: 1px solid #000; margin-bottom: 4px; }
            `}</style>
        </div>
    );
}
