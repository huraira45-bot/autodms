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
import { Loader2, Play, Square, Undo2, Wifi, WifiOff, MonitorSmartphone, CheckCircle2, Clock, User } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFeedback } from '../../context/FeedbackContext';
import { isNativeApp, getServerUrl } from '../../tablet/serverConfig';
import { useServiceEvents } from '../../tablet/useServiceEvents';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { API, errText, fmtDateTime } from '../../tablet/estimateFormat';

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
const D = {
    bg: '#0b1220', card: '#16213a', line: '#26324d', text: '#f8fafc', muted: '#94a3b8',
    start: '#16a34a', finish: '#2563eb', done: '#22c55e', warn: '#f59e0b', bad: '#ef4444',
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
        ? { icon: <WifiOff size={20} />, text: 'Offline — retrying', color: D.bad }
        : live
            ? { icon: <Wifi size={20} />, text: 'Live', color: D.done }
            : { icon: <Wifi size={20} />, text: 'Updates every 15 s', color: D.warn };

    const cards = data?.jobCards || [];

    return (
        <div style={{ minHeight: '100vh', background: D.bg, color: D.text, fontFamily: S.page.fontFamily }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 20, padding: '14px 24px', borderBottom: `1px solid ${D.line}`, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 34, fontWeight: 800, letterSpacing: 0.5 }}>{data?.bay?.BayName || device.bayName}</div>
                <div style={{ color: D.muted, fontSize: 17 }}>{cards.length} job card{cards.length === 1 ? '' : 's'}</div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 18 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: status.color, fontSize: 16 }}>{status.icon} {status.text}</span>
                    {data?.server && (
                        <span style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: 28, fontWeight: 700 }}>{data.server.TimeText}</div>
                            <div style={{ fontSize: 14, color: D.muted }}>{data.server.DateText}</div>
                        </span>
                    )}
                </div>
            </div>

            {message && (
                <div style={{ margin: '14px 24px 0', padding: '14px 18px', borderRadius: 10, background: '#3b1d1d', color: '#fecaca', fontSize: 18 }}>
                    {message}
                </div>
            )}

            {!data && <div style={{ display: 'grid', placeItems: 'center', minHeight: 300 }}><Loader2 size={36} className="animate-spin" /></div>}

            {data && !cards.length && (
                <div style={{ textAlign: 'center', padding: '80px 24px', color: D.muted }}>
                    <CheckCircle2 size={56} />
                    <div style={{ fontSize: 26, marginTop: 12 }}>No jobs on this bay right now</div>
                </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(440px, 1fr))', gap: 18, padding: 24 }}>
                {cards.map(card => (
                    <div key={card.JobCardId} style={{ background: D.card, borderRadius: 14, padding: 20, border: `1px solid ${D.line}` }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
                            <span style={{ fontSize: 34, fontWeight: 800 }}>{card.VehicleRegNo || '—'}</span>
                            <span style={{ fontSize: 17, color: D.muted }}>{card.JobCardNo}</span>
                        </div>
                        <div style={{ fontSize: 18, color: '#cbd5e1', marginTop: 2 }}>
                            {[card.VehicleModel, card.CustomerName].filter(Boolean).join(' · ')}
                        </div>
                        <div style={{ fontSize: 15, color: D.muted, marginTop: 4, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {card.ServiceAdvisor && <span><User size={14} style={{ verticalAlign: -2 }} /> {card.ServiceAdvisor}</span>}
                            {card.PromisedText && <span><Clock size={14} style={{ verticalAlign: -2 }} /> Promised {card.PromisedText}</span>}
                        </div>

                        {card.Lines.map(line => (
                            <div key={line.DetailId} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0 4px', marginTop: 10, borderTop: `1px solid ${D.line}` }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{ fontSize: 21, fontWeight: 600, color: line.State === 'done' ? D.muted : D.text }}>{line.Job}</div>
                                    <div style={{ fontSize: 15, color: D.muted, marginTop: 2 }}>
                                        {line.State === 'waiting' && 'Not started'}
                                        {line.State === 'working' && <span style={{ color: '#93c5fd' }}>Started {line.StartText} · {line.Minutes} min</span>}
                                        {line.State === 'done' && <span style={{ color: D.done }}>Done {line.EndText} · {line.Minutes} min</span>}
                                        {line.PerformedByName ? ` · ${line.PerformedByName}` : ''}
                                    </div>
                                </div>
                                {line.CanUndo && (
                                    <button type="button" onClick={() => act(line, 'undo')} disabled={busyLine === line.DetailId}
                                            style={{ background: 'transparent', color: D.muted, border: `1px solid ${D.line}`, borderRadius: 10, minHeight: 52, padding: '0 14px', fontSize: 16, display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                                        <Undo2 size={18} /> Undo
                                    </button>
                                )}
                                {line.State === 'waiting' && (
                                    <button type="button" onClick={() => act(line, 'start')} disabled={busyLine === line.DetailId}
                                            style={{ background: D.start, color: '#fff', border: 'none', borderRadius: 12, minHeight: 68, minWidth: 150, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
                                        {busyLine === line.DetailId ? <Loader2 className="animate-spin" /> : <><Play size={24} /> Start</>}
                                    </button>
                                )}
                                {line.State === 'working' && (
                                    <button type="button" onClick={() => act(line, 'finish')} disabled={busyLine === line.DetailId}
                                            style={{ background: D.finish, color: '#fff', border: 'none', borderRadius: 12, minHeight: 68, minWidth: 150, fontSize: 22, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer' }}>
                                        {busyLine === line.DetailId ? <Loader2 className="animate-spin" /> : <><Square size={22} /> Finish</>}
                                    </button>
                                )}
                                {line.State === 'done' && <CheckCircle2 size={40} color={D.done} />}
                            </div>
                        ))}
                    </div>
                ))}
            </div>

            <div style={{ padding: '0 24px 18px', color: '#475569', fontSize: 13 }}>{data?.device || device.deviceName}</div>
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
