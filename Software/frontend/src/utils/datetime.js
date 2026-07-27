/**
 * Date/time formatters used across the app.
 *
 * SQL Server stores GETDATE() in server-local time (Asia/Karachi), but the
 * mssql msnodesqlv8 driver tags the ISO string with a trailing 'Z' when it
 * serialises to JSON. JavaScript's Date then treats it as UTC, and a plain
 * .toLocaleString('en-PK') pushes it forward by another +5h — so a voucher
 * posted at 12:59 shows up as 17:59 on screen.
 *
 * Passing timeZone: 'UTC' to toLocaleString instructs it to display the
 * literal wall-clock value the DB actually recorded, no timezone maths.
 * This lines up the displayed time with what the operator actually clicked.
 *
 * Owner report 2026-07-03. Same pattern already applied to Gate Pass print.
 */
const LOCALE = 'en-PK';
const TZ_OPT = { timeZone: 'UTC' };

/** "03 Jul 2026, 12:59 PM" */
export const fmtDT = (v) =>
    v ? new Date(v).toLocaleString(LOCALE, { ...TZ_OPT, dateStyle: 'medium', timeStyle: 'short' }) : '';

/** "03/07/2026, 12:59:22 pm" — matches historic display format */
export const fmtDTLong = (v) =>
    v ? new Date(v).toLocaleString(LOCALE, TZ_OPT) : '';

/** Date only — "03 Jul 2026" */
export const fmtDate = (v) =>
    v ? new Date(v).toLocaleDateString(LOCALE, { ...TZ_OPT, dateStyle: 'medium' }) : '';

/** Time only — "12:59 PM" */
export const fmtTime = (v) =>
    v ? new Date(v).toLocaleTimeString(LOCALE, { ...TZ_OPT, timeStyle: 'short' }) : '';

/** "2026-07-27T11:17" for a <input type="datetime-local"> from a DB value.
 *  Same "read as UTC" trick used by fmtDT — the DB stored server-local
 *  time but the driver tags it with a Z, so we read the UTC clock faces
 *  to get the wall-clock time the operator originally saw.               */
export const toDTLocalInput = (v) => {
    if (!v) return '';
    const d = new Date(v);
    const p = n => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
};

/** Now, in the local wall clock ("YYYY-MM-DDTHH:MM") — for new-form defaults. */
export const nowDTLocalInput = () => {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
};
