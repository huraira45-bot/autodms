import React from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import { isDemoMode } from './demoMode'   // must run before App so the adapter is installed
import App from './App.jsx'
import './index.css'

// In demo mode (Vercel preview) we don't talk to a backend — the demoMode adapter
// intercepts every request. Otherwise:
//   - VITE_API_URL set         → use it (cross-origin API host)
//   - VITE_API_URL = ""        → relative paths (Express serves API + SPA same-origin)
//   - VITE_API_URL unset + DEV → fall back to local backend at port 5000
//   - VITE_API_URL unset + PROD → relative paths
if (!isDemoMode) {
    const apiUrl = import.meta.env.VITE_API_URL;
    if (apiUrl !== undefined) {
        axios.defaults.baseURL = apiUrl;
    } else if (import.meta.env.DEV) {
        // Vite dev server on :5173, backend on :5000 — point at it explicitly
        axios.defaults.baseURL = ['http', '://localhost:', '5000'].join('');
    } else {
        axios.defaults.baseURL = '';
    }
}

axios.interceptors.response.use(
    res => res,
    err => {
        if (err.response?.status === 401) {
            localStorage.removeItem('dms_token');
            delete axios.defaults.headers.common['Authorization'];
            window.location.href = '/';
        }
        return Promise.reject(err);
    }
);

ReactDOM.createRoot(document.getElementById('root')).render(
    <App />
)
