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
import { Wifi, Video, Printer, Loader2, ExternalLink, Info } from 'lucide-react';
import { isNativeApp, getServerUrl, serverPageUrl, openOutsideApp } from '../../tablet/serverConfig';
import { T, tStyles as S } from '../../tablet/tabletStyles';

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
        </div>
    );
}
