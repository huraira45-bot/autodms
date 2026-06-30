import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';

// Master Motors sales-tax-invoice style GRN print. Portrait A4, dense layout
// to fit the 14 data columns. Mirrors the supplier invoice numbers 1:1 so the
// owner can cross-reference printed GRN ↔ posted GL voucher.

const fmt = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = v => v ? new Date(v).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }).toUpperCase() : '';

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

    const items = (g.Items || []).map(it => {
        const qty   = Number(it.Quantity) || 0;
        const rate  = Number(it.ItemRate) || 0;
        const dPct  = Number(it.DiscountPercentage) || 0;
        const dVal  = Number(it.DiscountAmount) || 0;
        const adPct = Number(it.AdditionalDiscountPct) || 0;
        const adVal = Number(it.AdditionalDiscountAmount) || 0;
        const tax   = Number(it.TaxAmount) || 0;
        const ait   = Number(it.AITAmount) || 0;
        const valueExcl    = qty * rate;
        const salesValueEx = valueExcl - dVal - adVal;
        const valueIncTax  = salesValueEx + tax + ait;
        return {
            ...it, qty, rate, dPct, dVal, adPct, adVal, tax, ait,
            valueExcl, salesValueEx, valueIncTax,
            taxPlusAit: tax + ait,
        };
    });

    const totals = items.reduce((a, x) => ({
        qty:           a.qty           + x.qty,
        valueExcl:     a.valueExcl     + x.valueExcl,
        dVal:          a.dVal          + x.dVal,
        adVal:         a.adVal         + x.adVal,
        salesValueEx:  a.salesValueEx  + x.salesValueEx,
        tax:           a.tax           + x.tax,
        ait:           a.ait           + x.ait,
        taxPlusAit:    a.taxPlusAit    + x.taxPlusAit,
        valueIncTax:   a.valueIncTax   + x.valueIncTax,
    }), { qty: 0, valueExcl: 0, dVal: 0, adVal: 0, salesValueEx: 0, tax: 0, ait: 0, taxPlusAit: 0, valueIncTax: 0 });

    return (
        <div className="grn-print">
            {/* Top right form code */}
            <div className="topcode">CMCL/SP/PSP/F01</div>

            <h1 className="title">SALES TAX INVOICE</h1>

            {/* Header grid (buyer/supplier block) */}
            <div className="hdr">
                <div className="hdr-col">
                    <div><label>Supplier</label><span>{g.PurchasedParty || g.PartyName || ''}</span></div>
                    <div><label>Address</label><span>{g.PartyAddress || ''}</span></div>
                    <div><label>Term of Sales</label><span>{g.TermOfSales || 'As Per Policy'}</span></div>
                    <div><label>NTN</label><span>{g.SupplierNTN || g.PartyNTN || ''}</span></div>
                    <div><label>STRN</label><span>{g.SupplierSTRN || ''}</span></div>
                </div>
                <div className="hdr-col">
                    <div><label>Date</label><span>{d(g.PurchaseDate)}</span></div>
                    <div><label>Invoice No</label><span>{g.FBRInvoiceNumber || g.SupplierBillNo || g.PurchaseCode || ''}</span></div>
                    <div><label>Buyer</label><span>CHANGAN MULTAN MOTORS</span></div>
                    <div><label>Address</label><span>NEAR PAK FERTILIZER MAIN KHANEWAL ROAD MULTAN</span></div>
                    <div><label>STRN</label><span>—</span></div>
                    <div><label>NTN No</label><span>—</span></div>
                    <div><label>Customer PO#</label><span>{g.PurchaseCode || `GRN-${g.PurchaseID}`}</span></div>
                </div>
            </div>

            {/* Line items table — matches Master Motors invoice column layout */}
            <table className="items">
                <thead>
                    <tr>
                        <th>S#</th>
                        <th>Part #</th>
                        <th>Item Description</th>
                        <th>Product</th>
                        <th>Qty</th>
                        <th>Unit Retail<br/>Excl. Sales Tax</th>
                        <th>Value Excl.<br/>Sales Tax</th>
                        <th>Discount<br/>Rate (%)</th>
                        <th>Discount<br/>Value</th>
                        <th>Add. Discount<br/>Rate (%)</th>
                        <th>Add. Discount<br/>Value</th>
                        <th>Sales Value<br/>Excl. Sales Tax</th>
                        <th>Sales Tax<br/>(18%)</th>
                        <th>AIT</th>
                        <th>Sales Tax<br/>+ AIT</th>
                        <th>Value<br/>Inc. Sales Tax</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((it, i) => (
                        <tr key={i}>
                            <td className="c">{i + 1}</td>
                            <td className="mono">{it.ItemNumber || ''}</td>
                            <td>{it.ItenName || ''}</td>
                            <td className="c">—</td>
                            <td className="r">{it.qty.toLocaleString('en-PK')}</td>
                            <td className="r">{fmt(it.rate)}</td>
                            <td className="r">{fmt(it.valueExcl)}</td>
                            <td className="r">{it.dPct}</td>
                            <td className="r">{fmt(it.dVal)}</td>
                            <td className="r">{it.adPct}</td>
                            <td className="r">{fmt(it.adVal)}</td>
                            <td className="r">{fmt(it.salesValueEx)}</td>
                            <td className="r">{fmt(it.tax)}</td>
                            <td className="r">{fmt(it.ait)}</td>
                            <td className="r">{fmt(it.taxPlusAit)}</td>
                            <td className="r b">{fmt(it.valueIncTax)}</td>
                        </tr>
                    ))}
                </tbody>
                <tfoot>
                    <tr className="tot">
                        <td colSpan={4} className="r b">Total</td>
                        <td className="r b">{totals.qty.toLocaleString('en-PK')}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.valueExcl)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.dVal)}</td>
                        <td></td>
                        <td className="r b">{fmt(totals.adVal)}</td>
                        <td className="r b">{fmt(totals.salesValueEx)}</td>
                        <td className="r b">{fmt(totals.tax)}</td>
                        <td className="r b">{fmt(totals.ait)}</td>
                        <td className="r b">{fmt(totals.taxPlusAit)}</td>
                        <td className="r b">{fmt(totals.valueIncTax)}</td>
                    </tr>
                </tfoot>
            </table>

            {/* Footer signatures */}
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
                .grn-print {
                    font-family: Arial, sans-serif; color: #000;
                    font-size: 8px; max-width: 210mm;
                    margin: 0 auto; padding: 8mm 5mm; box-sizing: border-box;
                }
                .topcode { text-align: right; font-weight: 700; font-size: 9px; margin-bottom: 4px; }
                .title { text-align: center; font-size: 22px; font-weight: 700; margin: 0 0 10px; letter-spacing: 1px; }

                .hdr { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; margin-bottom: 10px; font-size: 9px; }
                .hdr-col > div { display: grid; grid-template-columns: 90px 1fr; padding: 1px 0; }
                .hdr-col label { font-weight: 700; }
                .hdr-col span { color: #000; }

                .items { width: 100%; border-collapse: collapse; font-size: 7.5px; }
                .items th, .items td { border: 1px solid #999; padding: 2px 3px; vertical-align: middle; }
                .items th { background: #f4f4f4; font-weight: 700; text-align: center; }
                .items td.c { text-align: center; }
                .items td.r { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
                .items td.b { font-weight: 700; }
                .items td.mono { font-family: 'Courier New', monospace; font-size: 7px; }
                .items tfoot .tot td { background: #f4f4f4; }

                .sigs { display: grid; grid-template-columns: repeat(3, 1fr); gap: 30px; margin-top: 28mm; font-size: 10px; text-align: center; }
                .sigs .line { border-top: 1px solid #000; margin-bottom: 4px; }

                @media print {
                    .topcode, .title, .hdr, .items, .sigs {
                        page-break-inside: avoid;
                    }
                }
            `}</style>
        </div>
    );
}
