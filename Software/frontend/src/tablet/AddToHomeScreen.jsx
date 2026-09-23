/**
 * "Put DealerDesk on this tablet's home screen" — shown once per tablet.
 *
 * Owner ask 2026-09-23: the advisor should be able to open service reception
 * from an icon instead of typing an address into Chrome. Two ways there:
 *
 *   - HTTPS: Chrome offers a real install, and this shows an Install button
 *     that opens its dialog. The app then runs without an address bar.
 *   - Plain HTTP (the workshop today): Chrome offers no install, so this shows
 *     the two taps that add the icon by hand. Chrome still takes the name and
 *     icon from /manifest.webmanifest, so it lands as "DealerDesk" with the
 *     wrench — it just opens in a browser tab.
 *
 * Hidden inside the Android app, once the app is running from the home screen,
 * on desktop (a mouse means it isn't a tablet), and after the advisor closes
 * it — the dismissal is remembered on that device.
 */
import React, { useEffect, useState } from 'react';
import { X, Download, Plus, MoreVertical, Share } from 'lucide-react';
import { T } from './tabletStyles';
import { isNativeApp } from './serverConfig';
import { canPromptInstall, promptInstall, onInstallStateChange, isStandalone } from './installPrompt';

const DISMISS_KEY = 'dms_a2hs_dismissed';

const readDismissed = () => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
};

/** Brings the tip back — an advisor who closed it by mistake needs a way in. */
export function resetHomeScreenHint() {
    try { localStorage.removeItem(DISMISS_KEY); } catch { /* storage blocked */ }
}

/** False where the tip could never apply: inside the app, or already added. */
export const homeScreenHintApplies = () => !isNativeApp() && !isStandalone();

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS reports as Mac
const isHandheld = () => window.matchMedia?.('(pointer: coarse)')?.matches === true;

export default function AddToHomeScreen({ style }) {
    const [, bump] = useState(0);
    const [dismissed, setDismissed] = useState(readDismissed);
    const [busy, setBusy] = useState(false);

    useEffect(() => onInstallStateChange(() => bump(n => n + 1)), []);

    // Already an app, already on the home screen, not a tablet, or dismissed.
    if (isNativeApp() || isStandalone() || dismissed) return null;
    const installable = canPromptInstall();
    if (!installable && !isHandheld()) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked — it comes back next visit */ }
        setDismissed(true);
    };
    const install = async () => {
        setBusy(true);
        try {
            if (await promptInstall()) dismiss();
        } finally {
            setBusy(false);
        }
    };

    return (
        <div style={{ ...wrap, ...style }}>
            <div style={badge}><Plus size={22} color="#fff" /></div>
            <div style={{ flex: '1 1 260px', minWidth: 0 }}>
                <div style={title}>Keep DealerDesk on the home screen</div>
                <div style={sub}>
                    {installable
                        ? 'Add it once and open service reception straight from the tablet, without typing an address.'
                        : isIOS()
                            ? <>Tap <Share size={15} style={inlineIcon} /> <strong>Share</strong>, then <strong>Add to Home Screen</strong>.</>
                            : <>Tap <MoreVertical size={15} style={inlineIcon} /> in Chrome, then <strong>Add to Home screen</strong>.</>}
                </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {installable && (
                    <button style={installBtn} onClick={install} disabled={busy}>
                        <Download size={19} /> {busy ? 'Adding…' : 'Add'}
                    </button>
                )}
                <button style={closeBtn} onClick={dismiss} title="Don't show this again" aria-label="Don't show this again">
                    <X size={20} />
                </button>
            </div>
        </div>
    );
}

const wrap = {
    display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
    background: '#fff', border: `1px solid ${T.line}`, borderLeft: `4px solid ${T.brand}`,
    borderRadius: 12, padding: '14px 16px', marginBottom: 16,
};
const badge = {
    width: 42, height: 42, borderRadius: 10, background: T.brand,
    display: 'grid', placeItems: 'center', flex: '0 0 auto',
};
const title = { fontSize: 17, fontWeight: 700, color: T.ink };
const sub = { fontSize: 14.5, lineHeight: 1.5, color: T.muted, marginTop: 2 };
const inlineIcon = { verticalAlign: '-3px' };
const installBtn = {
    minHeight: 44, padding: '0 18px', fontSize: 16, fontWeight: 600, borderRadius: 10,
    border: 'none', background: T.brand, color: '#fff', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', gap: 8,
};
const closeBtn = {
    minHeight: 44, minWidth: 44, borderRadius: 10, border: `1px solid ${T.line}`,
    background: '#fff', color: T.muted, cursor: 'pointer', display: 'grid', placeItems: 'center',
};
