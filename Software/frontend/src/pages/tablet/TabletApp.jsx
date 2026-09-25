/**
 * DealerDesk Service — tablet app shell (plan 2026-09-14).
 *
 * Everything under /tablet renders here instead of the desktop ERP shell:
 * touch-sized controls, no sidebar. Inside the Android app this is the only
 * part of DealerDesk shown.
 *
 * Phase 0: server address, sign-in, and the Tablet tests (reach the server,
 *          upload a walk-around video, print).
 * Phase 1: intake at the vehicle and the estimate — video, customer and
 *          vehicle, jobs and parts, estimate print.
 * Phase 2: the customer's signature opens the job card.
 * Phase 3: bay screens (/tablet/bay); the parts counter is a desk screen.
 * Phase 4: job cards — progress, additional work, finalize, final print.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Routes, Route, Navigate, useNavigate, useLocation, Link } from 'react-router-dom';
import { LogOut, Settings, Stethoscope, Server, Loader2, ShieldAlert, Wrench, ClipboardList, ClipboardCheck, Video, MonitorSmartphone, Smartphone } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { isNativeApp, getServerUrl, setServerUrl, normalizeServerUrl } from '../../tablet/serverConfig';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import TabletDiagnostics from './TabletDiagnostics';
import TabletEstimates, { NewIntakeButton } from './TabletEstimates';
import TabletEstimateEditor from './TabletEstimateEditor';
import TabletEstimatePrint from './TabletEstimatePrint';
import QCChecksheetPrint from '../QCChecksheetPrint';
import TabletEstimateSign from './TabletEstimateSign';
import BayScreen, { hasBayDevice } from './BayScreen';
import TabletJobCards from './TabletJobCards';
import TabletJobCard, { TabletJobCardPrint } from './TabletJobCard';
import AddToHomeScreen, { resetHomeScreenHint, homeScreenHintApplies } from '../../tablet/AddToHomeScreen';

const PRINT_ROUTE = /^\/tablet\/(estimates|job-cards|qc)\/\d+\/print\/?$/;

export default function TabletApp() {
    const { user, loading, logout, hasPermission } = useAuth();
    const location = useLocation();
    const native = isNativeApp();
    const [serverUrl, setServerUrlState] = useState(getServerUrl());

    // Inside the app nothing can work until it knows where the server is.
    if (native && !serverUrl) {
        return <ServerSettings firstRun onSaved={setServerUrlState} />;
    }
    // A registered bay screen runs on its device token, with nobody signed in.
    if (location.pathname === '/tablet/bay' && hasBayDevice()) {
        return <BayScreen />;
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
    const bayScreenSetup = location.pathname === '/tablet/bay' && hasPermission('workshop_bay_screen');
    if (!hasPermission('workshop_tablet') && !bayScreenSetup) {
        return <NoAccess user={user} onSignOut={logout} />;
    }

    // Print pages fill the screen with the A4 sheet — no app bar.
    if (PRINT_ROUTE.test(location.pathname)) {
        return (
            <Routes>
                <Route path="/tablet/estimates/:id/print" element={<TabletEstimatePrint />} />
                <Route path="/tablet/job-cards/:id/print" element={<TabletJobCardPrint />} />
                {/* The delivery checksheet, printed from the tablet. Same page
                    as the desk uses, reading through the tablet's own API. */}
                <Route path="/tablet/qc/:inspectionId/print"
                       element={<QCChecksheetPrint apiBase="/api/service-intake" />} />
            </Routes>
        );
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
                <Route path="/tablet/estimates" element={<TabletEstimates />} />
                <Route path="/tablet/estimates/:id" element={<TabletEstimateEditor />} />
                <Route path="/tablet/estimates/:id/sign" element={<TabletEstimateSign />} />
                <Route path="/tablet/job-cards" element={<TabletJobCards />} />
                <Route path="/tablet/job-cards/:id" element={<TabletJobCard />} />
                <Route path="/tablet/diagnostics" element={<TabletDiagnostics />} />
                <Route path="/tablet/bay" element={<BayScreen />} />
                <Route path="/tablet/settings" element={<ServerSettings onSaved={setServerUrlState} />} />
                <Route path="*" element={<Navigate to="/tablet" replace />} />
            </Routes>
        </div>
    );
}

const tile = {
    ...S.card, marginBottom: 0, minHeight: 170, width: '100%', boxSizing: 'border-box', cursor: 'pointer',
    display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', gap: 8,
    textAlign: 'left', textDecoration: 'none', color: T.ink, font: 'inherit',
};
const tileTitle = { fontSize: 21, fontWeight: 700 };
const tileSub = { fontSize: 15, color: T.muted, fontWeight: 400 };

function TabletHome({ user }) {
    const { hasPermission } = useAuth();
    const canSetUpBays = hasPermission('workshop_bay_screen');
    return (
        <div style={S.body}>
            <AddToHomeScreen />
            <h1 style={{ ...S.h1, margin: '4px 0 16px' }}>Hello, {user.userName}</h1>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
                <NewIntakeButton style={{ ...tile, background: T.brand, borderColor: T.brand, color: '#fff' }}>
                    <Video size={34} />
                    <span style={tileTitle}>New intake</span>
                    <span style={{ ...tileSub, color: 'rgba(255,255,255,0.85)' }}>Video, customer, jobs and parts, estimate</span>
                </NewIntakeButton>
                <Link to="/tablet/estimates" style={tile}>
                    <ClipboardList size={34} color={T.brand} />
                    <span style={tileTitle}>Estimates</span>
                    <span style={tileSub}>Continue, print or cancel an estimate</span>
                </Link>
                <Link to="/tablet/job-cards" style={tile}>
                    <ClipboardCheck size={34} color={T.brand} />
                    <span style={tileTitle}>Job cards</span>
                    <span style={tileSub}>Jobs and parts progress, add work, finalize, print</span>
                </Link>
                {canSetUpBays && (
                    <Link to="/tablet/bay" style={tile}>
                        <MonitorSmartphone size={34} color={T.brand} />
                        <span style={tileTitle}>Bay screens</span>
                        <span style={tileSub}>Make this device a bay screen, or unregister one</span>
                    </Link>
                )}
                <Link to="/tablet/diagnostics" style={tile}>
                    <Stethoscope size={34} color={T.brand} />
                    <span style={tileTitle}>Tablet tests</span>
                    <span style={tileSub}>Wi-Fi, video upload speed, printing</span>
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
        <div style={{ ...S.page, display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center', padding: 20 }}>
            <AddToHomeScreen style={{ width: '100%', maxWidth: 460 }} />
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

                {!firstRun && homeScreenHintApplies() && (
                    <>
                        <hr style={{ border: 0, borderTop: `1px solid ${T.line}`, margin: '20px 0 16px' }} />
                        <label style={S.label}>Home screen</label>
                        <p style={S.p}>Put a DealerDesk icon on this tablet so the advisor opens service
                            reception with one tap instead of typing the address.</p>
                        <button style={S.btnGhost}
                                onClick={() => { resetHomeScreenHint(); navigate('/tablet'); }}>
                            <Smartphone size={20} /> Show me how
                        </button>
                    </>
                )}
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
