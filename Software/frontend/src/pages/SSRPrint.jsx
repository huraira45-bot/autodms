import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintShell, { fmtMoney as fmt, fmtDate, toWords } from '../components/PrintShell';

export default function SSRPrint() {
    const { id } = useParams();
    const [s, setS] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/sales/ssr/${id}/print-data`)
            .then(r => { setS(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!s) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const items = s.Items || [];
    const totalReturn = Number(s.TotalReturnAmount) || items.reduce((sum, i) => sum + Number(i.Quantity || 0) * Number(i.SaleRate || 0), 0);
    const taxRefund   = Number(s.TotalTaxReturn) || 0;
    const discRev     = Number(s.TotalDiscReturn) || 0;
    const net         = Number(s.NetRefund) || (totalReturn + taxRefund - discRev);

    return (
        <PrintShell
            docTitle="Sale Return Voucher"
            metaPairs={[
                { label: 'SIR #',  value: s.ReturnNo || `#${s.ReturnID}`, highlight: true },
                { label: 'Date',   value: fmtDate(s.ReturnDate) },
                ...(s.OriginalSaleID ? [{ label: 'Original Sale ID', value: s.OriginalSaleID }] : []),
            ]}
            sigLabels={['Authorized Signature', 'Customer Signature']}
            footnote={
                <>
                    <b>* This document acknowledges receipt of the returned items listed above.</b><br/>
                    <b>* Refund mode: {s.RefundMode || 'Cash'}.</b> Stock has been restated to the warehouse.<br/>
                    <b>* No further claim against the original invoice will be considered for the items returned here.</b>
                </>
            }
        >
            <div className="ps-cust-row">
                <div><b>Customer:</b>&nbsp;&nbsp;{s.CustomerName || '—'}</div>
                <div><b>Processed By:</b>&nbsp;{s.CreatedByName || '—'}</div>
            </div>
            {s.Remarks && (
                <div className="ps-extras">
                    <span><b>Reason:</b> {s.Remarks}</span>
                </div>
            )}

            <table className="ps-items">
                <thead>
                    <tr>
                        <th style={{ width: '14%' }}>Item Code</th>
                        <th>Item Name</th>
                        <th style={{ width: '8%',  textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Rate</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>Tax</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>Disc.</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Refund</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td style={{ fontFamily: 'monospace' }}>{it.ItemNumber || ''}</td>
                            <td>{it.ItenName || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(it.Quantity || 0).toFixed(0)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.SaleRate)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.TaxAmount)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.DiscountAmount)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.NetAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="ps-no-more">NO ITEM BELOW THIS AREA.</div>

            <div className="ps-totals-row">
                <div className="ps-words">
                    <div><b>Refund Amount In Words:</b></div>
                    <div className="ps-words-val">{toWords(net)}</div>
                </div>
                <table className="ps-totals">
                    <tbody>
                        <tr><td>Base Return:</td><td>RS. {fmt(totalReturn)}</td></tr>
                        {taxRefund > 0 && <tr><td>Tax Refund:</td><td>RS. {fmt(taxRefund)}</td></tr>}
                        {discRev > 0 && <tr><td>Discount Reversed:</td><td>RS. -{fmt(discRev)}</td></tr>}
                        <tr className="ps-net"><td>Net Refund:</td><td>RS. {fmt(net)}</td></tr>
                    </tbody>
                </table>
            </div>
        </PrintShell>
    );
}
