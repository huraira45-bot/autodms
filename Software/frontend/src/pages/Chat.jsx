import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import {
    Hash, Lock, Users, MessageSquare, Paperclip, Send, Plus,
    ShieldAlert, RefreshCw, Search, X
} from 'lucide-react';

const API = '/api/chat';

// --- Socket.io connection hook ---------------------------------------------
function useChatSocket() {
    const [sock, setSock] = useState(null);
    useEffect(() => {
        const token = localStorage.getItem('dms_token');
        if (!token) return;
        const s = io('/chat', {
            path: '/socket.io',
            auth: { token },
            transports: ['websocket', 'polling'],
        });
        setSock(s);
        return () => { s.disconnect(); setSock(null); };
    }, []);
    return sock;
}

// --- Format helpers ---------------------------------------------------------
const fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const fmtDay  = (d) => {
    const dt = new Date(d);
    const today = new Date();
    if (dt.toDateString() === today.toDateString()) return 'Today';
    today.setDate(today.getDate() - 1);
    if (dt.toDateString() === today.toDateString()) return 'Yesterday';
    return dt.toLocaleDateString();
};
const fmtSize = (n) => {
    if (n == null) return '';
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
};

// ---------------------------------------------------------------------------
export default function Chat() {
    const { user, hasModule } = useAuth();
    const isChatAdmin = hasModule('chat_admin') || user?.groupId === 1;
    const sock = useChatSocket();

    const [channels, setChannels]   = useState([]);
    const [activeId, setActiveId]   = useState(null);
    const [messages, setMessages]   = useState([]);
    const [loadingMsgs, setLoadingMsgs] = useState(false);
    const [showNewCh, setShowNewCh] = useState(false);
    const [showNewDM, setShowNewDM] = useState(false);

    // ---- Admin audit mode: browse every channel in the system, not just
    // the ones the current user is a member of (owner ask 2026-08-15 —
    // the "Admins can audit any channel" banner was real on the backend
    // but had no UI to actually reach it). Read-only: no compose box while
    // auditing, so an admin can't accidentally post into someone else's DM.
    const [auditMode, setAuditMode] = useState(false);
    const [auditChannels, setAuditChannels] = useState([]);
    const [auditActiveChannel, setAuditActiveChannel] = useState(null);
    const loadAuditChannels = async () => {
        try { const r = await axios.get(`${API}/audit/channels`); setAuditChannels(r.data); }
        catch { setAuditChannels([]); }
    };
    const toggleAuditMode = () => {
        setAuditMode(v => {
            const next = !v;
            setActiveId(null);
            setAuditActiveChannel(null);
            if (next) loadAuditChannels();
            return next;
        });
    };
    const openAuditChannel = (c) => { setAuditActiveChannel(c); setActiveId(c.ChannelID); };

    // ---- Channel list load / refresh ----
    const loadChannels = async () => {
        try { const r = await axios.get(`${API}/channels`); setChannels(r.data); }
        catch { setChannels([]); }
    };
    useEffect(() => { loadChannels(); }, []);

    // ---- Messages ----
    useEffect(() => {
        if (!activeId) { setMessages([]); return; }
        (async () => {
            setLoadingMsgs(true);
            try {
                const r = await axios.get(`${API}/channels/${activeId}/messages?limit=100`);
                setMessages(r.data);
                // Skip the read-receipt POST while auditing -- a no-op on the
                // backend for a channel the admin isn't a member of anyway,
                // but there's no reason to fire it for a passive view.
                if (r.data.length && !auditMode) {
                    await axios.post(`${API}/channels/${activeId}/read`, {
                        messageId: r.data[r.data.length - 1].MessageID,
                    });
                    // reflect unread=0 locally so the badge disappears immediately
                    setChannels(cs => cs.map(c =>
                        c.ChannelID === activeId ? { ...c, UnreadCount: 0 } : c));
                }
            } catch { setMessages([]); }
            setLoadingMsgs(false);
        })();
    }, [activeId]);

    // ---- Socket wiring ----
    useEffect(() => {
        if (!sock) return;
        const onMessage = (msg) => {
            // If it's for the active channel, append; otherwise bump unread.
            if (msg.ChannelID === activeId) {
                setMessages(m => m.some(x => x.MessageID === msg.MessageID) ? m : [...m, msg]);
                axios.post(`${API}/channels/${activeId}/read`, { messageId: msg.MessageID }).catch(()=>{});
            } else {
                setChannels(cs => cs.map(c =>
                    c.ChannelID === msg.ChannelID
                        ? { ...c,
                            UnreadCount: (c.UnreadCount || 0) + (msg.SenderID === user?.userId ? 0 : 1),
                            LastMessagePreview: `${msg.SenderName}: ${msg.Content || `[${msg.AttachmentName || 'file'}]`}`,
                            LastMessageAt: msg.CreatedAt }
                        : c));
            }
        };
        const onChannelNew = () => loadChannels();
        sock.on('chat:message', onMessage);
        sock.on('channel:new', onChannelNew);
        return () => {
            sock.off('chat:message', onMessage);
            sock.off('channel:new', onChannelNew);
        };
    }, [sock, activeId, user?.userId]);

    const activeChannel = auditMode ? auditActiveChannel : channels.find(c => c.ChannelID === activeId);

    return (
        <div style={{ display: 'flex', height: 'calc(100vh - 60px)', background: '#f8fafc' }}>
            {/* LEFT SIDEBAR */}
            <div style={{ width: 280, borderRight: '1px solid #e2e8f0', background: 'white', display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ fontWeight: 700, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <MessageSquare size={18} /> Chat
                    </div>
                    <button title="Refresh" onClick={auditMode ? loadAuditChannels : loadChannels}
                            style={ghostBtn}><RefreshCw size={14} /></button>
                </div>

                {isChatAdmin && (
                    <button onClick={toggleAuditMode}
                        style={{
                            margin: '8px 12px 0', padding: '6px 10px', borderRadius: 6, cursor: 'pointer',
                            fontSize: '0.78rem', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 6,
                            border: auditMode ? '1px solid #92400e' : '1px solid #cbd5e1',
                            background: auditMode ? '#fef3c7' : 'white',
                            color: auditMode ? '#92400e' : '#334155',
                        }}>
                        <ShieldAlert size={13} /> {auditMode ? 'Exit Audit Mode' : 'Audit All Channels'}
                    </button>
                )}

                {!auditMode && (
                    <div style={{ padding: '8px 12px', display: 'flex', gap: 6, borderBottom: '1px solid #f1f5f9' }}>
                        <button style={primaryBtn} onClick={() => setShowNewCh(true)}>
                            <Plus size={12} /> Channel
                        </button>
                        <button style={primaryBtn} onClick={() => setShowNewDM(true)}>
                            <Plus size={12} /> DM
                        </button>
                    </div>
                )}

                {auditMode ? (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    <SectionHeader title={`Every Conversation (${auditChannels.length})`} />
                    {auditChannels.map(c => (
                        <AuditChannelRow key={c.ChannelID} c={c} active={c.ChannelID === activeId}
                                    onClick={() => openAuditChannel(c)} />
                    ))}
                    {auditChannels.length === 0 && (
                        <div style={{ padding: 16, color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                            No conversations exist yet.
                        </div>
                    )}
                </div>
                ) : (
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    <SectionHeader title="Channels" />
                    {channels.filter(c => c.Kind !== 'dm').map(c => (
                        <ChannelRow key={c.ChannelID} c={c} active={c.ChannelID === activeId}
                                    onClick={() => setActiveId(c.ChannelID)} />
                    ))}
                    <SectionHeader title="Direct Messages" />
                    {channels.filter(c => c.Kind === 'dm').map(c => (
                        <ChannelRow key={c.ChannelID} c={c} active={c.ChannelID === activeId}
                                    onClick={() => setActiveId(c.ChannelID)} />
                    ))}
                    {channels.length === 0 && (
                        <div style={{ padding: 16, color: '#94a3b8', fontSize: '0.85rem', textAlign: 'center' }}>
                            No conversations yet. Start a DM or create a channel.
                        </div>
                    )}
                </div>
                )}

                {isChatAdmin && !auditMode && (
                    <div style={{ padding: 10, borderTop: '1px solid #e2e8f0', background: '#fef3c7',
                                  color: '#92400e', fontSize: '0.72rem', display: 'flex', gap: 6, alignItems: 'flex-start' }}>
                        <ShieldAlert size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                        <span><strong>Admin access</strong> — you can audit any channel. Users are told in the message pane.</span>
                    </div>
                )}
            </div>

            {/* RIGHT PANE */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                {activeChannel ? (
                    <ChannelPane channel={activeChannel} messages={messages}
                                 loading={loadingMsgs}
                                 readOnly={auditMode}
                                 onSent={(msg) => setMessages(m =>
                                     m.some(x => x.MessageID === msg.MessageID) ? m : [...m, msg])}
                                 currentUserId={user?.userId} />
                ) : (
                    <div style={{ margin: 'auto', color: '#94a3b8', textAlign: 'center' }}>
                        <MessageSquare size={40} style={{ opacity: 0.4 }} />
                        <div style={{ marginTop: 8 }}>Pick a conversation on the left.</div>
                    </div>
                )}
            </div>

            {showNewCh && <NewChannelModal onClose={() => setShowNewCh(false)}
                                            onCreated={(id) => { setShowNewCh(false); loadChannels(); setActiveId(id); }} />}
            {showNewDM && <NewDMModal onClose={() => setShowNewDM(false)}
                                       onCreated={(id) => { setShowNewDM(false); loadChannels(); setActiveId(id); }} />}
        </div>
    );
}

// ---------------------------------------------------------------------------
function SectionHeader({ title }) {
    return (
        <div style={{ padding: '10px 16px 4px', fontSize: '0.7rem', color: '#64748b',
                      textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
            {title}
        </div>
    );
}

function ChannelRow({ c, active, onClick }) {
    const label = c.Kind === 'dm'
        ? (c.DmPeerName || 'Direct message')
        : (c.Name || 'Channel');
    const Icon = c.Kind === 'dm' ? Users : (c.Kind === 'private' ? Lock : Hash);
    return (
        <div onClick={onClick}
             style={{
                 padding: '6px 16px', display: 'flex', alignItems: 'center', gap: 8,
                 cursor: 'pointer', fontSize: '0.88rem',
                 background: active ? '#eef2ff' : 'transparent',
                 color: active ? '#3730a3' : '#334155',
                 borderLeft: active ? '3px solid #4f46e5' : '3px solid transparent',
                 fontWeight: active ? 600 : 500,
             }}>
            <Icon size={14} style={{ opacity: 0.75 }} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {label}
            </span>
            {c.UnreadCount > 0 && (
                <span style={{ background: '#ef4444', color: 'white', borderRadius: 10,
                               padding: '1px 6px', fontSize: '0.65rem', fontWeight: 700 }}>
                    {c.UnreadCount}
                </span>
            )}
        </div>
    );
}

// Audit-mode row — every channel in the system, not just the current user's.
// DMs have no Name of their own, so this falls back to the joined member
// names (owner ask 2026-08-15).
function AuditChannelRow({ c, active, onClick }) {
    const label = c.Kind === 'dm'
        ? (c.MemberNames || 'Direct message')
        : (c.Name || 'Channel');
    const Icon = c.Kind === 'dm' ? Users : (c.Kind === 'private' ? Lock : Hash);
    return (
        <div onClick={onClick}
             style={{
                 padding: '8px 16px', cursor: 'pointer', fontSize: '0.85rem',
                 background: active ? '#eef2ff' : 'transparent',
                 color: active ? '#3730a3' : '#334155',
                 borderLeft: active ? '3px solid #4f46e5' : '3px solid transparent',
             }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: active ? 600 : 500 }}>
                <Icon size={14} style={{ opacity: 0.75, flexShrink: 0 }} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
            <div style={{ marginLeft: 22, marginTop: 2, fontSize: '0.7rem', color: '#94a3b8' }}>
                {c.MemberCount} member{c.MemberCount === 1 ? '' : 's'} · {c.MessageCount} message{c.MessageCount === 1 ? '' : 's'}
                {c.LastMessageAt && <> · {fmtDay(c.LastMessageAt)} {fmtTime(c.LastMessageAt)}</>}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
function ChannelPane({ channel, messages, loading, onSent, currentUserId, readOnly }) {
    const [text, setText] = useState('');
    const [attach, setAttach] = useState(null);
    const [sending, setSending] = useState(false);
    const scrollRef = useRef(null);
    const fileRef   = useRef(null);

    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }, [messages]);

    const label = channel.Kind === 'dm'
        ? (channel.DmPeerName || channel.MemberNames || 'Direct message')
        : (channel.Name || 'Channel');
    const IconLead = channel.Kind === 'dm' ? Users : (channel.Kind === 'private' ? Lock : Hash);

    const send = async (e) => {
        e?.preventDefault?.();
        if (!text.trim() && !attach) return;
        setSending(true);
        try {
            let attachData = null;
            if (attach) {
                const form = new FormData();
                form.append('file', attach);
                const r = await axios.post(`${API}/upload`, form,
                    { headers: { 'Content-Type': 'multipart/form-data' } });
                attachData = r.data;
            }
            const r = await axios.post(`${API}/channels/${channel.ChannelID}/messages`, {
                Content: text.trim() || null,
                ...(attachData || {}),
            });
            // Optimistically append the REST response so the sender sees it
            // immediately even if the socket echo hasn't arrived (or if the
            // socket dropped). The socket handler dedupes by MessageID.
            if (r.data?.MessageID) onSent(r.data);
            setText(''); setAttach(null);
            if (fileRef.current) fileRef.current.value = '';
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || 'Failed to send.');
        } finally { setSending(false); }
    };

    return (
        <>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid #e2e8f0', background: 'white',
                          display: 'flex', alignItems: 'center', gap: 10 }}>
                <IconLead size={18} />
                <div style={{ fontWeight: 700, fontSize: '1rem' }}>{label}</div>
                {channel.Description && (
                    <div style={{ color: '#64748b', fontSize: '0.8rem' }}>— {channel.Description}</div>
                )}
            </div>

            <div style={{ padding: '6px 20px', background: '#fef9c3', color: '#854d0e',
                          fontSize: '0.72rem', borderBottom: '1px solid #fde68a' }}>
                {readOnly
                    ? '🔒 Audit mode — read-only view of this conversation. Nothing you do here is visible to its participants.'
                    : '⚠ Admins can audit every conversation. Do not share confidential information you would not disclose to management.'}
            </div>

            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', background: '#f8fafc' }}>
                {loading && <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>Loading messages…</div>}
                {!loading && messages.length === 0 && (
                    <div style={{ color: '#94a3b8', textAlign: 'center', marginTop: 40 }}>
                        Say hi 👋 — no messages here yet.
                    </div>
                )}
                {renderMessages(messages, currentUserId)}
            </div>

            {!readOnly && (
                <form onSubmit={send} style={{ padding: 12, borderTop: '1px solid #e2e8f0', background: 'white',
                                                display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                    <button type="button" onClick={() => fileRef.current?.click()}
                            style={{ ...ghostBtn, padding: '6px 10px' }} title="Attach a file">
                        <Paperclip size={16} />
                    </button>
                    <input type="file" ref={fileRef} style={{ display: 'none' }}
                           onChange={e => setAttach(e.target.files?.[0] || null)} />
                    <div style={{ flex: 1 }}>
                        {attach && (
                            <div style={{ fontSize: '0.75rem', color: '#475569', background: '#e2e8f0',
                                          padding: '2px 8px', borderRadius: 4, display: 'inline-flex',
                                          gap: 6, alignItems: 'center', marginBottom: 4 }}>
                                <Paperclip size={11} /> {attach.name} ({fmtSize(attach.size)})
                                <button type="button" onClick={() => { setAttach(null); if (fileRef.current) fileRef.current.value=''; }}
                                        style={{ ...ghostBtn, padding: 0 }}><X size={11} /></button>
                            </div>
                        )}
                        <textarea rows={1} value={text}
                                  onChange={e => setText(e.target.value)}
                                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(e); } }}
                                  placeholder="Message… (Enter to send, Shift+Enter for new line)"
                                  style={{ width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
                                           borderRadius: 6, resize: 'vertical', fontFamily: 'inherit', fontSize: '0.9rem' }} />
                    </div>
                    <button type="submit" disabled={sending || (!text.trim() && !attach)}
                            style={{ ...primaryBtn, padding: '8px 14px' }}>
                        <Send size={14} /> {sending ? 'Sending…' : 'Send'}
                    </button>
                </form>
            )}
        </>
    );
}

function renderMessages(messages, currentUserId) {
    const out = [];
    let lastDay = null;
    for (const m of messages) {
        const day = fmtDay(m.CreatedAt);
        if (day !== lastDay) {
            out.push(
                <div key={`day-${m.MessageID}`}
                     style={{ textAlign: 'center', margin: '12px 0', color: '#94a3b8', fontSize: '0.72rem' }}>
                    <span style={{ background: 'white', padding: '2px 10px', borderRadius: 10, border: '1px solid #e2e8f0' }}>{day}</span>
                </div>
            );
            lastDay = day;
        }
        const isMine = m.SenderID === currentUserId;
        out.push(
            <div key={m.MessageID}
                 style={{ marginBottom: 8, display: 'flex', flexDirection: 'column',
                          alignItems: isMine ? 'flex-end' : 'flex-start' }}>
                <div style={{ maxWidth: '75%', padding: '6px 10px',
                              borderRadius: 8,
                              background: isMine ? '#4f46e5' : 'white',
                              color: isMine ? 'white' : '#0f172a',
                              border: isMine ? 'none' : '1px solid #e2e8f0',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
                    {!isMine && (
                        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: '#6366f1', marginBottom: 2 }}>
                            {m.SenderName}
                        </div>
                    )}
                    {m.Content && <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.Content}</div>}
                    {m.AttachmentPath && <AttachmentRender m={m} isMine={isMine} />}
                    <div style={{ fontSize: '0.65rem', textAlign: 'right', marginTop: 2, opacity: 0.7 }}>
                        {fmtTime(m.CreatedAt)}
                    </div>
                </div>
            </div>
        );
    }
    return out;
}

function AttachmentRender({ m, isMine }) {
    const isImg = (m.AttachmentType || '').startsWith('image/');
    if (isImg) {
        return (
            <a href={m.AttachmentPath} target="_blank" rel="noreferrer">
                <img src={m.AttachmentPath} alt={m.AttachmentName}
                     style={{ maxWidth: 260, maxHeight: 260, borderRadius: 6, marginTop: 4, display: 'block' }} />
            </a>
        );
    }
    return (
        <a href={m.AttachmentPath} target="_blank" rel="noreferrer"
           style={{ display: 'inline-flex', gap: 6, alignItems: 'center', marginTop: 4,
                    padding: '4px 8px', background: isMine ? 'rgba(255,255,255,0.15)' : '#f1f5f9',
                    borderRadius: 4, color: 'inherit', textDecoration: 'none', fontSize: '0.8rem' }}>
            <Paperclip size={12} /> {m.AttachmentName} <span style={{ opacity: 0.7 }}>· {fmtSize(m.AttachmentSize)}</span>
        </a>
    );
}

// ---------------------------------------------------------------------------
function NewChannelModal({ onClose, onCreated }) {
    const [name, setName] = useState('');
    const [description, setDescription] = useState('');
    const [kind, setKind] = useState('public');
    const [users, setUsers] = useState([]);
    const [q, setQ] = useState('');
    const [picked, setPicked] = useState(new Set());
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        axios.get(`${API}/users`).then(r => setUsers(r.data)).catch(() => setUsers([]));
    }, []);
    const filtered = useMemo(
        () => users.filter(u => !q.trim() || u.UserName.toLowerCase().includes(q.toLowerCase())),
        [users, q]
    );
    const toggle = (uid) => setPicked(p => {
        const n = new Set(p); if (n.has(uid)) n.delete(uid); else n.add(uid); return n;
    });

    const submit = async () => {
        if (!name.trim()) return;
        setSaving(true);
        try {
            const r = await axios.post(`${API}/channels`, {
                kind, name: name.trim(), description: description.trim() || null,
                memberUserIds: [...picked],
            });
            onCreated(r.data.ChannelID);
        } catch (e) { alert(e.response?.data?.error || 'Failed'); }
        finally { setSaving(false); }
    };

    return (
        <ModalShell title="New channel" onClose={onClose}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={{ fontSize: '0.75rem', color: '#475569' }}>Name
                    <input value={name} onChange={e => setName(e.target.value)} style={fieldStyle} placeholder="e.g. service-advisors" />
                </label>
                <label style={{ fontSize: '0.75rem', color: '#475569' }}>Description (optional)
                    <input value={description} onChange={e => setDescription(e.target.value)} style={fieldStyle} placeholder="Purpose of the channel" />
                </label>
                <div style={{ display: 'flex', gap: 12 }}>
                    <label><input type="radio" checked={kind==='public'} onChange={() => setKind('public')} /> Public</label>
                    <label><input type="radio" checked={kind==='private'} onChange={() => setKind('private')} /> Private (invite-only)</label>
                </div>
                <div>
                    <div style={{ fontSize: '0.75rem', color: '#475569', marginBottom: 4 }}>Add members ({picked.size} selected)</div>
                    <div style={{ position: 'relative' }}>
                        <Search size={12} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                        <input value={q} onChange={e => setQ(e.target.value)}
                               placeholder="Search users…" style={{ ...fieldStyle, paddingLeft: 26 }} />
                    </div>
                    <div style={{ maxHeight: 200, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 4, marginTop: 4 }}>
                        {filtered.map(u => (
                            <label key={u.UserId} style={{ display: 'flex', gap: 6, padding: '4px 8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                                <input type="checkbox" checked={picked.has(u.UserId)} onChange={() => toggle(u.UserId)} />
                                {u.UserName} <span style={{ color: '#94a3b8' }}>· {u.GroupTitle}</span>
                            </label>
                        ))}
                    </div>
                </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginTop: 12 }}>
                <button onClick={onClose} style={ghostBtn}>Cancel</button>
                <button onClick={submit} disabled={saving || !name.trim()} style={primaryBtn}>Create</button>
            </div>
        </ModalShell>
    );
}

function NewDMModal({ onClose, onCreated }) {
    const [users, setUsers] = useState([]);
    const [q, setQ] = useState('');
    useEffect(() => { axios.get(`${API}/users`).then(r => setUsers(r.data)).catch(() => setUsers([])); }, []);
    const filtered = useMemo(
        () => users.filter(u => !q.trim() || u.UserName.toLowerCase().includes(q.toLowerCase())),
        [users, q]
    );
    const pick = async (u) => {
        try {
            const r = await axios.post(`${API}/dm/${u.UserId}`);
            onCreated(r.data.ChannelID);
        } catch (e) { alert(e.response?.data?.error || 'Failed'); }
    };
    return (
        <ModalShell title="Start a direct message" onClose={onClose}>
            <div style={{ position: 'relative', marginBottom: 6 }}>
                <Search size={12} style={{ position: 'absolute', left: 8, top: 9, color: '#94a3b8' }} />
                <input value={q} onChange={e => setQ(e.target.value)}
                       placeholder="Search users…" style={{ ...fieldStyle, paddingLeft: 26 }} />
            </div>
            <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 4 }}>
                {filtered.map(u => (
                    <div key={u.UserId} onClick={() => pick(u)}
                         style={{ padding: '6px 10px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize: '0.9rem' }}>
                        {u.UserName} <span style={{ color: '#94a3b8', fontSize: '0.75rem' }}>· {u.GroupTitle}</span>
                    </div>
                ))}
            </div>
        </ModalShell>
    );
}

function ModalShell({ title, onClose, children }) {
    return (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
             onClick={onClose}>
            <div onClick={e => e.stopPropagation()}
                 style={{ background: 'white', borderRadius: 8, padding: 16, width: 420, maxWidth: '95vw' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div style={{ fontWeight: 700 }}>{title}</div>
                    <button onClick={onClose} style={ghostBtn}><X size={14} /></button>
                </div>
                {children}
            </div>
        </div>
    );
}

// --- Style tokens ---
const primaryBtn = {
    background: '#4f46e5', color: 'white', border: 'none', borderRadius: 4,
    padding: '4px 10px', fontSize: '0.78rem', display: 'inline-flex',
    alignItems: 'center', gap: 4, cursor: 'pointer',
};
const ghostBtn = {
    background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 4,
    padding: '4px 8px', fontSize: '0.78rem', display: 'inline-flex',
    alignItems: 'center', gap: 4, cursor: 'pointer', color: '#334155',
};
const fieldStyle = {
    width: '100%', padding: '6px 8px', border: '1px solid #cbd5e1',
    borderRadius: 4, fontSize: '0.85rem', boxSizing: 'border-box',
};
