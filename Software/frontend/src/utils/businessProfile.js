/**
 * Shared business-profile helpers for print output.
 *
 * Owner ask 2026-07-04: every printed document — reports AND the previously
 * excluded transaction prints (Work Order, Store Sale, Gate Pass, GRN,
 * GRTN, SSR, Voucher, Credit Invoice) — must show the SAME business header
 * sourced from /api/settings/business-profile. No company details are
 * hard-coded anywhere.
 *
 * Two entry points:
 *   getBusinessProfile()      — Promise<profile|null>, cached for the SPA
 *   businessHeaderHtml(p, opts) — inlineable HTML for print-window `document.write`
 *
 * The React component at components/PrintBusinessHeader.jsx wraps
 * getBusinessProfile() with a useEffect + useState.
 */
import axios from 'axios';

let profilePromise = null;

/**
 * Fetches the business profile from /api/settings/business-profile.
 * Cached at module scope so multiple prints in the same SPA session
 * only hit the server once.
 * Returns `null` if the endpoint fails or the profile is empty — every
 * consumer must handle a missing profile gracefully.
 */
export function getBusinessProfile() {
    if (!profilePromise) {
        profilePromise = axios.get('/api/settings/business-profile')
            .then(r => r.data || null)
            .catch(() => null);
    }
    return profilePromise;
}

/** Test / dev helper — reset the cache so the next call re-fetches. */
export function resetBusinessProfileCache() {
    profilePromise = null;
}

// --- HTML escaping (for document.write templates) -----------------------------
const HTML_ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
function esc(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, ch => HTML_ESC[ch]);
}

function joinNonEmpty(parts, sep) {
    return parts.filter(p => p !== null && p !== undefined && String(p).trim() !== '').join(sep);
}

/**
 * Renders the shared business header as an HTML string suitable for
 * dropping into a print-window template (e.g. GatePass.jsx's document.write
 * or any legacy print flow that builds its own document).
 *
 * profile: the object returned from getBusinessProfile()
 * opts:
 *   docTitle    — big title under the business header (e.g. "Gate Pass")
 *   docSubtitle — small line under docTitle (e.g. reason / voucher #)
 *   docMetaLeft / docMetaRight — small meta strip below title
 *   showLogo    — default true; pass false to omit even if profile has one
 *   logoBase    — URL prefix for LogoPath (default '/uploads/')
 *
 * Rendered inside <div class="pbh"> — style classes match components/
 * PrintBusinessHeader.jsx so the same CSS in index.css (.pbh, .pbh-*)
 * governs both React and legacy print-window rendering.
 */
export function businessHeaderHtml(profile, opts = {}) {
    const p = profile || {};
    const {
        docTitle, docSubtitle, docMetaLeft, docMetaRight,
        showLogo = true, logoBase = '/uploads/',
    } = opts;

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

    const logoHtml = (showLogo && p.LogoPath)
        ? `<div class="pbh-logo"><img src="${esc(logoBase + p.LogoPath)}" alt="" onerror="this.style.display='none'"/></div>`
        : '';

    return (
`<div class="pbh">
  <div class="pbh-band">
    ${logoHtml}
    <div class="pbh-company">
      <div class="pbh-name">${esc(p.CompanyName || '')}</div>
      ${p.LegalName    ? `<div class="pbh-legal">${esc(p.LegalName)}</div>` : ''}
      ${addressLine    ? `<div class="pbh-line">${esc(addressLine)}</div>`  : ''}
      ${contactLine    ? `<div class="pbh-line">${esc(contactLine)}</div>`  : ''}
      ${taxLine        ? `<div class="pbh-line">${esc(taxLine)}</div>`      : ''}
    </div>
  </div>
  ${(docTitle || docSubtitle || docMetaLeft || docMetaRight) ? `
  <div class="pbh-doc">
    ${docTitle    ? `<div class="pbh-doc-title">${esc(docTitle)}</div>` : ''}
    ${docSubtitle ? `<div class="pbh-doc-subtitle">${esc(docSubtitle)}</div>` : ''}
    ${(docMetaLeft || docMetaRight) ? `
    <div class="pbh-doc-meta">
      <span>${esc(docMetaLeft || '')}</span>
      <span>${esc(docMetaRight || '')}</span>
    </div>` : ''}
  </div>` : ''}
</div>`
    );
}

/**
 * Minimal CSS that MUST be present in a print window to render the
 * businessHeaderHtml() output correctly. Include it in <style> when
 * a legacy print window (e.g. Gate Pass) doesn't already load our
 * index.css. Print CSS in index.css already covers the standard
 * @media print flow.
 */
export const BUSINESS_HEADER_INLINE_CSS = `
.pbh { font-family: 'Inter', Arial, sans-serif; color: #000; border-bottom: 1.5px solid #0f172a; padding-bottom: 4pt; margin-bottom: 6pt; }
.pbh-band { display: flex; align-items: center; gap: 10pt; }
.pbh-logo { width: 48pt; flex-shrink: 0; }
.pbh-logo img { max-width: 100%; max-height: 42pt; object-fit: contain; display: block; }
.pbh-company { flex: 1; text-align: center; line-height: 1.2; }
.pbh-name { font-size: 13pt; font-weight: 700; color: #0f172a; line-height: 1.1; }
.pbh-legal { font-size: 8pt; color: #475569; font-style: italic; }
.pbh-line { font-size: 7.5pt; color: #334155; line-height: 1.25; }
.pbh-doc { border-top: 0.5pt solid #94a3b8; margin-top: 3pt; padding-top: 2pt; }
.pbh-doc-title { font-size: 12pt; font-weight: 700; color: #0f172a; line-height: 1.15; }
.pbh-doc-subtitle { font-size: 8pt; color: #475569; }
.pbh-doc-meta { font-size: 7.5pt; color: #475569; margin-top: 1pt; display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
`;
