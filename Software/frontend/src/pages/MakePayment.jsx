import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Send, Search, X, Plus, Trash2, Check, Loader2, AlertTriangle, Printer } from 'lucide-react';
import RecentActivityPanel from '../components/RecentActivityPanel';

// Make Payment to suppliers. Symmetric to Receive Payment.
// Workflow per §14.11: pick supplier → see outstanding bills + advance balance →
// enter payment lines (multi-mode) → allocate to bills → post.
// Excess routes to Supplier Advance Paid.

export default function MakePayment() {
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDD, setShowPartyDD] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [bills, setBills] = useState([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [allocations, setAllocations] = useState({});
  const [paymentLines, setPaymentLines] = useState([{ Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '', ChequeDate: '', DrawerBank: '' }]);
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [lastVoucher, setLastVoucher] = useState(null);

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 4000);
  };

  useEffect(() => {
    axios.get('/api/parties').then(r => setParties(r.data)).catch(() => {});
    axios.get('/api/accounts/banks').then(r => setBanks(r.data)).catch(() => {});
  }, []);

  const filteredParties = useMemo(() => {
    if (!partySearch || partySearch.length < 1) return parties.slice(0, 10);
    const q = partySearch.toLowerCase();
    return parties.filter(p => (p.PartyName || '').toLowerCase().includes(q)).slice(0, 10);
  }, [partySearch, parties]);

  const pickParty = async (party) => {
    setSelectedParty(party);
    setPartySearch(party.PartyName);
    setShowPartyDD(false);
    setAllocations({});
    setMsg(''); setErr('');
    try {
      const r = await axios.get(`/api/payments/outstanding/make/${party.PartyID}`);
      setBills(r.data.invoices || []);
      setAdvanceBalance(parseFloat(r.data.advance) || 0);
    } catch (e) { flash('Failed to load supplier bills.', true); }
  };

  const clearParty = () => {
    setSelectedParty(null); setPartySearch(''); setBills([]); setAdvanceBalance(0); setAllocations({});
  };

  const addPaymentLine = () => setPaymentLines([...paymentLines, { Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '', ChequeDate: '', DrawerBank: '' }]);
  const removePaymentLine = (i) => setPaymentLines(paymentLines.filter((_, idx) => idx !== i));
  const updatePaymentLine = (i, field, value) => {
    const next = [...paymentLines];
    next[i] = { ...next[i], [field]: value };
    setPaymentLines(next);
  };

  const totalPayment = useMemo(() => paymentLines.reduce((s, p) => s + (parseFloat(p.Amount) || 0), 0), [paymentLines]);
  const allocatedSum = useMemo(() => Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0), [allocations]);
  const excess = totalPayment - allocatedSum;

  const setAlloc = (voucherId, value) => {
    setAllocations(prev => {
      const next = { ...prev };
      if (!value || parseFloat(value) <= 0) delete next[voucherId];
      else next[voucherId] = value;
      return next;
    });
  };

  const autoAllocateFIFO = () => {
    let remaining = totalPayment;
    const next = {};
    for (const bill of bills) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(bill.Outstanding));
      if (take > 0.005) { next[bill.VoucherID] = take.toFixed(2); remaining -= take; }
    }
    setAllocations(next);
  };

  const handleSubmit = async () => {
    if (!selectedParty) { flash('Select a supplier first.', true); return; }
    if (totalPayment <= 0) { flash('Enter at least one payment line.', true); return; }
    if (allocatedSum > totalPayment + 0.01) { flash(`Allocations exceed payment total.`, true); return; }
    for (const p of paymentLines) {
      if (p.Mode === 'Bank Transfer' && !p.BankGLCAID) { flash('Pick a bank for Bank Transfer line.', true); return; }
      if (p.Mode === 'Cheque') {
        if (!p.BankGLCAID) { flash('Pick the Drawn-On Bank for each Cheque line.', true); return; }
        if (!p.Reference)  { flash('Enter the Cheque # for each Cheque line.', true); return; }
        if (!p.ChequeDate) { flash('Enter the Cheque Date for each Cheque line.', true); return; }
      }
    }

    const allocArray = Object.entries(allocations)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([vid, v]) => ({ TargetVoucherID: parseInt(vid), Amount: parseFloat(v) }));

    setSaving(true);
    try {
      const r = await axios.post('/api/payments/make', {
        partyId: selectedParty.PartyID,
        paymentLines: paymentLines.filter(p => parseFloat(p.Amount) > 0).map(p => ({
          Mode: p.Mode,
          Amount: parseFloat(p.Amount),
          Reference: p.Reference || null,
          BankGLCAID: p.BankGLCAID ? parseInt(p.BankGLCAID) : null,
          ChequeDate: p.Mode === 'Cheque' ? (p.ChequeDate || null) : null,
          DrawerBank: p.Mode === 'Cheque' ? (p.DrawerBank || null) : null,
        })),
        allocations: allocArray,
        narration: narration || null,
      });
      flash(`Payment posted as ${r.data.voucherNo}.`);
      setLastVoucher({ voucherId: r.data.voucherId, voucherNo: r.data.voucherNo });
      setPaymentLines([{ Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '', ChequeDate: '', DrawerBank: '' }]);
      setAllocations({});
      setNarration('');
      if (selectedParty) pickParty(selectedParty);
    } catch (e) {
      flash(e.response?.data?.error || e.message, true);
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Send size={28} style={{ color: '#dc2626' }} />
        <h1 style={{ margin: 0, fontSize: 24 }}>Make Payment</h1>
      </div>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        Pay suppliers via cash, cheque, POS, or bank transfer. Allocate to specific bills or leave as a supplier advance.
      </p>

      {msg && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span>{msg}</span>
          {lastVoucher && (
            <a href={`/vouchers/cpv?id=${lastVoucher.voucherId}&print=1`} target="_blank" rel="noreferrer"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#0f766e', color: 'white', borderRadius: 6, fontWeight: 600, fontSize: '0.85rem', textDecoration: 'none' }}>
              <Printer size={14} /> Print Payment Voucher {lastVoucher.voucherNo}
            </a>
          )}
        </div>
      )}
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{err}</div>}

      {/* Supplier picker */}
      <div style={card}>
        <label style={lblStyle}>Supplier</label>
        <div style={{ position: 'relative' }}>
          <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
          <input
            type="text"
            placeholder="Type to search by name..."
            value={partySearch}
            onChange={e => { setPartySearch(e.target.value); setShowPartyDD(true); if (selectedParty) clearParty(); }}
            onFocus={() => setShowPartyDD(true)}
            onBlur={() => setTimeout(() => setShowPartyDD(false), 200)}
            style={{ ...inp, paddingLeft: 32 }}
          />
          {showPartyDD && filteredParties.length > 0 && !selectedParty && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #cbd5e1', borderRadius: 6, maxHeight: 200, overflow: 'auto', zIndex: 10 }}>
              {filteredParties.map(p => (
                <div key={p.PartyID} onMouseDown={() => pickParty(p)} style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9' }}>
                  {p.PartyName} {p.PartyType ? <span style={{ color: '#94a3b8', fontSize: 11 }}>({p.PartyType})</span> : ''}
                </div>
              ))}
            </div>
          )}
        </div>
        {selectedParty && (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <strong>{selectedParty.PartyName}</strong>
              {advanceBalance > 0 && (
                <span style={{ marginLeft: 14, padding: '4px 10px', background: '#fef3c7', color: '#92400e', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                  Existing advance to supplier: PKR {advanceBalance.toLocaleString()}
                </span>
              )}
            </div>
            <button onClick={clearParty} style={iconBtn}><X size={16} /></button>
          </div>
        )}
      </div>

      {/* Outstanding bills */}
      {selectedParty && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Outstanding Bills ({bills.length})</strong>
            {bills.length > 0 && <button onClick={autoAllocateFIFO} style={btn('ghost')}>Auto-allocate FIFO</button>}
          </div>
          {bills.length === 0 ? (
            <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>No open bills for this supplier.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}>Doc</th>
                  <th style={th}>Date</th>
                  <th style={{ ...th, textAlign: 'right' }}>Billed</th>
                  <th style={{ ...th, textAlign: 'right' }}>Paid</th>
                  <th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                  <th style={{ ...th, textAlign: 'center' }}>Age</th>
                  <th style={{ ...th, textAlign: 'right', width: 140 }}>Allocate</th>
                </tr>
              </thead>
              <tbody>
                {bills.map(b => (
                  <tr key={b.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={td}>
                      <strong>{b.SourceRef || b.VoucherNo}</strong>
                      <br /><span style={{ fontSize: 10, color: '#94a3b8' }}>{b.SourceDocType} · {b.VoucherNo}</span>
                    </td>
                    <td style={td}>{new Date(b.VoucherDate).toLocaleDateString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{parseFloat(b.Invoiced).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{parseFloat(b.Paid).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{parseFloat(b.Outstanding).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{b.AgeDays}d</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input
                        type="number"
                        value={allocations[b.VoucherID] || ''}
                        onChange={e => setAlloc(b.VoucherID, e.target.value)}
                        style={{ ...inp, width: 120, textAlign: 'right', padding: '4px 8px' }}
                        placeholder="0"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Payment lines */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>Payment Lines</strong>
          <button onClick={addPaymentLine} style={btn('ghost')}><Plus size={14} /> Add line</button>
        </div>
        {paymentLines.map((p, i) => {
          const isAdvance = p.Mode === 'Advance';
          const isCheque  = p.Mode === 'Cheque';
          const isBankT   = p.Mode === 'Bank Transfer';
          const needsBank = isBankT || isCheque;
          const advanceAllowed = !!selectedParty && advanceBalance > 0;
          return (
          <div key={i} style={{ marginBottom: 12, paddingBottom: isCheque ? 10 : 0, borderBottom: isCheque ? '1px dashed #e2e8f0' : 'none' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '160px 180px 160px 1fr 32px', gap: 8, alignItems: 'end' }}>
              <div>
                <label style={lblStyle}>Mode</label>
                <select value={p.Mode} onChange={e => updatePaymentLine(i, 'Mode', e.target.value)} style={inp}>
                  <option value="Cash">Cash</option>
                  <option value="Cheque">Cheque</option>
                  <option value="POS">POS</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                  {advanceAllowed && <option value="Advance">Apply Supplier Advance (PKR {advanceBalance.toFixed(2)} available)</option>}
                </select>
              </div>
              <div>
                <label style={lblStyle}>Amount (PKR)</label>
                <input
                  type="number" step="0.01" min="0"
                  max={isAdvance ? advanceBalance : undefined}
                  value={p.Amount}
                  onChange={e => updatePaymentLine(i, 'Amount', e.target.value)}
                  style={{ ...inp, borderColor: isAdvance && parseFloat(p.Amount || 0) > advanceBalance + 0.005 ? '#dc2626' : (inp.borderColor || '#cbd5e1') }}
                />
                {isAdvance && <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Available: PKR {advanceBalance.toFixed(2)}</div>}
              </div>
              <div>
                <label style={lblStyle}>{isCheque ? 'Cheque # *' : 'Reference'}</label>
                <input
                  type="text"
                  placeholder={isCheque ? 'Cheque #' : isAdvance ? 'Memo' : 'Optional'}
                  value={p.Reference}
                  onChange={e => updatePaymentLine(i, 'Reference', e.target.value)}
                  style={inp}
                  disabled={isAdvance}
                />
              </div>
              <div>
                <label style={lblStyle}>{needsBank ? (isCheque ? 'Drawn-On Bank *' : 'Bank Account *') : <span style={{ color: '#cbd5e1' }}>—</span>}</label>
                <select value={p.BankGLCAID} onChange={e => updatePaymentLine(i, 'BankGLCAID', e.target.value)} disabled={!needsBank} style={{ ...inp, background: !needsBank ? '#f8fafc' : 'white' }}>
                  <option value="">Pick bank...</option>
                  {banks.map(b => <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} — {b.GLTitle}</option>)}
                </select>
              </div>
              <div>
                {paymentLines.length > 1 && <button onClick={() => removePaymentLine(i)} style={{ ...iconBtn, color: '#ef4444' }}><Trash2 size={16} /></button>}
              </div>
            </div>
            {isCheque && (
              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr 32px', gap: 8, alignItems: 'end', marginTop: 6 }}>
                <div>
                  <label style={lblStyle}>Cheque Date *</label>
                  <input
                    type="date"
                    value={p.ChequeDate}
                    onChange={e => updatePaymentLine(i, 'ChequeDate', e.target.value)}
                    style={inp}
                  />
                </div>
                <div>
                  <label style={lblStyle}>Payee Bank (optional, on the cheque)</label>
                  <input
                    type="text"
                    placeholder="Payee's bank if known"
                    value={p.DrawerBank}
                    onChange={e => updatePaymentLine(i, 'DrawerBank', e.target.value)}
                    style={inp}
                  />
                </div>
                <div />
              </div>
            )}
          </div>
        );})}
      </div>

      <div style={{ ...card, background: '#f8fafc' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Stat label="Total paid" value={totalPayment} colour="#1e293b" />
          <Stat label="Allocated to bills" value={allocatedSum} colour="#dc2626" />
          <Stat
            label={
              excess < -0.005
                ? 'Allocation OVER total!'
                : (excess > 0 && excess <= 10 && allocatedSum > 0
                    ? 'To rounding adjustment'
                    : 'To supplier advance (excess)')
            }
            value={Math.abs(excess)}
            colour={
              excess < -0.005
                ? '#ef4444'
                : (excess > 0 && excess <= 10 && allocatedSum > 0 ? '#7c3aed' : (excess > 0 ? '#b45309' : '#94a3b8'))
            }
            warn={excess < -0.005}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lblStyle}>Narration / Memo</label>
          <input type="text" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Payment for April bills" style={inp} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={handleSubmit} disabled={saving || totalPayment <= 0 || excess < -0.005 || !selectedParty} style={btn(saving || totalPayment <= 0 || excess < -0.005 || !selectedParty ? 'disabled' : 'primary')}>
          {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Post Payment
        </button>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin{animation:spin 1s linear infinite}`}</style>
      </div>
      <div>
        <RecentActivityPanel
          title="Recent Payments"
          endpoint="/payments/recent"
          params={{ partyId: selectedParty?.PartyID, direction: 'make', limit: 12 }}
          emptyMessage={!selectedParty ? 'Select a supplier to see their recent payments.' : 'No recent payments.'}
          amountField="PartyAmount"
        />
      </div>
    </div>
  );
}

const Stat = ({ label, value, colour, warn }) => (
  <div>
    <div style={{ fontSize: 11, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 700, color: colour, display: 'flex', alignItems: 'center', gap: 6 }}>
      PKR {Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      {warn && <AlertTriangle size={16} />}
    </div>
  </div>
);

const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lblStyle = { display: 'block', fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 };
const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 14 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'inline-flex' };
const th = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' };
const td = { padding: '8px 12px', fontSize: 13 };

function btn(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent' };
  if (variant === 'primary')  return { ...base, background: '#dc2626', color: 'white', borderColor: '#dc2626' };
  if (variant === 'ghost')    return { ...base, background: 'white', color: '#475569', borderColor: '#cbd5e1' };
  if (variant === 'disabled') return { ...base, background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };
  return base;
}
