/**
 * PrintBusinessHeader — the ONE business header at the top of every
 * printed AutoDMS document (owner ask 2026-07-04).
 *
 * Used by:
 *   - ReportShell (through ReportPrintHeader.jsx which re-exports this)
 *   - WorkOrderPrint / StoreSalePrint / GRNPrint / GRTNPrint / SSRPrint /
 *     VoucherPrint / CreditInvoicePrint
 *
 * For legacy print-window flows (GatePass.jsx uses document.write into a
 * popup) use the string version instead:
 *   import { getBusinessProfile, businessHeaderHtml } from '../utils/businessProfile';
 *
 * The rendered classes (`.pbh` / `.pbh-band` / …) share a single stylesheet
 * with the string version so both React and print-window callers look
 * identical on paper.
 */
import React, { useEffect, useState } from 'react';
import { getBusinessProfile } from '../utils/businessProfile';

export default function PrintBusinessHeader({
    // Report / document-specific title block rendered UNDER the business band
    docTitle, docSubtitle, docMetaLeft, docMetaRight,
    // Older ReportShell prop names — kept for back-compat
    title, subtitle, filterSummary, printedAt,
    // Rendering options
    showLogo = true,
    showOnScreen = false, // add print-only class unless overridden
    className,
}) {
    const [profile, setProfile] = useState(null);
    useEffect(() => {
        let live = true;
        getBusinessProfile().then(p => { if (live) setProfile(p); });
        return () => { live = false; };
    }, []);

    const p = profile || {};

    // Address / contact / tax lines — trimmed for missing fields
    const addressLine = joinNonEmpty([p.Address1, p.Address2, p.City, p.Country], ', ');
    const contactParts = [];
    if (p.PhoneNumbers) contactParts.push('Ph: ' + p.PhoneNumbers);
    if (p.FaxNumber)    contactParts.push('Fax: ' + p.FaxNumber);
    if (p.Email)        contactParts.push('Email: ' + p.Email);
    if (p.Website)      contactParts.push('Web: ' + p.Website);
    const contactLine = contactParts.join('   ·   ');
    const taxParts = [];
    if (p.NTN)  taxParts.push('NTN: ' + p.NTN);
    if (p.STRN) taxParts.push('STRN: ' + p.STRN);
    if (p.CNIC) taxParts.push('CNIC: ' + p.CNIC);
    const taxLine = taxParts.join('   ·   ');

    // Normalise props: prefer docTitle etc, fall back to legacy ReportShell names.
    const T  = docTitle    ?? title;
    const S  = docSubtitle ?? subtitle;
    const ML = docMetaLeft ?? filterSummary;
    const MR = docMetaRight ?? (printedAt ? `Printed: ${printedAt}` : '');
    const showDocBlock = !!(T || S || ML || MR);

    const logoSrc = (showLogo && p.LogoPath) ? '/uploads/' + p.LogoPath : null;

    // `.pbh` styling lives in index.css so both the React version here AND the
    // string version emitted by businessHeaderHtml() share one stylesheet.
    const wrapper = 'pbh' + (showOnScreen ? '' : ' print-only') + (className ? ' ' + className : '');

    return (
        <div className={wrapper}>
            <div className="pbh-band">
                {logoSrc && (
                    <div className="pbh-logo">
                        <img src={logoSrc} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                )}
                <div className="pbh-company">
                    <div className="pbh-name">{p.CompanyName || ''}</div>
                    {p.LegalName && <div className="pbh-legal">{p.LegalName}</div>}
                    {addressLine && <div className="pbh-line">{addressLine}</div>}
                    {contactLine && <div className="pbh-line">{contactLine}</div>}
                    {taxLine && <div className="pbh-line">{taxLine}</div>}
                </div>
            </div>
            {showDocBlock && (
                <div className="pbh-doc">
                    {T && <div className="pbh-doc-title">{T}</div>}
                    {S && <div className="pbh-doc-subtitle">{S}</div>}
                    {(ML || MR) && (
                        <div className="pbh-doc-meta">
                            <span>{ML || ''}</span>
                            <span>{MR || ''}</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function joinNonEmpty(parts, sep) {
    return parts.filter(v => v !== null && v !== undefined && String(v).trim() !== '').join(sep);
}
