const ACTIONS = {
    VOUCHER_EDIT: 'Voucher edited', DATE_CHANGE: 'Date changed',
    LINE_DEPARTMENT_CHANGE: 'Department / expense changed', EXPENSE_FLAG_CHANGE: 'Expense flags changed',
    LEGACY_DATE_CHANGE: 'Earlier date change (date-only record)',
};
const labels = { VoucherNo: 'Voucher number', VoucherDate: 'Voucher date', VoucherTypeID: 'Voucher type ID',
    VoucherTypeCode: 'Voucher type', Status: 'Status', TotalAmount: 'Total amount', Remarks: 'Remarks',
    SourceDocType: 'Source document type', SourceDocID: 'Source document ID', ReversesVoucherID: 'Reversed voucher',
    GLCAID: 'Account', Narration: 'Narration', Debit: 'Debit', Credit: 'Credit', DepartmentID: 'Department',
    IsExpense: 'Expense flag', PartyID: 'Party', JobCardID: 'Job card', BookingID: 'Booking', AllocatedToVoucherID: 'Allocated voucher' };
const offsetMs = 5 * 60 * 60 * 1000;
function filters(query = {}, now = new Date()) {
    const today = new Date(now.getTime() + offsetMs).toISOString().slice(0, 10);
    const fromDay = query.from || query.to || today, toDay = query.to || query.from || today;
    const day = value => {
        if (typeof value !== 'string' || !/^(?!0000)\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Use edit dates in YYYY-MM-DD format.');
        const date = new Date(`${value}T00:00:00Z`);
        if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value) throw new Error('Invalid edit date.');
        return new Date(date.getTime() - offsetMs);
    };
    const from = day(fromDay), last = day(toDay), to = new Date(last.getTime() + 86400000);
    if (from > last || to.getUTCFullYear() > 9999 || from.getUTCFullYear() < 1) throw new Error('Choose a valid edit date range.');
    const text = (key, max) => {
        if (query[key] !== undefined && (typeof query[key] !== 'string' || query[key].length > max))
            throw new Error(`${key === 'changedBy' ? 'Editing user' : 'Voucher number'} must be text of at most ${max} characters.`);
        return (query[key] || '').trim();
    };
    const action = query.action || '';
    if (typeof action !== 'string' || (action && !Object.hasOwn(ACTIONS, action))) throw new Error('Invalid edit action.');
    return { fromDay, toDay, from, to, legacyFrom: new Date(from.getTime() + offsetMs), legacyTo: new Date(to.getTime() + offsetMs),
        voucherNo: text('voucherNo', 50), changedBy: text('changedBy', 100), action };
}
const like = value => `%${value.replace(/[~%_[\]]/g, '~$&')}%`;
function reportQuery(f) {
    const extra = [f.voucherNo && "h.VoucherNo LIKE @voucherNo ESCAPE '~'", f.changedBy && "h.ChangedByName LIKE @changedBy ESCAPE '~'", f.action && 'h.Action=@action'].filter(Boolean);
    const where = extra.length ? ' AND ' + extra.join(' AND ') : '';
    const columns = 'h.EditID,h.VoucherID,h.VoucherNo,h.Action,h.Reason,h.ChangedBy,h.ChangedByName,h.BeforeJSON,h.AfterJSON';
    // Migration 158 copied the older GETDATE() log verbatim. Those date-only
    // timestamps are Pakistan wall time; subsequent audit entries are UTC.
    // Keep the evidence immutable and normalize only the report's projection.
    return `SELECT edits.*,CAST(CASE WHEN voucher.VoucherID IS NULL THEN 0 ELSE 1 END AS BIT) AS VoucherExists,
        vt.Title AS CurrentVoucherType
        FROM (
            SELECT ${columns},h.ChangedAt AS EditedAtUtc FROM dms_VoucherEditHistory h
            WHERE h.Action<>'LEGACY_DATE_CHANGE' AND h.ChangedAt>=@from AND h.ChangedAt<@to${where}
            UNION ALL
            SELECT ${columns},DATEADD(minute,-300,h.ChangedAt) AS EditedAtUtc FROM dms_VoucherEditHistory h
            WHERE h.Action='LEGACY_DATE_CHANGE' AND h.ChangedAt>=@legacyFrom AND h.ChangedAt<@legacyTo${where}
        ) edits
        LEFT JOIN data_FinanceVoucherInfo voucher ON voucher.VoucherID=edits.VoucherID
        LEFT JOIN GLVoucherType vt ON vt.Voucherid=voucher.VoucherTypeID
        ORDER BY edits.EditedAtUtc DESC,edits.EditID DESC`;
}

const equal = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const account = line => line?.GLCAID == null ? null : [line.GLCode || `#${line.GLCAID}`, line.GLTitle].filter(Boolean).join(' ');
const lineText = line => `${account(line) || 'No account'} | Debit ${line.Debit ?? 0} | Credit ${line.Credit ?? 0}${line.Narration ? ` | ${line.Narration}` : ''}`;
function changes(before, after) {
    const result = [];
    const add = (section, field, old, next) => result.push({ Section: section, Field: labels[field] || field, Before: old ?? null, After: next ?? null });
    const headerBefore = before.Header || {}, headerAfter = after.Header || {};
    for (const key of new Set([...Object.keys(headerBefore), ...Object.keys(headerAfter)]))
        if (key !== 'VoucherID' && !equal(headerBefore[key], headerAfter[key])) add('Voucher', key, headerBefore[key], headerAfter[key]);
    if (Array.isArray(before.Lines) && Array.isArray(after.Lines)) {
        const old = before.Lines, next = after.Lines;
        const hasSharedIds = old.some(line => line.VoucherDetailID != null && next.some(n => n.VoucherDetailID === line.VoucherDetailID));
        const pairs = hasSharedIds
            ? old.map((line, i) => [line, next.find(n => n.VoucherDetailID === line.VoucherDetailID), i + 1]).concat(
                next.flatMap((line, i) => old.some(o => o.VoucherDetailID === line.VoucherDetailID) ? [] : [[undefined, line, i + 1]]))
            : Array.from({ length: Math.max(old.length, next.length) }, (_, i) => [old[i], next[i], i + 1]);
        for (const [a, b, index] of pairs) {
            const section = `Line ${index}`;
            if (!a) { add(section, 'Line added', null, lineText(b)); continue; }
            if (!b) { add(section, 'Line removed', lineText(a), null); continue; }
            for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
                // Re-saving a voucher replaces its internal line IDs. Lookup
                // names accompany an account/department change, not a separate edit.
                if (['VoucherDetailID', 'VoucherID', 'GLCode', 'GLTitle', 'DepartmentName'].includes(key) || equal(a[key], b[key])) continue;
                const display = line => key === 'GLCAID' ? account(line) : key === 'DepartmentID' ? (line.DepartmentName || line.DepartmentID) : line[key];
                add(section, key, display(a), display(b));
            }
        }
    }
    if (Array.isArray(before.Charity) && Array.isArray(after.Charity)) {
        const key = list => list.map(row => JSON.stringify(row)).sort();
        if (!equal(key(before.Charity), key(after.Charity))) {
            const text = list => list.map(row => `${row.CharityAmount} on ${row.VoucherAmount}`).join('; ') || null;
            add('Voucher', 'Manual charity', text(before.Charity), text(after.Charity));
        }
    }
    return result;
}
function formatEvent(row) {
    const { BeforeJSON, AfterJSON, EditedAtUtc, CurrentVoucherType, ...metadata } = row;
    const before = JSON.parse(BeforeJSON), after = JSON.parse(AfterJSON);
    if (!before || !after || typeof before !== 'object' || typeof after !== 'object') throw new Error('Invalid saved voucher audit snapshot.');
    const diff = changes(before, after);
    return { ...metadata, EditedAtUtc: new Date(EditedAtUtc).toISOString(), ActionLabel: ACTIONS[row.Action] || row.Action,
        VoucherType: after.Header?.VoucherTypeCode || before.Header?.VoucherTypeCode || CurrentVoucherType || '',
        VoucherDateBefore: before.Header?.VoucherDate?.slice(0, 10) || null, VoucherDateAfter: after.Header?.VoucherDate?.slice(0, 10) || null,
        Coverage: row.Action === 'LEGACY_DATE_CHANGE' ? 'Earlier date-only record' : 'Saved before/after snapshots',
        Changes: diff, ChangesSummary: diff.map(c => `${c.Section}: ${c.Field}`).join('; ') || 'No field values changed', Before: before, After: after };
}
module.exports = { ACTIONS, filters, like, reportQuery, changes, formatEvent };
