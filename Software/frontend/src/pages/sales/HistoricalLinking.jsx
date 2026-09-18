/**
 * Sales — Link historical payments to the ledger.
 *
 * Owner ask 2026-09-18: payments are recorded on the booking form; the linking
 * to vouchers already posted in the chart of accounts happens here, on its own
 * screen, the same way Booking Draft Vouchers gathers the vouchers awaiting
 * review. Nothing on this screen posts anything — it only ties a payment that
 * is already on record to the voucher that is already in the ledger.
 */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import { Link2, Loader2, RefreshCw, ExternalLink, History } from 'lucide-react';
import { ErpControlPanel } from '../../components/erp';
import { LinkVoucherModal } from './HistoricalPaymentModals';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');
const dt = (d) => (d ? new Date(d).toLocaleDateString('en-PK') : '—');

const TABS = [
    { key: 'unlinked', label: 'Not linked yet' },
    { key: 'linked',   label: 'Linked' },
    { key: 'all',      label: 'All' },
];

export default function HistoricalLinking() {
    // A booking can send you straight here for its own payments.
    const [params, setParams] = useSearchParams();
    const bookingFilter = params.get('bookingId');
    const [rows, setRows] = useState([]);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState('unlinked');
    const [msg, setMsg] = useState(null);
    const [linkFor, setLinkFor] = useState(null);

    const flash = (kind, text) => { setMsg({ kind, text }); setTimeout(() => setMsg(null), 4000); };

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const r = await axios.get(`${API}/sales/historical/pending-links`,
                { params: { state: tab, bookingId: bookingFilter || undefined } });
            setRows(r.data || []);
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
        setBusy(false);
    }, [tab, bookingFilter]);
    useEffect(() => { load(); }, [load]);

    const unlink = async (row) => {
        try {
            const { data } = await axios.post(`${API}/sales/historical/payments/${row.PaymentID}/unlink`);
            flash('ok', data.message);
            load();
        } catch (e) { flash('err', e.response?.data?.error || e.message); }
    };

    const total = rows.reduce((s, r) => s + Number(r.Amount || 0) + Number(r.PremiumPortion || 0), 0);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><History size={16} /> Historical Payment Links</span>}
                subtitle="Payments recorded on old bookings, waiting to be tied to the voucher that is already posted in the chart of accounts. Nothing here posts to the GL."
                actions={<button className="btn-sm" onClick={load} disabled={busy}>{busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />} Refresh</button>}
            />

            {msg && (
                <div className="card" style={{
                    background: msg.kind === 'ok' ? '#dcfce7' : '#fee2e2',
                    color: msg.kind === 'ok' ? '#166534' : '#b91c1c', fontSize: '0.85rem' }}>
                    {msg.text}
                </div>
            )}

            {bookingFilter && (
                <div className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', fontSize: '0.82rem' }}>
                    <span>Showing one booking only{rows[0]?.BookingNo ? <> — <strong>{rows[0].BookingNo}</strong></> : ''}.</span>
                    <button className="btn-sm" onClick={() => setParams({})}>Show all bookings</button>
                </div>
            )}

            <div className="card" style={{ display: 'flex', gap: 4, padding: 6 }}>
                {TABS.map(t => (
                    <button key={t.key} onClick={() => setTab(t.key)}
                        style={{
                            padding: '6px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                            background: tab === t.key ? '#1e40af' : 'transparent',
                            color: tab === t.key ? 'white' : '#475569',
                            fontWeight: tab === t.key ? 600 : 500, fontSize: '0.85rem',
                        }}>
                        {t.label}
                    </button>
                ))}
            </div>

            <div className="card">
                <h3 style={{ marginTop: 0, fontSize: '1rem' }}>
                    {TABS.find(t => t.key === tab)?.label} ({rows.length})
                    <span style={{ fontWeight: 400, color: '#64748b', fontSize: '0.8rem', marginLeft: 8 }}>
                        PKR {fmtN(total)}
                    </span>
                </h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={th}>Booking</th>
                            <th style={th}>Customer</th>
                            <th style={th}>Vehicle</th>
                            <th style={th}>Paid on</th>
                            <th style={th}>Mode</th>
                            <th style={{ ...th, textAlign: 'right' }}>Amount</th>
                            <th style={th}>Ledger voucher</th>
                            <th style={th}></th>
                        </tr></thead>
                        <tbody>
                            {rows.map(r => {
                                const amount = Number(r.Amount || 0) + Number(r.PremiumPortion || 0);
                                return (
                                    <tr key={r.PaymentID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                        <td style={td}>
                                            <Link to={`/sales/bookings/${r.BookingID}`} style={{ color: '#1e40af', fontWeight: 600, textDecoration: 'none' }}>
                                                {r.BookingNo} <ExternalLink size={11} style={{ display: 'inline', verticalAlign: 'middle' }} />
                                            </Link>
                                            <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                                                booked {dt(r.BookingDate)} · payment #{r.PaymentID}
                                            </div>
                                        </td>
                                        <td style={td}>{r.PartyName || '—'}</td>
                                        <td style={td}>
                                            <div>{[r.ModelName, r.VariantName].filter(Boolean).join(' ') || '—'}</div>
                                            {r.ChasisNo && <div style={{ fontSize: '0.72rem', color: '#94a3b8' }}>{r.ChasisNo}</div>}
                                        </td>
                                        <td style={td}>{dt(r.ReceivedAt)}</td>
                                        <td style={td}>{r.PaymentMode}</td>
                                        <td style={tdNum}>{fmtN(amount)}</td>
                                        <td style={td}>
                                            {r.VoucherNo
                                                ? <span style={{ color: '#0f766e', fontWeight: 600 }}>{r.VoucherNo}
                                                      <span style={{ color: '#94a3b8', fontWeight: 400 }}> · {dt(r.LinkedVoucherDate)}</span>
                                                  </span>
                                                : <span style={{ color: '#b45309', fontWeight: 600 }}>Not linked</span>}
                                        </td>
                                        <td style={td}>
                                            {r.VoucherID
                                                ? <button className="btn-sm" onClick={() => unlink(r)}
                                                          title="Remove the link — the voucher stays exactly as it is in the ledger">Unlink</button>
                                                : <button className="btn-sm" onClick={() => setLinkFor(r)}
                                                          style={{ background: '#1e40af', color: 'white', border: 'none' }}>
                                                      <Link2 size={12} /> Link voucher
                                                  </button>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {!busy && rows.length === 0 && (
                                <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>
                                    {tab === 'unlinked'
                                        ? 'Nothing waiting — every historical payment is tied to its ledger voucher.'
                                        : 'Nothing here yet.'}
                                </td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {linkFor && (
                <LinkVoucherModal
                    booking={{ BookingID: linkFor.BookingID, PartyName: linkFor.PartyName }}
                    payment={linkFor}
                    onClose={() => setLinkFor(null)}
                    onSaved={(voucherNo) => { setLinkFor(null); flash('ok', `Payment #${linkFor.PaymentID} linked to ${voucherNo}`); load(); }} />
            )}
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
const tdNum = { padding: 8, textAlign: 'right', fontFamily: 'monospace' };
