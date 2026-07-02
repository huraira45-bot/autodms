import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { Search, ShieldCheck, ShieldAlert, ArrowRight, Loader2, Printer, RotateCcw } from 'lucide-react';
import { useFeedback } from '../context/FeedbackContext';

const fmt = (n) => Number(n || 0).toLocaleString('en-PK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dt  = (d) => d ? new Date(d).toLocaleString('en-PK') : '';

const REASON_LABEL = {
    CREDIT_PARTY:       'Credit Party',
    PAID_FULL:          'Paid in Full',
    INSURANCE_DEP_PAID: 'Insurance — Dep. Paid',
    FREE_SERVICE:       'Free / Zero-Charge',
};

export default function GatePass() {
    const { notify, confirm } = useFeedback();
    const [docType, setDocType] = useState('JOBCARD');
    const [docNo, setDocNo]     = useState('');
    const [check, setCheck]     = useState(null);
    const [busy, setBusy]       = useState(false);
    const [history, setHistory] = useState([]);

    const loadHistory = useCallback(async () => {
        try {
            const r = await axios.get('/api/gatepass', { params: { } });
            setHistory(r.data || []);
        } catch { /* silent */ }
    }, []);

    useEffect(() => { loadHistory(); }, [loadHistory]);

    const runCheck = async () => {
        if (!docNo.trim()) return;
        setBusy(true); setCheck(null);
        try {
            const r = await axios.get('/api/gatepass/check', { params: { docType, docNo: docNo.trim() } });
            setCheck(r.data);
            if (r.data.warnings?.some(w => w.code === 'POS_USED')) {
                notify('POS was used — confirm the card was physically swiped before opening the gate.', 'info');
            }
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        }
        setBusy(false);
    };

    const issue = async () => {
        const ok = await confirm({
            title: `Issue gate pass for ${check.doc.docNo}?`,
            message: `${REASON_LABEL[check.passReason]} — ${check.doc.customerName}. Continue?`,
            confirmText: 'ISSUE PASS',
            danger: false,
        });
        if (!ok) return;
        setBusy(true);
        try {
            const r = await axios.post('/api/gatepass/issue', { docType, docNo: docNo.trim() });
            notify(`Issued ${r.data.GatePassNo}.`, 'success');
            await loadHistory();
            await runCheck();
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        }
        setBusy(false);
    };

    const revoke = async (gp) => {
        const reason = window.prompt(`Revoke ${gp.GatePassNo}? Reason:`, '');
        if (!reason) return;
        try {
            await axios.post(`/api/gatepass/${gp.GatePassID}/revoke`, { reason });
            notify('Gate pass revoked.', 'success');
            await loadHistory();
        } catch (e) {
            notify(e.response?.data?.error || e.message, 'error');
        }
    };

    const printPass = (gp) => {
        const w = window.open('', '_blank', 'width=1000,height=650');
        if (!w) return;
        // Landscape gate pass with the fields the owner asked for (2026-07-02):
        // RO#, cell #, vehicle #, business unit, time-in (JC creation) + time-out
        // (gate-pass issue), vehicle colour, payment mode + party (for Credit),
        // advisor name.
        const isCredit = (gp.PaymentMode || '').toUpperCase() === 'CREDIT';
        const paymentDisplay = isCredit
            ? `Credit${gp.PartyName ? ' — ' + gp.PartyName : ''}`
            : (gp.PaymentMode || gp.PaymentModes || '—');
        const ro = gp.RONumber || gp.InvoiceNo || `${gp.DocType} #${gp.DocID}`;
        w.document.write(`<html><head><title>${gp.GatePassNo}</title>
            <style>
                @page { size: A4 landscape; margin: 0; }
                @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
                html,body{margin:0;padding:0;background:#fff;}
                body{font-family:Arial;padding:10mm 14mm;box-sizing:border-box;width:297mm;min-height:210mm;}
                .banner{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #1e40af;padding-bottom:8px;margin-bottom:12px;}
                .banner .title{font-size:22pt;color:#1e40af;font-weight:800;}
                .banner .sub{font-size:11pt;color:#334155;}
                .banner .gpno{font-size:14pt;color:#1e40af;font-weight:700;font-family:monospace;}
                .grid{display:grid;grid-template-columns:repeat(3, 1fr);gap:0 24px;}
                .cell{padding:6px 0;border-bottom:1px dashed #cbd5e1;display:flex;flex-direction:column;gap:2px;}
                .cell .lbl{color:#64748b;font-size:9pt;text-transform:uppercase;letter-spacing:0.4px;}
                .cell .val{font-weight:600;font-size:12pt;color:#0f172a;}
                .reason{margin:16px 0;padding:10px;background:#dcfce7;color:#166534;border-radius:6px;font-weight:700;text-align:center;font-size:12pt;}
                .money{display:grid;grid-template-columns:repeat(3, 1fr);gap:16px;margin-top:6px;}
                .money .box{padding:8px 12px;background:#f1f5f9;border-radius:6px;text-align:center;}
                .money .box .lbl{font-size:9pt;color:#64748b;text-transform:uppercase;letter-spacing:0.4px;}
                .money .box .val{font-size:14pt;font-weight:800;color:#1e293b;margin-top:2px;}
                .sig{margin-top:28px;display:flex;justify-content:space-between;gap:36px;}
                .sig div{flex:1;border-top:1px solid #475569;text-align:center;padding-top:6px;font-size:10pt;color:#475569;}
            </style></head><body>
            <div class="banner">
                <div>
                    <div class="title">CHANGAN MULTAN MOTORS</div>
                    <div class="sub">Gate Pass</div>
                </div>
                <div style="text-align:right">
                    <div class="gpno">${gp.GatePassNo}</div>
                    <div class="sub">${REASON_LABEL[gp.PassReason] || gp.PassReason}</div>
                </div>
            </div>

            <div class="grid">
                <div class="cell"><span class="lbl">RO / Doc #</span><span class="val">${ro}</span></div>
                <div class="cell"><span class="lbl">Business Unit</span><span class="val">${gp.BusinessUnit || '—'}</span></div>
                <div class="cell"><span class="lbl">Service Advisor</span><span class="val">${gp.ServiceAdvisorName || '—'}</span></div>

                <div class="cell"><span class="lbl">Customer</span><span class="val">${gp.CustomerName || '—'}</span></div>
                <div class="cell"><span class="lbl">Cell #</span><span class="val">${gp.CustomerCell || '—'}</span></div>
                <div class="cell"><span class="lbl">Payment</span><span class="val">${paymentDisplay}</span></div>

                <div class="cell"><span class="lbl">Vehicle Reg #</span><span class="val">${gp.VehicleRegNo || '—'}</span></div>
                <div class="cell"><span class="lbl">Vehicle Colour</span><span class="val">${gp.VehicleColour || '—'}</span></div>
                <div class="cell"><span class="lbl">Chassis #</span><span class="val">${gp.VehicleChassis || '—'}</span></div>

                <div class="cell"><span class="lbl">Time In (RO created)</span><span class="val">${dt(gp.TimeIn)}</span></div>
                <div class="cell"><span class="lbl">Time Out (Gate Pass)</span><span class="val">${dt(gp.IssuedAt)}</span></div>
                <div class="cell"><span class="lbl">Issued By</span><span class="val">${gp.IssuedByName || '—'}</span></div>
            </div>

            <div class="money">
                <div class="box"><div class="lbl">Amount Invoiced</div><div class="val">PKR ${fmt(gp.AmountInvoiced)}</div></div>
                <div class="box"><div class="lbl">Amount Received</div><div class="val">PKR ${fmt(gp.AmountReceived)}</div></div>
                <div class="box"><div class="lbl">Modes Used</div><div class="val" style="font-size:12pt">${gp.PaymentModes || '—'}</div></div>
            </div>

            <div class="reason">${REASON_LABEL[gp.PassReason] || gp.PassReason}</div>

            <div class="sig"><div>Customer Signature</div><div>Security / Gate</div><div>Authorized</div></div>
            <script>window.onload=()=>setTimeout(()=>window.print(),200);</script>
            </body></html>`);
        w.document.close();
    };

    return (
        <div className="container" style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <ShieldCheck size={28} color="#1e40af" /> Gate Pass
            </h1>

            <div className="card" style={{ marginBottom: 24 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <div style={{ minWidth: 160 }}>
                        <label style={{ fontSize: '0.78rem', color: '#475569', display: 'block', marginBottom: 4 }}>Type</label>
                        <select value={docType} onChange={e => { setDocType(e.target.value); setCheck(null); }}
                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }}>
                            <option value="JOBCARD">Job Card</option>
                            <option value="STORE_SALE">Store Sale</option>
                        </select>
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.78rem', color: '#475569', display: 'block', marginBottom: 4 }}>
                            {docType === 'JOBCARD' ? 'Job Card #' : 'Invoice #'}
                        </label>
                        <input value={docNo} onChange={e => setDocNo(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && runCheck()}
                            placeholder={docType === 'JOBCARD' ? 'e.g. B&P-0001' : 'e.g. INV-001'}
                            style={{ width: '100%', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6 }} />
                    </div>
                    <button disabled={!docNo.trim() || busy} onClick={runCheck}
                        style={{ padding: '9px 16px', background: '#1e40af', color: 'white', border: 'none', borderRadius: 6, fontWeight: 600, cursor: docNo.trim() ? 'pointer' : 'not-allowed', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {busy ? <Loader2 size={16} className="spin" /> : <Search size={16} />} Check
                    </button>
                </div>
            </div>

            {check && (
                <div className="card" style={{ marginBottom: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16, marginBottom: 16 }}>
                        <Info label="Document" value={`${check.doc.docNo}`} />
                        <Info label="Customer" value={check.doc.customerName || '—'} />
                        <Info label="Vehicle Reg" value={check.doc.vehicleRegNo || '—'} />
                        <Info label="Chassis" value={check.doc.vehicleChassis || '—'} />
                        <Info label="Party" value={check.doc.partyName ? `${check.doc.partyName} (${check.doc.partyType})` : 'Walk-in'} />
                        <Info label="Finalized" value={check.doc.isFinalized ? 'Yes' : 'No'} />
                        <Info label="Invoiced (walk-out)" value={`PKR ${fmt(check.amountInvoiced)}`} />
                        <Info label="Received" value={`PKR ${fmt(check.amountReceived)}`} />
                        <Info label="Outstanding" value={`PKR ${fmt(check.amountOutstanding)}`}
                              color={check.amountOutstanding > 0.01 ? '#b91c1c' : '#15803d'} />
                        <Info label="Payment Modes" value={check.paymentModes?.join(', ') || '—'} />
                    </div>

                    {check.warnings?.map((w, i) => (
                        <div key={i} style={{ padding: 10, background: '#fef3c7', color: '#92400e', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert size={16} /> {w.message}
                        </div>
                    ))}
                    {check.blockers?.map((b, i) => (
                        <div key={i} style={{ padding: 10, background: '#fee2e2', color: '#991b1b', borderRadius: 6, marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldAlert size={16} /> <strong>BLOCKED:</strong> {b.message}
                        </div>
                    ))}

                    {check.existingPass && (
                        <div style={{ padding: 10, background: '#e0e7ff', color: '#3730a3', borderRadius: 6, marginBottom: 8 }}>
                            Active gate pass already issued: <strong>{check.existingPass.GatePassNo}</strong> on {dt(check.existingPass.IssuedAt)} by {check.existingPass.IssuedByName}.
                        </div>
                    )}

                    {check.canIssue && !check.existingPass && (
                        <button onClick={issue} disabled={busy}
                            style={{ padding: '10px 20px', background: '#16a34a', color: 'white', border: 'none', borderRadius: 6, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <ShieldCheck size={16} /> Issue Gate Pass — {REASON_LABEL[check.passReason] || check.passReason}
                            <ArrowRight size={16} />
                        </button>
                    )}
                </div>
            )}

            <div className="card">
                <h3 style={{ marginTop: 0 }}>Recent Gate Passes</h3>
                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9', textAlign: 'left' }}>
                                <th style={{ padding: 8 }}>GP #</th>
                                <th style={{ padding: 8 }}>Doc</th>
                                <th style={{ padding: 8 }}>Customer</th>
                                <th style={{ padding: 8 }}>Vehicle</th>
                                <th style={{ padding: 8 }}>Reason</th>
                                <th style={{ padding: 8, textAlign: 'right' }}>Received</th>
                                <th style={{ padding: 8 }}>Issued</th>
                                <th style={{ padding: 8 }}>Status</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.map(gp => (
                                <tr key={gp.GatePassID} style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: 8, fontFamily: 'monospace', fontWeight: 700 }}>{gp.GatePassNo}</td>
                                    <td style={{ padding: 8 }}>{gp.DocType} #{gp.DocID}</td>
                                    <td style={{ padding: 8 }}>{gp.CustomerName || '—'}</td>
                                    <td style={{ padding: 8 }}>{gp.VehicleRegNo || gp.VehicleChassis || '—'}</td>
                                    <td style={{ padding: 8 }}>{REASON_LABEL[gp.PassReason] || gp.PassReason}</td>
                                    <td style={{ padding: 8, textAlign: 'right' }}>PKR {fmt(gp.AmountReceived)}</td>
                                    <td style={{ padding: 8, fontSize: '0.78rem', color: '#64748b' }}>{dt(gp.IssuedAt)}<br/>by {gp.IssuedByName}</td>
                                    <td style={{ padding: 8 }}>
                                        {gp.RevokedAt
                                            ? <span style={{ color: '#b91c1c', fontWeight: 600 }}>REVOKED</span>
                                            : <span style={{ color: '#15803d', fontWeight: 600 }}>ACTIVE</span>}
                                    </td>
                                    <td style={{ padding: 8, display: 'flex', gap: 4 }}>
                                        <button onClick={() => printPass(gp)} title="Print"
                                            style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#475569' }}>
                                            <Printer size={14} />
                                        </button>
                                        {!gp.RevokedAt && (
                                            <button onClick={() => revoke(gp)} title="Revoke"
                                                style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: '#b91c1c' }}>
                                                <RotateCcw size={14} />
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {history.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 24, textAlign: 'center', color: '#94a3b8' }}>No gate passes issued yet.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
            <style>{`.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
    );
}

function Info({ label, value, color }) {
    return (
        <div>
            <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
            <div style={{ fontWeight: 600, color: color || '#0f172a' }}>{value}</div>
        </div>
    );
}
