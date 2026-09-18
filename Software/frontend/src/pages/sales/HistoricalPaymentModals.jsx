/**
 * Historical booking payments — two separate steps (owner ask 2026-09-18):
 *
 *   1. HistoricalPaymentModal — record what the customer paid on the old deal.
 *      It counts towards the booking straight away. No voucher is posted and
 *      none has to be chosen yet.
 *   2. LinkVoucherModal — later, tie that payment to the voucher already posted
 *      in the chart of accounts. Entering a hundred old payments should not
 *      stall because one voucher is hard to find.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Link2, AlertTriangle } from 'lucide-react';
import { inputStyle, Field, Err, Shell } from './VehicleModelsAdmin';

const API = '/api';
const fmtN = (n) => Number(n || 0).toLocaleString('en-PK');
const MODES = ['BankTransfer', 'Cash', 'Cheque', 'POS', 'PayOrder'];

/** Step one — the payment goes on record. */
export function HistoricalPaymentModal({ booking, onClose, onSaved }) {
    const [amount, setAmount] = useState('');
    const [premium, setPremium] = useState('');
    const [mode, setMode] = useState('BankTransfer');
    const [receivedAt, setReceivedAt] = useState('');
    const [notes, setNotes] = useState('');
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const total = Math.round(((Number(amount) || 0) + (Number(premium) || 0)) * 100) / 100;

    const save = async () => {
        setBusy(true); setErr(null);
        try {
            const { data } = await axios.post(`${API}/sales/historical/bookings/${booking.BookingID}/payment`, {
                Amount: Number(amount),
                PremiumPortion: Number(premium) || 0,
                PaymentMode: mode,
                ReceivedAt: receivedAt || undefined,
                Notes: notes || undefined,
            });
            onSaved(data.message);
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    return (
        <Shell title="Record a payment on this old booking" onClose={onClose}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f0f9ff', borderLeft: '3px solid #0369a1', borderRadius: 4, marginBottom: 12, fontSize: '0.82rem', color: '#0c4a6e' }}>
                This records what <strong>{booking.PartyName}</strong> paid on the old deal, and it counts towards the
                booking straight away. <strong>No voucher is posted.</strong> Once it is saved you can link it to the
                voucher already in your ledger — from the payments list, whenever you have found it.
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="Vehicle amount (PKR) *" flex>
                    <input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={inputStyle} />
                </Field>
                <Field label="Premium (if any)" flex>
                    <input type="number" value={premium} onChange={e => setPremium(e.target.value)} style={inputStyle} />
                </Field>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="How it was paid" flex>
                    <select value={mode} onChange={e => setMode(e.target.value)} style={inputStyle}>
                        {MODES.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                </Field>
                <Field label="Date received" flex>
                    <input type="date" value={receivedAt} onChange={e => setReceivedAt(e.target.value)} style={inputStyle} />
                </Field>
            </div>
            <Field label="Notes (optional)">
                <input value={notes} onChange={e => setNotes(e.target.value)}
                       placeholder="e.g. receipt book #12, old file reference" style={inputStyle} />
            </Field>

            {total > 0 && (
                <div style={{ padding: 8, background: '#f8fafc', borderRadius: 4, fontSize: '0.82rem', marginBottom: 10 }}>
                    Total recorded: <strong>PKR {fmtN(total)}</strong>
                    {Number(premium) > 0 && ` (vehicle ${fmtN(amount)} + premium ${fmtN(premium)})`}
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn" onClick={save} disabled={busy || !(Number(amount) > 0)}>
                    {busy ? 'Saving…' : 'Record payment'}
                </button>
            </div>
        </Shell>
    );
}

/** Step two — tie that payment to the voucher already in the ledger. */
export function LinkVoucherModal({ booking, payment, onClose, onSaved }) {
    const total = Math.round((Number(payment.Amount) + Number(payment.PremiumPortion || 0)) * 100) / 100;
    const [search, setSearch] = useState('');
    const [vouchers, setVouchers] = useState(null);     // null until searched
    const [others, setOthers] = useState(null);         // everything on the account
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);

    const find = async (all = false) => {
        setErr(null); setBusy(true);
        if (!all) { setPicked(null); setOthers(null); }
        try {
            const { data } = await axios.get(
                `${API}/sales/historical/bookings/${booking.BookingID}/linkable-vouchers`,
                { params: all ? { all: 1 } : { amount: total, search: search || undefined } });
            if (all) setOthers(data.vouchers || []);
            else setVouchers(data.vouchers || []);
        } catch (e) { setErr(e.response?.data?.error || e.message); if (!all) setVouchers([]); }
        setBusy(false);
    };

    const link = async () => {
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/historical/payments/${payment.PaymentID}/link`, { VoucherID: picked.VoucherID });
            onSaved(picked.VoucherNo);
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    const row = (v, selectable) => (
        <div key={v.VoucherID} onClick={() => selectable && setPicked(v)}
             style={{ padding: 10, borderBottom: '1px solid #f1f5f9', cursor: selectable ? 'pointer' : 'default',
                      background: picked?.VoucherID === v.VoucherID ? '#eff6ff' : 'white', opacity: selectable ? 1 : 0.75 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                <strong>{v.VoucherNo}</strong>
                <span>{fmtN(v.TotalAmount)}</span>
            </div>
            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                {v.VoucherType} · {new Date(v.VoucherDate).toLocaleDateString()}
                {v.Remarks ? ` · ${String(v.Remarks).slice(0, 80)}` : ''}
            </div>
        </div>
    );

    return (
        <Shell title={`Link payment #${payment.PaymentID} to a voucher in the ledger`} onClose={onClose}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f0f9ff', borderLeft: '3px solid #0369a1', borderRadius: 4, marginBottom: 12, fontSize: '0.82rem', color: '#0c4a6e' }}>
                Payment of <strong>PKR {fmtN(total)}</strong> on {new Date(payment.ReceivedAt).toLocaleDateString()}.
                Pick the voucher already posted on <strong>{booking.PartyName}</strong>'s account for the same amount.
                Nothing is posted — the voucher stays exactly as it is.
            </div>

            <Field label="Narrow by voucher number or narration (optional)">
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="e.g. BRV-0912" style={inputStyle} />
            </Field>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Vouchers for exactly PKR {fmtN(total)}</span>
                <button className="btn-sm" onClick={() => find(false)} disabled={busy}>
                    {busy ? 'Searching…' : 'Find vouchers'}
                </button>
            </div>

            {vouchers && (
                <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    {vouchers.length === 0 ? (
                        <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            No unlinked voucher on this account for exactly PKR {fmtN(total)}.
                            <div style={{ marginTop: 8 }}>
                                <button className="btn-sm" onClick={() => find(true)} disabled={busy}>
                                    Show what is on this account
                                </button>
                            </div>
                        </div>
                    ) : vouchers.map(v => row(v, true))}
                </div>
            )}

            {others && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
                        Unlinked vouchers on {booking.PartyName}'s account ({others.length}) — for reference; only one
                        of the same amount can be linked.
                    </div>
                    <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px dashed #cbd5e1', borderRadius: 6 }}>
                        {others.length === 0
                            ? <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                  Nothing unlinked on this account at all. Post the entry in Accounting first.
                              </div>
                            : others.map(v => row(v, Math.abs(Number(v.TotalAmount) - total) < 0.01))}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn" onClick={link} disabled={busy || !picked}>
                    <Link2 size={13} /> {picked ? `Link to ${picked.VoucherNo}` : 'Pick a voucher'}
                </button>
            </div>
        </Shell>
    );
}
