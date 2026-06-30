/**
 * Permission-gate component for action-specific UI (Add / Edit / Delete buttons,
 * Save buttons on edit forms, etc.). Mirrors the backend requirePerm guard so
 * the UI and the API stay in lock-step.
 *
 * Usage:
 *   <Can perm="workshop_jobs" action="insert">
 *     <button>New Job Card</button>
 *   </Can>
 *
 *   <Can perm="finalize">          // workflow/report-style keys (no action)
 *     <button>Finalize</button>
 *   </Can>
 *
 *   <Can anyOf={['cro_workspace','cro_admin']}>
 *     <button>Open complaint</button>
 *   </Can>
 *
 *   <Can perm="finance_vouchers" action="delete" fallback={<DisabledButton />}>
 *     <button>Delete</button>
 *   </Can>
 *
 * Admin (groupId=1) always renders the children — same as the server side.
 */
import { useAuth } from '../context/AuthContext';

export default function Can({ perm, action, anyOf, fallback = null, children }) {
    const { user, hasPermission } = useAuth();

    if (!user) return fallback;
    if (user.groupId === 1) return children;

    if (Array.isArray(anyOf) && anyOf.length) {
        const ok = anyOf.some(k => (user.permissions || []).includes(k));
        return ok ? children : fallback;
    }

    if (perm) {
        return hasPermission(perm, action) ? children : fallback;
    }

    return fallback;
}
