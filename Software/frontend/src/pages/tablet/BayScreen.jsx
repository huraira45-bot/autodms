/**
 * Bay screen — service tablet app, Phase 3 (plan 2026-09-14).
 *
 * A tablet or TV fixed at one bay shows the jobs sent to that bay, and the
 * technicians tap Start and Finish. The times are the server's clock, so the
 * Job Controller, the lobby kiosk and the reports all see the same times.
 *
 * Two modes at /tablet/bay:
 *   - Setup: someone with Bay Screens permission signs in on the device and
 *     registers it to a bay. They are signed out straight after, and the
 *     device keeps only a device token that works for nothing but its bay.
 *   - Board: a registered device, with nobody signed in.
 */
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { Loader2, Play, Square, Undo2, Wifi, WifiOff, MonitorSmartphone, CheckCircle2, Clock, User, Package } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { isNativeApp, getServerUrl } from '../../tablet/serverConfig';
import { useServiceEvents } from '../../tablet/useServiceEvents';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, errText, fmtDateTime } from '../../tablet/estimateFormat';
import BayCamera from './BayCamera';

const STORE_KEY = 'dms_bay_device';

function readDevice() {
    try {
        const v = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
        return v?.token ? v : null;
    } catch {
        return null;
    }
}
function saveDevice(v) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(v)); } catch { /* storage unavailable */ }
}
function clearDevice() {
    try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ }
}

export const hasBayDevice = () => !!readDevice();

export default function BayScreen() {
    const device = readDevice();
    return device ? <BayBoard device={device} /> : <BaySetup />;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------
//
// Styled as workshop instrumentation (owner ask 2026-09-25): a dark console
// with a faint grid, cyan as the "live" colour, and the technical values —
// registration, job number, times, quantities — set in a monospace face so
// digits line up and read like a readout.
//
// Everything here is read from several metres away by someone holding a tool,
// so the decoration is kept behind the content: nothing dims text below the
// contrast it had, every touch target stays at least 68px, and the only motion
// is a slow pulse on work that is actually running. A board that is hard to
// read in a hurry would be worse than a plain one.
const D = {
    bg: '#070b14', bgGrid: '#0e1626', card: '#111a2e', cardTop: '#16223c',
    line: '#24314f', text: '#f1f5f9', muted: '#94a3b8', dim: '#64748b',
    accent: '#22d3ee',                       // live / running
    start: '#16a34a', finish: '#0891b2', done: '#22c55e', warn: '#f59e0b', bad: '#ef4444',
};

const MONO = "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Consolas, monospace";

const BAY_CSS = `
.bay-led { width: 10px; height: 10px; border-radius: 50%; display: inline-block;
           box-shadow: 0 0 10px currentColor; animation: bayPulse 2.4s ease-in-out infinite; }
.bay-led-bad { animation: bayPulse 0.9s ease-in-out infinite; }
@keyframes bayPulse { 0%,100% { opacity: 0.45; } 50% { opacity: 1; } }

/* The card's left edge is its state at a glance; only running work moves. */
.bay-edge { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
.bay-edge-live { animation: bayEdge 2s ease-in-out infinite; }
@keyframes bayEdge { 0%,100% { opacity: 0.55; } 50% { opacity: 1; } }

.bay-card { position: relative; overflow: hidden; }
.bay-card::after {
    content: ''; position: absolute; inset: 0; pointer-events: none;
    background: linear-gradient(180deg, rgba(255,255,255,0.035), transparent 120px);
}

/* One thin sweep under the header — enough to read as an instrument, slow
   enough to ignore while working. */
.bay-scan { height: 2px; background: linear-gradient(90deg, transparent, ${'#22d3ee'}, transparent);
            opacity: 0.5; animation: bayScan 7s linear infinite; }
@keyframes bayScan { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }

.bay-btn:active { transform: translateY(1px); }
.bay-btn:disabled { opacity: 0.55; }

@media (prefers-reduced-motion: reduce) {
    .bay-led, .bay-edge-live, .bay-scan { animation: none; }
}
`;

const S2 = {
    screen: {
        minHeight: '100vh', color: D.text,
        background: `
            radial-gradient(1200px 500px at 50% -10%, #12203a 0%, transparent 70%),
            repeating-linear-gradient(0deg,  ${D.bgGrid} 0 1px, transparent 1px 44px),
            repeating-linear-gradient(90deg, ${D.bgGrid} 0 1px, transparent 1px 44px),
            ${D.bg}`,
        fontFamily: "'Inter', 'Segoe UI', Arial, sans-serif",
    },
    hud: {
        display: 'flex', alignItems: 'center', gap: 22, padding: '14px 26px', flexWrap: 'wrap',
        background: 'linear-gradient(180deg, rgba(34,211,238,0.07), transparent)',
        borderBottom: `1px solid ${D.line}`,
    },
    bayTag: { fontFamily: MONO, fontSize: 15, letterSpacing: 3, color: D.accent, opacity: 0.85 },
    bayName: { fontFamily: MONO, fontSize: 38, fontWeight: 700, letterSpacing: 3, textShadow: `0 0 22px ${D.accent}44` },
    jobCount: { display: 'flex', alignItems: 'baseline', gap: 7, color: D.muted },
    jobCountNum: { fontFamily: MONO, fontSize: 26, fontWeight: 700, color: D.text },
    jobCountWord: { fontSize: 16 },
    status: { display: 'flex', alignItems: 'center', gap: 9, fontFamily: MONO, fontSize: 15, letterSpacing: 1.5 },
    clock: { fontFamily: MONO, fontSize: 30, fontWeight: 700, letterSpacing: 1 },
    clockDate: { fontFamily: MONO, fontSize: 13, color: D.muted, letterSpacing: 1.5, textTransform: 'uppercase' },

    alert: {
        margin: '16px 26px 0', padding: '14px 18px', fontSize: 18,
        background: 'rgba(127,29,29,0.5)', color: '#fecaca',
        border: `1px solid ${D.bad}66`, borderLeft: `4px solid ${D.bad}`, borderRadius: 4,
    },
    emptyBig: { fontFamily: MONO, fontSize: 30, letterSpacing: 5, marginTop: 16, color: D.done },

    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(460px, 1fr))', gap: 18, padding: 24 },
    card: {
        background: `linear-gradient(180deg, ${D.cardTop}, ${D.card})`,
        border: `1px solid ${D.line}`, borderRadius: 4, padding: '18px 20px 18px 24px',
        // A clipped top-right corner — a panel, not a web card.
        clipPath: 'polygon(0 0, calc(100% - 18px) 0, 100% 18px, 100% 100%, 0 100%)',
    },
    reg: { fontFamily: MONO, fontSize: 36, fontWeight: 700, letterSpacing: 2 },
    jcNo: { fontFamily: MONO, fontSize: 16, color: D.accent, letterSpacing: 1.5 },
    vehicle: { fontSize: 18, color: '#cbd5e1', marginTop: 3 },
    meta: {
        fontFamily: MONO, fontSize: 13.5, color: D.muted, marginTop: 6,
        display: 'flex', gap: 18, flexWrap: 'wrap', letterSpacing: 1,
    },

    lineRow: {
        display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0 4px', marginTop: 12,
        borderTop: `1px solid ${D.line}`,
    },
    lineDot: { width: 8, height: 8, borderRadius: 50, flex: '0 0 auto', boxShadow: '0 0 8px currentColor' },
    lineJob: { fontSize: 21, fontWeight: 600 },
    lineMeta: { fontFamily: MONO, fontSize: 13.5, marginTop: 3, letterSpacing: 1 },

    undoBtn: {
        background: 'transparent', color: D.muted, border: `1px solid ${D.line}`, borderRadius: 4,
        minHeight: 52, padding: '0 14px', fontFamily: MONO, fontSize: 14, letterSpacing: 1.5,
        display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer',
    },
    bigBtn: {
        color: '#fff', border: 'none', borderRadius: 4,
        minHeight: 68, minWidth: 158, fontFamily: MONO, fontSize: 21, fontWeight: 700, letterSpacing: 2,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer',
    },

    partsWrap: { marginTop: 14, paddingTop: 12, borderTop: `1px dashed ${D.line}` },
    partsHead: {
        // D.muted, not D.dim: this labels something technicians actually read
        // off the screen, so it stays above the contrast the rest of the card
        // holds. D.dim is kept for the device identifier in the footer.
        fontFamily: MONO, fontSize: 13.5, letterSpacing: 2, color: D.muted,
        display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8,
    },
    partChip: {
        fontSize: 16.5, background: 'rgba(34,211,238,0.07)', border: `1px solid ${D.line}`,
        borderRadius: 3, padding: '6px 12px', color: D.text,
    },
    footer: { padding: '0 26px 18px', color: D.dim, fontFamily: MONO, fontSize: 12, letterSpacing: 1.5 },
};

function BayBoard({ device }) {
    const api = useMemo(() => axios.create({
        baseURL: isNativeApp() ? getServerUrl() : undefined,
        headers: { Authorization: `Bearer ${device.token}` },
        timeout: 15000,
    }), [device.token]);

    const [data, setData] = useState(null);
    const [offline, setOffline] = useState(false);
    const [gone, setGone] = useState(null);
    const [busyLine, setBusyLine] = useState(null);
    const [message, setMessage] = useState(null);

    const load = useCallback(async () => {
        try {
            const r = await api.get('/api/bay-screen/jobs');
            setData(r.data);
            setOffline(false);
        } catch (err) {
            if (err.response?.status === 401) setGone(err.response.data?.error || 'This screen is no longer registered.');
            else setOffline(true);
        }
    }, [api]);

    useEffect(() => {
        load();
        const t = setInterval(load, 15000);
        return () => clearInterval(t);
    }, [load]);

    const live = useServiceEvents(gone ? null : device.token, { 'bay:jobs-changed': load });

    // Keep the display on, where the browser allows it.
    useEffect(() => {
        let lock = null;
        const request = () => navigator.wakeLock?.request?.('screen').then((l) => { lock = l; }).catch(() => {});
        request();
        const onVisible = () => { if (document.visibilityState === 'visible') request(); };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            document.removeEventListener('visibilitychange', onVisible);
            lock?.release?.().catch(() => {});
        };
    }, []);

    const act = async (line, action) => {
        setBusyLine(line.DetailId);
        try {
            await api.post(`/api/bay-screen/lines/${line.DetailId}/${action}`);
            await load();
        } catch (err) {
            if (err.response?.status === 401) {
                setGone(err.response.data?.error || 'This screen is no longer registered.');
            } else {
                setMessage(errText(err));
                setTimeout(() => setMessage(null), 6000);
                load();
            }
        } finally {
            setBusyLine(null);
        }
    };

    if (gone) {
        return (
            <div style={{ minHeight: '100vh', background: D.bg, color: D.text, display: 'grid', placeItems: 'center', padding: 24, fontFamily: S.page.fontFamily }}>
                <div style={{ textAlign: 'center', maxWidth: 520 }}>
                    <MonitorSmartphone size={56} color={D.warn} />
                    <h1 style={{ fontSize: 30, margin: '14px 0 8px' }}>{gone}</h1>
                    <p style={{ color: D.muted, fontSize: 18 }}>Someone with Bay Screens permission can register it again.</p>
                    <button type="button" style={{ ...S.btn, marginTop: 16 }}
                            onClick={() => { clearDevice(); window.location.assign('/tablet/bay'); }}>
                        Set up this screen
                    </button>
                </div>
            </div>
        );
    }

    const status = offline
        ? { icon: <WifiOff size={20} />, text: 'OFFLINE — RETRYING', color: D.bad }
        : live
            ? { icon: <Wifi size={20} />, text: 'LIVE', color: D.accent }
            : { icon: <Wifi size={20} />, text: 'SYNC 15s', color: D.warn };

    const cards = data?.jobCards || [];

    return (
        <div style={S2.screen}>
            <style>{BAY_CSS}</style>

            {/* ---- HUD strip ---- */}
            <div style={S2.hud}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
                    <span style={S2.bayTag}>BAY</span>
                    <span style={S2.bayName}>{data?.bay?.BayName || device.bayName}</span>
                </div>
                <div style={S2.jobCount}>
                    <span style={S2.jobCountNum}>{String(cards.length).padStart(2, '0')}</span>
                    <span style={S2.jobCountWord}>job card{cards.length === 1 ? '' : 's'}</span>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 26 }}>
                    <span style={{ ...S2.status, color: status.color }}>
                        <span className={offline ? 'bay-led bay-led-bad' : 'bay-led'} style={{ background: status.color }} />
                        {status.icon} {status.text}
                    </span>
                    {data?.server && (
                        <span style={{ textAlign: 'right' }}>
                            <div style={S2.clock}>{data.server.TimeText}</div>
                            <div style={S2.clockDate}>{data.server.DateText}</div>
                        </span>
                    )}
                </div>
            </div>
            <div className="bay-scan" />

            {message && <div style={S2.alert}>{message}</div>}

            {/* The camera on this machine (owner report 2026-09-26: nothing
                ever asked for permission). Capture only -- nothing is sent or
                recorded yet. It sits under the alert so a bay with no camera
                set up is not staring at an error all day. */}
            <div style={{ marginTop: 16 }}>
                <BayCamera bayName={data?.bay?.BayName || device.bayName} />
            </div>

            {!data && (
                <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}>
                    <Loader2 size={40} className="animate-spin" color={D.accent} />
                </div>
            )}

            {data && !cards.length && (
                <div style={{ textAlign: 'center', padding: '90px 24px', color: D.muted }}>
                    <CheckCircle2 size={60} color={D.done} />
                    <div style={S2.emptyBig}>BAY CLEAR</div>
                    <div style={{ fontSize: 20, marginTop: 6 }}>No jobs on this bay right now</div>
                </div>
            )}

            <div style={S2.grid}>
                {cards.map(card => {
                    // The card's edge colour says, from across the workshop,
                    // whether anything here needs a hand.
                    const state = card.Lines.some(l => l.State === 'working') ? 'working'
                                : card.Lines.some(l => l.State === 'waiting') ? 'waiting' : 'done';
                    const edge = state === 'working' ? D.accent : state === 'waiting' ? D.warn : D.done;
                    return (
                        <div key={card.JobCardId} className="bay-card" style={{ ...S2.card, borderColor: edge + '55' }}>
                            <span className={state === 'working' ? 'bay-edge bay-edge-live' : 'bay-edge'}
                                  style={{ background: edge }} />

                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap' }}>
                                <span style={S2.reg}>{card.VehicleRegNo || '—'}</span>
                                <span style={S2.jcNo}>{card.JobCardNo}</span>
                            </div>
                            <div style={S2.vehicle}>
                                {[card.VehicleModel, card.CustomerName].filter(Boolean).join('  ·  ')}
                            </div>
                            <div style={S2.meta}>
                                {card.ServiceAdvisor && <span><User size={14} style={{ verticalAlign: -2 }} /> {card.ServiceAdvisor}</span>}
                                {card.PromisedText && <span><Clock size={14} style={{ verticalAlign: -2 }} /> PROMISED {card.PromisedText}</span>}
                            </div>

                            {card.Lines.map(line => (
                                <div key={line.DetailId} style={S2.lineRow}>
                                    <span style={{ ...S2.lineDot,
                                                   background: line.State === 'done' ? D.done
                                                             : line.State === 'working' ? D.accent : D.warn }} />
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ ...S2.lineJob, color: line.State === 'done' ? D.muted : D.text }}>{line.Job}</div>
                                        <div style={S2.lineMeta}>
                                            {line.State === 'waiting' && <span style={{ color: D.warn }}>NOT STARTED</span>}
                                            {line.State === 'working' && <span style={{ color: D.accent }}>RUNNING {line.StartText} · {line.Minutes} MIN</span>}
                                            {line.State === 'done' && <span style={{ color: D.done }}>DONE {line.EndText} · {line.Minutes} MIN</span>}
                                            {line.PerformedByName ? <span style={{ color: D.muted }}> · {line.PerformedByName}</span> : ''}
                                        </div>
                                    </div>
                                    {line.CanUndo && (
                                        <button type="button" onClick={() => act(line, 'undo')} disabled={busyLine === line.DetailId}
                                                style={S2.undoBtn}>
                                            <Undo2 size={18} /> UNDO
                                        </button>
                                    )}
                                    {line.State === 'waiting' && (
                                        <button type="button" onClick={() => act(line, 'start')} disabled={busyLine === line.DetailId}
                                                className="bay-btn" style={{ ...S2.bigBtn, background: D.start, boxShadow: `0 0 0 1px ${D.start}, 0 0 22px ${D.start}55` }}>
                                            {busyLine === line.DetailId ? <Loader2 className="animate-spin" /> : <><Play size={24} /> START</>}
                                        </button>
                                    )}
                                    {line.State === 'working' && (
                                        <button type="button" onClick={() => act(line, 'finish')} disabled={busyLine === line.DetailId}
                                                className="bay-btn" style={{ ...S2.bigBtn, background: D.finish, boxShadow: `0 0 0 1px ${D.finish}, 0 0 22px ${D.finish}55` }}>
                                            {busyLine === line.DetailId ? <Loader2 className="animate-spin" /> : <><Square size={22} /> FINISH</>}
                                        </button>
                                    )}
                                    {line.State === 'done' && <CheckCircle2 size={40} color={D.done} />}
                                </div>
                            ))}

                            {/* What the parts counter has sent out for this vehicle
                                (owner ask 2026-09-25). Names and quantities only —
                                what a part costs is not a technician's business,
                                and the API does not send it. */}
                            {card.Parts?.length > 0 && (
                                <div style={S2.partsWrap}>
                                    <div style={S2.partsHead}>
                                        <Package size={16} /> PARTS ISSUED
                                    </div>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                                        {card.Parts.map((p, i) => (
                                            <span key={i} style={S2.partChip}>
                                                {p.PartName}
                                                {p.Qty > 1 && <strong style={{ color: D.accent }}> ×{p.Qty}</strong>}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <div style={S2.footer}>{data?.device || device.deviceName}</div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------
function BaySetup() {
    const { user, hasPermission, logout } = useAuth();
    const { confirm, error } = useFeedback();
    const allowed = !!user && hasPermission('workshop_bay_screen');
    const [bays, setBays] = useState([]);
    const [devices, setDevices] = useState(null);
    const [form, setForm] = useState({ BayID: '', DeviceName: '' });
    const [busy, setBusy] = useState(false);

    const loadDevices = useCallback(() => {
        axios.get(`${API}/bay-devices`)
            .then(r => setDevices(r.data))
            .catch(err => { setDevices([]); error('Could not load bay screens', errText(err)); });
    }, [error]);

    useEffect(() => {
        if (!allowed) return;
        axios.get(`${API}/bay-devices/bays`).then(r => setBays(r.data)).catch(() => setBays([]));
        loadDevices();
    }, [allowed, loadDevices]);

    if (!allowed) {
        return (
            <div style={S.body}>
                <div style={S.result('warn')}>
                    Registering a bay screen needs the <strong>Bay Screens</strong> permission. An administrator can tick it in Role Permissions.
                </div>
            </div>
        );
    }

    const register = async () => {
        const bay = bays.find(b => String(b.BayID) === String(form.BayID));
        if (!bay) { error('Pick a bay', 'Choose the bay this screen is at.'); return; }
        const ok = await confirm({
            title: `Make this device the ${bay.BayName} screen?`,
            message: 'It will show the jobs sent to that bay and let technicians start and finish them. '
                   + 'You will be signed out on this device. It stays registered until someone unregisters it.',
            confirmLabel: 'Register this screen',
        });
        if (!ok) return;
        setBusy(true);
        try {
            const { data } = await axios.post(`${API}/bay-devices`, form);
            saveDevice({
                token: data.token, deviceId: data.device.DeviceID, bayId: data.device.BayID,
                bayName: data.device.BayName, deviceName: data.device.DeviceName,
            });
            logout();
            window.location.assign('/tablet/bay');
        } catch (err) {
            error('Could not register the screen', errText(err));
            setBusy(false);
        }
    };

    const revoke = async (d) => {
        const ok = await confirm({
            title: `Unregister ${d.DeviceName}?`,
            message: `The screen at ${d.BayName} stops working straight away and has to be registered again.`,
            confirmLabel: 'Unregister',
            tone: 'danger',
        });
        if (!ok) return;
        try {
            await axios.post(`${API}/bay-devices/${d.DeviceID}/revoke`);
            loadDevices();
        } catch (err) {
            error('Could not unregister', errText(err));
        }
    };

    return (
        <div style={S.body}>
            <div style={S.card}>
                <h1 style={{ ...S.h1, display: 'flex', alignItems: 'center', gap: 10 }}><MonitorSmartphone size={26} /> Bay screen setup</h1>
                <p style={S.p}>
                    Do this on the device that will stay at the bay. It then shows that bay's jobs with Start and Finish
                    buttons, and needs no one signed in.
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12, marginBottom: 14 }}>
                    <div>
                        <label style={S.label}>Bay</label>
                        <select style={S.input} value={form.BayID} onChange={e => setForm(f => ({ ...f, BayID: e.target.value }))}>
                            <option value="">— Select bay —</option>
                            {bays.map(b => <option key={b.BayID} value={String(b.BayID)}>{b.BayName}</option>)}
                        </select>
                    </div>
                    <div>
                        <label style={S.label}>Screen name (optional)</label>
                        <input style={S.input} value={form.DeviceName} maxLength={100}
                               onChange={e => setForm(f => ({ ...f, DeviceName: e.target.value }))} placeholder="e.g. Bay 3 wall tablet" />
                    </div>
                </div>
                <button type="button" style={S.btn} onClick={register} disabled={busy || !form.BayID}>
                    {busy ? <Loader2 size={20} className="animate-spin" /> : 'Register this device'}
                </button>
            </div>

            <div style={S.card}>
                <h2 style={S.h2}>Registered screens</h2>
                {devices === null && <Loader2 className="animate-spin" />}
                {devices && !devices.length && <div style={{ color: T.muted }}>No bay screens registered yet.</div>}
                {devices?.map(d => (
                    <div key={d.DeviceID} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: `1px solid ${T.line}`, flexWrap: 'wrap' }}>
                        <div style={{ flex: 1, minWidth: 220 }}>
                            <div style={{ fontSize: 17, fontWeight: 600 }}>{d.DeviceName} <span style={{ color: T.muted, fontWeight: 400 }}>· {d.BayName}</span></div>
                            <div style={{ fontSize: 14, color: T.muted }}>
                                Registered {fmtDateTime(d.RegisteredAt)}{d.RegisteredByName ? ` by ${d.RegisteredByName}` : ''}
                                {' · '}{d.LastSeenAt ? `last seen ${fmtDateTime(d.LastSeenAt)}` : 'not seen yet'}
                            </div>
                        </div>
                        {d.RevokedAt
                            ? <span style={{ color: T.muted, fontSize: 14 }}>Unregistered {fmtDateTime(d.RevokedAt)}</span>
                            : <button type="button" style={{ ...S.btnGhost, color: T.bad, minHeight: 44 }} onClick={() => revoke(d)}>Unregister</button>}
                    </div>
                ))}
            </div>
        </div>
    );
}
