/**
 * Remembers Chrome's install offer for the tablet app.
 *
 * Chrome fires `beforeinstallprompt` once and early — usually before React has
 * mounted — and the event is only usable later if its default was prevented at
 * the time. So the listener is registered from main.jsx at start-up and the
 * event parked here until a tablet screen asks for it.
 *
 * Over plain HTTP the event never fires at all: Chrome only offers a real
 * install over HTTPS (or localhost). The tablet screens then fall back to
 * telling the advisor to use Chrome's "Add to Home screen" by hand, which
 * still picks up the name and icon from /manifest.webmanifest.
 */
let deferred = null;
let installed = false;
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a screen unmounting mid-event */ } });

if (typeof window !== 'undefined') {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferred = e;
        emit();
    });
    window.addEventListener('appinstalled', () => {
        deferred = null;
        installed = true;
        emit();
    });
}

export const canPromptInstall = () => !!deferred;
export const wasInstalled = () => installed;

/** Subscribe to "the offer appeared / was used / the app got installed". */
export function onInstallStateChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
}

/** Shows Chrome's install dialog. Resolves true if the advisor accepted. */
export async function promptInstall() {
    if (!deferred) return false;
    const e = deferred;
    deferred = null;          // the event is single-use
    emit();
    e.prompt();
    const { outcome } = await e.userChoice;
    return outcome === 'accepted';
}

/** True when the page is already running from the home screen, not in a tab. */
export function isStandalone() {
    if (typeof window === 'undefined') return false;
    const mm = (q) => window.matchMedia?.(q)?.matches === true;
    return mm('(display-mode: standalone)') || mm('(display-mode: minimal-ui)')
        || window.navigator.standalone === true;   // iOS Safari
}
