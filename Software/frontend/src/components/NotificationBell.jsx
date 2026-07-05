import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { Bell, AlertTriangle, MessageSquare, X, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const API = '/api';
const POLL_MS = 60_000;

const SEV_COLOR = {
    Critical: '#dc2626',
    High:     '#b45309',
    Normal:   '#475569',
    Low:      '#64748b',
};

const ICON_FOR = (sourceType) => {
    if (sourceType === 'ComplaintEscalation') return AlertTriangle;
    return MessageSquare;
};

const fmtAgo = (iso) => {
    if (!iso) return '';
    const ms = Date.now() - new Date(iso).getTime();
    const m = Math.floor(ms / 60_000);
    if (m < 1)  return 'just now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    return `${Math.floor(h / 24)}d ago`;
};

export default function NotificationBell() {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [open, setOpen]           = useState(false);
    const [items, setItems]         = useState([]);
    const [unread, setUnread]       = useState(0);
    const [busy, setBusy]           = useState(false);
    const containerRef              = useRef(null);

    const load = useCallback(async () => {
        if (!user?.employeeId) {
            setItems([]); setUnread(0); return;
        }
        try {
            const r = await axios.get(`${API}/cro/notifications/inbox`, { params: { limit: 15 } });
            setItems(r.data.items || []);
            setUnread(r.data.unreadCount || 0);
        } catch (e) { /* silent — bell stays quiet */ }
    }, [user?.employeeId]);

    useEffect(() => {
        load();
        const t = setInterval(load, POLL_MS);
        return () => clearInterval(t);
    }, [load]);

    // Close on outside click
    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        return () => document.removeEventListener('mousedown', onDocClick);
    }, [open]);

    const onItemClick = async (n) => {
        if (!n.ReadAt) {
            try { await axios.post(`${API}/cro/notifications/${n.NotificationID}/read`); } catch {}
        }
        setOpen(false);
        if (n.LinkURL) navigate(n.LinkURL);
        load();
    };

    const markAllRead = async () => {
        setBusy(true);
        try { await axios.post(`${API}/cro/notifications/read-all`); } catch {}
        setBusy(false);
        load();
    };

    if (!user) return null;

    return (
        <div ref={containerRef} className="erp-topbar-bell">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                title={unread ? `${unread} unread` : 'No new notifications'}
                className="erp-topbar-icon"
                style={{ position: 'relative' }}>
                <Bell size={16} color={unread > 0 ? '#b91c1c' : 'var(--erp-text-muted)'} />
                {unread > 0 && (
                    <span style={{
                        position: 'absolute', top: 2, right: 2,
                        minWidth: 14, height: 14, padding: '0 3px',
                        background: '#dc2626', color: 'white', borderRadius: 9,
                        fontSize: 9, fontWeight: 700, lineHeight: 1,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                        {unread > 99 ? '99+' : unread}
                    </span>
                )}
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', right: 0, width: 360,
                    background: 'white', border: '1px solid #e2e8f0', borderRadius: 10,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.15)', overflow: 'hidden',
                    zIndex: 900,
                }}>
                    <div style={{
                        padding: '10px 14px', borderBottom: '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        background: '#f8fafc',
                    }}>
                        <div style={{ fontWeight: 600, fontSize: '0.9rem' }}>Notifications</div>
                        <div style={{ display: 'flex', gap: 6 }}>
                            {unread > 0 && (
                                <button onClick={markAllRead} disabled={busy}
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#1e40af', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                                    <CheckCheck size={14} /> Mark all read
                                </button>
                            )}
                            <button onClick={() => setOpen(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#64748b' }}>
                                <X size={16} />
                            </button>
                        </div>
                    </div>

                    <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                        {!user.employeeId ? (
                            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                Your user account is not linked to an employee record yet — no inbox to show.
                            </div>
                        ) : items.length === 0 ? (
                            <div style={{ padding: 28, textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
                                You're all caught up.
                            </div>
                        ) : items.map(n => {
                            const Icon = ICON_FOR(n.SourceType);
                            const sevC = SEV_COLOR[n.Severity] || '#475569';
                            const unreadRow = !n.ReadAt;
                            return (
                                <button key={n.NotificationID} onClick={() => onItemClick(n)}
                                    style={{
                                        display: 'flex', gap: 10, width: '100%', textAlign: 'left',
                                        padding: '10px 14px', cursor: 'pointer',
                                        background: unreadRow ? '#fff7ed' : 'white',
                                        border: 'none', borderBottom: '1px solid #f1f5f9',
                                    }}>
                                    <div style={{ flexShrink: 0, width: 28, height: 28, borderRadius: 99, background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                        <Icon size={14} color={sevC} />
                                    </div>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ fontSize: '0.85rem', fontWeight: unreadRow ? 600 : 400, color: '#0f172a' }}>
                                            {n.Subject}
                                        </div>
                                        {n.Body && (
                                            <div style={{ fontSize: '0.78rem', color: '#64748b', marginTop: 2, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                                {n.Body}
                                            </div>
                                        )}
                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8', marginTop: 4 }}>
                                            {fmtAgo(n.SentAt)}{n.ComplaintNo ? ` · ${n.ComplaintNo}` : ''}{n.Status ? ` · ${n.Status}` : ''}
                                        </div>
                                    </div>
                                    {unreadRow && <span style={{ width: 8, height: 8, borderRadius: 99, background: '#dc2626', flexShrink: 0, marginTop: 8 }} />}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
