import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import {
  Package, Search, Plus, Trash2, Save, Loader2, Printer,
  Percent, DollarSign, CheckCircle2, Circle, ClipboardList,
} from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';
import { useCan } from '../context/AuthContext';
import SearchableSelect from '../components/SearchableSelect';

const API = '/api';
const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Parts Issue to Job Card.
 *
 * Owner ask 2026-07-03: bring this page in line with the Store Sale UX —
 *   * per-line Discount + GST toggle
 *   * live "Line preview" total before Add
 *   * clickable pending row → edit in place
 *   * always-visible issue-slip identifier ("(auto)" for a fresh header)
 *   * a Recent Issues panel that lists prior parts-issue slips across all JCs
 *     with a search box (Job No / Customer / Part No / Item Name).
 */
export default function PartsIssue() {
  const { notify, confirm } = useFeedback();
  const { canDelete } = useCan('workshop_parts_issue');

  const [jobCards, setJobCards]         = useState([]);
  const [items, setItems]               = useState([]);
  const [issuedParts, setIssuedParts]   = useState([]);   // saved lines on the selected JC
  const [jobSearch, setJobSearch]       = useState('');
  const [selectedJob, setSelectedJob]   = useState(null);
  const [saving, setSaving]             = useState(false);
  const [newItems, setNewItems]         = useState([]);   // pending lines about to be saved
  const [remarks, setRemarks]           = useState('');
  const [gstRate, setGstRate]           = useState(18);
  // Editable "current" row (Store Sale style) — user tunes here, then Adds.
  const [entry, setEntry] = useState(emptyEntry(18));
  const [editingIdx, setEditingIdx] = useState(null);

  // Recent Issues panel state (prior slips across all JCs)
  const [showList, setShowList]         = useState(false);
  const [recent, setRecent]             = useState([]);
  const [recentSearch, setRecentSearch] = useState('');

  // Deep-link support: /parts-issue?jobCardId=XXX preselects the JC so drill-through
  // from Job Card Register (owner ask 2026-07-17) lands on the right issue slip.
  const [searchParams] = useSearchParams();
  const preselectJobCardId = searchParams.get('jobCardId');

  useEffect(() => {
    (async () => {
      try {
        const [it, tx] = await Promise.all([
          axios.get(`${API}/items`),
          axios.get(`${API}/tax-rates`).catch(() => ({ data: { current: [] } })),
        ]);
        setItems(it.data || []);
        const gst = (tx.data?.current || []).find(r => (r.TaxType || '').toUpperCase() === 'GST');
        const rate = gst ? parseFloat(gst.Rate) : 18;
        setGstRate(rate);
        setEntry(e => ({ ...e, TaxPercent: rate, IsGST: true }));
      } catch (err) { console.error(err); }
    })();
  }, []);

  // Preselect the JC when arriving from a deep-link (e.g. Job Card Register).
  useEffect(() => {
    if (!preselectJobCardId) return;
    const id = parseInt(preselectJobCardId);
    if (!id || selectedJob?.JobCardId === id) return;
    (async () => {
      try {
        const r = await axios.get(`${API}/workshop/job-cards/${id}`);
        if (r.data) selectJob(r.data);
      } catch (err) {
        console.error('Preselect JC failed:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preselectJobCardId]);

  const searchJobs = async (val) => {
    setJobSearch(val);
    if (val.length < 2) { setJobCards([]); return; }
    try {
      const res = await axios.get(`${API}/workshop/job-cards?search=${val}`);
      setJobCards(res.data);
    } catch (err) { console.error(err); }
  };

  const selectJob = async (job) => {
    setSelectedJob(job);
    setJobSearch(''); setJobCards([]);
    setNewItems([]); setEntry(emptyEntry(gstRate)); setEditingIdx(null);
    try {
      const res = await axios.get(`${API}/workshop/parts-issue?jobCardId=${job.JobCardId}`);
      setIssuedParts(res.data || []);
    } catch (err) { console.error(err); }
  };

  const fetchRecent = useCallback(async () => {
    try {
      const r = await axios.get(`${API}/workshop/parts-issue/list`, { params: recentSearch ? { search: recentSearch } : {} });
      setRecent(r.data || []);
    } catch { /* silent */ }
  }, [recentSearch]);

  useEffect(() => { if (showList) fetchRecent(); }, [showList, fetchRecent]);

  // ─────────────────────────────── Line math ────────────────────────────
  const computeLine = (row) => {
    const qty  = Number(row.Quantity || 0);
    const rate = Number(row.Rate || 0);
    const subtotal = qty * rate;
    // Discount: Amount is per-unit (× qty), Percent is a % of gross.
    const discInput = Number(row.Discount || 0);
    const discAmt = row.DiscType === 'Percent'
      ? (subtotal * discInput / 100)
      : (discInput * qty);
    // GST is always applied at the configured rate — no opt-out toggle.
    const taxPct = Number(gstRate) || 0;
    const taxAmt = (subtotal - discAmt) * taxPct / 100;
    const net    = subtotal - discAmt + taxAmt;
    return { subtotal, discAmt, taxPct, taxAmt, net };
  };

  const preview = computeLine(entry);

  const commitLine = () => {
    if (!entry.ItemId || Number(entry.Quantity) <= 0) {
      notify({ type: 'warning', title: 'Add a part', message: 'Pick a part and quantity greater than zero.' });
      return;
    }
    const master = items.find(x => x.ItemId == entry.ItemId);
    const { subtotal, discAmt, taxPct, taxAmt, net } = preview;
    const line = {
      ItemId:       entry.ItemId,
      ItemName:     master?.ItenName || '',
      ItemNumber:   master?.ItemNumber ?? null,
      ManualNumber: master?.ManualNumber ?? null,
      Quantity:     Number(entry.Quantity),
      Rate:         Number(entry.Rate),
      Discount:     Number(entry.Discount) || 0,
      DiscType:     entry.DiscType,
      DiscAmt:      +discAmt.toFixed(2),
      IsGST:        !!entry.IsGST,
      TaxPercent:   taxPct,
      TaxAmount:    +taxAmt.toFixed(2),
      Subtotal:     +subtotal.toFixed(2),
      LineTotal:    +net.toFixed(2),
    };
    if (editingIdx !== null) {
      setNewItems(newItems.map((r, i) => i === editingIdx ? line : r));
      setEditingIdx(null);
    } else {
      setNewItems([...newItems, line]);
    }
    setEntry(emptyEntry(gstRate));
  };

  const editLine = (idx) => {
    const row = newItems[idx];
    setEntry({
      ItemId:     row.ItemId,
      Quantity:   row.Quantity,
      Rate:       row.Rate,
      Discount:   row.Discount,
      DiscType:   row.DiscType || 'Amount',
      IsGST:      true,
      TaxPercent: gstRate,
    });
    setEditingIdx(idx);
  };

  const removeNewLine = (idx) => {
    setNewItems(newItems.filter((_, i) => i !== idx));
    if (editingIdx === idx) { setEditingIdx(null); setEntry(emptyEntry(gstRate)); }
  };

  const cancelEdit = () => { setEditingIdx(null); setEntry(emptyEntry(gstRate)); };

  // ─────────────────────────────── Totals ────────────────────────────
  const totalNew    = newItems.reduce((s, i) => s + Number(i.LineTotal || 0), 0);
  const totalIssued = issuedParts.reduce((s, p) => {
    const qty = Number(p.IssueQuantity || 0);
    const rate = Number(p.ItemRate || 0);
    return s + (qty * rate - Number(p.DiscAmt || 0) + Number(p.TaxAmount || 0));
  }, 0);

  const handleDeleteLine = async (line) => {
    const ok = await confirm({
      title: `Delete ${line.ItemName}?`,
      message: `Remove this issued line and restore ${line.IssueQuantity} unit(s) back into stock.`,
      details: 'Only allowed while the Job Card is not finalized.',
      confirmLabel: 'Delete line', tone: 'danger',
    });
    if (!ok) return;
    try {
      await axios.delete(`${API}/workshop/parts-issue/line/${line.StockIssueDetailID}`);
      notify({ type: 'success', title: 'Line deleted', message: `${line.ItemName} returned to stock.` });
      selectJob(selectedJob);
    } catch (err) {
      notify({ type: 'error', title: 'Delete failed', message: err.response?.data?.error || err.message });
    }
  };

  const handleIssue = async () => {
    if (!selectedJob) return notify({ type: 'warning', title: 'Select a job card', message: 'Choose the job card before issuing parts.' });
    if (newItems.length === 0) return notify({ type: 'warning', title: 'Add at least one part', message: 'Add the parts to issue.' });
    setSaving(true);
    try {
      await axios.post(`${API}/workshop/parts-issue`, {
        JobCardId: selectedJob.JobCardId,
        JobCardNo: selectedJob.JobCardNo?.toString() || '',
        // Server accepts Discount + DiscAmt + IsGST per-line (see workshopController.issuePartsToJobCard).
        Items: newItems.map(l => ({
          ItemId:   l.ItemId,
          Quantity: l.Quantity,
          Rate:     l.Rate,
          Discount: l.Discount,
          DiscAmt:  l.DiscAmt,
          IsGST:    l.IsGST,
        })),
        Remarks: remarks,
      });
      notify({ type: 'success', title: 'Parts issued', message: `PKR ${totalNew.toLocaleString()} issued to JC-${selectedJob.JobCardNo}.` });
      setNewItems([]); setRemarks(''); setEditingIdx(null); setEntry(emptyEntry(gstRate));
      selectJob(selectedJob);
    } catch (err) {
      notify({ type: 'error', title: 'Could not issue parts', message: err.response?.data?.error || err.message });
    }
    setSaving(false);
  };

  // ─────────────────────────────── Render ────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div className="print-only print-header">
        <h1>Parts Issue to Job Card</h1>
        <div className="meta"><span>Printed: {new Date().toLocaleString('en-PK', { dateStyle: 'medium', timeStyle: 'short' })}</span></div>
      </div>

      <div className="card-header">
        <div>
          <h1 className="page-title">
            Parts Issue to Job Card
            {/* Owner ask 2026-07-03: always show an issue-slip identifier —
                the JC's most recent slip if there is one, else "(auto)". */}
            <span style={{ marginLeft: 10, fontSize: '0.7em', color: '#475569', fontFamily: 'monospace' }}>
              · {issuedParts[0]?.IssueNo ? `PI-${String(issuedParts[0].IssueNo).padStart(4, '0')}` : '(auto)'}
            </span>
          </h1>
          <p className="page-subtitle">Parts department: issue spare parts against workshop job cards. Issue slip number is assigned when you save.</p>
        </div>
        <div className="no-print" style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => setShowList(v => !v)} className="btn" style={{ background: '#0f172a' }}>
            <ClipboardList size={16} /> {showList ? 'Hide' : 'Prior Issues'}
          </button>
          <button onClick={() => window.print()} className="btn" style={{ background: '#0f766e' }}>
            <Printer size={16} /> Print Issue Slip
          </button>
        </div>
      </div>

      {/* Prior issues panel */}
      {showList && (
        <div className="card">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 12, borderBottom: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700 }}>Recent Parts Issues</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#f8fafc', padding: '0 12px', border: '1px solid #e2e8f0', borderRadius: 8, height: 36, width: 320 }}>
              <Search size={15} style={{ color: '#94a3b8' }} />
              <input style={{ border: 'none', outline: 'none', flex: 1, fontSize: '0.85rem', background: 'transparent' }}
                placeholder="Search Job No, Part No, Item Name…"
                value={recentSearch} onChange={e => setRecentSearch(e.target.value)} />
            </div>
          </div>
          <div className="table-wrapper">
            <table>
              <thead>
                <tr><th>Slip #</th><th>Date</th><th>Job Card</th><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th><th style={{ textAlign: 'right' }}>Line Total</th></tr>
              </thead>
              <tbody>
                {recent.length === 0
                  ? <tr><td colSpan={6} style={{ textAlign: 'center', padding: 20, color: '#94a3b8' }}>No issues found.</td></tr>
                  : recent.map(r => (
                    <tr key={r.StockIssueDetailID}>
                      <td style={{ fontFamily: 'monospace', color: 'var(--primary)' }}>PI-{String(r.IssueNo).padStart(4, '0')}</td>
                      <td>{r.IssueDate ? new Date(r.IssueDate).toLocaleDateString() : '—'}</td>
                      <td><strong>JC-{r.JobCardNo}</strong></td>
                      <td>{r.ItemName} <span style={{ color: '#64748b', fontFamily: 'monospace' }}>({r.ManualNumber || r.ItemNumber || '—'})</span></td>
                      <td style={{ textAlign: 'right' }}>{fmt(r.IssueQuantity)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(r.LineNet)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Job Card Search */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 600, color: 'var(--primary)', marginBottom: 12 }}><Search size={18} /> Find Job Card</div>
        <div style={{ position: 'relative' }}>
          <input type="text" value={jobSearch} onChange={e => searchJobs(e.target.value)}
                 placeholder="Search by Job No, Customer, Reg No..."
                 style={{ width: '100%', padding: '10px 14px', border: '2px solid var(--primary)', borderRadius: 8, fontSize: '0.95rem' }} />
          {jobCards.length > 0 && (
            <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, maxHeight: 250, overflow: 'auto', zIndex: 10, boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
              {jobCards.map(j => (
                <div key={j.JobCardId} onClick={() => selectJob(j)} style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>JC-{j.JobCardNo}</strong> — {j.CustomerName || 'N/A'}</div>
                  <div style={{ textAlign: 'right' }}><span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--primary)' }}>{j.VehicleRegNo}</span><br /><span style={{ fontSize: '0.8rem', color: '#64748b' }}>{j.JobStatusText}</span></div>
                </div>
              ))}
            </div>
          )}
        </div>

        {selectedJob && (
          <div style={{ marginTop: 16, background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 8, padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
            <div><span style={{ fontSize: '0.8rem', color: '#64748b' }}>Job Card</span><br /><strong>JC-{selectedJob.JobCardNo}</strong></div>
            <div><span style={{ fontSize: '0.8rem', color: '#64748b' }}>Customer</span><br /><strong>{selectedJob.CustomerName || '—'}</strong></div>
            <div><span style={{ fontSize: '0.8rem', color: '#64748b' }}>Vehicle</span><br /><strong>{selectedJob.VehicleRegNo}</strong></div>
            <div><span style={{ fontSize: '0.8rem', color: '#64748b' }}>Status</span><br /><strong>{selectedJob.JobStatusText}</strong></div>
          </div>
        )}
      </div>

      {selectedJob && (
        <>
          {/* Already issued */}
          {issuedParts.length > 0 && (
            <div className="card">
              <div style={{ padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0', fontWeight: 600 }}>Previously Issued Parts</div>
              <div className="table-wrapper">
                <table>
                  <thead>
                    <tr>
                      <th>Part #</th><th>Part Name</th><th style={{ textAlign: 'right' }}>Qty</th>
                      <th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Disc</th>
                      <th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Total</th>
                      {canDelete && <th className="no-print" style={{ width: 48 }}></th>}
                    </tr>
                  </thead>
                  <tbody>
                    {issuedParts.map(p => {
                      const qty = Number(p.IssueQuantity || 0), rate = Number(p.ItemRate || 0);
                      const disc = Number(p.DiscAmt || 0), tax = Number(p.TaxAmount || 0);
                      const net = qty * rate - disc + tax;
                      return (
                        <tr key={p.StockIssueDetailID}>
                          <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{p.ManualNumber || p.ItemNumber || '—'}</td>
                          <td><strong>{p.ItemName}</strong></td>
                          <td style={{ textAlign: 'right' }}>{qty}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(rate)}</td>
                          <td style={{ textAlign: 'right', color: '#059669' }}>-{fmt(disc)}</td>
                          <td style={{ textAlign: 'right', color: '#1d4ed8' }}>+{fmt(tax)}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(net)}</td>
                          {canDelete && (
                            <td className="no-print" style={{ textAlign: 'center' }}>
                              <button onClick={() => handleDeleteLine(p)} title="Delete this line and restore stock"
                                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: 4 }}>
                                <Trash2 size={16} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Total Issued:</td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, fontSize: '1.1rem', textAlign: 'right' }}>PKR {fmt(totalIssued)}</td>
                      {canDelete && <td className="no-print"></td>}
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Issue new — Store-Sale style controls */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16, background: '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Package size={18} /> <strong>Issue New Parts</strong></div>
            </div>

            <div style={{ padding: 16, display: 'grid', gap: 12 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={label}>Select Part</label>
                  <SearchableSelect
                    value={entry.ItemId}
                    onChange={(id) => {
                      const p = items.find(x => x.ItemId == id);
                      setEntry(e => ({ ...e, ItemId: id, Rate: p?.ItemSalesPrice || 0 }));
                    }}
                    placeholder="Search part by code or name…"
                    options={items.filter(i => i.ItemType === 'Part').map(p => {
                      const code = p.ManualNumber ?? p.ItemNumber ?? '';
                      const alt  = (p.ManualNumber && p.ItemNumber) ? ' · ' + p.ItemNumber : '';
                      return { id: p.ItemId, label: p.ItenName, sub: code ? `#${code}${alt}` : '' };
                    })}
                  />
                </div>
                <div>
                  <label style={label}>Qty</label>
                  <input type="number" value={entry.Quantity} onChange={e => setEntry(v => ({ ...v, Quantity: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={label}>Rate</label>
                  <input type="number" value={entry.Rate} onChange={e => setEntry(v => ({ ...v, Rate: e.target.value }))} style={inp} />
                </div>
                <div>
                  <label style={label}>GST ({gstRate}%)</label>
                  <input type="number" readOnly value={gstRate} style={{ ...inp, background: '#f1f5f9', color: '#64748b' }} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 3fr auto', gap: 12, alignItems: 'end' }}>
                <div>
                  <label style={label}>Discount{entry.DiscType === 'Amount' ? ' (per unit)' : ' (%)'}</label>
                  <div style={{ display: 'flex' }}>
                    <input type="number" value={entry.Discount} onChange={e => setEntry(v => ({ ...v, Discount: e.target.value }))}
                           style={{ ...inp, borderRight: 'none', borderTopRightRadius: 0, borderBottomRightRadius: 0 }} />
                    <button type="button" onClick={() => setEntry(v => ({ ...v, DiscType: v.DiscType === 'Amount' ? 'Percent' : 'Amount' }))}
                            title={entry.DiscType === 'Amount' ? 'Switch to %' : 'Switch to per-unit amount'}
                            style={{ border: '1px solid #cbd5e1', background: 'white', padding: '0 10px', borderTopRightRadius: 6, borderBottomRightRadius: 6, cursor: 'pointer', color: '#334155', display: 'inline-flex', alignItems: 'center' }}>
                      {entry.DiscType === 'Amount' ? <DollarSign size={14} /> : <Percent size={14} />}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={label}>Remarks (issue slip)</label>
                  <input type="text" value={remarks} onChange={e => setRemarks(e.target.value)} placeholder="optional" style={inp} />
                </div>
                <button type="button" onClick={commitLine}
                        style={{ height: 42, background: editingIdx !== null ? '#0284c7' : 'var(--primary)', color: 'white', border: 'none', borderRadius: 6, padding: '0 18px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                  <Plus size={18} /> {editingIdx !== null ? `Update Line ${editingIdx + 1}` : 'Add to Slip'}
                </button>
              </div>

              {/* Owner ask 2026-07-03: line preview before Add. */}
              {entry.ItemId && Number(entry.Quantity) > 0 && (
                <div style={{ padding: '8px 14px', background: '#f0f9ff', border: '1px solid #bae6fd', borderRadius: 6, display: 'flex', gap: 20, flexWrap: 'wrap', fontSize: 12, alignItems: 'center' }}>
                  <span style={{ color: '#0369a1', fontWeight: 700 }}>{editingIdx !== null ? 'Editing preview →' : 'Line preview →'}</span>
                  <span>Subtotal: <strong>{fmt(preview.subtotal)}</strong></span>
                  <span>GST: <strong>{fmt(preview.taxAmt)}</strong></span>
                  <span>Discount: <strong>-{fmt(preview.discAmt)}</strong></span>
                  <span style={{ marginLeft: 'auto', color: '#0f172a', fontSize: 14, fontWeight: 800 }}>Line Total: PKR {fmt(preview.net)}</span>
                  {editingIdx !== null && (
                    <button type="button" onClick={cancelEdit} style={{ padding: '4px 10px', background: '#e2e8f0', color: '#334155', border: 'none', borderRadius: 6, fontSize: 12, cursor: 'pointer' }}>Cancel Edit</button>
                  )}
                </div>
              )}
            </div>

            <div className="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th>Part #</th><th>Item</th><th style={{ textAlign: 'right' }}>Qty</th>
                    <th style={{ textAlign: 'right' }}>Rate</th><th style={{ textAlign: 'right' }}>Disc</th>
                    <th style={{ textAlign: 'right' }}>GST</th><th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {newItems.length === 0 && <tr><td colSpan={8} style={{ padding: 20, textAlign: 'center', color: '#94a3b8' }}>No lines on the slip yet — build one above.</td></tr>}
                  {newItems.map((line, idx) => (
                    <tr key={idx}
                        onClick={() => editLine(idx)}
                        style={{ cursor: 'pointer', background: editingIdx === idx ? '#e0f2fe' : undefined }}
                        title="Click to edit this line">
                      <td style={{ fontFamily: 'monospace', color: '#64748b' }}>{line.ManualNumber || line.ItemNumber || '—'}</td>
                      <td><strong>{line.ItemName}</strong></td>
                      <td style={{ textAlign: 'right' }}>{line.Quantity}</td>
                      <td style={{ textAlign: 'right' }}>{fmt(line.Rate)}</td>
                      <td style={{ textAlign: 'right', color: '#059669' }}>-{fmt(line.DiscAmt)}</td>
                      <td style={{ textAlign: 'right', color: '#1d4ed8' }}>+{fmt(line.TaxAmount)}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600 }}>{fmt(line.LineTotal)}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button onClick={(e) => { e.stopPropagation(); removeNewLine(idx); }}
                                style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
                {newItems.length > 0 && (
                  <tfoot>
                    <tr>
                      <td colSpan={6} style={{ padding: '12px 16px', fontWeight: 700, textAlign: 'right' }}>Slip Total:</td>
                      <td style={{ padding: '12px 16px', fontWeight: 800, fontSize: '1.05rem', textAlign: 'right' }}>PKR {fmt(totalNew)}</td>
                      <td></td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>

            {newItems.length > 0 && (
              <div style={{ padding: 16, display: 'flex', justifyContent: 'flex-end', gap: 12, borderTop: '1px solid #e2e8f0' }}>
                <button onClick={handleIssue} disabled={saving} className="btn"
                        style={{ background: 'var(--primary)', color: 'white', padding: '12px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {saving ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Issue Parts
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ────────── Local helpers ──────────
function emptyEntry(gstRate) {
  return { ItemId: '', Quantity: 1, Rate: 0, Discount: 0, DiscType: 'Amount', IsGST: true, TaxPercent: gstRate };
}
const label = { fontSize: 12, fontWeight: 500, color: '#475569', marginBottom: 4, display: 'block' };
const inp   = { width: '100%', padding: '10px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.9rem', boxSizing: 'border-box' };
