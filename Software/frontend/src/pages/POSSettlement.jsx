import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { CreditCard, Loader2, Check, AlertTriangle, RefreshCw, Plus, Trash2 } from 'lucide-react';
import RecentActivityPanel from '../components/RecentActivityPanel';

// POS Settlement screen per §14.13.
// Workflow: list pending POS Clearing receipts → admin picks a bank → system applies
// per-bank commission % → admin reviews + overrides if needed → posts BRV voucher.

export default function POSSettlement() {
  const [pending, setPending] = useState([]);
  const [banks, setBanks] = useState([]);
  const [loading, setLoading] = useState(true);
  // Multi-bank rows (owner ask 2026-07-14). Start with one empty row.
  // Each row: { bankId, commission, netDeposit } — strings so blank inputs stay blank.
  const [bankRows, setBankRows] = useState([{ bankId: '', commission: '', netDeposit: '' }]);
  const [selectedIds, setSelectedIds] = useState({});      // { [voucherId]: bool }
  const [narration, setNarration] = useState('');
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 4000);
  };

  const fetchPending = async () => {
    setLoading(true);
    try {
      const r = await axios.get('/api/pos-settlement/pending');
      setPending(r.data.pending || []);
      // Default-select all pending
      const sel = {};
      for (const p of (r.data.pending || [])) sel[p.VoucherID] = true;
      setSelectedIds(sel);
    } catch (e) {
      flash('Failed to load pending POS receipts.', true);
    }
    setLoading(false);
  };

  // Fetch banks; for the rate per bank we need the extended fields, fetch from COA via a separate hit.
  // The /api/accounts/banks endpoint returns basic info; we also need POSCommissionPct + BankChargesGLCAID.
  // We'll fetch full bank rows directly from the backend via a small util query.
  const fetchBanks = async () => {
    try {
      const r = await axios.get('/api/accounts/banks');
      setBanks(r.data || []);
    } catch (e) {
      flash('Failed to load bank accounts.', true);
    }
  };

  useEffect(() => {
    fetchPending();
    fetchBanks();
  }, []);

  const toggleSelect = (vid) => setSelectedIds(prev => ({ ...prev, [vid]: !prev[vid] }));
  const selectAll = () => {
    const all = {};
    for (const p of pending) all[p.VoucherID] = true;
    setSelectedIds(all);
  };
  const selectNone = () => setSelectedIds({});

  const grossTotal = useMemo(() => {
    return +pending
      .filter(p => selectedIds[p.VoucherID])
      .reduce((s, p) => s + parseFloat(p.PendingAmount || 0), 0)
      .toFixed(2);
  }, [pending, selectedIds]);

  const totalCommission = useMemo(
    () => +bankRows.reduce((s, r) => s + (parseFloat(r.commission) || 0), 0).toFixed(2),
    [bankRows]
  );
  const totalNetDeposit = useMemo(
    () => +bankRows.reduce((s, r) => s + (parseFloat(r.netDeposit) || 0), 0).toFixed(2),
    [bankRows]
  );
  const isBalanced = Math.abs((totalNetDeposit + totalCommission) - grossTotal) <= 0.01;
  const isMulti = bankRows.length > 1;

  // Row helpers.
  const updateRow = (idx, patch) => setBankRows(rows => rows.map((r, i) => i === idx ? { ...r, ...patch } : r));
  const addRow = () => setBankRows(rows => [...rows, { bankId: '', commission: '', netDeposit: '' }]);
  const removeRow = (idx) => setBankRows(rows => rows.length > 1 ? rows.filter((_, i) => i !== idx) : rows);
  // Auto-fill net deposit on the single-bank path when the operator picks a bank
  // and enters commission (or leaves it blank) — matches the old UX.
  const autofillSingleBank = () => {
    if (bankRows.length !== 1) return;
    const r = bankRows[0];
    if (r.netDeposit === '') {
      const c = parseFloat(r.commission) || 0;
      updateRow(0, { netDeposit: (grossTotal - c).toFixed(2) });
    }
  };

  const handleSubmit = async () => {
    const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => parseInt(k));
    if (ids.length === 0) { flash('Select at least one POS receipt.', true); return; }
    for (const [i, r] of bankRows.entries()) {
      if (!r.bankId) { flash(`Bank #${i+1}: pick a bank.`, true); return; }
      if (isMulti) {
        if (r.netDeposit === '' || r.commission === '') {
          flash(`Bank #${i+1}: multi-bank split needs both net deposit and commission on every row (commission can be 0).`, true);
          return;
        }
      }
    }
    if (isMulti && !isBalanced) {
      flash(`Total across banks (${(totalNetDeposit + totalCommission).toFixed(2)}) must equal gross POS total (${grossTotal.toFixed(2)}).`, true);
      return;
    }

    setSaving(true);
    try {
      const r = await axios.post('/api/pos-settlement', {
        banks: bankRows.map(row => ({
          bankGLCAID: parseInt(row.bankId),
          netDepositAmount: row.netDeposit !== '' ? parseFloat(row.netDeposit) : undefined,
          commissionAmount: row.commission !== '' ? parseFloat(row.commission) : undefined,
        })),
        voucherIDs: ids,
        narration: narration || null,
      });
      flash(`Settlement posted as ${r.data.voucherNo}. Gross ${r.data.grossTotal}, commission ${r.data.commission}, deposit ${r.data.netDeposit}.`);
      setBankRows([{ bankId: '', commission: '', netDeposit: '' }]);
      setNarration('');
      fetchPending();
    } catch (e) {
      flash(e.response?.data?.error || e.message, true);
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1500, margin: '0 auto', display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 20 }}>
      <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <CreditCard size={28} style={{ color: '#7c3aed' }} />
        <h1 style={{ margin: 0, fontSize: 24 }}>POS Settlement</h1>
      </div>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        Settle POS Clearing into a bank account. Pick which receipts the bank has deposited, enter the actual deposit amount (and commission), and post. The voucher Cr's POS Clearing per receipt and Dr's Bank + Bank Charges.
      </p>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{msg}</div>}
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, marginBottom: 14 }}>{err}</div>}

      {/* Bank rows — one per receiving bank */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <strong>Receiving Bank{isMulti ? 's' : ''}</strong>
          <button onClick={fetchPending} disabled={loading} style={btn('ghost')}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
        <div style={{ display: 'grid', gap: 10 }}>
          {bankRows.map((row, idx) => {
            const usedBankIds = new Set(bankRows.filter((_, i) => i !== idx).map(r => r.bankId).filter(Boolean));
            return (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr 140px 140px auto', gap: 8, alignItems: 'end' }}>
                <div>
                  <label style={lblStyle}>Bank {isMulti ? `#${idx+1}` : ''} *</label>
                  <select value={row.bankId} onChange={e => updateRow(idx, { bankId: e.target.value })} style={inp}>
                    <option value="">Pick a bank…</option>
                    {banks.filter(b => !usedBankIds.has(String(b.GLCAID))).map(b => (
                      <option key={b.GLCAID} value={b.GLCAID}>{b.GLCode} — {b.GLTitle}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={lblStyle}>Commission</label>
                  <input type="number" step="0.01" min="0" value={row.commission}
                    onChange={e => updateRow(idx, { commission: e.target.value })}
                    onBlur={autofillSingleBank}
                    placeholder={isMulti ? '0.00' : '(auto)'} style={inp} />
                </div>
                <div>
                  <label style={lblStyle}>Net Deposit</label>
                  <input type="number" step="0.01" min="0" value={row.netDeposit}
                    onChange={e => updateRow(idx, { netDeposit: e.target.value })}
                    placeholder={isMulti ? '0.00' : `(${(grossTotal - (parseFloat(row.commission) || 0)).toFixed(2)})`}
                    style={inp} />
                </div>
                <button onClick={() => removeRow(idx)}
                  disabled={bankRows.length === 1}
                  title={bankRows.length === 1 ? 'At least one bank row is required' : 'Remove this bank'}
                  style={{ ...btn(bankRows.length === 1 ? 'disabled' : 'ghost'), padding: '8px 10px' }}>
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
        <div style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={addRow} style={btn('ghost')}
            disabled={bankRows.length >= banks.length}
            title={bankRows.length >= banks.length ? 'No more banks to add' : 'Split settlement across another bank'}>
            <Plus size={14} /> Add Bank
          </button>
          <div style={{ fontSize: 11, color: '#94a3b8', maxWidth: 420, textAlign: 'right' }}>
            {isMulti
              ? 'Multi-bank split: enter net deposit + commission per bank. Sum must equal gross POS total.'
              : 'Single bank: leave amounts blank to use the bank\'s default commission %. Bank Charges GL is auto-selected per bank.'}
          </div>
        </div>
      </div>

      {/* Pending receipts table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <strong>Pending POS Receipts ({pending.length})</strong>
          {pending.length > 0 && (
            <div style={{ display: 'flex', gap: 6 }}>
              <button onClick={selectAll} style={btn('ghost')}>Select all</button>
              <button onClick={selectNone} style={btn('ghost')}>Clear</button>
            </div>
          )}
        </div>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 30 }}><Loader2 className="spin" size={28} /></div>
        ) : pending.length === 0 ? (
          <div style={{ color: '#94a3b8', padding: 20, textAlign: 'center' }}>
            No pending POS Clearing entries. Card-paid Job Cards / Store Sales will appear here once finalized.
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ background: '#f8fafc' }}>
                <th style={{ ...th, width: 40, textAlign: 'center' }}>✓</th>
                <th style={th}>Source</th>
                <th style={th}>Date</th>
                <th style={th}>Voucher #</th>
                <th style={{ ...th, textAlign: 'right' }}>Original</th>
                <th style={{ ...th, textAlign: 'right' }}>Settled</th>
                <th style={{ ...th, textAlign: 'right' }}>Pending</th>
                <th style={{ ...th, textAlign: 'center' }}>Age</th>
              </tr>
            </thead>
            <tbody>
              {pending.map(p => (
                <tr key={p.VoucherID} style={{ borderBottom: '1px solid #f1f5f9', background: selectedIds[p.VoucherID] ? '#f0fdf4' : 'white' }}>
                  <td style={{ ...td, textAlign: 'center' }}>
                    <input type="checkbox" checked={!!selectedIds[p.VoucherID]} onChange={() => toggleSelect(p.VoucherID)} />
                  </td>
                  <td style={td}>
                    <strong>{p.SourceRef || p.VoucherNo}</strong>
                    <br /><span style={{ fontSize: 10, color: '#94a3b8' }}>{p.SourceDocType}</span>
                  </td>
                  <td style={td}>{new Date(p.VoucherDate).toLocaleDateString()}</td>
                  <td style={td}>{p.VoucherNo}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{parseFloat(p.DebitAmount).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{parseFloat(p.SettledAmount).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 600 }}>{parseFloat(p.PendingAmount).toLocaleString()}</td>
                  <td style={{ ...td, textAlign: 'center' }}>{p.AgeDays}d</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Settlement preview */}
      <div style={{ ...card, background: '#f8fafc' }}>
        <strong>Settlement Preview</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 12 }}>
          <Stat label="Gross POS total" value={grossTotal} colour="#1e293b" />
          <Stat label={isMulti ? 'Total commission (all banks)' : 'Commission (bank charge)'} value={totalCommission} colour="#dc2626" />
          <Stat label={isMulti ? 'Total net deposit (all banks)' : 'Net deposit to bank'} value={totalNetDeposit} colour="#16a34a" warn={isMulti && !isBalanced} />
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={lblStyle}>Narration / Memo</label>
          <input type="text" value={narration} onChange={e => setNarration(e.target.value)} placeholder="e.g. HBL + Meezan POS settlement 14-Jul-26" style={inp} />
        </div>
        {isMulti && !isBalanced && (
          <div style={{ marginTop: 8, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
            <AlertTriangle size={14} /> Net deposit + commission across all banks ({(totalNetDeposit + totalCommission).toFixed(2)}) must equal gross POS total ({grossTotal.toFixed(2)}).
          </div>
        )}
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 20 }}>
        <button onClick={handleSubmit}
          disabled={saving || grossTotal <= 0 || bankRows.some(r => !r.bankId) || (isMulti && !isBalanced)}
          style={btn(saving || grossTotal <= 0 || bankRows.some(r => !r.bankId) || (isMulti && !isBalanced) ? 'disabled' : 'primary')}>
          {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Post Settlement
        </button>
      </div>

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin{animation:spin 1s linear infinite}`}</style>
      </div>
      <div>
        <RecentActivityPanel
          title="Recent Settlements"
          endpoint="/pos-settlement/recent"
          params={{ bankGLCAID: (!isMulti && bankRows[0]?.bankId) || undefined, limit: 12 }}
          emptyMessage={(!isMulti && bankRows[0]?.bankId) ? 'No recent settlements for this bank.' : 'Pick a single bank to filter by bank, or leave multi to see all.'}
          showBankColumn={isMulti || !bankRows[0]?.bankId}
          amountField="TotalAmount"
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
const th = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' };
const td = { padding: '8px 12px', fontSize: 13 };

function btn(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', border: '1px solid transparent' };
  if (variant === 'primary')  return { ...base, background: '#7c3aed', color: 'white', borderColor: '#7c3aed' };
  if (variant === 'ghost')    return { ...base, background: 'white', color: '#475569', borderColor: '#cbd5e1' };
  if (variant === 'disabled') return { ...base, background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };
  return base;
}
