import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { Percent, Edit2, History, X, Check, Loader2, AlertTriangle, Calendar, Clock } from 'lucide-react';

const API = '/api/tax-rates';

const TAX_META = {
  GST: { label: 'GST', subtitle: 'General Sales Tax — applies to parts only', color: '#1d4ed8', bg: '#eff6ff' },
  PST: { label: 'PST', subtitle: 'Provincial Sales Tax — applies to labour & sublet only', color: '#a21caf', bg: '#fdf4ff' },
};

export default function TaxRates() {
  const [current, setCurrent] = useState([]);
  const [scheduled, setScheduled] = useState([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  // Change modal
  const [editType, setEditType] = useState(null);
  const [newRate, setNewRate] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  // History modal
  const [histType, setHistType] = useState(null);
  const [history, setHistory] = useState([]);

  const flash = (m, isErr = false) => {
    isErr ? setErr(m) : setMsg(m);
    setTimeout(() => { setMsg(''); setErr(''); }, 4000);
  };

  const load = async () => {
    setLoading(true);
    try {
      const r = await axios.get(API);
      setCurrent(r.data.current || []);
      setScheduled(r.data.scheduled || []);
    } catch (e) { flash('Failed to load tax rates.', true); }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const openEdit = (type) => {
    const cur = current.find(c => c.TaxType === type);
    setEditType(type);
    setNewRate(cur ? String(cur.Rate) : '');
    setEffectiveFrom(new Date().toISOString().slice(0, 10));
    setReason('');
  };

  const openHist = async (type) => {
    setHistType(type);
    setHistory([]);
    try {
      const r = await axios.get(`${API}/${type}/history`);
      setHistory(r.data);
    } catch (e) { flash('Failed to load history.', true); }
  };

  const save = async () => {
    const rate = parseFloat(newRate);
    if (isNaN(rate) || rate < 0 || rate > 100) { flash('Rate must be 0–100.', true); return; }
    setSaving(true);
    try {
      const r = await axios.post(`${API}/${editType}`, {
        Rate: rate,
        EffectiveFrom: effectiveFrom,
        Reason: reason || null,
      });
      flash(r.data.message);
      setEditType(null);
      load();
    } catch (e) {
      flash(e.response?.data?.error || e.message, true);
    }
    setSaving(false);
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <Percent size={28} style={{ color: '#1e40af' }} />
        <h1 style={{ margin: 0, fontSize: 24 }}>Tax Rates</h1>
      </div>
      <p style={{ color: '#64748b', marginTop: 0, marginBottom: 20 }}>
        GST and PST rates. Every change closes the previous rate (sets its end-date) and opens a new one — historical rates remain queryable for FBR audit. Already-finalised documents keep the rate they were saved with.
      </p>

      {msg && <div style={{ background: '#dcfce7', color: '#166534', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>{msg}</div>}
      {err && <div style={{ background: '#fee2e2', color: '#991b1b', padding: '10px 12px', borderRadius: 6, marginBottom: 12 }}>{err}</div>}

      {loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Loader2 className="spin" size={32} /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          {['GST', 'PST'].map(type => {
            const cur = current.find(c => c.TaxType === type);
            const scheduledForType = scheduled.find(s => s.TaxType === type);
            const meta = TAX_META[type];
            return (
              <div key={type} style={{ background: 'white', border: '1px solid #e2e8f0', borderRadius: 10, overflow: 'hidden' }}>
                <div style={{ background: meta.bg, padding: '16px 20px', borderBottom: '1px solid #e2e8f0' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                    <h2 style={{ margin: 0, fontSize: 18, color: meta.color }}>{meta.label}</h2>
                    <span style={{ color: '#64748b', fontSize: 13 }}>{meta.subtitle}</span>
                  </div>
                </div>
                <div style={{ padding: 20 }}>
                  {cur ? (
                    <>
                      <div style={{ fontSize: 48, fontWeight: 700, color: meta.color, lineHeight: 1 }}>
                        {parseFloat(cur.Rate).toFixed(2)}<span style={{ fontSize: 24, marginLeft: 2 }}>%</span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, marginTop: 12, color: '#64748b', fontSize: 13 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <Calendar size={14} /> Effective from {new Date(cur.EffectiveFrom).toLocaleDateString()}
                        </span>
                        {cur.ChangedByName && (
                          <span style={{ color: '#94a3b8' }}>
                            by {cur.ChangedByName}
                          </span>
                        )}
                      </div>
                      {scheduledForType && (
                        <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: '10px 12px', borderRadius: 6, marginTop: 12, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                          <Clock size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                          <div style={{ fontSize: 13 }}>
                            <strong>Scheduled change:</strong> {parseFloat(scheduledForType.Rate).toFixed(2)}% from {new Date(scheduledForType.EffectiveFrom).toLocaleDateString()}
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <div style={{ color: '#b45309', display: 'flex', alignItems: 'center', gap: 6 }}>
                      <AlertTriangle size={16} /> No active rate set
                    </div>
                  )}

                  <div style={{ marginTop: 20, display: 'flex', gap: 8 }}>
                    <button onClick={() => openEdit(type)} style={btn('primary')}>
                      <Edit2 size={14} /> Change Rate
                    </button>
                    <button onClick={() => openHist(type)} style={btn('ghost')}>
                      <History size={14} /> History
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Change modal */}
      {editType && (
        <div style={modalOverlay}>
          <div style={{ ...modal, width: 460 }}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}>Change {editType} Rate</h3>
              <button onClick={() => setEditType(null)} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: 16 }}>
              <div style={{ background: '#fef3c7', border: '1px solid #fde68a', color: '#92400e', padding: 10, borderRadius: 6, marginBottom: 14, fontSize: 13, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 2 }} />
                <div>
                  Already-finalised Job Cards, GRNs, and Store Sales keep the rate they were saved with. This change applies only to new lines saved after the effective date.
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>New Rate (%)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={newRate}
                  onChange={e => setNewRate(e.target.value)}
                  style={inp}
                  autoFocus
                />
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Effective From</label>
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={e => setEffectiveFrom(e.target.value)}
                  style={inp}
                />
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                  Leave as today, or pick a future date to schedule the change.
                </div>
              </div>

              <div style={{ marginBottom: 12 }}>
                <label style={lblStyle}>Reason <span style={{ fontWeight: 400, color: '#94a3b8' }}>(optional)</span></label>
                <textarea
                  rows={2}
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  style={{ ...inp, resize: 'vertical' }}
                  placeholder="e.g., FBR notification SRO 123/2026"
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button onClick={() => setEditType(null)} style={btn('ghost')}>Cancel</button>
                <button onClick={save} disabled={saving || !newRate} style={btn(newRate && !saving ? 'primary' : 'disabled')}>
                  {saving ? <Loader2 size={14} className="spin" /> : <Check size={14} />} Apply Change
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* History modal */}
      {histType && (
        <div style={modalOverlay}>
          <div style={{ ...modal, width: 720 }}>
            <div style={modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18 }}><History size={18} style={{ verticalAlign: -3, marginRight: 6 }} />{histType} Rate History</h3>
              <button onClick={() => setHistType(null)} style={iconBtn}><X size={20} /></button>
            </div>
            <div style={{ padding: 16 }}>
              {history.length === 0 ? (
                <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>No history yet.</div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      <th style={hdr}>Rate</th>
                      <th style={hdr}>From</th>
                      <th style={hdr}>To</th>
                      <th style={hdr}>Changed By</th>
                      <th style={hdr}>Changed At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map(h => (
                      <tr key={h.TaxRateID} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={cell}><strong>{parseFloat(h.Rate).toFixed(2)}%</strong></td>
                        <td style={cell}>{new Date(h.EffectiveFrom).toLocaleDateString()}</td>
                        <td style={cell}>{h.EffectiveTo ? new Date(h.EffectiveTo).toLocaleDateString() : <em style={{ color: '#16a34a' }}>current</em>}</td>
                        <td style={cell}>{h.ChangedByName || h.ChangedBy || '—'}</td>
                        <td style={cell}>{new Date(h.ChangedAt).toLocaleString()}</td>
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
const hdr = { textAlign: 'left', padding: '8px 12px', fontSize: 11, color: '#64748b', textTransform: 'uppercase' };
const cell = { padding: '8px 12px', fontSize: 13 };

function btn(variant) {
  const base = { display: 'inline-flex', alignItems: 'center', gap: 4, padding: '7px 14px', borderRadius: 6, fontSize: 13, fontWeight: 500, cursor: 'pointer', border: '1px solid transparent' };
  if (variant === 'primary')  return { ...base, background: '#1d4ed8', color: 'white', borderColor: '#1d4ed8' };
  if (variant === 'ghost')    return { ...base, background: 'white', color: '#475569', borderColor: '#cbd5e1' };
  if (variant === 'disabled') return { ...base, background: '#e2e8f0', color: '#94a3b8', cursor: 'not-allowed' };
  return base;
}
