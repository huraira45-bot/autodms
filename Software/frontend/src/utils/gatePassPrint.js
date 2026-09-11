/**
 * Shared Gate Pass print.
 *
 * Lifted out of pages/GatePass.jsx unchanged (owner ask 2026-09-11) so the
 * vehicle-sales booking flow prints the very same slip instead of growing a
 * second, drifting copy of an 80-line A5 template.
 */
import { fmtDTLong as dt } from './datetime';
import { getBusinessProfile, businessHeaderHtml, BUSINESS_HEADER_INLINE_CSS } from './businessProfile';

export const REASON_LABEL = {
    CREDIT_PARTY:       'Credit Party',
    PAID_FULL:          'Paid in Full',
    INSURANCE_DEP_PAID: 'Insurance — Dep. Paid',
    FREE_SERVICE:       'Free / Zero-Charge',
    VEHICLE_DELIVERY:   'Vehicle Delivery',
};

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function printGatePass(gp) {
    const w = window.open('', '_blank', 'width=560,height=800');
    if (!w) return;
    // Owner ask 2026-07-04: business header must come from Business
    // Profile — no hard-coded company details on the Gate Pass. Fetch
    // profile before writing the popup HTML.
    const profile = await getBusinessProfile();
    // Owner ask 2026-07-02: A5 portrait (half of A4) so the slip fits
    // a receipt-sized printout. Two-column grid keeps every field but
    // packs it into the narrower page.
    const isCredit = (gp.PaymentMode || '').toUpperCase() === 'CREDIT';
    const paymentDisplay = isCredit
        ? `Credit${gp.PartyName ? ' — ' + gp.PartyName : ''}`
        : (gp.PaymentMode || gp.PaymentModes || '—');
    const ro = gp.RONumber || gp.InvoiceNo || `${gp.DocType} #${gp.DocID}`;
    // Inline the same .pbh business header shared by every DealerDesk
    // print — see utils/businessProfile.js.
    const headerHtml = businessHeaderHtml(profile, {
        docTitle: 'Gate Pass',
        docSubtitle: gp.GatePassNo,
        docMetaLeft: REASON_LABEL[gp.PassReason] || gp.PassReason,
    });
    w.document.write(`<html><head><title>${gp.GatePassNo}</title>
        <style>
            @page { size: A5 portrait; margin: 0; }
            @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
            html,body{margin:0;padding:0;background:#fff;}
            body{font-family:Arial;padding:6mm 8mm;box-sizing:border-box;width:148mm;min-height:210mm;font-size:9pt;}
            ${BUSINESS_HEADER_INLINE_CSS}
            .grid{display:grid;grid-template-columns:1fr 1fr;gap:0 12px;margin-top:6px;}
            .cell{padding:4px 0;border-bottom:1px dashed #cbd5e1;display:flex;flex-direction:column;gap:1px;}
            .cell.full{grid-column:1 / -1;}
            .cell .lbl{color:#64748b;font-size:7.5pt;text-transform:uppercase;letter-spacing:0.3px;}
            .cell .val{font-weight:600;font-size:9.5pt;color:#0f172a;}
            .reason{margin:8px 0;padding:6px;background:#dcfce7;color:#166534;border-radius:4px;font-weight:700;text-align:center;font-size:10pt;}
            .money{display:grid;grid-template-columns:repeat(2, 1fr);gap:6px;margin-top:6px;}
            .money .box{padding:4px 8px;background:#f1f5f9;border-radius:4px;text-align:center;}
            .money .box .lbl{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;}
            .money .box .val{font-size:10.5pt;font-weight:800;color:#1e293b;margin-top:1px;}
            .modes{grid-column:1 / -1;background:#f1f5f9;padding:4px 8px;border-radius:4px;text-align:center;}
            .modes .lbl{font-size:7.5pt;color:#64748b;text-transform:uppercase;letter-spacing:0.3px;}
            .modes .val{font-weight:700;font-size:9.5pt;color:#1e293b;margin-top:1px;}
            .sig{margin-top:14px;display:flex;justify-content:space-between;gap:14px;}
            .sig div{flex:1;border-top:1px solid #475569;text-align:center;padding-top:4px;font-size:8pt;color:#475569;}
        </style></head><body>
        ${headerHtml}

        <div class="grid">
            <div class="cell"><span class="lbl">RO / Doc #</span><span class="val">${ro}</span></div>
            <div class="cell"><span class="lbl">Business Unit</span><span class="val">${gp.BusinessUnit || '—'}</span></div>

            <div class="cell"><span class="lbl">Customer</span><span class="val">${gp.CustomerName || '—'}</span></div>
            <div class="cell"><span class="lbl">Cell #</span><span class="val">${gp.CustomerCell || '—'}</span></div>

            <div class="cell"><span class="lbl">Vehicle Reg #</span><span class="val">${gp.VehicleRegNo || '—'}</span></div>
            <div class="cell"><span class="lbl">Vehicle Colour</span><span class="val">${gp.VehicleColour || '—'}</span></div>

            <div class="cell full"><span class="lbl">Chassis #</span><span class="val">${gp.VehicleChassis || '—'}</span></div>

            <div class="cell"><span class="lbl">Service Advisor</span><span class="val">${gp.ServiceAdvisorName || '—'}</span></div>
            <div class="cell"><span class="lbl">Payment</span><span class="val">${paymentDisplay}</span></div>

            <div class="cell"><span class="lbl">Time In (RO created)</span><span class="val">${dt(gp.TimeIn)}</span></div>
            <div class="cell"><span class="lbl">Time Out (Gate Pass)</span><span class="val">${dt(gp.IssuedAt)}</span></div>

            <div class="cell full"><span class="lbl">Issued By</span><span class="val">${gp.IssuedByName || '—'}</span></div>
        </div>

        <div class="money">
            <div class="box"><div class="lbl">Amount Invoiced</div><div class="val">PKR ${fmt(gp.AmountInvoiced)}</div></div>
            <div class="box"><div class="lbl">Amount Received</div><div class="val">PKR ${fmt(gp.AmountReceived)}</div></div>
            <div class="modes"><div class="lbl">Modes Used</div><div class="val">${gp.PaymentModes || '—'}</div></div>
        </div>

        <div class="reason">${REASON_LABEL[gp.PassReason] || gp.PassReason}</div>

        <div class="sig"><div>Customer</div><div>Security / Gate</div><div>Authorized</div></div>
        <script>window.onload=()=>setTimeout(()=>window.print(),200);</script>
        </body></html>`);
    w.document.close();
}
