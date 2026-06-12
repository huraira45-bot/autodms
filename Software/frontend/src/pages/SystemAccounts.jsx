import React, { useState, useEffect, useMemo } from 'react';
import axios from 'axios';
import { Settings, Edit2, AlertTriangle, History, Search, X, Check, Loader2 } from 'lucide-react';

const API = '/api/system-accounts';
const COA_API = '/api/accounts/coa';

const TYPE_COLORS = {
  Asset:     { bg: '#eff6ff', fg: '#1d4ed8' },
  Liability: { bg: '#fdf4ff', fg: '#a21caf' },
  Revenue:   { bg: '#f0fdf4', fg: '#15803d' },
  Expense:   { bg: '#fff7ed', fg: '#c2410c' },
  Either:    { bg: '#f1f5f9', fg: '#475569' },
};

export default function SystemAccounts() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Edit modal
  const [editRow, setEditRow] = useState(null);
  const [coaSearch, setCoaSearch] = useState('');
  const [coaResults, setCoaResults] = useState([]);
  const [coaLoading, setCoaLoading] = useState(false);
  const [chosen, setChosen] = useState(null);
  const [reason, setReason] = useState('');
  const [postingCount, setPostingCount] = useState(null);
  const [saving, setSaving] = useState(false);

  // Audit modal
  const [auditRow, setAuditRow] = useState(null);
  const [audit, setAudit] = useState([]);

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 3500);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(API);
      setRows(r.data);
    } catch (e) { flash('Failed to load system accounts.', true); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // ----- Edit flow -----
  const openEdit = async (row) => {
    setEditRow(row);
    setCoaSearch('');
    setCoaResults([]);
    setChosen(null);
    setReason('');
    setPostingCount(null);

    // Pre-fetch posting count on currently-assigned account (warns user)
    if (row.assigned) {
      try {
        const r = await axios.get(`${API}/${row.key}/posting-count`);
        setPostingCount(r.data.count);
      } catch { /* non-fatal */ }
    }
  };

  // Debounced COA search — leaf accounts only
  useEffect(() => {
    if (!editRow) return;
    if (coaSearch.length < 2) { setCoaResults([]); return; }
    const t = setTimeout(async () => {
      setCoaLoading(true);
      try {
        const r = await axios.get(`${COA_API}?search=${encodeURIComponent(coaSearch)}`);
        // Filter to leaf accounts (non-parent) only
        setCoaResults(r.data.filter(a => !a.isParent));
      } catch { setCoaResults([]); }
      setCoaLoading(false);
    }, 250);
    return () => clearTimeout(t);
  }, [coaSearch, editRow]);

  const handleSave = async () => {
    if (!chosen) { flash('Pick an account first.', true); return; }
    setSaving(true);
    try {
      const r = await axios.put(`${API}/${editRow.key}`, { GLCAID: chosen.GLCAID, Reason: reason || null });
      flash(r.data.message || 'Saved.');
      setEditRow(null);
      load();
    } catch (e) {
      flash(e.response?.data?.error || e.message, true);
    }
    setSaving(false);
  };

  // ----- Audit flow -----
  const openAudit = async (row) => {
    setAuditRow(row);
    setAudit([]);
    try {
      const r = await axios.get(`${API}/${row.key}/audit`);
      setAudit(r.data);
    } catch (e) { flash('Failed to load audit.', true); }
  };

  // ----- Stats -----
  const assignedCount = useMemo(() => rows.filter(r => r.assigned).length, [rows]);

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Settings size={28} style={{ color: '#1e40af' }} />
        <h1 style={{ margin: 0, fontSize: 24 }}>Accounting Setup — System Accounts</h1>
      </div>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        Designate which Chart of Accounts entry fills each of the {rows.length} system roles. Re-assignment is forward-looking only — historical postings stay on the previous account. Every change is audited.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 13, color: '#475569' }}>
        <strong>{assignedCount}</strong> of <strong>{rows.length}</strong> roles configured.
        {assignedCount < rows.length && (
          <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle size={14} /> Posting flows that need unconfigured roles will fail until set.
          </span>
        )}
      </div>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '8px 12px', borderRadius: 6, marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="spin" size={32} /></div>
      ) : (
        <div style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Role</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Type</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Purpose</th>
                <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Assigned Account</th>
                <th style={{ textAlign: 'right', padding: '12px 16px', fontSize: 12, color: '#64748b', textTransform: 'uppercase' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const tc = TYPE_COLORS[r.type] || TYPE_COLORS.Either;
                return (
                  <tr key={r.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600 }}>{r.label}<br />
                      <span style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{r.key}</span>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ background: tc.bg, color: tc.fg, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{r.type}</span>
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569' }}>{r.purpose}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {r.assigned ? (
                        <div>
                          <div style={{ fontWeight: 600 }}>{r.assigned.GLTitle}</div>
                          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{r.assigned.GLCode}</div>
                        </div>
                      ) : (
                        <span style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: 4, fontSize: 13 }}>
                          <AlertTriangle size={14} /> Not configured
                        </span>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <button onClick={() => openEdit(r)} style={btn('primary')}>
                        <Edit2 size={13} /> {r.assigned ? 'Reassign' : 'Assign'}
                      </button>
                      {r.assigned && (
                        <button onClick={() => openAudit(r)} style={{ ...btn('ghost'), marginLeft: 6 }}>
                          <History size={13} /> Audit
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {editRow && (
        <div style={modalOverlay}>
          <div style={{ ...modal, width: 560 }}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}>{editRow.assigned ? 'Reassign' : 'Assign'} — {editRow.label}</h3>
              <button onClick={() => setEditRow(null)} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {editRow.assigned && postingCount > 0 && (
                <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: 12, borderRadius: 6, marginBottom: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 2 }} />
                  <div>
                    <strong>This role has {postingCount} historical journal line{postingCount === 1 ? '' : 's'}</strong> on <strong>{editRow.assigned.GLCode} — {editRow.assigned.GLTitle}</strong>.<br />
                    Reassigning will direct <em>future</em> entries to the new account. Old entries stay where they were.
                  </div>
                </div>
              )}

              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Pick a Chart of Accounts entry (leaf accounts only)</label>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: '#94a3b8' }} />
                  <input
                    autoFocus
                    type="text"
                    placeholder="Type 2+ characters to search by code or title..."
                    value={coaSearch}
                    onChange={e => { setCoaSearch(e.target.value); setChosen(null); }}
                    style={{ ...inp, paddingLeft: 32 }}
                  />
                </div>
                {coaLoading && <div style={{ padding: 8, fontSize: 12, color: '#64748b' }}><Loader2 size={12} className="spin" /> searching...</div>}
                {coaResults.length > 0 && !chosen && (
                  <div style={{ maxHeight: 200, overflow: 'auto', border: '1px solid #e2e8f0', borderRadius: 6, marginTop: 4 }}>
                    {coaResults.map(a => (
                      <div key={a.GLCAID} onClick={() => setChosen(a)} style={resultRow}>
                        <div>
                          <div style={{ fontWeight: 500 }}>{a.GLTitle}</div>
                          <div style={{ fontSize: 11, color: '#64748b', fontFamily: 'monospace' }}>{a.GLCode}</div>
                        </div>
                        <span style={{ fontSize: 11, color: '#94a3b8', padding: '2px 6px', background: '#f1f5f9', borderRadius: 10 }}>{a.GLNature}</span>
                      </div>
                    ))}
                  </div>
                )}
                {chosen && (
                  <div style={{ background: '#dbeafe', border: '1px solid #93c5fd', padding: 10, borderRadius: 6, marginTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{chosen.GLTitle}</div>
                      <div style={{ fontSize: 11, fontFamily: 'monospace', color: '#1e40af' }}>{chosen.GLCode}</div>
                    </div>
                    <button onClick={() => setChosen(null)} style={iconBtn}><X size={16} /></button>
                  </div>
                )}
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Reason for change <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional, recorded in audit log)</span></label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  style={{ ...inp, resize: 'vertical' }}
                  placeholder="e.g., corrected initial mis-assignment"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setEditRow(null)} style={btn('ghost')}>Cancel</button>
                <button onClick={handleSave} disabled={!chosen || saving} style={btn(chosen ? 'primary' : 'disabled')}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} {editRow.assigned ? 'Reassign' : 'Assign'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit modal */}
      {auditRow && (
        <div style={modalOverlay}>
          <div style={{ ...modal, width: 700 }}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}><History size={18} style={{ verticalAlign: -3, marginRight: 6 }} />Audit — {auditRow.label}</h3>
              <button onClick={() => setAuditRow(null)} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {audit.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No history yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={auditHdr}>When</th>
                      <th style={auditHdr}>From</th>
                      <th style={auditHdr}>To</th>
                      <th style={auditHdr}>By</th>
                      <th style={auditHdr}>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {audit.map(a => (
                      <tr key={a.AuditID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={auditCell}>{new Date(a.ChangedAt).toLocaleString()}</td>
                        <td style={auditCell}>{a.OldGLCAID ? `${a.OldGLCode} — ${a.OldGLTitle}` : <em style={{ color: '#94a3b8' }}>—</em>}</td>
                        <td style={auditCell}>{a.NewGLCode} — {a.NewGLTitle}</td>
                        <td style={auditCell}>{a.ChangedByName || a.ChangedBy || '—'}</td>
                        <td style={auditCell}>{a.Reason || <em style={{ color: '#94a3b8' }}>—</em>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} } .spin{animation:spin 1s linear infinite}`}</style>
    </div>
  );
}

// ----- styles -----
const inp = { width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 14, boxSizing: 'border-box' };
const lblStyle = { display: 'block', fontSize: 12, color: '#475569', fontWeight: 600, marginBottom: 4 };
const modalOverlay = { position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 };
const modal = { background: 'white', borderRadius: 8, boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)' };
const modalHeader = { padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' };
const iconBtn = { background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b', padding: 4, display: 'inline-flex' };
const resultRow = { padding: '8px 12px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'background 0.1s' };
const auditHdr = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' };
const auditCell = { padding: '8px 12px', fontSize: 13 };

function btn(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '6px 12px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent' };
  if (variant === 'primary')  return { ...base, background: '#1d4ed8', color: 'white', borderColor: '#1d4ed8' };
  if (variant === 'ghost')    return { ...base, background: 'white', color: '#475569', borderColor: '#cbd5e1' };
  if (variant === 'disabled') return { ...base, background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };
  return base;
}
