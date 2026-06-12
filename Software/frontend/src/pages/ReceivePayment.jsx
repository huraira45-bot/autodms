import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Receipt, Search, X, Plus, Trash2, Check, Loader2, AlertTriangle, Wallet } from 'lucide-react';
import RecentActivityPanel from '../components/RecentActivityPanel';

// Receive Payment from customers.
// Workflow per §14.11: pick party (or walk-in JC) → see outstanding invoices + advance balance →
// enter payment lines (multi-mode) → allocate to invoices (FIFO default, manual override) → post.
// Excess routes automatically to Customer Advance Received.

export default function ReceivePayment() {
  const [parties, setParties] = useState([]);
  const [banks, setBanks] = useState([]);
  const [jobTypes, setJobTypes] = useState([]);
  const [partySearch, setPartySearch] = useState('');
  const [showPartyDD, setShowPartyDD] = useState(false);
  // Walk-in deposit: structured RO entry (Business Unit + JC #)
  const [walkInCardCode, setWalkInCardCode] = useState('');
  const [walkInNumber, setWalkInNumber] = useState('');
  const [walkInResolved, setWalkInResolved] = useState(null);  // { JobCardId, JobCardNo } once resolved
  const [walkInResolving, setWalkInResolving] = useState(false);
  const [walkInBalance, setWalkInBalance] = useState(null);    // { invoiceTotal, paid, outstanding, hasInvoiceVoucher, voucher }
  const [mode, setMode] = useState('named');                 // 'named' or 'walkin'
  const [selectedParty, setSelectedParty] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [advanceBalance, setAdvanceBalance] = useState(0);
  const [allocations, setAllocations] = useState({});         // { [voucherId]: amount }
  const [paymentLines, setPaymentLines] = useState([{ Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '' }]);
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 4000);
  };

  useEffect(() => {
    axios.get('/api/parties').then(r => setParties(r.data)).catch(() => {});
    axios.get('/api/accounts/banks').then(r => setBanks(r.data)).catch(() => {});
    axios.get('/api/workshop/job-types').then(r => {
      setJobTypes(r.data);
      if (r.data.length > 0) setWalkInCardCode(r.data[0].CardCode);
    }).catch(() => {});
  }, []);

  // Resolve walk-in RO whenever code or number changes; then fetch balance
  useEffect(() => {
    if (mode !== 'walkin' || !walkInCardCode || !walkInNumber) {
      setWalkInResolved(null);
      setWalkInBalance(null);
      return;
    }
    const t = setTimeout(async () => {
      setWalkInResolving(true);
      setWalkInBalance(null);
      try {
        const r = await axios.get('/api/workshop/job-cards/resolve-ro', {
          params: { cardCode: walkInCardCode, number: walkInNumber },
        });
        setWalkInResolved(r.data);
        // Fetch balance for this Job Card
        try {
          const b = await axios.get(`/api/payments/jobcard-balance/${r.data.JobCardId}`);
          setWalkInBalance(b.data);
        } catch { setWalkInBalance(null); }
      } catch (e) {
        setWalkInResolved(null);
      }
      setWalkInResolving(false);
    }, 400);
    return () => clearTimeout(t);
  }, [walkInCardCode, walkInNumber, mode]);

  // Auto-fill payment amount with outstanding balance when balance loads (convenience)
  // Only if no payment lines have an amount yet
  useEffect(() => {
    if (walkInBalance && walkInBalance.outstanding > 0 && paymentLines.length === 1 && !paymentLines[0].Amount) {
      // Don't auto-fill — let user decide. Just provide a hint via the UI.
    }
  }, [walkInBalance]);

  // ---- Party search ----
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
      const r = await axios.get(`/api/payments/outstanding/receive/${party.PartyID}`);
      setInvoices(r.data.invoices || []);
      setAdvanceBalance(parseFloat(r.data.advance) || 0);
    } catch (e) {
      flash('Failed to load outstanding invoices.', true);
    }
  };

  const clearParty = () => {
    setSelectedParty(null);
    setPartySearch('');
    setInvoices([]);
    setAdvanceBalance(0);
    setAllocations({});
  };

  // ---- Payment lines ----
  const addPaymentLine = () => setPaymentLines([...paymentLines, { Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '' }]);
  const removePaymentLine = (i) => setPaymentLines(paymentLines.filter((_, idx) => idx !== i));
  const updatePaymentLine = (i, field, value) => {
    const next = [...paymentLines];
    next[i] = { ...next[i], [field]: value };
    setPaymentLines(next);
  };

  const totalPayment = useMemo(
    () => paymentLines.reduce((s, p) => s + (parseFloat(p.Amount) || 0), 0),
    [paymentLines]
  );

  // ---- Allocations ----
  const allocatedSum = useMemo(
    () => Object.values(allocations).reduce((s, v) => s + (parseFloat(v) || 0), 0),
    [allocations]
  );
  const excess = totalPayment - allocatedSum;

  const setAlloc = (voucherId, value) => {
    setAllocations(prev => {
      const next = { ...prev };
      if (!value || parseFloat(value) <= 0) delete next[voucherId];
      else next[voucherId] = value;
      return next;
    });
  };

  // FIFO auto-allocation: fill oldest first up to payment total
  const autoAllocateFIFO = () => {
    let remaining = totalPayment;
    const next = {};
    for (const inv of invoices) {
      if (remaining <= 0) break;
      const take = Math.min(remaining, parseFloat(inv.Outstanding));
      if (take > 0.005) {
        next[inv.VoucherID] = take.toFixed(2);
        remaining -= take;
      }
    }
    setAllocations(next);
  };

  // ---- Submit ----
  const handleSubmit = async () => {
    if (mode === 'named' && !selectedParty) { flash('Select a customer first.', true); return; }
    if (mode === 'walkin' && !walkInResolved) {
      flash('Pick a Business Unit and enter a valid RO number first.', true); return;
    }
    if (totalPayment <= 0) { flash('Enter at least one payment line with amount.', true); return; }
    if (allocatedSum > totalPayment + 0.01) { flash(`Allocations (${allocatedSum.toFixed(2)}) exceed payment total (${totalPayment.toFixed(2)}).`, true); return; }
    for (const p of paymentLines) {
      if (p.Mode === 'Bank Transfer' && !p.BankGLCAID) {
        flash('Pick a bank for each Bank Transfer line.', true); return;
      }
    }

    let allocArray = Object.entries(allocations)
      .filter(([, v]) => parseFloat(v) > 0)
      .map(([vid, v]) => ({ TargetVoucherID: parseInt(vid), Amount: parseFloat(v) }));

    // For walk-in mode: if the JC has an invoice voucher with outstanding, auto-allocate
    // the lesser of (totalPayment, outstanding) to it. Excess becomes advance.
    if (mode === 'walkin' && walkInBalance && walkInBalance.hasInvoiceVoucher && walkInBalance.outstanding > 0 && walkInBalance.voucher) {
      const toAllocate = Math.min(totalPayment, walkInBalance.outstanding);
      if (toAllocate > 0.005) {
        allocArray = [{ TargetVoucherID: walkInBalance.voucher.VoucherID, Amount: +toAllocate.toFixed(2) }];
      }
    }

    setSaving(true);
    try {
      const r = await axios.post('/api/payments/receive', {
        partyId: mode === 'named' ? selectedParty.PartyID : null,
        walkInJobCardID: mode === 'walkin' ? walkInResolved.JobCardId : null,
        paymentLines: paymentLines.filter(p => parseFloat(p.Amount) > 0).map(p => ({
          Mode: p.Mode,
          Amount: parseFloat(p.Amount),
          Reference: p.Reference || null,
          BankGLCAID: p.BankGLCAID ? parseInt(p.BankGLCAID) : null,
        })),
        allocations: allocArray,
        narration: narration || null,
      });
      flash(`Payment posted as ${r.data.voucherNo}.`);
      // Reset and refresh
      setPaymentLines([{ Mode: 'Cash', Amount: '', Reference: '', BankGLCAID: '' }]);
      setAllocations({});
      setNarration('');
      if (mode === 'named' && selectedParty) pickParty(selectedParty);
      if (mode === 'walkin') {
        setWalkInNumber('');
        setWalkInResolved(null);
      }
    } catch (e) {
      flash(e.response?.data?.error || e.message, true);
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Receipt size={28} style={{ color: '#16a34a' }} />
        <h1 style={{ margin: 0, fontSize: 24 }}>Receive Payment</h1>
      </div>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        Record cash, cheque, POS, or bank-transfer receipts from customers. Multiple payment modes per receipt are supported. Excess routes to Customer Advance Received.
      </p>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{msg}</div>}
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{err}</div>}

      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <label style={radioWrap(mode === 'named')}>
          <input type="radio" value="named" checked={mode === 'named'} onChange={() => { setMode('named'); clearParty(); }} />
          <span>Named customer</span>
        </label>
        <label style={radioWrap(mode === 'walkin')}>
          <input type="radio" value="walkin" checked={mode === 'walkin'} onChange={() => { setMode('walkin'); clearParty(); }} />
          <span>Walk-in deposit against Job Card</span>
        </label>
      </div>

      {/* Party / RO picker */}
      <div style={card}>
        {mode === 'named' ? (
          <div>
            <label style={lblStyle}>Customer</label>
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
                    <span style={{ marginLeft: 14, padding: '4px 10px', background: '#dbeafe', color: '#1d4ed8', borderRadius: 12, fontSize: 12, fontWeight: 600 }}>
                      Existing advance: PKR {advanceBalance.toLocaleString()}
                    </span>
                  )}
                </div>
                <button onClick={clearParty} style={iconBtn}><X size={16} /></button>
              </div>
            )}
          </div>
        ) : (
          <div>
            <label style={lblStyle}>Walk-in deposit against Job Card</label>
            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 10 }}>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>Business Unit</div>
                <select value={walkInCardCode} onChange={e => setWalkInCardCode(e.target.value)} style={inp}>
                  {jobTypes.map(jt => (
                    <option key={jt.JobCardTypeId} value={jt.CardCode}>{jt.CardCode} — {jt.Title}</option>
                  ))}
                </select>
              </div>
              <div>
                <div style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>RO Number</div>
                <input
                  type="number"
                  placeholder="e.g. 42 (will resolve as e.g. CT-0042)"
                  value={walkInNumber}
                  onChange={e => setWalkInNumber(e.target.value)}
                  style={inp}
                />
              </div>
            </div>
            <div style={{ fontSize: 12, marginTop: 8, minHeight: 20 }}>
              {walkInResolving && <span style={{ color: '#94a3b8' }}><Loader2 size={12} className="spin" /> Looking up...</span>}
              {!walkInResolving && walkInResolved && (
                <span style={{ color: '#16a34a', fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Check size={14} /> Found: {walkInResolved.JobCardNo} (Job # {walkInResolved.jobCode || walkInResolved.JobCardId})
                  {walkInResolved.IsFinalized ? <span style={{ marginLeft: 6, padding: '2px 6px', background: '#fef3c7', color: '#92400e', borderRadius: 10, fontSize: 10 }}>FINALIZED</span> : null}
                </span>
              )}
              {!walkInResolving && !walkInResolved && walkInCardCode && walkInNumber && (
                <span style={{ color: '#dc2626' }}><AlertTriangle size={12} /> No Job Card found for {walkInCardCode}-{String(walkInNumber).padStart(4, '0')}</span>
              )}
            </div>

            {/* Balance breakdown for the resolved Job Card */}
            {walkInBalance && (
              <div style={{ marginTop: 12, padding: 12, background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
                  <MiniStat label="Invoice total" value={walkInBalance.invoiceTotal} colour="#1e293b" />
                  <MiniStat label={walkInBalance.walkInAdvance > 0 ? 'Advance + payments' : 'Already paid'} value={walkInBalance.paid} colour="#0284c7" />
                  <MiniStat label="Outstanding" value={walkInBalance.outstanding} colour={walkInBalance.outstanding > 0 ? '#dc2626' : '#16a34a'} />
                </div>
                {!walkInBalance.hasInvoiceVoucher && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#92400e', display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                    <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>No invoice voucher posted for this Job Card. Computed amount shown above is from the Job Card detail lines. Any payment will be recorded as a walk-in advance tagged to this Job Card.</span>
                  </div>
                )}
                {walkInBalance.outstanding === 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#16a34a', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <Check size={12} /> This Job Card is fully paid. Any new payment becomes a credit advance.
                  </div>
                )}
              </div>
            )}

            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
              Walk-in advance will be tagged with this Job Card. When the Job Card is finalised later, the advance can be applied via the Receive Payment screen.
            </div>
          </div>
        )}
      </div>

      {/* Outstanding invoices (only for named mode) */}
      {mode === 'named' && selectedParty && (
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <strong>Outstanding Invoices ({invoices.length})</strong>
            {invoices.length > 0 && (
              <button onClick={autoAllocateFIFO} style={btn('ghost')}>
                Auto-allocate FIFO (oldest first)
              </button>
            )}
          </div>
          {invoices.length === 0 ? (
            <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>
              No open invoices for this customer.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc' }}>
                  <th style={th}>Doc</th>
                  <th style={th}>Date</th>
                  <th style={{ ...th, textAlign: 'right' }}>Invoiced</th>
                  <th style={{ ...th, textAlign: 'right' }}>Paid</th>
                  <th style={{ ...th, textAlign: 'right' }}>Outstanding</th>
                  <th style={{ ...th, textAlign: 'center' }}>Age</th>
                  <th style={{ ...th, textAlign: 'right', width: 140 }}>Allocate</th>
                </tr>
              </thead>
              <tbody>
                {invoices.map(inv => (
                  <tr key={inv.VoucherID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={td}>
                      <strong>{inv.SourceRef || inv.VoucherNo}</strong>
                      <br /><span style={{ fontSize: 10, color: '#94a3b8' }}>{inv.SourceDocType} · {inv.VoucherNo}</span>
                    </td>
                    <td style={td}>{new Date(inv.VoucherDate).toLocaleDateString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{parseFloat(inv.Invoiced).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right' }}>{parseFloat(inv.Paid).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{parseFloat(inv.Outstanding).toLocaleString()}</td>
                    <td style={{ ...td, textAlign: 'center' }}>{inv.AgeDays}d</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <input
                        type="number"
                        value={allocations[inv.VoucherID] || ''}
                        onChange={e => setAlloc(inv.VoucherID, e.target.value)}
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
          <strong>Payment Lines (mix any modes)</strong>
          <button onClick={addPaymentLine} style={btn('ghost')}><Plus size={14} /> Add line</button>
        </div>
        {paymentLines.map((p, i) => {
          const isAdvance = p.Mode === 'Advance';
          const advanceAllowed = mode === 'named' && advanceBalance > 0;
          return (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '160px 180px 160px 1fr 32px', gap: 8, marginBottom: 8, alignItems: 'end' }}>
            <div>
              <label style={lblStyle}>Mode</label>
              <select value={p.Mode} onChange={e => updatePaymentLine(i, 'Mode', e.target.value)} style={inp}>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="POS">POS</option>
                <option value="Bank Transfer">Bank Transfer</option>
                {advanceAllowed && <option value="Advance">Apply Advance (PKR {advanceBalance.toFixed(2)} available)</option>}
              </select>
            </div>
            <div>
              <label style={lblStyle}>Amount (PKR)</label>
              <input
                type="number" step="0.01" min="0"
                max={isAdvance ? advanceBalance : undefined}
                value={p.Amount}
                onChange={e => updatePaymentLine(i, 'Amount', e.target.value)}
                style={{
                  ...inp,
                  borderColor: isAdvance && parseFloat(p.Amount || 0) > advanceBalance + 0.005 ? '#dc2626' : (inp.borderColor || '#cbd5e1')
                }}
              />
              {isAdvance && (
                <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                  Available: PKR {advanceBalance.toFixed(2)}
                </div>
              )}
            </div>
            <div>
              <label style={lblStyle}>Reference</label>
              <input
                type="text"
                placeholder={p.Mode === 'Cheque' ? 'Cheque #' : isAdvance ? 'Memo' : 'Optional'}
                value={p.Reference}
                onChange={e => updatePaymentLine(i, 'Reference', e.target.value)}
                style={inp}
                disabled={isAdvance}
              />
            </div>
            <div>
              <label style={lblStyle}>{p.Mode === 'Bank Transfer' ? 'Bank Account *' : <span style={{ color: '#cbd5e1' }}>—</span>}</label>
              <select
                value={p.BankGLCAID}
                onChange={e => updatePaymentLine(i, 'BankGLCAID', e.target.value)}
                disabled={p.Mode !== 'Bank Transfer'}
                style={{ ...inp, background: p.Mode !== 'Bank Transfer' ? '#f8fafc' : 'white' }}
              >
                <option value="">Pick bank...</option>
                {banks.map(b => <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} — {b.GLTitle}</option>)}
              </select>
            </div>
            <div>
              {paymentLines.length > 1 && (
                <button onClick={() => removePaymentLine(i)} style={{ ...iconBtn, color: '#ef4444' }}>
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </div>
        );})}
      </div>

      {/* Totals + advance preview */}
      <div style={{ ...card, background: '#f8fafc' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <Stat label="Total received" value={totalPayment} colour="#1e293b" />
          <Stat label="Allocated to invoices" value={allocatedSum} colour="#16a34a" />
          <Stat
            label={excess >= 0 ? 'To advance (excess)' : 'Allocation OVER total!'}
            value={Math.abs(excess)}
            colour={excess < -0.005 ? '#ef4444' : (excess > 0 ? '#1d4ed8' : '#94a3b8')}
            warn={excess < -0.005}
          />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lblStyle}>Narration / Memo</label>
          <input type="text" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. Payment against May invoices" style={inp} />
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={handleSubmit} disabled={saving || totalPayment <= 0 || excess < -0.005} style={btn(saving || totalPayment <= 0 || excess < -0.005 ? 'disabled' : 'primary')}>
          {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Post Receipt
        </button>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin{animation:spin 1s linear infinite}`}</style>
      </div>
      <div>
        <RecentActivityPanel
          title="Recent Receipts"
          endpoint="/payments/recent"
          params={{ partyId: selectedParty?.PartyID, direction: 'receive', limit: 12 }}
          emptyMessage={mode === 'named' && !selectedParty ? 'Select a customer to see their recent receipts.' : 'No recent receipts.'}
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

const MiniStat = ({ label, value, colour }) => (
  <div>
    <div style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
    <div style={{ fontSize: 16, fontWeight: 700, color: colour }}>
      PKR {Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </div>
  </div>
);

// ---- styles ----
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lblStyle = { display: 'block', fontSize: 11, color: '#475569', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.3 };
const card = { background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, padding: 16, marginBottom: 14 };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'inline-flex' };
const th = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' };
const td = { padding: '8px 12px', fontSize: 13 };
const radioWrap = (active) => ({ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', border: `2px solid ${active ? '#16a34a' : '#cbd5e1'}`, borderRadius: 8, cursor: 'pointer', background: active ? '#f0fdf4' : 'white' });

function btn(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent' };
  if (variant === 'primary')  return { ...base, background: '#16a34a', color: 'white', borderColor: '#16a34a' };
  if (variant === 'ghost')    return { ...base, background: 'white', color: '#475569', borderColor: '#cbd5e1' };
  if (variant === 'disabled') return { ...base, background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };
  return base;
}
