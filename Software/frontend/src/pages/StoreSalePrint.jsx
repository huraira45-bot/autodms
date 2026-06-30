import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtDate = v => v ? new Date(v).toLocaleDateString('en-GB').replace(/\//g, '/') : '';

// Convert a number to English words — sized for Pakistani rupee amounts
// (lakh/crore not used; standard international grouping). Outputs e.g.
// "Three Thousand Twenty Rupees Only."
function toWords(n) {
    n = Math.round(Number(n) || 0);
    if (n === 0) return 'Zero Rupees Only.';
    const A = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine','Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
    const B = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
    const chunk = (x) => {
        if (x === 0) return '';
        if (x < 20) return A[x];
        if (x < 100) return B[Math.floor(x/10)] + (x % 10 ? ' ' + A[x % 10] : '');
        return A[Math.floor(x/100)] + ' Hundred' + (x % 100 ? ' ' + chunk(x % 100) : '');
    };
    const parts = [];
    const crore = Math.floor(n / 10000000); n %= 10000000;
    const lakh  = Math.floor(n / 100000);   n %= 100000;
    const thou  = Math.floor(n / 1000);     n %= 1000;
    const rest  = n;
    if (crore) parts.push(chunk(crore) + ' Crore');
    if (lakh)  parts.push(chunk(lakh)  + ' Lakh');
    if (thou)  parts.push(chunk(thou)  + ' Thousand');
    if (rest)  parts.push(chunk(rest));
    return parts.join(' ').trim() + ' Rupees Only.';
}

export default function StoreSalePrint() {
    const { id } = useParams();
    const [ss, setSs] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/sales/store-sale/${id}/print-data`)
            .then(r => { setSs(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!ss) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const items = ss.Items || [];
    const totalBill   = Number(ss.TotalBillAmount) || items.reduce((s, i) => s + (Number(i.Quantity) * Number(i.SaleRate) || 0), 0);
    const totalDisc   = Number(ss.TotalDiscount) || 0;
    const totalTax    = Number(ss.TotalTaxAmount) || 0;
    const delivery    = Number(ss.DeliveryExpense) || 0;
    const netBill     = Number(ss.NetPayable) || (totalBill - totalDisc + totalTax + delivery);

    return (
        <div className="ss-print">
            {/* TOP BANNER */}
            <div className="banner">
                <div className="logo-box">
                    <div className="logo-letter">⌖</div>
                    <div className="logo-text">CHANGAN AUTO<br/>MULTAN</div>
                </div>
                <div className="banner-mid">
                    <div className="company">CHANGAN MULTAN MOTORS</div>
                    <div className="address">NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN.</div>
                </div>
                <div className="banner-right">
                    <div className="invoice-title">Sales Invoice</div>
                    <div className="meta">
                        <div><b>Sale Date:</b>&nbsp;&nbsp;{fmtDate(ss.SaleDate)}</div>
                        <div><b>Bill #:</b>&nbsp;&nbsp;<span style={{ color: '#b91c1c', fontWeight: 700 }}>{ss.InvoiceNo}</span></div>
                    </div>
                </div>
            </div>

            <hr className="rule" />

            {/* CUSTOMER LINE */}
            <div className="cust-row">
                <div>
                    <strong>Respected,</strong>&nbsp;&nbsp;{ss.CustomerName || '—'}
                    {ss.PartyName && <span> · {ss.PartyName}</span>}
                </div>
                <div className="cust-meta">
                    {ss.MobileNo && <span><b>Mobile:</b> {ss.MobileNo}</span>}
                </div>
            </div>

            {/* Sub-row: vehicle / NIC / NTN (the user-requested additions) */}
            {(ss.VehicleName || ss.NICNo || ss.NTNNo) && (
                <div className="extras-row">
                    {ss.VehicleName && <span><b>Vehicle / Reg #:</b> {ss.VehicleName}{ss.Variant ? ` (${ss.Variant})` : ''}</span>}
                    {ss.NICNo && <span><b>NIC #:</b> {ss.NICNo}</span>}
                    {ss.NTNNo && <span><b>NTN #:</b> {ss.NTNNo}</span>}
                </div>
            )}

            {/* Thank-you paragraph */}
            <p className="thank-you">
                We just wanted to thank you for your recent purchase. We hope that you will enjoy the many benefits of your
                purchased items. Following are your recent purchased items.
            </p>

            {/* ITEM TABLE */}
            <table className="items">
                <thead>
                    <tr>
                        <th style={{ width: '15%' }}>Item Code</th>
                        <th>Item Name</th>
                        <th style={{ width: '8%', textAlign: 'right' }}>Qty</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Rate</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Disc.</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Amount</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td style={{ fontFamily: 'monospace' }}>{it.ItemNumber || ''}</td>
                            <td>{it.ItenName || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(it.Quantity || 0).toFixed(0)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.SaleRate)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.DiscountAmount)}</td>
                            <td style={{ textAlign: 'right' }}>{fmt(it.NetAmount)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* NO-ITEM-BELOW banner */}
            <div className="no-item">NO ITEM BELOW THIS AREA.</div>

            {/* Words + totals row */}
            <div className="totals-row">
                <div className="words">
                    <div className="lbl"><b>Bill Amount In Words:</b></div>
                    <div className="words-val">{toWords(netBill)}</div>
                </div>
                <table className="totals">
                    <tbody>
                        <tr><td>Total Bill:</td><td>RS. {fmt(totalBill)}</td></tr>
                        {totalDisc > 0 && <tr><td>Total Disc:</td><td>RS. {fmt(totalDisc)}</td></tr>}
                        {totalTax > 0 && <tr><td>GST:</td><td>RS. {fmt(totalTax)}</td></tr>}
                        {delivery > 0 && <tr><td>Delivery Expense:</td><td>RS. {fmt(delivery)}</td></tr>}
                        <tr className="net"><td>Net Bill:</td><td>RS. {fmt(netBill)}</td></tr>
                    </tbody>
                </table>
            </div>

            {/* FOOTNOTE */}
            <div className="footnote">
                <b>* We wish long term relation with you.</b> Please check product and warranty card (if exists) before leaving sales counter.<br/>
                <b>* We are not responsible</b>, if accessory's company void warranty or change terms and condition.<br/>
                <b>* Terms and Conditions applied.</b> Don't hesitate to ask questions related to product features, use, maintenance and after-service.<br/>
                <b>* Product refund / Replace not applicable.</b>
            </div>

            {/* SIGNATURES */}
            <div className="sigs">
                <div className="sig"><div className="line" /><b>Salesman Signature</b></div>
                <div className="sig"><div className="line" /><b>Customer Signature</b></div>
            </div>

            <style>{`
                /* margin: 0 — no room for browser-injected URL / page-# header */
                @page { size: A4 portrait; margin: 0; }
                html, body { width: 210mm; margin: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .ss-print { font-family: Arial, sans-serif; color: #000; font-size: 11px; max-width: 210mm; margin: 0 auto; padding: 10mm 12mm; box-sizing: border-box; }
                .banner { display: flex; align-items: center; padding: 6px 0 4px; gap: 18px; }
                .logo-box { width: 90px; height: 70px; border: 1px solid #999; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
                .logo-letter { font-size: 24px; }
                .logo-text { font-size: 7px; text-align: center; }
                .banner-mid { flex: 1; text-align: center; }
                .banner-mid .company { font-size: 20px; font-weight: 700; }
                .banner-mid .address { font-size: 10px; margin-top: 4px; }
                .banner-right { text-align: right; min-width: 200px; }
                .banner-right .invoice-title { font-family: 'Brush Script MT', cursive; font-size: 22px; color: #b91c1c; font-weight: 700; }
                .banner-right .meta { font-size: 11px; margin-top: 6px; line-height: 1.5; }
                .rule { border: 0; border-top: 1px solid #000; margin: 4px 0 8px; }
                .cust-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; padding: 2px 0; }
                .extras-row { display: flex; flex-wrap: wrap; gap: 18px; font-size: 11px; padding: 2px 0; color: #333; border-top: 1px dashed #cbd5e1; padding-top: 4px; margin-top: 4px; }
                .thank-you { font-size: 11px; padding: 6px 0; }
                .items { width: 100%; border-collapse: collapse; margin-top: 6px; }
                .items th, .items td { padding: 6px 8px; border-bottom: 1px solid #cbd5e1; font-size: 11px; }
                .items th { background: #f0f0f0; text-align: left; }
                .no-item { text-align: center; font-family: 'Times New Roman', serif; font-style: italic; font-weight: 700; color: #b91c1c; font-size: 22px; padding: 10px 0; letter-spacing: 1px; border-bottom: 1px solid #000; }
                .totals-row { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; align-items: flex-start; }
                .words { flex: 1; }
                .words-val { padding: 4px 0; }
                .totals { font-size: 12px; min-width: 220px; border-collapse: collapse; }
                .totals td:first-child { font-weight: 700; padding: 3px 12px 3px 0; text-align: right; }
                .totals td:last-child { text-align: right; min-width: 110px; font-weight: 600; }
                .totals tr.net td { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
                .footnote { font-size: 10px; padding: 12px 0; line-height: 1.5; border-top: 1px dashed #94a3b8; margin-top: 10px; }
                .sigs { display: flex; gap: 60px; margin-top: 40px; padding: 0 20px; }
                .sig { flex: 1; text-align: center; }
                .sig .line { border-bottom: 1px solid #000; margin-bottom: 6px; padding-top: 30px; }
                @media screen { .ss-print { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
                @media print  { .ss-print { box-shadow: none; } }
            `}</style>
        </div>
    );
}
