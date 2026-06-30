import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintShell, { fmtMoney as fmt, fmtDate, toWords } from '../components/PrintShell';

export default function GRNPrint() {
    const { id } = useParams();
    const [g, setG] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/procurement/grn/${id}/print-data`)
            .then(r => { setG(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!g) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const items = g.Items || [];
    const itemsTotal = items.reduce((s, i) => s + Number(i.NetAmount || 0), 0);
    const discount = Number(g.NetDiscount) || items.reduce((s, i) => s + Number(i.DiscountAmount || 0), 0);
    const freight  = Number(g.FreightAmount) || 0;
    const grand    = itemsTotal + freight - 0;     // discount already netted into NetAmount

    return (
        <PrintShell
            docTitle="Goods Receiving Note"
            metaPairs={[
                { label: 'GRN #',         value: g.PurchaseCode || g.PurchaseVoucherNo || `#${g.PurchaseID}`, highlight: true },
                { label: 'Date',          value: fmtDate(g.PurchaseDate) },
                { label: 'Supplier Bill', value: g.FBRInvoiceNumber || '—' },
            ]}
            sigLabels={['Receiver Signature', 'Supplier Signature']}
            footnote={
                <>
                    <b>* Goods received as per the supplier's invoice and counted against this GRN.</b><br/>
                    <b>* Any discrepancy must be reported to procurement within 48 hours of receipt.</b><br/>
                    <b>* Stock has been added to the warehouse on this voucher's posting.</b>
                </>
            }
        >
            <div className="ps-cust-row">
                <div><b>Supplier:</b>&nbsp;&nbsp;{g.PurchasedParty || g.PartyName || '—'}</div>
                <div><b>Received By:</b>&nbsp;{g.CreatedByName || '—'}</div>
            </div>
            <div className="ps-extras">
                {g.PartyAddress && <span><b>Address:</b> {g.PartyAddress}</span>}
                {g.PartyMobile  && <span><b>Mobile:</b>  {g.PartyMobile}</span>}
                {g.PartyNTN     && <span><b>NTN:</b>     {g.PartyNTN}</span>}
                {g.WHID         && <span><b>Warehouse ID:</b> {g.WHID}</span>}
            </div>

            <table className="ps-items">
                <thead>
                    <tr>
                        <th style={{ width: '14%' }}>Item Code</th>
                        <th>Item Name</th>
                        <th style={{ width: '8%',  textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Rate</th>
                        <th style={{ width: '12%', textAlign: 'right' }}>Disc.</th>
                        <th style={{ width: '14%', textAlign: 'right' }}>Net</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td style={{ fontFamily: 'monospace' }}>{it.ItemNumber || ''}</td>
                            <td>{it.ItenName || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(it.Quantity || 0).toFixed(0)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.ItemRate)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.DiscountAmount)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.NetAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            <div className="ps-no-more">NO ITEM BELOW THIS AREA.</div>

            <div className="ps-totals-row">
                <div className="ps-words">
                    <div><b>Amount In Words:</b></div>
                    <div className="ps-words-val">{toWords(grand)}</div>
                </div>
                <table className="ps-totals">
                    <tbody>
                        <tr><td>Items Total:</td><td>RS. {fmt(itemsTotal)}</td></tr>
                        {discount > 0 && <tr><td>Total Discount:</td><td>RS. {fmt(discount)}</td></tr>}
                        {freight > 0 && <tr><td>Freight:</td><td>RS. {fmt(freight)}</td></tr>}
                        <tr className="ps-net"><td>Grand Total:</td><td>RS. {fmt(grand)}</td></tr>
                    </tbody>
                </table>
            </div>
        </PrintShell>
    );
}
