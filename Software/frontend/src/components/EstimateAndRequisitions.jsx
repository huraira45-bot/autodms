/**
 * The signed estimate and what it sent to the parts counter, on the job card.
 *
 * Owner ask 2026-09-26: both were visible only on the tablet, so anyone at a
 * desk could see a job card without being able to see what the customer
 * actually agreed to or whether the parts had been issued.
 *
 * Quantities issued are the live figures the parts counter's own loader reads
 * off the Parts Issue lines — not a stored number, which would go stale the
 * moment an issue line is edited or deleted on that screen.
 *
 * Renders nothing for a job card written at the desk, which has neither.
 */
import { FileText, Package, Printer, Check, Clock, Ban } from 'lucide-react';

const money = n => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const when  = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';
const qty   = n => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 2 });

const C = { line: '#dbe3ec', head: '#1a3a6a', muted: '#64748b', ok: '#16a34a', warn: '#b45309', bad: '#dc2626' };

const S = {
    wrap:  { border: '1px solid #c8d4e4', borderRadius: 6, background: '#f7fafc', padding: 12, marginTop: 10 },
    head:  { display: 'flex', alignItems: 'center', gap: 7, fontSize: 12, fontWeight: 700, color: C.head, marginBottom: 8 },
    row:   { display: 'flex', alignItems: 'center', gap: 12, padding: '7px 0', borderTop: `1px solid ${C.line}`, flexWrap: 'wrap' },
    pill:  (bg, fg) => ({ fontSize: 10.5, fontWeight: 700, padding: '2px 7px', borderRadius: 10, background: bg, color: fg }),
    link:  { display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: C.head,
             textDecoration: 'none', border: `1px solid ${C.line}`, borderRadius: 4, padding: '4px 8px', background: '#fff' },
    lines: { marginTop: 5, paddingLeft: 14, borderLeft: `2px solid ${C.line}` },
};

const estimatePill = (e) => {
    if (e.Status === 'Converted') return <span style={S.pill('#dcfce7', '#166534')}>Signed</span>;
    if (e.Status === 'Cancelled') return <span style={S.pill('#fee2e2', '#991b1b')}>Cancelled</span>;
    return <span style={S.pill('#fef3c7', '#92400e')}>{e.Status}</span>;
};

export default function EstimateAndRequisitions({ estimates = [], requisitions = [] }) {
    if (!estimates.length && !requisitions.length) return null;

    return (
        <div style={S.wrap}>
            {estimates.length > 0 && (
                <>
                    <div style={S.head}><FileText size={15} /> Estimate the customer agreed to</div>
                    {estimates.map(e => (
                        <div key={e.EstimateID} style={S.row}>
                            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                                <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                    {e.EstimateNo}
                                    {e.RevisionNo > 1 && (
                                        <span style={{ fontWeight: 400, color: C.muted }}>· additional work</span>
                                    )}
                                    {estimatePill(e)}
                                </div>
                                <div style={{ fontSize: 11.5, color: C.muted }}>
                                    {e.LineCount} line{e.LineCount === 1 ? '' : 's'}
                                    {e.SignerName ? ` · signed by ${e.SignerName}, ${when(e.SignedAt)}` : ' · not signed'}
                                    {e.BayName ? ` · bay ${e.BayName}` : ''}
                                </div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: 13, fontWeight: 700 }}>Rs {money(e.GrandTotal)}</div>
                                <div style={{ fontSize: 10.5, color: C.muted }}>
                                    labour {money(Number(e.LabourTotal) + Number(e.LabourTax))}
                                    {' · '}parts {money(Number(e.PartsTotal) + Number(e.PartsTax))}
                                </div>
                            </div>
                            <a href={`/tablet/estimates/${e.EstimateID}/print`} target="_blank" rel="noreferrer" style={S.link}>
                                <Printer size={13} /> Print
                            </a>
                        </div>
                    ))}
                </>
            )}

            {requisitions.length > 0 && (
                <div style={{ marginTop: estimates.length ? 12 : 0, paddingTop: estimates.length ? 10 : 0,
                              borderTop: estimates.length ? `1px solid #e2e8f0` : 'none' }}>
                    <div style={S.head}><Package size={15} /> Parts requested from the counter</div>
                    {requisitions.map(r => {
                        const lines = r.Lines || [];
                        // "Issued" only when every line is fully out; anything
                        // less is still holding the car up.
                        const outstanding = lines.filter(l => Number(l.QtyIssued || 0) < Number(l.QtyRequested || 0)).length;
                        const cancelled = r.Status === 'Cancelled';
                        return (
                            <div key={r.RequisitionID} style={S.row}>
                                <div style={{ flex: '1 1 100%' }}>
                                    <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                                        {r.RequisitionNo}
                                        {cancelled
                                            ? <span style={S.pill('#fee2e2', '#991b1b')}><Ban size={10} /> Cancelled</span>
                                            : outstanding === 0
                                                ? <span style={S.pill('#dcfce7', '#166534')}><Check size={10} /> All issued</span>
                                                : <span style={S.pill('#fef3c7', '#92400e')}><Clock size={10} /> {outstanding} still to issue</span>}
                                        <span style={{ fontWeight: 400, fontSize: 11.5, color: C.muted }}>
                                            requested {when(r.RequestedAt)}
                                            {r.RequestedByName ? ` by ${r.RequestedByName}` : ''}
                                        </span>
                                    </div>
                                    {cancelled && r.CancelReason && (
                                        <div style={{ fontSize: 11.5, color: C.bad }}>{r.CancelReason}</div>
                                    )}
                                    <div style={S.lines}>
                                        {lines.map(l => {
                                            const req = Number(l.QtyRequested || 0);
                                            const iss = Number(l.QtyIssued || 0);
                                            const full = iss >= req;
                                            return (
                                                <div key={l.RequisitionLineID}
                                                     style={{ display: 'flex', gap: 10, alignItems: 'baseline',
                                                              fontSize: 12, padding: '2px 0' }}>
                                                    <span style={{ flex: 1, minWidth: 0 }}>
                                                        {l.Description}
                                                        {l.PartNumber && (
                                                            <code style={{ marginLeft: 6, fontSize: 10.5, color: C.muted }}>{l.PartNumber}</code>
                                                        )}
                                                    </span>
                                                    <span style={{ color: cancelled ? C.muted : full ? C.ok : C.warn, fontWeight: 600 }}>
                                                        {qty(iss)} / {qty(req)}
                                                    </span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
