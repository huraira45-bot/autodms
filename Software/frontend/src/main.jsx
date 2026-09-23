import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import { isDemoMode } from './demoMode'   // must run before App so the adapter is installed
import { isNativeApp, getServerUrl } from './tablet/serverConfig'
import './tablet/installPrompt'   // must listen before Chrome fires beforeinstallprompt
import { registerTabletServiceWorker } from './tablet/registerTabletSW'
import App from './App.jsx'
import './index.css'

// In demo mode (Vercel preview) we don't talk to a backend — the demoMode adapter
// intercepts every request. Otherwise:
//   - Inside the Android service app → the server address saved on the tablet.
//     The page itself is served from the app bundle, so relative paths would
//     point at the tablet, not at the DealerDesk server.
//   - VITE_API_URL set         → use it (cross-origin API host)
//   - VITE_API_URL = ""        → relative paths (Express serves API + SPA same-origin)
//   - VITE_API_URL unset + DEV → fall back to local backend at port 5000
//   - VITE_API_URL unset + PROD → relative paths
if (!isDemoMode) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (isNativeApp()) {
        axios.defaults.baseURL = getServerUrl();
    } else if (apiUrl !== undefined) {
        axios.defaults.baseURL = apiUrl;
    } else if (import.meta.env.DEV) {
        // Vite dev server on :5173, backend on :5000 — point at it explicitly
        axios.defaults.baseURL = ['http', '://localhost:', '5000'].join('');
    } else {
        axios.defaults.baseURL = '';
    }
}

// The Android app only ever shows the tablet screens (and print pages opened
// from them) — never the desktop ERP.
if (isNativeApp()
    && !window.location.pathname.startsWith('/tablet')
    && !/\/print(?:\/|$)/.test(window.location.pathname)) {
    window.history.replaceState(null, '', '/tablet');
}

// The tablet app's service worker — what lets Chrome install it as a
// full-screen app. Does nothing on the desktop ERP or over plain HTTP.
if (window.location.pathname.startsWith('/tablet')) {
    registerTabletServiceWorker();
}

axios.interceptors.response.use(
    res => res,
    err => {
        // A 401 from the login call itself is just "wrong password" — let the
        // sign-in form show it instead of reloading the page and losing it.
        const isLoginCall = String(err.config?.url || '').includes('/api/auth/login');
        if (err.response?.status === 401 && !isLoginCall) {
            localStorage.removeItem('dms_token');
            delete axios.defaults.headers.common['Authorization'];
            // Tablet screens have their own sign-in; send them back there.
            window.location.href = window.location.pathname.startsWith('/tablet') ? '/tablet' : '/';
        }
        return Promise.reject(err);
    }
);

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
)
