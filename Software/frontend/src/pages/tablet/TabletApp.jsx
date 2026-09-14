/**
 * DealerDesk Service — tablet app shell (plan 2026-09-14, Phase 0).
 *
 * Everything under /tablet renders here instead of the desktop ERP shell:
 * touch-sized controls, no sidebar. Inside the Android app this is the only
 * part of DealerDesk shown.
 *
 * Phase 0 proves three things on the real tablet before anything is built on
 * top of them: that it reaches the server, that a walk-around video uploads
 * over the workshop Wi-Fi, and that it can print.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useNavigate, Link } from 'react-router-dom';
import { LogOut, Settings, Stethoscope, Server, Loader2, ShieldAlert, Wrench } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isNativeApp, getServerUrl, setServerUrl, normalizeServerUrl } from '../../tablet/serverConfig';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import TabletDiagnostics from './TabletDiagnostics';

export default function TabletApp() {
    const { user, loading, logout, hasPermission } = useAuth();
    const native = isNativeApp();
    const [serverUrl, setServerUrlState] = useState(getServerUrl());

    // Inside the app nothing can work until it knows where the server is.
    if (native && !serverUrl) {
        return <ServerSettings firstRun onSaved={setServerUrlState} />;
    }
    if (loading) {
        return <div style={{ ...S.page, display: 'grid', placeItems: 'center' }}><Loader2 className="animate-spin" /></div>;
    }
    if (!user) {
        return (
            <Routes>
                <Route path="/tablet/settings" element={<ServerSettings onSaved={setServerUrlState} />} />
                <Route path="*" element={<TabletLogin serverUrl={serverUrl} />} />
            </Routes>
        );
    }
    if (!hasPermission('workshop_tablet')) {
        return <NoAccess user={user} onSignOut={logout} />;
    }

    return (
        <div style={S.page}>
            <div style={S.bar}>
                <Link to="/tablet" style={{ color: '#fff', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <Wrench size={22} />
                    <span style={S.barTitle}>DealerDesk Service</span>
                </Link>
                <span style={{ marginLeft: 'auto', fontSize: 15, opacity: 0.9 }}>{user.userName}</span>
                <Link to="/tablet/settings" title="Server settings" style={{ color: '#fff', display: 'flex', padding: 10 }}>
                    <Settings size={22} />
                </Link>
                <button onClick={logout} title="Sign out"
                        style={{ background: 'transparent', border: 'none', color: '#fff', padding: 10, cursor: 'pointer', display: 'flex' }}>
                    <LogOut size={22} />
                </button>
            </div>
            <Routes>
                <Route path="/tablet" element={<TabletHome user={user} />} />
                <Route path="/tablet/diagnostics" element={<TabletDiagnostics />} />
                <Route path="/tablet/settings" element={<ServerSettings onSaved={setServerUrlState} />} />
                <Route path="*" element={<Navigate to="/tablet" replace />} />
            </Routes>
        </div>
    );
}

function TabletHome({ user }) {
    return (
        <div style={S.body}>
            <div style={S.card}>
                <h1 style={S.h1}>Hello, {user.userName}</h1>
                <p style={S.p}>
                    This is the first build of the service tablet app. Before the intake, estimate,
                    signature and bay screens are added, it has to pass three tests on this tablet:
                    reaching the server, uploading a walk-around video over the workshop Wi-Fi, and printing.
                </p>
                <Link to="/tablet/diagnostics" style={{ ...S.btn, textDecoration: 'none', width: '100%', boxSizing: 'border-box' }}>
                    <Stethoscope size={20} /> Run the tablet tests
                </Link>
            </div>
        </div>
    );
}

function TabletLogin({ serverUrl }) {
    const { login } = useAuth();
    const native = isNativeApp();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await login(username.trim(), password);
        } catch (err) {
            setError(err.response?.data?.error
                || (err.response ? 'Sign-in failed.' : 'Could not reach the server. Check the Wi-Fi and the server address.'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ ...S.page, display: 'grid', placeItems: 'center', padding: 20 }}>
            <form onSubmit={submit} style={{ ...S.card, width: '100%', maxWidth: 460 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 10, background: T.brand, display: 'grid', placeItems: 'center' }}>
                        <Wrench size={22} color="#fff" />
                    </div>
                    <div>
                        <div style={{ fontSize: 21, fontWeight: 700 }}>DealerDesk Service</div>
                        <div style={{ fontSize: 14, color: T.muted }}>Sign in with your DealerDesk account</div>
                    </div>
                </div>

                {error && <div style={{ ...S.result('bad'), marginTop: 0, marginBottom: 14 }}>{error}</div>}

                <label style={S.label}>Username</label>
                <input style={{ ...S.input, marginBottom: 14 }} value={username} autoCapitalize="none" autoCorrect="off"
                       onChange={e => setUsername(e.target.value)} autoComplete="username" required />
                <label style={S.label}>Password</label>
                <input style={{ ...S.input, marginBottom: 18 }} type="password" value={password}
                       onChange={e => setPassword(e.target.value)} autoComplete="current-password" required />

                <button type="submit" style={{ ...S.btn, width: '100%' }} disabled={busy}>
                    {busy ? <Loader2 size={20} className="animate-spin" /> : 'Sign in'}
                </button>

                {native && (
                    <div style={{ marginTop: 16, fontSize: 14, color: T.muted, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <Server size={15} /> {serverUrl || 'No server set'} ·
                        <Link to="/tablet/settings" style={{ color: T.brand, fontWeight: 600 }}>change</Link>
                    </div>
                )}
            </form>
        </div>
    );
}

function ServerSettings({ firstRun = false, onSaved }) {
    const native = isNativeApp();
    const navigate = useNavigate();
    const [value, setValue] = useState(getServerUrl() || 'http://192.168.3.10:5000');
    const [state, setState] = useState(null);   // { tone, text }
    const [busy, setBusy] = useState(false);

    const testAndSave = async () => {
        const url = normalizeServerUrl(value);
        if (!url) { setState({ tone: 'bad', text: 'Enter the server address.' }); return; }
        setBusy(true);
        setState(null);
        const t0 = performance.now();
        try {
            // Absolute URL on purpose: this has to reach the address being
            // tested, not whatever the app is currently pointed at.
            const r = await axios.get(`${url}/api/service-intake/ping`, { timeout: 8000 });
            if (r.data?.app !== 'DealerDesk') {
                throw new Error('Something answered at that address, but it is not the DealerDesk server.');
            }
            const ms = Math.round(performance.now() - t0);
            setServerUrl(url);
            if (native) axios.defaults.baseURL = url;
            setState({ tone: 'ok', text: `Connected in ${ms} ms. Saved.` });
            onSaved?.(url);
            setTimeout(() => navigate('/tablet'), 600);
        } catch (err) {
            setState({
                tone: 'bad',
                text: err.response
                    ? `The server answered with an error (${err.response.status}).`
                    : `Could not reach ${url}. Check the tablet is on the workshop Wi-Fi and the address is right. (${err.message})`,
            });
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ ...S.page, padding: 20 }}>
            <div style={{ ...S.card, maxWidth: 560, margin: '40px auto 0' }}>
                <h1 style={{ ...S.h1, display: 'flex', alignItems: 'center', gap: 8 }}><Server size={24} /> Server address</h1>
                <p style={S.p}>
                    {firstRun
                        ? 'Enter the address of the DealerDesk server once. The tablet must be on the workshop Wi-Fi.'
                        : native
                            ? 'The address this tablet uses to reach DealerDesk.'
                            : 'In a web browser the server is simply this page\'s own address — this setting only matters inside the Android app. You can still test it here.'}
                </p>
                <label style={S.label}>Address</label>
                <input style={{ ...S.input, marginBottom: 14 }} value={value} inputMode="url" autoCapitalize="none"
                       autoCorrect="off" onChange={e => setValue(e.target.value)} placeholder="http://192.168.3.10:5000" />
                <div style={S.row}>
                    <button style={S.btn} onClick={testAndSave} disabled={busy}>
                        {busy ? <Loader2 size={20} className="animate-spin" /> : 'Test and save'}
                    </button>
                    {!firstRun && <Link to="/tablet" style={{ ...S.btnGhost, textDecoration: 'none' }}>Back</Link>}
                </div>
                {state && <div style={S.result(state.tone)}>{state.text}</div>}
            </div>
        </div>
    );
}

function NoAccess({ user, onSignOut }) {
    return (
        <div style={{ ...S.page, display: 'grid', placeItems: 'center', padding: 20 }}>
            <div style={{ ...S.card, maxWidth: 480, textAlign: 'center' }}>
                <ShieldAlert size={40} color={T.warn} />
                <h1 style={{ ...S.h1, marginTop: 10 }}>No access to the tablet app</h1>
                <p style={S.p}>
                    {user.userName} is signed in, but this account's role does not include
                    <strong> Service Tablet App</strong>. An administrator can tick it in Role Permissions.
                </p>
                <button style={S.btn} onClick={onSignOut}><LogOut size={20} /> Sign out</button>
            </div>
        </div>
    );
}
