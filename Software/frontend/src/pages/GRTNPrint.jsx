import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import PrintShell, { fmtMoney as fmt, fmtDate, toWords } from '../components/PrintShell';

export default function GRTNPrint() {
    const { id } = useParams();
    const [g, setG] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/procurement/grtn/${id}/print-data`)
            .then(r => { setG(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!g) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const items = g.Items || [];
    const itemsTotal = items.reduce((s, i) => s + Number(i.NetAmount || 0), 0);
    const discount = Number(g.DiscountAmount) || 0;
    const freight  = Number(g.FreightAmount) || 0;
    const grand    = Number(g.NetAmount) || (itemsTotal + freight - discount);

    return (
        <PrintShell
            docTitle="Goods Return Note"
            metaPairs={[
                { label: 'GRTN #', value: g.PurchaseReturnNo || `#${g.PurchaseReturnID}`, highlight: true },
                { label: 'Date',   value: fmtDate(g.PurchaseReturnDate) },
                ...(g.PurchaseID ? [{ label: 'Source GRN', value: g.PurchaseID }] : []),
            ]}
            sigLabels={['Authorized Signature', 'Supplier Signature']}
            footnote={
                <>
                    <b>* These items are being returned to the supplier; credit will be applied against the supplier's outstanding ledger.</b><br/>
                    <b>* Items have been physically removed from the warehouse on this voucher's posting.</b>
                </>
            }
        >
            <div className="ps-cust-row">
                <div><b>Supplier:</b>&nbsp;&nbsp;{g.PartyName || '—'}</div>
                <div><b>Returned By:</b>&nbsp;{g.CreatedByName || '—'}</div>
            </div>
            <div className="ps-extras">
                {g.PartyAddress && <span><b>Address:</b> {g.PartyAddress}</span>}
                {g.WHID         && <span><b>From Warehouse:</b> {g.WHID}</span>}
                {g.Remarks      && <span><b>Reason:</b> {g.Remarks}</span>}
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
                        <tr className="ps-net"><td>Total Credit:</td><td>RS. {fmt(grand)}</td></tr>
                    </tbody>
                </table>
            </div>
        </PrintShell>
    );
}
