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
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Link2, AlertTriangle } from 'lucide-react';
import { inputStyle, Field, Err, Shell } from './VehicleModelsAdmin';

import { VoucherSearchFields, HistoricalVoucherReferencePanel } from './HistoricalVoucherReferences';
import { HistoricalMasterApprovalPanel } from './HistoricalMasterApproval';

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
    const [voucherType, setVoucherType] = useState('');
    const [referenceOnly, setReferenceOnly] = useState(false);
    const [vouchers, setVouchers] = useState(null);     // null until searched
    const [others, setOthers] = useState(null);         // everything on the account
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const canLinkVoucher = v => Number(v.AvailableAmount || 0) > 0 && Math.round(Number(v.AvailableAmount || 0) * 100) >= Math.round(total * 100);

    const find = async (all = false) => {
        setErr(null); setBusy(true); setPicked(null);
        setVouchers(null); setOthers(null);
        try {
            const { data } = await axios.get(
                `${API}/sales/historical/bookings/${booking.BookingID}/linkable-vouchers`,
                { params: { ...(all ? { all: 1 } : { amount: total }), search: search || undefined, voucherType: voucherType || undefined } });
            if (all) setOthers(data.vouchers || []);
            else setVouchers(data.vouchers || []);
        } catch (e) { setErr(e.response?.data?.error || e.message); if (!all) setVouchers([]); }
        setBusy(false);
    };

    const link = async () => {
        if (!picked || !canLinkVoucher(picked)) return;
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/historical/payments/${payment.PaymentID}/link`, { VoucherID: picked.VoucherID });
            onSaved(picked.VoucherNo);
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    const row = v => {
        const selectable = canLinkVoucher(v);
        return (
            <div key={v.VoucherID} onClick={() => selectable && setPicked(v)}
                 role={selectable ? 'button' : undefined} tabIndex={selectable ? 0 : undefined}
                 onKeyDown={e => {
                     if (selectable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPicked(v); }
                 }}
                 style={{ padding: 10, borderBottom: '1px solid #f1f5f9', cursor: selectable ? 'pointer' : 'default',
                          background: picked?.VoucherID === v.VoucherID ? '#eff6ff' : 'white', opacity: selectable ? 1 : 0.75 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.85rem' }}>
                    <strong>{v.VoucherNo}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Voucher total: PKR {fmtN(v.TotalAmount)}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
                    {v.VoucherType} &middot; {new Date(v.VoucherDate).toLocaleDateString()}
                    {v.Remarks ? ` | ${String(v.Remarks).slice(0, 80)}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8, fontSize: '0.75rem' }}>
                    <div><span style={{ color: '#64748b' }}>Account amount</span><div>PKR {fmtN(v.CustomerAmount)}</div></div>
                    <div><span style={{ color: '#64748b' }}>Already linked</span><div>PKR {fmtN(v.LinkedAmount)}</div></div>
                    <div><span style={{ color: '#64748b' }}>Available</span><div style={{ fontWeight: 600, color: selectable ? '#166534' : '#92400e' }}>PKR {fmtN(v.AvailableAmount)}</div></div>
                </div>
                {!selectable && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#92400e' }}>Insufficient available amount for this payment.</div>}
            </div>
        );
    };

    return (
        <Shell title={`Link payment #${payment.PaymentID} to a voucher in the ledger`} onClose={onClose} width={640}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn-sm" disabled={busy} aria-pressed={!referenceOnly} onClick={() => setReferenceOnly(false)}>Payment link</button>
                <button className="btn-sm" disabled={busy} aria-pressed={referenceOnly} onClick={() => setReferenceOnly(true)}>Any voucher as reference</button>
            </div>
            {referenceOnly && <HistoricalVoucherReferencePanel booking={booking} kind="CUSTOMER" paymentId={payment.PaymentID} />}
            <div hidden={referenceOnly}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f0f9ff', borderLeft: '3px solid #0369a1', borderRadius: 4, marginBottom: 12, fontSize: '0.82rem', color: '#0c4a6e' }}>
                Payment of <strong>PKR {fmtN(total)}</strong> on {new Date(payment.ReceivedAt).toLocaleDateString()}.
                {' '}Pick a posted voucher with at least this amount available on <strong>{booking.PartyName}</strong>'s account.
                {' '}A shared opening voucher can cover other customers and bookings; each link uses only this payment amount.
            </div>

            <VoucherSearchFields search={search} voucherType={voucherType} disabled={busy}
                onSearch={value => { setSearch(value); setPicked(null); setVouchers(null); setOthers(null); }}
                onType={value => { setVoucherType(value); setPicked(null); setVouchers(null); setOthers(null); }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>Account balance available: at least PKR {fmtN(total)}</span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-sm" onClick={() => find(true)} disabled={busy}>Show account</button>
                    <button className="btn-sm" onClick={() => find(false)} disabled={busy}>
                        {busy ? 'Searching...' : 'Find vouchers'}
                    </button>
                </div>
            </div>

            {vouchers && (
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    {vouchers.length === 0 ? (
                        <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            No posted voucher has PKR {fmtN(total)} available on this account. Use Show account to review its vouchers.
                        </div>
                    ) : vouchers.map(row)}
                </div>
            )}

            {others && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
                        Posted vouchers on {booking.PartyName}'s account ({others.length}). Select one with enough available amount;
                        fully allocated vouchers are shown for reference.
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px dashed #cbd5e1', borderRadius: 6 }}>
                        {others.length === 0
                            ? <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                  No posted vouchers on this account. Post the opening entry in Accounting first.
                              </div>
                            : others.map(row)}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-sm" onClick={onClose}>Cancel</button>
                <button className="btn" onClick={link} disabled={busy || !picked || !canLinkVoucher(picked)}>
                    <Link2 size={13} /> {picked ? `Link to ${picked.VoucherNo}` : 'Pick a voucher'}
                </button>
            </div>
            </div>
        </Shell>
    );
}

/**
 * Money forwarded to Master on an OLD deal.
 *
 * Owner report 2026-09-25: Pay Master on a historical booking was posting a
 * fresh voucher, counting money that left the bank months ago a second time.
 * On an old deal the remittance is already in the ledger, so this matches the
 * booking to that voucher instead. Nothing is posted.
 */
export function LinkMasterVoucherModal({ booking, stillOwed, onClose, onSaved }) {
    const agreedRemaining = booking.NegotiatedPrice == null ? Number(stillOwed || 0) : Number(booking.NegotiatedPrice) - Number(booking.AmountPaidToMaster || 0);
    const owed = Math.round(Math.max(0, agreedRemaining) * 100) / 100;
    const [amount, setAmount] = useState(owed > 0 ? String(owed) : booking.HistoricalMasterApprovedAmount ? String(booking.HistoricalMasterApprovedAmount) : '');
    const [approvalOnly, setApprovalOnly] = useState(false);
    const [search, setSearch] = useState('');
    const [voucherType, setVoucherType] = useState('');
    const [referenceOnly, setReferenceOnly] = useState(false);
    const [vouchers, setVouchers] = useState(null);   // null until searched
    const [others, setOthers] = useState(null);
    const [linked, setLinked] = useState([]);
    const [picked, setPicked] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState(null);
    const requestedCents = Math.round(Number(amount) * 100);
    const amountIsValid = Number.isFinite(Number(amount)) && Number.isSafeInteger(requestedCents) && requestedCents > 0 && Number(amount) === requestedCents / 100;
    const canAllocate = v => amountIsValid && Math.round(Number(v.UnclaimedToMaster || 0) * 100) >= requestedCents;

    const loadLinked = async () => {
        try {
            const { data } = await axios.get(`${API}/sales/historical/bookings/${booking.BookingID}/linked-master`);
            setLinked(data || []);
        } catch { /* the list is a convenience; a failure here should not block linking */ }
    };
    useEffect(() => { loadLinked(); }, []);   // eslint-disable-line react-hooks/exhaustive-deps

    const find = async (all = false) => {
        setErr(null); setBusy(true); setPicked(null);
        setVouchers(null); setOthers(null);
        try {
            const { data } = await axios.get(
                `${API}/sales/historical/bookings/${booking.BookingID}/linkable-master-vouchers`,
                { params: { ...(all ? { all: 1 } : { amount: Number(amount) }), search: search || undefined, voucherType: voucherType || undefined } });
            if (all) setOthers(data.vouchers || []);
            else setVouchers(data.vouchers || []);
        } catch (e) { setErr(e.response?.data?.error || e.message); if (!all) setVouchers([]); }
        setBusy(false);
    };

    const link = async () => {
        if (!picked || !canAllocate(picked)) return;
        setBusy(true); setErr(null);
        try {
            const { data } = await axios.post(
                `${API}/sales/historical/bookings/${booking.BookingID}/link-master`,
                { VoucherID: picked.VoucherID, Amount: requestedCents / 100 });
            onSaved(data?.message || `Linked to ${picked.VoucherNo}.`);
        } catch (e) { setErr(e.response?.data?.error || e.message); setBusy(false); }
    };

    const unlink = async (v) => {
        setBusy(true); setErr(null);
        try {
            await axios.post(`${API}/sales/historical/bookings/${booking.BookingID}/unlink-master`,
                             { VoucherID: v.VoucherID });
            await loadLinked();
            setVouchers(null); setOthers(null); setPicked(null);
        } catch (e) { setErr(e.response?.data?.error || e.message); }
        setBusy(false);
    };

    const row = v => {
        const selectable = canAllocate(v);
        return (
            <div key={v.VoucherID} onClick={() => selectable && setPicked(v)}
                 role={selectable ? 'button' : undefined} tabIndex={selectable ? 0 : undefined}
                 onKeyDown={e => {
                     if (selectable && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setPicked(v); }
                 }}
                 style={{ padding: 10, borderBottom: '1px solid #f1f5f9', cursor: selectable ? 'pointer' : 'default',
                          background: picked?.VoucherID === v.VoucherID ? '#eff6ff' : 'white', opacity: selectable ? 1 : 0.75 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: '0.85rem' }}>
                    <strong>{v.VoucherNo}</strong>
                    <span style={{ fontSize: '0.75rem', color: '#64748b' }}>Voucher total: PKR {fmtN(v.TotalAmount)}</span>
                </div>
                <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 3 }}>
                    {v.VoucherType} &middot; {new Date(v.VoucherDate).toLocaleDateString()}
                    {v.Remarks ? ` | ${String(v.Remarks).slice(0, 70)}` : ''}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 8, fontSize: '0.75rem' }}>
                    <div><span style={{ color: '#64748b' }}>Master account amount</span><div>PKR {fmtN(v.MasterAmount)}</div></div>
                    <div><span style={{ color: '#64748b' }}>Already linked</span><div>PKR {fmtN(v.LinkedAmount)}</div></div>
                    <div><span style={{ color: '#64748b' }}>Available</span><div style={{ fontWeight: 600, color: selectable ? '#166534' : '#92400e' }}>PKR {fmtN(v.UnclaimedToMaster)}</div></div>
                </div>
                {!selectable && <div style={{ marginTop: 6, fontSize: '0.72rem', color: '#92400e' }}>
                    {amountIsValid ? 'Insufficient available amount for this booking.' : 'Enter this booking\'s portion to select a voucher.'}
                </div>}
            </div>
        );
    };

    return (
        <Shell title={`${booking.BookingNo} - match the payment already made to Master`} onClose={onClose} width={640}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <button className="btn-sm" disabled={busy} aria-pressed={approvalOnly} onClick={() => { setApprovalOnly(true); setReferenceOnly(false); }}>Approve without voucher</button>
                <button className="btn-sm" disabled={busy} aria-pressed={!referenceOnly && !approvalOnly} onClick={() => { setReferenceOnly(false); setApprovalOnly(false); }}>Master payment link</button>
                <button className="btn-sm" disabled={busy} aria-pressed={referenceOnly} onClick={() => { setReferenceOnly(true); setApprovalOnly(false); }}>Any voucher as reference</button>
            </div>
            {approvalOnly && <HistoricalMasterApprovalPanel booking={booking} onSaved={onSaved} />}
            {referenceOnly && <HistoricalVoucherReferencePanel booking={booking} kind="MASTER" />}
            <div hidden={referenceOnly || approvalOnly}>
            {err && <Err>{err}</Err>}

            <div style={{ padding: 10, background: '#f0f9ff', borderLeft: '3px solid #0369a1', borderRadius: 4,
                          marginBottom: 12, fontSize: '0.82rem', color: '#0c4a6e' }}>
                Enter the portion of the historical Master payment that belongs to this booking, then pick its posted voucher.
                {' '}A shared opening voucher can cover several bookings; only the amount entered here is allocated to this one.
                {' '}Linking or unlinking here affects only this booking's portion.
                {owed > 0 && <> Still to account for: <strong>PKR {fmtN(owed)}</strong>.</>}
            </div>

            {linked.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>Already matched to this booking</div>
                    {linked.map(v => (
                        <div key={v.VoucherID} style={{ display: 'flex', justifyContent: 'space-between',
                                alignItems: 'center', padding: '6px 10px', background: '#f8fafc',
                                border: '1px solid #e2e8f0', borderRadius: 4, marginBottom: 4, fontSize: '0.82rem' }}>
                            <span>
                                <strong>{v.VoucherNo}</strong>
                                <span style={{ color: '#64748b' }}> &middot; {new Date(v.VoucherDate).toLocaleDateString()}</span>
                            </span>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span>PKR {fmtN(v.Amount)}</span>
                                <button className="btn-sm" onClick={() => unlink(v)} disabled={busy}>Unlink</button>
                            </span>
                        </div>
                    ))}
                </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
                <Field label="This booking's portion (PKR)" flex>
                    <input type="number" min="0.01" step="0.01" value={amount}
                           onChange={e => { setAmount(e.target.value); setPicked(null); }} inputMode="decimal"
                           placeholder="e.g. 2000000" style={inputStyle} disabled={busy} />
                    {amount && !amountIsValid && <div style={{ fontSize: '0.75rem', color: '#b91c1c', marginTop: 4 }}>Enter a positive amount with up to two decimal places.</div>}
                </Field>
            </div>
            <VoucherSearchFields search={search} voucherType={voucherType} disabled={busy}
                onSearch={value => { setSearch(value); setPicked(null); setVouchers(null); setOthers(null); }}
                onType={value => { setVoucherType(value); setPicked(null); setVouchers(null); setOthers(null); }} />

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, margin: '10px 0' }}>
                <span style={{ fontSize: '0.8rem', color: '#64748b' }}>
                    Master balance available: at least PKR {fmtN(Number(amount) || 0)}
                </span>
                <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button className="btn-sm" onClick={() => find(true)} disabled={busy}>Show account</button>
                    <button className="btn-sm" onClick={() => find(false)} disabled={busy || !amountIsValid}>
                        {busy ? 'Searching...' : 'Find vouchers'}
                    </button>
                </div>
            </div>

            {vouchers && (
                <div style={{ maxHeight: 260, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                    {vouchers.length === 0 ? (
                        <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                            <AlertTriangle size={14} style={{ display: 'inline', verticalAlign: 'middle', marginRight: 4 }} />
                            No posted voucher has PKR {fmtN(Number(amount) || 0)} available on the Master account.
                            {' '}Use Show account to review its vouchers.
                        </div>
                    ) : vouchers.map(row)}
                </div>
            )}

            {others && (
                <div style={{ marginTop: 10 }}>
                    <div style={{ fontSize: '0.78rem', color: '#64748b', marginBottom: 4 }}>
                        Posted vouchers on the Master account ({others.length}). Select one with enough available amount
                        for this booking's portion.
                    </div>
                    <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px dashed #cbd5e1', borderRadius: 6 }}>
                        {others.length === 0
                            ? <div style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: '0.82rem' }}>
                                  No posted vouchers on the Master account. Post the historical entry in Accounting first.
                              </div>
                            : others.map(row)}
                    </div>
                </div>
            )}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                <button className="btn-sm" onClick={onClose}>Close</button>
                <button className="btn" onClick={link} disabled={busy || !picked || !canAllocate(picked)}>
                    <Link2 size={13} /> {picked ? `Link PKR ${fmtN(Number(amount))} to ${picked.VoucherNo}` : 'Pick a voucher'}
                </button>
            </div>
            </div>
        </Shell>
    );
}
