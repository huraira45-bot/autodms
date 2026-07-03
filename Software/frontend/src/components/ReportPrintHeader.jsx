/**
 * ReportPrintHeader — the ONE header used at the top of every report print.
 *
 * Owner ask 2026-07-03: hard-coded "CHANGAN MULTAN MOTORS" strings must go.
 * The company details on every printed report now come from
 * `GET /api/settings/business-profile`, i.e. the same row edited at
 * `/settings/business-profile`.
 *
 * Contract:
 *   - Fetches the profile ONCE for the whole SPA session (module-level
 *     promise cache) so opening 8 reports doesn't hit the API 8 times.
 *   - Renders inside `.print-only.report-print-header` — invisible on
 *     screen unless `showOnScreen` is set (rare — kept for previews).
 *   - Graceful fallback: any missing field is quietly skipped; if the whole
 *     profile is null/errored the header still renders the report title
 *     block so a Ctrl-P never produces a blank page.
 *
 * Deliberately NOT touched (per owner directive 2026-07-03):
 *   - Job Card / Work Order print (WorkOrderPrint.jsx)
 *   - Store Sale print (StoreSalePrint.jsx)
 *   - Gate Pass print window (built inline in GatePass.jsx)
 * Those documents keep their own layouts.
 */
import React, { useEffect, useState } from 'react';
import axios from 'axios';

// ── Module-level cache ──────────────────────────────────────────────
// One promise for the whole SPA session — every ReportPrintHeader
// instance awaits the same fetch.
let profilePromise = null;
function loadProfile() {
    if (!profilePromise) {
        profilePromise = axios.get('/api/settings/business-profile')
            .then(r => r.data || null)
            .catch(() => null);
    }
    return profilePromise;
}

// Small helper: filter out empty parts, join with a separator.
function joinNonEmpty(parts, sep) {
    return parts.filter(p => p !== null && p !== undefined && String(p).trim() !== '').join(sep);
}

export default function ReportPrintHeader({
    title, subtitle, filterSummary, printedAt,
    showOnScreen = false,
}) {
    const [profile, setProfile] = useState(null);

    useEffect(() => {
        let mounted = true;
        loadProfile().then(p => { if (mounted) setProfile(p); });
        return () => { mounted = false; };
    }, []);

    const p = profile || {};

    // Address line: Address1, Address2, City, Country
    const addressLine = joinNonEmpty([p.Address1, p.Address2, p.City, p.Country], ', ');

    // Contact line: Phone, Fax, Email, Website — labelled inline.
    const contactParts = [];
    if (p.PhoneNumbers) contactParts.push(`Ph: ${p.PhoneNumbers}`);
    if (p.FaxNumber)    contactParts.push(`Fax: ${p.FaxNumber}`);
    if (p.Email)        contactParts.push(`Email: ${p.Email}`);
    if (p.Website)      contactParts.push(`Web: ${p.Website}`);
    const contactLine = contactParts.join('   ·   ');

    // Tax IDs: NTN, STRN, CNIC — only rendered if at least one present.
    const taxParts = [];
    if (p.NTN)  taxParts.push(`NTN: ${p.NTN}`);
    if (p.STRN) taxParts.push(`STRN: ${p.STRN}`);
    if (p.CNIC) taxParts.push(`CNIC: ${p.CNIC}`);
    const taxLine = taxParts.join('   ·   ');

    // Logo path is stored relative — served from /uploads/. Missing logo is fine.
    const logoSrc = p.LogoPath ? `/uploads/${p.LogoPath}` : null;

    const wrapperClass = 'report-print-header' + (showOnScreen ? '' : ' print-only');

    return (
        <div className={wrapperClass}>
            <div className="rph-band">
                {logoSrc && (
                    <div className="rph-logo">
                        <img src={logoSrc} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    </div>
                )}
                <div className="rph-company">
                    <div className="rph-name">{p.CompanyName || 'Company Name'}</div>
                    {p.LegalName && <div className="rph-legal">{p.LegalName}</div>}
                    {addressLine && <div className="rph-line">{addressLine}</div>}
                    {contactLine && <div className="rph-line">{contactLine}</div>}
                    {taxLine && <div className="rph-line">{taxLine}</div>}
                </div>
            </div>
            <div className="rph-report">
                <h1>{title}</h1>
                {subtitle && <div className="rph-subtitle">{subtitle}</div>}
                <div className="rph-meta">
                    <span>{filterSummary || ''}</span>
                    <span>Printed: {printedAt}</span>
                </div>
            </div>
        </div>
    );
}

// Test hook — reset the module cache. Only ever called from unit tests.
export function __resetProfileCacheForTests() { profilePromise = null; }
