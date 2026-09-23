/**
 * Turns on the tablet app's service worker.
 *
 * It is what makes Chrome offer to install the app, so the advisor gets a
 * full-screen DealerDesk with no address bar and no tabs. Registration only
 * makes sense where that can happen:
 *
 *   - not inside the Android app, which is already its own shell;
 *   - only on a secure origin (HTTPS, or localhost while developing) —
 *     browsers refuse to register a service worker over plain HTTP, so on the
 *     old http://…:5000 address this simply does nothing;
 *   - only on /tablet, matching the scope in the worker and the manifest, so
 *     the desktop ERP is never affected by it.
 */
import { isNativeApp } from './serverConfig';

export function registerTabletServiceWorker() {
    if (isNativeApp()) return;
    if (!('serviceWorker' in navigator)) return;
    if (!window.isSecureContext) return;

    // Registering competes with the first paint; wait for the page to settle.
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/tablet-sw.js', { scope: '/tablet' })
            .catch((err) => console.warn('[tablet] service worker not registered:', err.message));
    });
}
