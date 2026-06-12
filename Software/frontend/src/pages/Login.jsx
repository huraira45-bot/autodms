import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Car } from 'lucide-react';
import { isDemoMode } from '../demoMode';

export default function Login() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError]       = useState('');
    const [loading, setLoading]   = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            await login(username.trim(), password);
        } catch (err) {
            setError(err.response?.data?.error || 'Login failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={styles.page}>
            <div style={styles.card}>
                <div style={styles.logo}>
                    <Car size={32} color="#2563eb" />
                    <span style={styles.logoText}>AutoDMS</span>
                </div>
                <h2 style={styles.title}>Sign In</h2>

                {isDemoMode && (
                    <div style={{
                        background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1e40af',
                        padding: '10px 12px', borderRadius: 6, fontSize: '0.82rem', marginBottom: 14,
                        lineHeight: 1.45,
                    }}>
                        <strong>Demo mode</strong> — no backend is connected. Enter any username and
                        password to sign in. Data is mocked; changes won't be saved.
                    </div>
                )}

                {error && <div style={styles.errorBox}>{error}</div>}

                <form onSubmit={handleSubmit}>
                    <div style={styles.field}>
                        <label style={styles.label}>Username</label>
                        <input
                            style={styles.input}
                            type="text"
                            value={username}
                            onChange={e => setUsername(e.target.value)}
                            autoFocus
                            autoComplete="username"
                            required
                        />
                    </div>
                    <div style={styles.field}>
                        <label style={styles.label}>Password</label>
                        <input
                            style={styles.input}
                            type="password"
                            value={password}
                            onChange={e => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>
                    <button style={{ ...styles.btn, opacity: loading ? 0.7 : 1 }} type="submit" disabled={loading}>
                        {loading ? 'Signing in…' : 'Sign In'}
                    </button>
                </form>
            </div>
        </div>
    );
}

const styles = {
    page: {
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f1f5f9',
    },
    card: {
        background: '#fff',
        borderRadius: 12,
        padding: '40px 36px',
        width: 360,
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
    },
    logo: {
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        marginBottom: 24,
        justifyContent: 'center',
    },
    logoText: {
        fontSize: 22,
        fontWeight: 700,
        color: '#1e293b',
    },
    title: {
        textAlign: 'center',
        marginBottom: 24,
        fontSize: 18,
        color: '#334155',
        fontWeight: 600,
    },
    errorBox: {
        background: '#fee2e2',
        color: '#b91c1c',
        padding: '10px 14px',
        borderRadius: 6,
        marginBottom: 16,
        fontSize: 13,
    },
    field: {
        marginBottom: 16,
    },
    label: {
        display: 'block',
        marginBottom: 6,
        fontSize: 13,
        fontWeight: 500,
        color: '#475569',
    },
    input: {
        width: '100%',
        padding: '9px 12px',
        border: '1px solid #cbd5e1',
        borderRadius: 6,
        fontSize: 14,
        outline: 'none',
        boxSizing: 'border-box',
    },
    btn: {
        width: '100%',
        padding: '10px',
        background: '#2563eb',
        color: '#fff',
        border: 'none',
        borderRadius: 6,
        fontSize: 15,
        fontWeight: 600,
        cursor: 'pointer',
        marginTop: 8,
    },
};
