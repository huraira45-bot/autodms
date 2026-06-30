/**
 * Shared print-page chrome — banner + footer + A4-portrait CSS.
 * Used by GRNPrint / GRTNPrint / SSRPrint / future modules so all dealership
 * documents look uniform.
 *
 * Props:
 *   docTitle       — large red script title in the top-right (e.g. "Goods Receiving Note")
 *   metaPairs      — [{ label, value }] shown under the title (Bill #, Date, etc.)
 *   children       — body content (customer block + items table + totals etc.)
 *   footnote       — optional terms-and-conditions string
 *   showSignatures — render "Authorized" / "Customer" signature lines (default true)
 *   sigLabels      — [leftLabel, rightLabel] to override default signature row
 */
export default function PrintShell({ docTitle, metaPairs = [], children, footnote, showSignatures = true, sigLabels = ['Authorized Signature', 'Customer Signature'] }) {
    return (
        <div className="dms-print">
            {/* TOP BANNER */}
            <div className="banner">
                <div className="logo-box">
                    <div className="logo-letter">⌖</div>
                    <div className="logo-text">CHANGAN AUTO<br/>MULTAN</div>
                </div>
                <div className="banner-mid">
                    <div className="company">CHANGAN MULTAN MOTORS</div>
                    <div className="address">NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN.&nbsp;&nbsp;Phone#: 061-111-222-388</div>
                </div>
                <div className="banner-right">
                    <div className="doc-title">{docTitle}</div>
                    <div className="meta">
                        {metaPairs.map((m, i) => (
                            <div key={i}><b>{m.label}:</b>&nbsp;&nbsp;{m.highlight ? <span style={{ color: '#b91c1c', fontWeight: 700 }}>{m.value}</span> : m.value}</div>
                        ))}
                    </div>
                </div>
            </div>
            <hr className="rule" />

            {/* BODY */}
            {children}

            {/* FOOTNOTE */}
            {footnote && (
                <div className="footnote">{footnote}</div>
            )}

            {/* SIGNATURES */}
            {showSignatures && (
                <div className="sigs">
                    <div className="sig"><div className="line" /><b>{sigLabels[0]}</b></div>
                    <div className="sig"><div className="line" /><b>{sigLabels[1]}</b></div>
                </div>
            )}

            <style>{`
                /* margin: 0 leaves no room for the browser's auto header/footer
                   (URL / date / page #). Internal padding on the container restores
                   visual margins. */
                @page { size: A4 portrait; margin: 0; }
                html, body { width: 210mm; margin: 0; background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                .dms-print { font-family: Arial, sans-serif; color: #000; font-size: 11px; max-width: 210mm; margin: 0 auto; padding: 10mm 12mm; box-sizing: border-box; }
                .banner { display: flex; align-items: center; padding: 6px 0 4px; gap: 18px; }
                .logo-box { width: 90px; height: 70px; border: 1px solid #999; display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0; }
                .logo-letter { font-size: 24px; }
                .logo-text { font-size: 7px; text-align: center; }
                .banner-mid { flex: 1; text-align: center; }
                .banner-mid .company { font-size: 20px; font-weight: 700; }
                .banner-mid .address { font-size: 10px; margin-top: 4px; }
                .banner-right { text-align: right; min-width: 200px; }
                .banner-right .doc-title { font-family: 'Brush Script MT', cursive; font-size: 22px; color: #b91c1c; font-weight: 700; }
                .banner-right .meta { font-size: 11px; margin-top: 6px; line-height: 1.5; }
                .rule { border: 0; border-top: 1px solid #000; margin: 4px 0 8px; }
                .ps-cust-row { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; padding: 4px 0; }
                .ps-extras { display: flex; flex-wrap: wrap; gap: 18px; font-size: 11px; padding: 4px 0; color: #333; border-top: 1px dashed #cbd5e1; }
                .ps-items { width: 100%; border-collapse: collapse; margin-top: 6px; }
                .ps-items th, .ps-items td { padding: 6px 8px; border-bottom: 1px solid #cbd5e1; font-size: 11px; }
                .ps-items th { background: #f0f0f0; text-align: left; }
                .ps-no-more { text-align: center; font-family: 'Times New Roman', serif; font-style: italic; font-weight: 700; color: #b91c1c; font-size: 20px; padding: 8px 0; letter-spacing: 1px; border-bottom: 1px solid #000; }
                .ps-totals-row { display: flex; justify-content: space-between; gap: 24px; margin-top: 8px; align-items: flex-start; }
                .ps-words { flex: 1; }
                .ps-words .ps-words-val { padding: 4px 0; }
                .ps-totals { font-size: 12px; min-width: 240px; border-collapse: collapse; }
                .ps-totals td:first-child { font-weight: 700; padding: 3px 12px 3px 0; text-align: right; }
                .ps-totals td:last-child { text-align: right; min-width: 110px; font-weight: 600; }
                .ps-totals tr.ps-net td { border-top: 1px solid #000; padding-top: 6px; font-size: 13px; }
                .footnote { font-size: 10px; padding: 12px 0; line-height: 1.5; border-top: 1px dashed #94a3b8; margin-top: 14px; }
                .sigs { display: flex; gap: 60px; margin-top: 40px; padding: 0 20px; }
                .sig { flex: 1; text-align: center; }
                .sig .line { border-bottom: 1px solid #000; margin-bottom: 6px; padding-top: 30px; }
                @media screen { .dms-print { box-shadow: 0 4px 12px rgba(0,0,0,0.1); margin: 20px auto; background: white; } }
                @media print  { .dms-print { box-shadow: none; } }
            `}</style>
        </div>
    );
}

export const fmtMoney = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fmtDate  = v => v ? new Date(v).toLocaleDateString('en-GB') : '';

// Number to words (Pakistani style: Crore/Lakh/Thousand)
export function toWords(n) {
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
