import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('dms_token');
        if (token) {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            axios.get('/api/auth/me')
                .then(r => setUser(r.data))
                .catch(() => { localStorage.removeItem('dms_token'); delete axios.defaults.headers.common['Authorization']; })
                .finally(() => setLoading(false));
        } else {
            setLoading(false);
        }
    }, []);

    const login = async (username, password) => {
        const { data } = await axios.post('/api/auth/login', { username, password });
        localStorage.setItem('dms_token', data.token);
        axios.defaults.headers.common['Authorization'] = `Bearer ${data.token}`;
        setUser(data.user);
    };

    const logout = () => {
        localStorage.removeItem('dms_token');
        delete axios.defaults.headers.common['Authorization'];
        setUser(null);
    };

    // Legacy binary check — true if the role has ANY action on the module.
    const hasModule = (key) => user?.modules?.includes(key) ?? false;

    /**
     * Granular check. Accepts:
     *   hasPermission('workshop_jobs:view')   – full permission key
     *   hasPermission('workshop_jobs', 'view') – module + action
     *   hasPermission('finalize')              – workflow/report keys (no action)
     * Admin (groupId=1) is always allowed.
     */
    const hasPermission = (keyOrModule, action) => {
        if (!user) return false;
        if (user.groupId === 1) return true;
        const key = action ? `${keyOrModule}:${action}` : keyOrModule;
        return user.permissions?.includes(key) ?? false;
    };

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, hasModule, hasPermission }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);

/**
 * Convenience hook — returns booleans for the four standard actions on a
 * given module key. Use this in pages that gate multiple buttons against the
 * same module:
 *   const { canView, canInsert, canEdit, canDelete } = useCan('procurement_grn');
 */
export function useCan(moduleKey) {
    const { user, hasPermission } = useContext(AuthContext) || {};
    if (!user) return { canView: false, canInsert: false, canEdit: false, canDelete: false };
    if (user.groupId === 1) return { canView: true, canInsert: true, canEdit: true, canDelete: true };
    return {
        canView:   hasPermission(moduleKey, 'view'),
        canInsert: hasPermission(moduleKey, 'insert'),
        canEdit:   hasPermission(moduleKey, 'edit'),
        canDelete: hasPermission(moduleKey, 'delete'),
    };
}
