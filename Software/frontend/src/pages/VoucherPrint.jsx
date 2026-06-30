/**
 * Voucher print view — half-A4, no app chrome, no browser headers.
 *
 *   Top:       Business name (large, centered)
 *   Below:     Voucher No. (small, left)     |     Date (small, right)
 *   Body:      Voucher type title + Cr/Dr line table
 *   Footer:    Signatories — role depends on voucher type:
 *                CPV / BPV       → Prepared by · Checked by · Received by
 *                CRV / BRV / JV  → Prepared by · Checked by · Verified by
 *              + tiny "Printed by <userName> (#<userId>) on <timestamp>" line
 *
 * @page is set to A4 portrait with zero margins, and the page is sized to
 * exactly half of A4 (148.5mm × 210mm) so two vouchers can be cut from one
 * A4 sheet if printed back-to-back.
 *
 * No header/footer injected by the browser — @page margin: 0 strips Chrome's
 * auto URL/page-number strip.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const d   = (v) => v ? new Date(v).toLocaleDateString('en-GB') : '';
const ts  = (v) => v ? new Date(v).toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' }) : '';

// Sign-off labels per voucher-type code (per user policy 2026-06-29).
const SIGN_OFF = {
    CPV: ['Prepared by', 'Checked by', 'Received by'],
    BPV: ['Prepared by', 'Checked by', 'Received by'],
    CRV: ['Prepared by', 'Checked by', 'Verified by'],
    BRV: ['Prepared by', 'Checked by', 'Verified by'],
    JV:  ['Prepared by', 'Checked by', 'Verified by'],
};

export default function VoucherPrint() {
    const { id } = useParams();
    const { user } = useAuth();
    const [v, setV] = useState(null);
    const [err, setErr] = useState(null);

    useEffect(() => {
        axios.get(`/api/accounts/vouchers/${id}`)
            .then(r => { setV(r.data); setTimeout(() => window.print(), 400); })
            .catch(e => setErr(e.response?.data?.error || e.message));
    }, [id]);

    if (err) return <div style={{ padding: 40, color: '#b91c1c', fontFamily: 'Arial' }}>Cannot print: {err}</div>;
    if (!v) return <div style={{ padding: 40, fontFamily: 'Arial' }}>Loading…</div>;

    const code = (v.VoucherTypeCode || '').toUpperCase();
    const signLabels = SIGN_OFF[code] || ['Prepared by', 'Checked by', 'Verified by'];
    // Strip the parenthesised "(SALES)" / "(SERVICES)" disambiguator from the
    // display name — user wants just the voucher type, e.g. "CASH PAYMENT VOUCHER".
    const titleName = (v.VoucherTypeName || code).replace(/\s*\([^)]*\)\s*$/, '').trim();
    const totalDr = (v.lines || []).reduce((s, l) => s + Number(l.Debit || 0), 0);
    const totalCr = (v.lines || []).reduce((s, l) => s + Number(l.Credit || 0), 0);

    return (
        <div className="vch-print">
            {/* Business header */}
            <div className="biz">
                <div className="biz-name">CHANGAN MULTAN MOTORS</div>
                <div className="biz-addr">NEAR PAK-ARAB FERTILIZERS, KHANEWAL ROAD, MULTAN · Phone: 061-111-222-388</div>
            </div>

            {/* Voucher type title centered, then number L + date R */}
            <div className="vch-title">{titleName}</div>
            <div className="vch-meta">
                <span className="vch-no">No. {v.VoucherNo}</span>
                <span className="vch-date">Date: {d(v.VoucherDate)}</span>
            </div>

            {v.Remarks && (
                <div className="narration"><b>Narration:</b> {v.Remarks}</div>
            )}

            {/* Lines */}
            <table className="lines">
                <thead>
                    <tr>
                        <th style={{ width: 70 }}>Code</th>
                        <th>Account Title</th>
                        <th>Narration</th>
                        <th style={{ width: 90, textAlign: 'right' }}>Debit (PKR)</th>
                        <th style={{ width: 90, textAlign: 'right' }}>Credit (PKR)</th>
                    </tr>
                </thead>
                <tbody>
                    {(v.lines || []).map((l, i) => (
                        <tr key={i}>
                            <td style={{ fontFamily: 'monospace' }}>{l.GLCode}</td>
                            <td>{l.GLTitle}</td>
                            <td>{l.Narration || ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(l.Debit) > 0 ? fmt(l.Debit) : ''}</td>
                            <td style={{ textAlign: 'right' }}>{Number(l.Credit) > 0 ? fmt(l.Credit) : ''}</td>
                        </tr>
                    ))}
                    <tr className="totals">
                        <td colSpan={3} style={{ textAlign: 'right' }}>Total</td>
                        <td style={{ textAlign: 'right' }}>{fmt(totalDr)}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(totalCr)}</td>
                    </tr>
                </tbody>
            </table>

            {/* Signatories */}
            <table className="sigs">
                <tbody>
                    <tr>
                        {signLabels.map((label, i) => (
                            <td key={i}>
                                <div className="sig-line">&nbsp;</div>
                                <div className="sig-label">{label}</div>
                            </td>
                        ))}
                    </tr>
                </tbody>
            </table>

            {/* Footer */}
            <div className="vch-footer">
                Printed by: <b>{user?.userName || '—'}</b> (User ID #{user?.userId || '—'})
                · {ts(new Date())}
                · Status: <b>{v.Status}</b>
            </div>

            <style>{`
                /* No browser header/footer — zero @page margin strips Chrome's URL/page strip. */
                @page { size: A4 portrait; margin: 0; }
                @media print {
                    html, body { margin: 0; padding: 0; }
                }
                body { background: white; }
                .vch-print {
                    /* Half A4: 148.5mm tall, full A4 width (210mm). */
                    width: 210mm;
                    min-height: 148.5mm;
                    box-sizing: border-box;
                    padding: 10mm 12mm 8mm 12mm;
                    font-family: 'Segoe UI', 'Calibri', Arial, sans-serif;
                    font-size: 10pt;
                    color: #000;
                }
                .biz { text-align: center; margin-bottom: 6px; padding-bottom: 4px; border-bottom: 1.5px solid #000; }
                .biz-name { font-size: 13pt; font-weight: 700; letter-spacing: 0.03em; }
                .biz-addr { font-size: 8pt; color: #333; margin-top: 2px; }

                .vch-title { font-size: 11pt; font-weight: 700; text-align: center; margin: 6px 0 4px; letter-spacing: 0.05em; }
                .vch-meta { display: flex; justify-content: space-between; margin-bottom: 8px; }
                .vch-no   { font-size: 8.5pt; font-family: 'Consolas', monospace; }
                .vch-date { font-size: 8.5pt; font-family: 'Consolas', monospace; }

                .narration { background: #f3f3f3; padding: 4px 8px; font-size: 9pt; margin-bottom: 6px; border-left: 3px solid #555; }

                .lines { width: 100%; border-collapse: collapse; font-size: 9.5pt; margin-bottom: 12px; }
                .lines th, .lines td {
                    border: 1px solid #000;
                    padding: 4px 6px;
                    vertical-align: top;
                }
                .lines th { background: #e8e8e8; font-size: 8.5pt; text-align: left; font-weight: 700; }
                .lines tr.totals td { font-weight: 700; border-top: 2px solid #000; background: #f8f8f8; }

                .sigs { width: 100%; border-collapse: collapse; margin-top: 20px; }
                .sigs td { width: 33.3%; text-align: center; padding: 0 8px; vertical-align: bottom; }
                .sig-line { height: 28px; border-bottom: 1px solid #000; }
                .sig-label { margin-top: 2px; font-size: 9pt; font-weight: 600; }

                .vch-footer { margin-top: 10px; font-size: 7.5pt; color: #555; border-top: 1px solid #ccc; padding-top: 3px; text-align: center; }
            `}</style>
        </div>
    );
}
