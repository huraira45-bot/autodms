/**
 * The bay camera, on the bay screen.
 *
 * Owner report 2026-09-26: nothing ever asked for permission to use the
 * camera. Two reasons, and the second is the one that matters for deployment:
 *
 *   1. Nothing in the app had touched the camera at all. This does.
 *   2. getUserMedia only exists in a SECURE CONTEXT. Opened over plain http
 *      on the LAN, navigator.mediaDevices is undefined in Chrome — so no
 *      prompt can appear, however the page asks. The bay screens have to be
 *      on https://<server>:5443, the same certificate the tablets use.
 *
 * This is the capture end only. Nothing is sent anywhere and nothing is
 * recorded — streaming to the customer and keeping the footage are a later
 * job, by the owner's instruction. What it proves is that the camera on this
 * particular Windows all-in-one works, is pointed at the right thing, and has
 * been granted to this origin — all of which has to be true before streaming
 * is worth building.
 *
 * The chosen camera is remembered per screen: these machines have a built-in
 * webcam facing the room as well as whatever is aimed at the bay, and picking
 * the right one every morning would not survive contact with a workshop.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, AlertTriangle, Loader2, RefreshCw, Lock } from 'lucide-react';

const LS_DEVICE = 'dms_bay_camera_device';

const D = {
    card: '#111a2e', cardTop: '#16223c', line: '#24314f',
    text: '#f1f5f9', muted: '#94a3b8', accent: '#22d3ee', warn: '#f59e0b', bad: '#ef4444',
};
const MONO = "ui-monospace, 'Cascadia Mono', 'Segoe UI Mono', Consolas, monospace";

const S = {
    wrap: {
        margin: '0 24px 20px', padding: '14px 18px',
        background: `linear-gradient(180deg, ${D.cardTop}, ${D.card})`,
        border: `1px solid ${D.line}`, borderRadius: 4, color: D.text,
    },
    head: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
    tag: { fontFamily: MONO, fontSize: 13, letterSpacing: 2, color: D.accent },
    btn: {
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        minHeight: 52, padding: '0 18px', border: 'none', borderRadius: 4,
        fontFamily: MONO, fontSize: 15, fontWeight: 700, letterSpacing: 1.5,
        color: '#fff', cursor: 'pointer',
    },
    ghost: {
        display: 'inline-flex', alignItems: 'center', gap: 7,
        minHeight: 52, padding: '0 14px', background: 'transparent', color: D.muted,
        border: `1px solid ${D.line}`, borderRadius: 4, fontFamily: MONO, fontSize: 13,
        letterSpacing: 1, cursor: 'pointer',
    },
    video: { width: '100%', maxWidth: 520, minHeight: 200, borderRadius: 4, background: '#000',
             display: 'block', marginTop: 12, objectFit: 'contain' },
    note: { fontSize: 13, color: D.muted, marginTop: 8, lineHeight: 1.5 },
    problem: {
        marginTop: 10, padding: '11px 14px', borderRadius: 4, fontSize: 14, lineHeight: 1.5,
        background: 'rgba(127,29,29,0.35)', color: '#fecaca',
        border: `1px solid ${D.bad}66`, borderLeft: `4px solid ${D.bad}`,
    },
    select: {
        minHeight: 52, padding: '0 10px', background: '#0b1424', color: D.text,
        border: `1px solid ${D.line}`, borderRadius: 4, fontSize: 14, maxWidth: 280,
    },
};

export default function BayCamera({ bayName }) {
    const videoRef = useRef(null);
    const streamRef = useRef(null);
    const [on, setOn] = useState(false);
    const [busy, setBusy] = useState(false);
    const [problem, setProblem] = useState(null);
    const [devices, setDevices] = useState([]);
    // What the camera is actually delivering. A granted camera that sends a
    // black picture looks identical to a working one, so the panel has to say
    // which it is rather than leave someone staring at a black rectangle.
    const [feed, setFeed] = useState(null);
    const [deviceId, setDeviceId] = useState(() => {
        try { return localStorage.getItem(LS_DEVICE) || ''; } catch { return ''; }
    });

    // Chrome exposes nothing about the camera on an insecure origin — not even
    // the API object — so this is checked before anything is attempted.
    const canAsk = typeof window !== 'undefined'
        && window.isSecureContext
        && !!navigator.mediaDevices?.getUserMedia;

    const stop = useCallback(() => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setFeed(null);
        setOn(false);
    }, []);

    // A camera left running holds the device against every other program on
    // this machine, so it is released when the screen goes away.
    useEffect(() => stop, [stop]);

    // Labels are blank until permission has been given once, so the list is
    // only worth reading after the camera has been turned on.
    const listDevices = useCallback(async () => {
        try {
            const all = await navigator.mediaDevices.enumerateDevices();
            setDevices(all.filter(d => d.kind === 'videoinput'));
        } catch { /* the picker simply does not appear */ }
    }, []);

    const start = useCallback(async (wantedId) => {
        setProblem(null);
        if (!canAsk) {
            setProblem(
                !window.isSecureContext
                    ? `This screen is on ${window.location.origin}. Chrome only allows camera access on a `
                      + 'secure address, so it will never ask for permission here. Open the bay screen on '
                      + 'the https address instead.'
                    : 'This browser does not support camera access.');
            return;
        }
        setBusy(true);
        try {
            const id = wantedId ?? deviceId;
            const stream = await navigator.mediaDevices.getUserMedia({
                video: id ? { deviceId: { exact: id } } : { width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false,   // nobody consented to being recorded talking
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play().catch(() => { /* autoplay guard; muted so it should not fire */ });
            }
            setOn(true);
            await listDevices();

            const track = stream.getVideoTracks()[0];
            const settings = track?.getSettings?.() || {};
            setFeed({
                label: track?.label || 'Camera',
                width: settings.width, height: settings.height,
                frameRate: settings.frameRate ? Math.round(settings.frameRate) : null,
                frames: null,
            });

            // A camera can be granted, report a resolution, and still send
            // nothing -- a closed privacy shutter, or a driver blocked in
            // Windows camera settings, both look exactly like this. The only
            // way to tell is to wait and see whether any frame arrives.
            setTimeout(() => {
                const v = videoRef.current;
                if (!v || !streamRef.current) return;
                setFeed(f => f && ({ ...f, frames: v.videoWidth > 0 && v.videoHeight > 0 }));
            }, 2500);
        } catch (e) {
            // These are the four that actually happen on a workshop machine.
            const msg =
                  e.name === 'NotAllowedError'   ? 'Permission was refused. Click the camera icon in Chrome\'s '
                                                 + 'address bar and allow it for this screen, then try again.'
                : e.name === 'NotFoundError'     ? 'No camera was found on this machine.'
                : e.name === 'NotReadableError'  ? 'The camera is being used by another program on this machine. '
                                                 + 'Close it and try again.'
                : e.name === 'OverconstrainedError' ? 'That camera is no longer attached. Pick another one.'
                : e.message || 'The camera could not be started.';
            setProblem(msg);
            stop();
        } finally { setBusy(false); }
    }, [canAsk, deviceId, listDevices, stop]);

    const pick = async (id) => {
        setDeviceId(id);
        try { localStorage.setItem(LS_DEVICE, id); } catch { /* remembering is a convenience */ }
        if (on) { stop(); await start(id); }
    };

    return (
        <div style={S.wrap}>
            <div style={S.head}>
                <Camera size={18} color={D.accent} />
                <span style={S.tag}>BAY CAMERA{bayName ? ` · ${bayName}` : ''}</span>

                <span style={{ marginLeft: 'auto', display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    {devices.length > 0 && (
                        <select value={deviceId} style={S.select} onChange={e => pick(e.target.value)}>
                            <option value="">Default camera</option>
                            {devices.map((d, i) => (
                                <option key={d.deviceId} value={d.deviceId}>
                                    {d.label || `Camera ${i + 1}`}
                                </option>
                            ))}
                        </select>
                    )}
                    {on ? (
                        <>
                            <button type="button" onClick={() => { stop(); start(); }} style={S.ghost}>
                                <RefreshCw size={16} /> RESTART
                            </button>
                            <button type="button" onClick={stop}
                                    style={{ ...S.btn, background: '#475569' }}>
                                <CameraOff size={18} /> TURN OFF
                            </button>
                        </>
                    ) : (
                        <button type="button" onClick={() => start()} disabled={busy}
                                style={{ ...S.btn, background: D.accent, color: '#04121a',
                                         boxShadow: `0 0 22px ${D.accent}44` }}>
                            {busy ? <Loader2 size={18} className="animate-spin" /> : <Camera size={18} />}
                            TURN THE CAMERA ON
                        </button>
                    )}
                </span>
            </div>

            {!canAsk && (
                <div style={S.problem}>
                    <Lock size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                    Chrome will not allow the camera on this address. Open the bay screen on the
                    <strong> https </strong> address — the camera cannot be asked for over plain http,
                    whatever this page does.
                </div>
            )}

            {problem && (
                <div style={S.problem}>
                    <AlertTriangle size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                    {problem}
                </div>
            )}

            {on && <video ref={videoRef} style={S.video} muted playsInline autoPlay />}

            {on && feed && (
                <div style={{ ...S.note, fontFamily: MONO, fontSize: 12, letterSpacing: 0.5 }}>
                    {feed.label}
                    {feed.width ? ` · ${feed.width}x${feed.height}` : ''}
                    {feed.frameRate ? ` · ${feed.frameRate}fps` : ''}
                    {feed.frames === true && <span style={{ color: D.accent }}> · PICTURE OK</span>}
                    {feed.frames === null && <span style={{ color: D.muted }}> · checking…</span>}
                </div>
            )}

            {on && feed?.frames === false && (
                <div style={{ ...S.problem, background: 'rgba(120,53,15,0.35)', color: '#fde68a',
                              border: `1px solid ${D.warn}66`, borderLeft: `4px solid ${D.warn}` }}>
                    <AlertTriangle size={15} style={{ verticalAlign: -2, marginRight: 6 }} />
                    The camera is switched on but sending no picture. Three things do this, in the
                    order they usually turn out to be: a privacy shutter closed over the lens, the
                    camera switched off for apps in Windows Settings &rarr; Privacy &amp; security
                    &rarr; Camera, or another program already holding it.
                    {devices.length > 1 && ' If this machine has more than one camera, try the other one above.'}
                </div>
            )}

            <div style={S.note}>
                {on
                    ? 'This is only shown on this screen. Nothing is being sent anywhere and nothing is being recorded.'
                    : 'Turning the camera on checks that it works and grants it to this screen. '
                      + 'Nothing is sent or recorded yet.'}
            </div>
        </div>
    );
}
