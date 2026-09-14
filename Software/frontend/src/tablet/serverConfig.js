/**
 * Where the service tablet app finds the DealerDesk server.
 *
 * In a normal browser the page is served BY the server, so relative "/api"
 * paths just work. Inside the Android app the page is served from the app's
 * own bundle, so every API call needs the server's address in front of it.
 * That address is entered once on the tablet and kept in localStorage.
 */
const KEY = 'dms_server_url';

export function isNativeApp() {
    const cap = typeof window !== 'undefined' ? window.Capacitor : null;
    return !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
}

/** Adds http:// when missing and strips trailing slashes. '' for blank input. */
export function normalizeServerUrl(raw) {
    let s = String(raw || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'http://' + s;
    return s.replace(/\/+$/, '');
}

export function getServerUrl() {
    try { return normalizeServerUrl(localStorage.getItem(KEY)); } catch { return ''; }
}

export function setServerUrl(raw) {
    const url = normalizeServerUrl(raw);
    try {
        if (url) localStorage.setItem(KEY, url);
        else localStorage.removeItem(KEY);
    } catch { /* storage blocked — the address simply won't persist */ }
    return url;
}

/**
 * Full address of a page on the server. Needed when a page has to open
 * OUTSIDE the app (Chrome, for printing), where a relative path would point
 * at the tablet instead of the server.
 */
export function serverPageUrl(path) {
    const base = isNativeApp() ? getServerUrl() : window.location.origin;
    return base + (path.startsWith('/') ? path : '/' + path);
}

/**
 * Opens a URL in the tablet's browser. Inside the app this goes through the
 * Capacitor Browser plugin bundled into the APK; in an ordinary browser it
 * opens a new tab.
 */
export function openOutsideApp(url) {
    const browser = window.Capacitor?.Plugins?.Browser;
    if (isNativeApp() && browser?.open) return browser.open({ url });
    window.open(url, '_blank', 'noopener');
    return Promise.resolve();
}
