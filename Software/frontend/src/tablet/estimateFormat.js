/**
 * Shared helpers for the service tablet estimate screens (plan 2026-09-14,
 * Phase 1): API base, money/date formatting, status colours.
 */
import { T } from './tabletStyles';

export const API = '/api/service-intake';

// Keep in step with MAX_BYTES in Software/middleware/serviceMediaUpload.js.
export const MAX_MEDIA_BYTES = 200 * 1024 * 1024;

export const money = (n) =>
    (Number(n) || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const mb = (bytes) => `${((Number(bytes) || 0) / 1048576).toFixed(1)} MB`;

export const rateLabel = (r) => `${+(Number(r) || 0).toFixed(2)}%`;

export const errText = (err) =>
    err?.response?.data?.error || err?.message || 'Something went wrong.';

// The app-wide formatters: the database holds server wall-clock time but the
// driver tags it as UTC, so a plain toLocaleString would show it 5 h late.
export { fmtDT as fmtDateTime, fmtDate } from '../utils/datetime';

const STATUS = {
    Draft:             { label: 'Draft',              bg: '#e2e8f0', fg: '#334155' },
    AwaitingSignature: { label: 'Awaiting signature', bg: T.warnBg,  fg: T.warn },
    Signed:            { label: 'Signed',             bg: T.okBg,    fg: T.ok },
    Converted:         { label: 'Job card opened',    bg: T.okBg,    fg: T.ok },
    Cancelled:         { label: 'Cancelled',          bg: T.badBg,   fg: T.bad },
};

export const statusStyle = (s) => STATUS[s] || { label: s || '—', bg: T.bg, fg: T.muted };

export const pill = (st) => ({
    display: 'inline-block', padding: '4px 10px', borderRadius: 999, fontSize: 13, fontWeight: 700,
    background: st.bg, color: st.fg, whiteSpace: 'nowrap',
});
