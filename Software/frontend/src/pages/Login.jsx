/**
 * DealerDesk — sign-in screen (owner ask 2026-07-05).
 *
 * Two-panel desktop-first layout:
 *   Left  → brand + product line + module signals + ERP-motif visual
 *   Right → sign-in form (unchanged auth behavior)
 *
 * Auth logic, AuthContext, JWT storage key (dms_token) and redirect
 * behavior are ALL preserved — only the visual shell changed.
 */
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import {
    LayoutDashboard, Wrench, Package, Car, Wallet, HeartHandshake, FileBarChart,
    ArrowRight, Lock, User,
} from 'lucide-react';
import { isDemoMode } from '../demoMode';

const MODULE_SIGNALS = [
    { label: 'Workshop', icon: Wrench },
    { label: 'Parts',    icon: Package },
    { label: 'Sales',    icon: Car },
    { label: 'Finance',  icon: Wallet },
    { label: 'CRM',      icon: HeartHandshake },
    { label: 'Reports',  icon: FileBarChart },
];

export default function Login() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="dd-login">
            {/* ── LEFT PANEL — brand + module signals + ERP visual ─── */}
            <aside className="dd-brand">
                <div className="dd-brand-top">
                    <div className="dd-mark" aria-hidden="true">
                        <LayoutDashboard size={22} color="#fff" />
                    </div>
                    <div className="dd-wordmark">
                        <div className="name">DealerDesk</div>
                        <div className="tagline">Dealership Management System</div>
                    </div>
                </div>

                <div className="dd-brand-mid">
                    <div className="dd-headline">
                        Run every corner of your dealership from one workspace.
                    </div>
                    <div className="dd-subhead">
                        Workshop, parts, sales, finance, customer relations and reporting — one login, one ledger, one truth.
                    </div>

                    <div className="dd-modules">
                        {MODULE_SIGNALS.map(m => {
                            const Icon = m.icon;
                            return (
                                <div key={m.label} className="dd-module">
                                    <Icon size={13} /> {m.label}
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Faux dashboard vignette — pure CSS, no images */}
                <div className="dd-vignette" aria-hidden="true">
                    <div className="v-card v1">
                        <div className="v-row"><span className="lbl">Open ROs</span><span className="val">32</span></div>
                        <div className="v-row"><span className="lbl">Awaiting Parts</span><span className="val">5</span></div>
                        <div className="v-row"><span className="lbl">Ready for Delivery</span><span className="val">7</span></div>
                    </div>
                    <div className="v-card v2">
                        <div className="v-row"><span className="lbl">Today's Cash</span><span className="val">218,400</span></div>
                        <div className="v-row"><span className="lbl">POS Pending</span><span className="val">42,120</span></div>
                        <div className="v-row"><span className="lbl">Cheques on Hand</span><span className="val">3</span></div>
                    </div>
                    <div className="v-card v3">
                        <div className="v-chartRow">
                            <span className="v-chartBar" style={{ height: '38%' }} />
                            <span className="v-chartBar" style={{ height: '55%' }} />
                            <span className="v-chartBar" style={{ height: '30%' }} />
                            <span className="v-chartBar" style={{ height: '72%' }} />
                            <span className="v-chartBar" style={{ height: '46%' }} />
                            <span className="v-chartBar" style={{ height: '68%' }} />
                            <span className="v-chartBar" style={{ height: '54%' }} />
                        </div>
                        <div className="v-row v-caption"><span className="lbl">7-Day Revenue Trend</span></div>
                    </div>
                </div>

                <div className="dd-brand-bottom">
                    © {new Date().getFullYear()} DealerDesk · Built for dealerships that mean business.
                </div>
            </aside>

            {/* ── RIGHT PANEL — sign-in form ─────────────────────── */}
            <main className="dd-form-wrap">
                <div className="dd-form">
                    <div className="dd-form-head">
                        <div className="dd-mark small" aria-hidden="true">
                            <LayoutDashboard size={16} color="#fff" />
                        </div>
                        <div className="dd-form-title">Sign in to DealerDesk</div>
                        <div className="dd-form-sub">Access your workspace</div>
                    </div>

                    {isDemoMode && (
                        <div className="dd-note">
                            <strong>Demo mode</strong> — no backend is connected.
                            Any username / password will sign you in. Data is mocked and won't be saved.
                        </div>
                    )}

                    {error && <div className="dd-error">{error}</div>}

                    <form onSubmit={handleSubmit} noValidate>
                        <label className="dd-field">
                            <span className="dd-field-label">Username</span>
                            <div className="dd-input-wrap">
                                <User size={14} className="dd-input-icn" />
                                <input
                                    type="text"
                                    value={username}
                                    onChange={e => setUsername(e.target.value)}
                                    autoFocus
                                    autoComplete="username"
                                    required
                                    placeholder="e.g. admin"
                                />
                            </div>
                        </label>

                        <label className="dd-field">
                            <span className="dd-field-label">Password</span>
                            <div className="dd-input-wrap">
                                <Lock size={14} className="dd-input-icn" />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={e => setPassword(e.target.value)}
                                    autoComplete="current-password"
                                    required
                                    placeholder="••••••••"
                                />
                            </div>
                        </label>

                        <button type="submit" className="dd-btn" disabled={loading}>
                            {loading ? 'Signing in…' : (<>Sign in <ArrowRight size={14} /></>)}
                        </button>
                    </form>

                    <div className="dd-form-foot">
                        Trouble signing in? Contact your administrator.
                    </div>
                </div>
            </main>

            <style>{`
                /* ── palette ── */
                :root {
                    --dd-slate-900: #1b1f26;    /* near-black slate */
                    --dd-slate-800: #232833;    /* card body */
                    --dd-slate-700: #2f3542;
                    --dd-slate-500: #64748b;    /* muted meta */
                    --dd-slate-300: #cbd5e1;
                    --dd-slate-100: #f1f5f9;
                    --dd-aubergine: #714b67;    /* signature brand */
                    --dd-aubergine-2: #5c3d54;
                    --dd-steel:      #3b5a72;   /* accent */
                    --dd-steel-soft: #6b849c;
                    --dd-ink:        #0f172a;
                    --dd-border:     #22283288;
                }

                .dd-login {
                    display: grid;
                    grid-template-columns: 1.15fr 1fr;
                    min-height: 100vh;
                    background: var(--dd-slate-100);
                    color: var(--dd-ink);
                    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
                }
                @media (max-width: 1000px) {
                    .dd-login { grid-template-columns: 1fr; }
                    .dd-brand { padding: 24px !important; }
                    .dd-brand-mid .dd-headline { font-size: 20px !important; }
                    .dd-vignette { display: none !important; }
                }

                /* ── LEFT — brand panel ── */
                .dd-brand {
                    position: relative;
                    padding: 40px 44px;
                    background:
                        radial-gradient(1200px 600px at -10% -10%, #2b1f2b 0%, transparent 55%),
                        radial-gradient(900px 500px at 110% 110%, #21313d 0%, transparent 55%),
                        linear-gradient(180deg, var(--dd-slate-900) 0%, #191d24 100%);
                    color: #e6ebf2;
                    display: flex;
                    flex-direction: column;
                    justify-content: space-between;
                    overflow: hidden;
                }
                /* subtle grid backdrop */
                .dd-brand::before {
                    content: '';
                    position: absolute; inset: 0;
                    background-image:
                        linear-gradient(#ffffff08 1px, transparent 1px),
                        linear-gradient(90deg, #ffffff08 1px, transparent 1px);
                    background-size: 32px 32px;
                    pointer-events: none;
                }
                .dd-brand > * { position: relative; z-index: 1; }

                .dd-brand-top {
                    display: flex; align-items: center; gap: 12px;
                }
                .dd-mark {
                    width: 40px; height: 40px;
                    border-radius: 8px;
                    background: linear-gradient(135deg, var(--dd-aubergine) 0%, var(--dd-aubergine-2) 100%);
                    display: flex; align-items: center; justify-content: center;
                    box-shadow:
                        inset 0 1px 0 #ffffff22,
                        0 6px 18px #714b6740;
                }
                .dd-mark.small { width: 28px; height: 28px; border-radius: 6px; }
                .dd-wordmark .name {
                    font-size: 22px;
                    font-weight: 800;
                    letter-spacing: 0.3px;
                    color: #ffffff;
                }
                .dd-wordmark .tagline {
                    font-size: 11px;
                    color: #98a2b3;
                    letter-spacing: 0.8px;
                    text-transform: uppercase;
                    margin-top: 1px;
                }

                .dd-brand-mid { max-width: 520px; margin-top: 8px; }
                .dd-headline {
                    font-size: 26px;
                    line-height: 1.25;
                    font-weight: 700;
                    color: #f5f7fa;
                    letter-spacing: -0.2px;
                }
                .dd-subhead {
                    margin-top: 10px;
                    font-size: 13.5px;
                    line-height: 1.55;
                    color: #b0b8c4;
                    max-width: 480px;
                }

                .dd-modules {
                    margin-top: 20px;
                    display: flex;
                    flex-wrap: wrap;
                    gap: 6px;
                }
                .dd-module {
                    display: inline-flex; align-items: center; gap: 5px;
                    padding: 5px 10px;
                    font-size: 11.5px;
                    color: #d3d9e2;
                    background: #ffffff08;
                    border: 1px solid #ffffff14;
                    border-radius: 999px;
                }

                /* faux ERP dashboard vignette */
                .dd-vignette {
                    margin-top: 32px;
                    display: grid;
                    grid-template-columns: 1fr 1fr 1.15fr;
                    gap: 10px;
                    max-width: 620px;
                }
                .v-card {
                    background: #ffffff08;
                    border: 1px solid #ffffff10;
                    border-radius: 8px;
                    padding: 10px 12px;
                    color: #d3d9e2;
                    backdrop-filter: blur(2px);
                }
                .v-row {
                    display: flex;
                    justify-content: space-between;
                    align-items: baseline;
                    padding: 3px 0;
                    font-size: 11.5px;
                }
                .v-row .lbl { color: #98a2b3; }
                .v-row .val {
                    color: #f5f7fa;
                    font-weight: 700;
                    font-variant-numeric: tabular-nums;
                }
                .v-chartRow {
                    display: flex;
                    align-items: flex-end;
                    gap: 6px;
                    height: 60px;
                    padding: 4px 2px;
                }
                .v-chartBar {
                    flex: 1;
                    background: linear-gradient(180deg, #6b849c 0%, #3b5a72 100%);
                    border-radius: 2px;
                    box-shadow: 0 0 0 1px #ffffff0a;
                }
                .v-caption { border-top: 1px solid #ffffff10; margin-top: 4px; padding-top: 4px; }

                .dd-brand-bottom {
                    font-size: 11px;
                    color: #6b7280;
                    letter-spacing: 0.3px;
                }

                /* ── RIGHT — form panel ── */
                .dd-form-wrap {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 40px 48px;
                    background: #ffffff;
                }
                .dd-form {
                    width: 100%;
                    max-width: 380px;
                }
                .dd-form-head {
                    display: flex;
                    flex-direction: column;
                    align-items: flex-start;
                    gap: 10px;
                    margin-bottom: 22px;
                }
                .dd-form-title {
                    font-size: 22px;
                    font-weight: 700;
                    color: var(--dd-ink);
                    letter-spacing: -0.2px;
                }
                .dd-form-sub {
                    font-size: 13px;
                    color: var(--dd-slate-500);
                }

                .dd-note {
                    background: #f0f4f8;
                    border: 1px solid #dce4ed;
                    color: #334155;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 12px;
                    line-height: 1.45;
                    margin-bottom: 14px;
                }
                .dd-error {
                    background: #fef2f2;
                    border: 1px solid #fecaca;
                    color: #b91c1c;
                    padding: 10px 12px;
                    border-radius: 6px;
                    font-size: 12.5px;
                    margin-bottom: 14px;
                }

                .dd-field { display: block; margin-bottom: 14px; }
                .dd-field-label {
                    display: block;
                    font-size: 12px;
                    font-weight: 600;
                    color: #475569;
                    margin-bottom: 6px;
                    letter-spacing: 0.2px;
                }
                .dd-input-wrap {
                    position: relative;
                    display: flex;
                    align-items: center;
                }
                .dd-input-icn {
                    position: absolute;
                    left: 11px;
                    color: #94a3b8;
                    pointer-events: none;
                }
                .dd-input-wrap input {
                    width: 100%;
                    padding: 9px 12px 9px 32px;
                    border: 1px solid #cbd5e1;
                    border-radius: 6px;
                    font-size: 13.5px;
                    background: #ffffff;
                    color: var(--dd-ink);
                    outline: none;
                    box-sizing: border-box;
                    transition: border-color 0.12s, box-shadow 0.12s;
                }
                .dd-input-wrap input:focus {
                    border-color: var(--dd-aubergine);
                    box-shadow: 0 0 0 3px #714b6725;
                }

                .dd-btn {
                    width: 100%;
                    padding: 10px 12px;
                    background: linear-gradient(180deg, var(--dd-aubergine) 0%, var(--dd-aubergine-2) 100%);
                    color: #ffffff;
                    border: 1px solid #5c3d54;
                    border-radius: 6px;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    margin-top: 6px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                    letter-spacing: 0.2px;
                }
                .dd-btn:hover:not(:disabled) {
                    background: linear-gradient(180deg, #7a5271 0%, #634056 100%);
                }
                .dd-btn:disabled {
                    opacity: 0.65;
                    cursor: not-allowed;
                }

                .dd-form-foot {
                    margin-top: 18px;
                    font-size: 11.5px;
                    color: var(--dd-slate-500);
                    text-align: center;
                }
            `}</style>
        </div>
    );
}
