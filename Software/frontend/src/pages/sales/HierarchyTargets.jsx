import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Users, Target, Plus, X, Loader2, UserMinus } from 'lucide-react';
import { useFeedback } from '../../context/FeedbackContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleDateString('en-PK') : '';

export default function HierarchyTargets() {
    const { notify, confirm } = useFeedback();
    const [tab, setTab]         = useState('hierarchy');
    const [assignments, setAssignments] = useState([]);
    const [targets, setTargets]         = useState([]);
    const [performance, setPerformance] = useState([]);
    const [employees, setEmployees]     = useState([]);
    const [showAssignModal, setShowAssignModal] = useState(false);
    const [showTargetModal, setShowTargetModal] = useState(false);
    const [busy, setBusy]               = useState(false);

    const load = useCallback(async () => {
        setBusy(true);
        try {
            const [a, t, p, e] = await Promise.all([
                axios.get('/api/sales/hierarchy/assignments'),
                axios.get('/api/sales/targets'),
                axios.get('/api/sales/targets/performance'),
                axios.get('/api/employees').catch(() => ({ data: [] })),
            ]);
            setAssignments(a.data || []);
            setTargets(t.data || []);
            setPerformance(p.data || []);
            setEmployees(e.data || []);
        } catch (err) { notify(err.response?.data?.error || err.message, 'error'); }
        setBusy(false);
    }, [notify]);

    useEffect(() => { load(); }, [load]);

    const endAssignment = async (a) => {
        const ok = await confirm({ title: 'End assignment?', message: `${a.EmployeeName} → ${a.HierarchyRole}`, confirmLabel: 'END', tone: 'danger' });
        if (!ok) return;
        try {
            await axios.post(`/api/sales/hierarchy/assignments/${a.AssignmentID}/end`, {});
            notify('Ended.', 'success'); load();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
    };

    return (
        <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <Users size={28} color="#1e40af" /> Sales Hierarchy & Targets
            </h1>

            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {[['hierarchy','Hierarchy'],['targets','Targets'],['performance','Performance']].map(([key,label]) => (
                    <button key={key} onClick={() => setTab(key)}
                        style={{ padding: '8px 16px', background: tab===key?'#1e40af':'#f1f5f9', color: tab===key?'white':'#475569', border:'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                        {label}
                    </button>
                ))}
            </div>

            {tab === 'hierarchy' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Active Assignments</h3>
                        <button onClick={() => setShowAssignModal(true)} className="btn">
                            <Plus size={14} /> Assign Role
                        </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={th}>Employee</th>
                            <th style={th}>Code</th>
                            <th style={th}>Role</th>
                            <th style={th}>Assigned At</th>
                            <th style={th}></th>
                        </tr></thead>
                        <tbody>
                            {assignments.map(a => (
                                <tr key={a.AssignmentID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={td}>{a.EmployeeName || '—'}</td>
                                    <td style={{...td, fontFamily: 'monospace'}}>{a.EmployeeCode || '—'}</td>
                                    <td style={td}>
                                        <span style={{ background: a.HierarchyRole==='GM'?'#7c3aed':a.HierarchyRole==='AGM'?'#1e40af':'#475569', color: 'white', padding: '2px 8px', borderRadius: 99, fontSize: '0.72rem', fontWeight: 700 }}>{a.HierarchyRole}</span>
                                    </td>
                                    <td style={{...td, color: '#64748b'}}>{dt(a.AssignedAt)}</td>
                                    <td style={td}>
                                        <button onClick={() => endAssignment(a)} title="End assignment" style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
                                            <UserMinus size={14} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {assignments.length === 0 && (
                                <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>{busy ? <Loader2 size={16} className="spin" /> : 'No active assignments yet.'}</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'targets' && (
                <div className="card">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <h3 style={{ margin: 0 }}>Active Targets</h3>
                        <button onClick={() => setShowTargetModal(true)} className="btn">
                            <Plus size={14} /> Set Target
                        </button>
                    </div>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={th}>Employee</th>
                            <th style={th}>Period</th>
                            <th style={th}>From → To</th>
                            <th style={{...th, textAlign:'right'}}>Units</th>
                            <th style={{...th, textAlign:'right'}}>Revenue</th>
                            <th style={th}>Set By</th>
                        </tr></thead>
                        <tbody>
                            {targets.map(t => (
                                <tr key={t.TargetID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={td}>{t.EmployeeName || '—'} <span style={{ color:'#94a3b8', fontFamily:'monospace', fontSize:'0.74rem' }}>{t.EmployeeCode}</span></td>
                                    <td style={td}>{t.PeriodType}</td>
                                    <td style={td}>{dt(t.PeriodStart)} → {dt(t.PeriodEnd)}</td>
                                    <td style={tdNum}>{t.UnitsTarget}</td>
                                    <td style={tdNum}>PKR {fmt(t.RevenueTarget)}</td>
                                    <td style={{...td, fontSize:'0.78rem', color:'#64748b'}}>{t.AssignedByName} · {dt(t.AssignedAt)}</td>
                                </tr>
                            ))}
                            {targets.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No targets set yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {tab === 'performance' && (
                <div className="card">
                    <h3 style={{ marginTop: 0 }}>Target vs Actual</h3>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                            <th style={th}>Employee</th>
                            <th style={th}>Period</th>
                            <th style={{...th, textAlign:'right'}}>Units T/A</th>
                            <th style={{...th, textAlign:'right'}}>Units %</th>
                            <th style={{...th, textAlign:'right'}}>Revenue T/A</th>
                            <th style={{...th, textAlign:'right'}}>Revenue %</th>
                        </tr></thead>
                        <tbody>
                            {performance.map(p => (
                                <tr key={p.TargetID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={td}>{p.EmployeeName || '—'}</td>
                                    <td style={td}>{p.PeriodType} · {dt(p.PeriodStart)} → {dt(p.PeriodEnd)}</td>
                                    <td style={tdNum}>{p.UnitsTarget} / <strong>{p.ActualUnits}</strong></td>
                                    <td style={{...tdNum, fontWeight: 700, color: p.UnitsPct >= 100 ? '#15803d' : p.UnitsPct >= 60 ? '#b45309' : '#b91c1c'}}>{p.UnitsPct != null ? `${p.UnitsPct.toFixed(1)}%` : '—'}</td>
                                    <td style={tdNum}>{fmt(p.RevenueTarget)} / <strong>{fmt(p.ActualRevenue)}</strong></td>
                                    <td style={{...tdNum, fontWeight: 700, color: p.RevenuePct >= 100 ? '#15803d' : p.RevenuePct >= 60 ? '#b45309' : '#b91c1c'}}>{p.RevenuePct != null ? `${p.RevenuePct.toFixed(1)}%` : '—'}</td>
                                </tr>
                            ))}
                            {performance.length === 0 && (
                                <tr><td colSpan={6} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No performance data — set some targets first.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            )}

            {showAssignModal && <AssignModal employees={employees} onClose={() => setShowAssignModal(false)} onSaved={() => { setShowAssignModal(false); load(); }} />}
            {showTargetModal && <TargetModal employees={employees} onClose={() => setShowTargetModal(false)} onSaved={() => { setShowTargetModal(false); load(); }} />}
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function AssignModal({ employees, onClose, onSaved }) {
    const { notify } = useFeedback();
    const [empId, setEmpId] = useState('');
    const [role, setRole]   = useState('Executive');
    const [busy, setBusy]   = useState(false);

    const save = async () => {
        if (!empId) return notify('Pick an employee.', 'error');
        setBusy(true);
        try {
            await axios.post('/api/sales/hierarchy/assignments', { EmployeeID: Number(empId), HierarchyRole: role });
            notify('Assigned.', 'success'); onSaved();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
        setBusy(false);
    };

    return <Modal title="Assign Hierarchy Role" onClose={onClose}>
        <Row label="Employee *">
            <select value={empId} onChange={e => setEmpId(e.target.value)} style={input}>
                <option value="">— Pick —</option>
                {employees.map(e => <option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeName} ({e.EmployeeCode})</option>)}
            </select>
        </Row>
        <Row label="Hierarchy Role *">
            <select value={role} onChange={e => setRole(e.target.value)} style={input}>
                <option value="Executive">Executive</option>
                <option value="AGM">AGM</option>
                <option value="GM">GM</option>
            </select>
        </Row>
        <Actions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>;
}

function TargetModal({ employees, onClose, onSaved }) {
    const { notify } = useFeedback();
    const today = new Date(); const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const [empId, setEmpId] = useState('');
    const [periodType, setPeriodType] = useState('Month');
    const [pStart, setPStart] = useState(monthStart.toISOString().slice(0,10));
    const [pEnd, setPEnd]     = useState(monthEnd.toISOString().slice(0,10));
    const [units, setUnits]   = useState('0');
    const [rev, setRev]       = useState('0');
    const [busy, setBusy]     = useState(false);

    const save = async () => {
        if (!empId) return notify('Pick an employee.', 'error');
        setBusy(true);
        try {
            await axios.post('/api/sales/targets', { EmployeeID: Number(empId), PeriodType: periodType, PeriodStart: pStart, PeriodEnd: pEnd, UnitsTarget: Number(units), RevenueTarget: Number(rev) });
            notify('Target set.', 'success'); onSaved();
        } catch (e) { notify(e.response?.data?.error || e.message, 'error'); }
        setBusy(false);
    };

    return <Modal title="Set Sales Target" onClose={onClose}>
        <Row label="Employee *">
            <select value={empId} onChange={e => setEmpId(e.target.value)} style={input}>
                <option value="">— Pick —</option>
                {employees.map(e => <option key={e.EmployeeID} value={e.EmployeeID}>{e.EmployeeName} ({e.EmployeeCode})</option>)}
            </select>
        </Row>
        <Row label="Period">
            <select value={periodType} onChange={e => setPeriodType(e.target.value)} style={input}>
                <option value="Month">Month</option>
                <option value="Quarter">Quarter</option>
                <option value="Year">Year</option>
            </select>
        </Row>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <Row label="Start *"><input type="date" value={pStart} onChange={e => setPStart(e.target.value)} style={input} /></Row>
            <Row label="End *"><input type="date" value={pEnd} onChange={e => setPEnd(e.target.value)} style={input} /></Row>
            <Row label="Units target"><input type="number" value={units} onChange={e => setUnits(e.target.value)} style={input} /></Row>
            <Row label="Revenue target (PKR)"><input type="number" value={rev} onChange={e => setRev(e.target.value)} style={input} /></Row>
        </div>
        <Actions onCancel={onClose} onSave={save} busy={busy} />
    </Modal>;
}

function Modal({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
            <div style={{ background: 'white', borderRadius: 8, padding: 20, maxWidth: 520, width: '100%' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ margin: 0 }}>{title}</h3>
                    <button onClick={onClose} style={{ background: 'transparent', border: 'none', cursor: 'pointer' }}><X size={18} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

function Row({ label, children }) {
    return (
        <div style={{ marginBottom: 10 }}>
            <label style={{ display: 'block', fontSize: '0.78rem', color: '#475569', marginBottom: 4, fontWeight: 600 }}>{label}</label>
            {children}
        </div>
    );
}

function Actions({ onCancel, onSave, busy }) {
    return (
        <div style={{ marginTop: 14, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={onCancel} className="btn-sm">Cancel</button>
            <button onClick={onSave} disabled={busy} style={{ padding: '8px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: 'pointer' }}>
                {busy ? <Loader2 size={14} className="spin" /> : 'Save'}
            </button>
        </div>
    );
}

const th = { padding: 8, fontWeight: 600, fontSize: '0.74rem', color: '#475569', textTransform: 'uppercase', letterSpacing: 0.4 };
const td = { padding: 8 };
const tdNum = { padding: 8, textAlign: 'right', fontFamily: 'monospace' };
const input = { width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: '0.88rem' };
