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

    const hasModule = (key) => user?.modules?.includes(key) ?? false;

    return (
        <AuthContext.Provider value={{ user, loading, login, logout, hasModule }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
