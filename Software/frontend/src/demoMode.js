/**
 * Demo-mode shim for Vercel preview deploys.
 *
 * When VITE_DEMO_MODE=true is set at build time, we swap out Axios's HTTP adapter
 * for an in-memory one. This means:
 *   - The login form accepts ANY username/password and returns a fake JWT.
 *   - The user is granted every module so every screen in the app is reachable.
 *   - All GET requests resolve with [] (or a small fake object for known shapes),
 *     so list pages render their empty states cleanly instead of throwing.
 *   - All POST/PUT/DELETE/PATCH requests resolve with a generic "not saved in demo
 *     mode" success object — UI thinks the action succeeded; nothing persists.
 *
 * This is purely a UI-demo aid. There is no real backend, no DB, no auth.
 */
import axios from 'axios';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

// Every module key from Software/config/modules.js — keep in sync if new modules are added.
const ALL_MODULES = [
    'workshop_customers', 'workshop_jobs', 'workshop_labour', 'workshop_sublet',
    'workshop_parts_issue', 'workshop_settings', 'workshop_careoff', 'workshop_accessories', 'workshop_controller',
    'parts_spare', 'procurement_grn', 'procurement_grtn', 'sales_store', 'sales_ssr', 'inventory_settings',
    'finance_coa', 'finance_vouchers', 'accounting_setup', 'payments', 'reports',
    'crm_parties', 'crd_followups',
    'cro_workspace', 'cro_admin', 'cro_dept_responder', 'cro_reports',
    'sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_pricing', 'sales_admin_settings',
    'sales_master_settlement', 'sales_recovery', 'sales_reports', 'sales_hierarchy',
    'hr_employees', 'hr_settings',
    'admin_users', 'admin_permissions',
    'finalize', 'am_approve', 'admin_unfinalize',
];

const DEMO_USER = {
    userId: 1,
    userName: 'demo',
    groupId: 1,
    groupTitle: 'Demo Administrator',
    employeeId: 1,
    modules: ALL_MODULES,
};

const DEMO_TOKEN = 'demo-token-not-a-real-jwt';

// Some endpoints expect a single object instead of an array. List the patterns
// here and we'll return {} for them. Everything else falls back to [].
const OBJECT_GET_PATTERNS = [
    /\/auth\/me$/,
    /\/me$/,
    /\/dashboard/i,
    /\/summary$/,
    /\/stats$/,
    /\/settings$/,
    /\/\d+$/, // GET /api/foo/123 — single record lookups
];

function fakeResponse(config, data, status = 200) {
    return {
        data,
        status,
        statusText: 'OK',
        headers: {},
        config,
        request: {},
    };
}

function demoAdapter(config) {
    return new Promise((resolve) => {
        const url = (config.url || '').toLowerCase();
        const method = (config.method || 'get').toLowerCase();

        // small delay so the spinner gets to spin for a beat — feels more "real"
        setTimeout(() => {
            // Auth — login accepts anything
            if (url.includes('/auth/login')) {
                return resolve(fakeResponse(config, { token: DEMO_TOKEN, user: DEMO_USER }));
            }
            if (url.includes('/auth/me')) {
                return resolve(fakeResponse(config, DEMO_USER));
            }

            // Reads
            if (method === 'get') {
                const wantsObject = OBJECT_GET_PATTERNS.some(rx => rx.test(url));
                return resolve(fakeResponse(config, wantsObject ? {} : []));
            }

            // Writes — pretend everything worked
            return resolve(fakeResponse(config, {
                ok: true,
                id: Date.now(),
                message: 'Demo mode — change was not persisted.',
            }));
        }, 80);
    });
}

if (isDemoMode) {
    axios.defaults.adapter = demoAdapter;
    // eslint-disable-next-line no-console
    console.info('[AutoDMS] Running in DEMO MODE — no backend calls are made.');
}
