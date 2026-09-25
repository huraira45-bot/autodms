/**
 * Tablet tests — Phase 0 of the service tablet app (plan 2026-09-14).
 *
 * Three things must work on the real tablet, on the real Wi-Fi, before any
 * intake screen is built on top of them:
 *   1. Reaching the server
 *   2. Uploading a walk-around video (size, speed, and that it arrives whole)
 *   3. Printing — inside the app, and by opening a page in Chrome
 * Nothing here stores data: the test video is deleted by the server on arrival.
 */
import React, { useState } from 'react';
import axios from 'axios';
import { Wifi, Video, Printer, Loader2, ExternalLink, Info,
         Smartphone, CheckCircle2, AlertTriangle } from 'lucide-react';
import { isNativeApp, getServerUrl, serverPageUrl, openOutsideApp } from '../../tablet/serverConfig';
import { T, tStyles as S } from '../../tablet/tabletStyles';
import { canPromptInstall } from '../../tablet/installPrompt';

const mb = (bytes) => (bytes / 1048576).toFixed(1) + ' MB';

export default function TabletDiagnostics() {
    const native = isNativeApp();

    // ---- 1. Connection ----
    const [conn, setConn] = useState(null);
    const [connBusy, setConnBusy] = useState(false);

    const testConnection = async () => {
        setConnBusy(true);
        const t0 = performance.now();
        try {
            const r = await axios.get('/api/service-intake/ping', { timeout: 8000 });
            if (r.data?.app !== 'DealerDesk') {
                throw new Error('Something answered, but it is not the DealerDesk server.');
            }
            setConn({ tone: 'ok', ms: Math.round(performance.now() - t0), serverTime: r.data.serverTime });
        } catch (err) {
            setConn({ tone: 'bad', error: err.response?.data?.error || err.message });
        } finally {
            setConnBusy(false);
        }
    };

    // ---- 2. Video upload ----
    const [file, setFile] = useState(null);
    const [up, setUp] = useState(null);

    const uploadVideo = async () => {
        if (!file) return;
        const fd = new FormData();
        fd.append('video', file, file.name || 'walkaround.mp4');
        const t0 = performance.now();
        setUp({ busy: true, pct: 0 });
        try {
            const r = await axios.post('/api/service-intake/diagnostics/upload', fd, {
                timeout: 0,   // a large video over Wi-Fi can legitimately take minutes
                onUploadProgress: (e) => {
                    if (e.total) setUp(u => ({ ...u, pct: Math.round((e.loaded * 100) / e.total) }));
                },
            });
            const seconds = (performance.now() - t0) / 1000;
            const mbPerSec = (file.size / 1048576) / Math.max(seconds, 0.001);
            setUp({
                busy: false, pct: 100, seconds, mbPerSec,
                intact: Number(r.data?.bytes) === file.size,
                serverBytes: Number(r.data?.bytes),
            });
        } catch (err) {
            setUp({ busy: false, pct: 0, error: err.response?.data?.error || err.message });
        }
    };

    // ---- 3. Printing ----
    const [printTried, setPrintTried] = useState({ inApp: false, chrome: false });

    const printInsideApp = () => {
        try { window.print(); } catch { /* reported by what the tester sees */ }
        setPrintTried(p => ({ ...p, inApp: true }));
    };
    const printInChrome = () => {
        openOutsideApp(serverPageUrl('/tablet-print-test.html'));
        setPrintTried(p => ({ ...p, chrome: true }));
    };

    // Time a 100 MB walk-around video would take at the measured speed.
    const secsFor100 = up?.mbPerSec ? 100 / up.mbPerSec : null;

    return (
        <div style={S.body}>
            <div style={S.card}>
                <h1 style={S.h1}>Tablet tests</h1>
                <p style={S.p}>
                    Run all three at the <strong>reception area</strong>, where advisors will actually stand
                    with the tablet — Wi-Fi is often weaker there than in the office. When finished, take a
                    screenshot of this page and send it.
                </p>
                <div style={{ fontSize: 14, color: T.muted, display: 'grid', gap: 4 }}>
                    <span><Info size={14} style={{ verticalAlign: -2 }} /> Running as: <strong>{native ? 'Android app' : 'web browser'}</strong></span>
                    <span>Server: <strong>{native ? getServerUrl() : window.location.origin}</strong></span>
                    <span>Screen: <strong>{window.innerWidth} × {window.innerHeight}</strong></span>
                </div>
            </div>

            {/* 1. Connection */}
            <div style={S.card}>
                <h2 style={S.h2}><Wifi size={20} /> 1. Reach the server</h2>
                <p style={S.p}>Confirms the tablet can talk to DealerDesk, and how fast it answers.</p>
                <button style={S.btn} onClick={testConnection} disabled={connBusy}>
                    {connBusy ? <Loader2 size={20} className="animate-spin" /> : 'Test connection'}
                </button>
                {conn && (
                    <div style={S.result(conn.tone === 'ok' ? (conn.ms > 1500 ? 'warn' : 'ok') : 'bad')}>
                        {conn.tone === 'ok'
                            ? <>PASS — answered in <strong>{conn.ms} ms</strong>.
                                {conn.ms > 1500 && ' That is slow; screens will feel sluggish at this spot.'}</>
                            : <>FAIL — {conn.error}</>}
                    </div>
                )}
            </div>

            {/* 2. Video upload */}
            <div style={S.card}>
                <h2 style={S.h2}><Video size={20} /> 2. Upload a walk-around video</h2>
                <p style={S.p}>
                    Record a real walk-around of a car — about <strong>2 minutes</strong>, the length advisors
                    will actually shoot. The server measures it and deletes it straight away; nothing is kept.
                </p>
                <label style={{ ...S.btnGhost, cursor: 'pointer', marginBottom: 12 }}>
                    <Video size={20} /> {file ? 'Record / choose again' : 'Record video'}
                    <input type="file" accept="video/*" capture="environment" style={{ display: 'none' }}
                           onChange={e => { setFile(e.target.files?.[0] || null); setUp(null); }} />
                </label>

                {file && (
                    <div style={{ fontSize: 15, marginBottom: 12 }}>
                        Selected: <strong>{mb(file.size)}</strong> · {file.type || 'unknown type'}
                    </div>
                )}

                <button style={S.btn} onClick={uploadVideo} disabled={!file || up?.busy}>
                    {up?.busy ? <><Loader2 size={20} className="animate-spin" /> Uploading {up.pct}%</> : 'Upload test video'}
                </button>

                {up?.busy && (
                    <div style={{ marginTop: 12, height: 14, background: T.line, borderRadius: 7, overflow: 'hidden' }}>
                        <div style={{ width: `${up.pct}%`, height: '100%', background: T.brand, transition: 'width 0.2s' }} />
                    </div>
                )}

                {up && !up.busy && up.error && (
                    <div style={S.result('bad')}>FAIL — {up.error}</div>
                )}
                {up && !up.busy && !up.error && (
                    <div style={S.result(!up.intact ? 'bad' : secsFor100 > 180 ? 'warn' : 'ok')}>
                        {!up.intact
                            ? <>FAIL — sent {mb(file.size)} but the server received {mb(up.serverBytes)}. The upload was cut short.</>
                            : <>
                                PASS — {mb(file.size)} arrived complete in <strong>{up.seconds.toFixed(1)} s</strong>
                                {' '}(<strong>{up.mbPerSec.toFixed(1)} MB/s</strong>).
                                <br />At this speed a 100 MB video takes about <strong>{Math.ceil(secsFor100)} s</strong>.
                                {secsFor100 > 180 && ' That is too slow for an advisor to wait at the car — the Wi-Fi at this spot needs improving.'}
                              </>}
                    </div>
                )}
            </div>

            {/* 3. Printing */}
            <div style={S.card}>
                <h2 style={S.h2}><Printer size={20} /> 3. Print</h2>
                <p style={S.p}>
                    Estimates and job cards will be printed from the tablet. Try both ways and note which one
                    produces a correct A4 page on the workshop printer.
                </p>
                <div style={S.row}>
                    <button style={S.btnGhost} onClick={printInsideApp}>
                        <Printer size={20} /> A. Print inside the app
                    </button>
                    <button style={S.btnGhost} onClick={printInChrome}>
                        <ExternalLink size={20} /> B. Open test page in Chrome
                    </button>
                </div>
                {(printTried.inApp || printTried.chrome) && (
                    <div style={S.result('warn')}>
                        {printTried.inApp && <>A: if no print dialog appeared, printing inside the app is not supported on this tablet. </>}
                        {printTried.chrome && <>B: the test page should open and show the print dialog. It passes if the printed
                            sheet has the table and both signature lines on one A4 page.</>}
                    </div>
                )}
            </div>

            <InstallReadiness />
        </div>
    );
}

/**
 * Why Chrome will or will not install this as an app.
 *
 * Owner report 2026-09-25: the tablet's menu said "This app cannot be
 * installed" with no reason given. Chrome does not tell you which of its
 * conditions failed, and the address bar is not always in shot, so the device
 * reports on itself instead of the answer being guessed at from here.
 *
 * Chrome's conditions, in the order they usually fail:
 *   1. a secure origin — https, or localhost. Plain http can never install.
 *   2. a service worker with a fetch handler. Browsers refuse to register one
 *      on an insecure origin, so a failure at 1 always fails this too.
 *   3. a manifest with a name, a 192px and a 512px icon, a start_url and a
 *      standalone display.
 */
function InstallReadiness() {
    const [checks, setChecks] = useState(null);
    const [busy, setBusy] = useState(false);

    const run = async () => {
        setBusy(true);
        const out = [];
        const secure = window.isSecureContext;
        out.push({
            ok: secure,
            label: 'Secure address (https)',
            detail: secure
                ? window.location.origin
                : `${window.location.origin} — Chrome will not install over plain http. `
                  + 'Open the https address instead.',
        });

        // A service worker cannot even be asked for on an insecure origin.
        let swOk = false, swDetail = 'Service workers are not supported by this browser.';
        if ('serviceWorker' in navigator) {
            if (!secure) {
                swDetail = 'Not registered — the address is not secure, so the browser refuses to register one.';
            } else {
                try {
                    const reg = await navigator.serviceWorker.getRegistration('/tablet');
                    swOk = !!reg;
                    swDetail = reg ? `Registered for ${reg.scope}` : 'Not registered yet — reload this page once and try again.';
                } catch (e) { swDetail = e.message; }
            }
        }
        out.push({ ok: swOk, label: 'Service worker', detail: swDetail });

        // The manifest, fetched and checked the way Chrome checks it.
        try {
            const r = await fetch('/manifest.webmanifest', { cache: 'no-store' });
            const m = await r.json();
            const has192 = (m.icons || []).some(i => i.sizes === '192x192');
            const has512 = (m.icons || []).some(i => i.sizes === '512x512');
            const display = ['standalone', 'fullscreen', 'minimal-ui'].includes(m.display);
            const ok = !!(m.name || m.short_name) && !!m.start_url && has192 && has512 && display;
            out.push({
                ok,
                label: 'App manifest',
                detail: ok
                    ? `${m.name} · ${m.display} · start ${m.start_url}`
                    : 'Missing a name, an icon size, start_url or a standalone display.',
            });
        } catch (e) {
            out.push({ ok: false, label: 'App manifest', detail: `Could not read it: ${e.message}` });
        }

        out.push({
            ok: canPromptInstall(),
            label: 'Chrome has offered to install',
            detail: canPromptInstall()
                ? 'Ready — the Add button on the tablet screens will install it.'
                : 'Not yet. Chrome offers this only once everything above passes, and '
                  + 'sometimes only after the page has been used for a few seconds.',
        });

        setChecks(out);
        setBusy(false);
    };

    return (
        <div style={S.card}>
            <h2 style={S.h2}><Smartphone size={20} /> 4. Install as an app</h2>
            <p style={S.p}>
                If Chrome's menu says <strong>“This app cannot be installed”</strong>, run this. It checks the
                same things Chrome does and says which one is failing.
            </p>
            <button style={S.btn} onClick={run} disabled={busy}>
                {busy ? <Loader2 size={20} className="animate-spin" /> : 'Check'}
            </button>

            {checks && (
                <div style={{ marginTop: 14, display: 'grid', gap: 8 }}>
                    {checks.map((c, i) => (
                        <div key={i} style={{
                            display: 'flex', gap: 10, alignItems: 'flex-start', padding: '10px 12px',
                            borderRadius: 8, border: `1px solid ${c.ok ? '#bbf7d0' : '#fde68a'}`,
                            background: c.ok ? T.okBg : T.warnBg,
                        }}>
                            {c.ok ? <CheckCircle2 size={18} color={T.ok} style={{ flex: '0 0 auto', marginTop: 2 }} />
                                  : <AlertTriangle size={18} color={T.warn} style={{ flex: '0 0 auto', marginTop: 2 }} />}
                            <div style={{ minWidth: 0 }}>
                                <div style={{ fontWeight: 600, fontSize: 15 }}>{c.label}</div>
                                <div style={{ fontSize: 14, color: T.muted, wordBreak: 'break-word' }}>{c.detail}</div>
                            </div>
                        </div>
                    ))}
                    {checks.some(c => !c.ok) && (
                        <div style={{ fontSize: 14, color: T.muted, marginTop: 2 }}>
                            Fix the first one that is not green — the ones under it usually depend on it.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
