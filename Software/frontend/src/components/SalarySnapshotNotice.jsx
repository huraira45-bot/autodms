export default function SalarySnapshotNotice({ sheet }) {
    if (!sheet?.isFrozen && !sheet?.legacyPosted) return null;
    const stamp = sheet.snapshot?.capturedAt
        ? new Date(sheet.snapshot.capturedAt).toLocaleString('en-PK', { timeZone: 'Asia/Karachi' }) : '';
    return <div role="status" style={{ padding: '8px 12px', margin: '8px 0', fontSize: 12,
        border: '1px solid #cbd5e1', borderRadius: 5, background: '#f8fafc', color: '#334155' }}>
        {sheet.isFrozen ? <>
            <strong>Saved salary sheet - read-only.</strong> Employee details and salary figures are preserved.
            {stamp && <> Captured: {stamp}.</>}
            {sheet.snapshot?.basis === 'LEGACY_CURRENT' && <div>
                Captured after posting from the data available at capture time; this is not a reconstruction of the original posted sheet.
            </div>}
        </> : <>
            <strong>Previously posted month - fixed copy not yet saved.</strong> These figures use current employee data.
            Ask the administrator to save the historical baseline before relying on this sheet.
        </>}
    </div>;
}
