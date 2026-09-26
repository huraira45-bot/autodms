/**
 * The bay camera watch link for this car.
 *
 * Owner ask 2026-09-26. The link is opened by the bay screen when work starts.
 * Streaming the camera down it and keeping the footage are a later job — so
 * this deliberately does not pretend otherwise: it says the camera is not
 * streaming yet, and does not offer to send the link to anyone.
 *
 * What it does give is the ability to see that a link exists and to kill one.
 * A link cannot be recalled once it has gone to the wrong person, so revoking
 * is the only remedy, and it is here from the start rather than added after
 * the first mistake.
 */
import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import { Video, Copy, Check, ShieldOff, Loader2 } from 'lucide-react';

const when = v => v ? new Date(v).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' }) : '';

export default function BayStreamLink({ jobCardId, apiBase = '/api/workshop', size = 'desk' }) {
    const big = size === 'tablet';
    const f = n => (big ? Math.round(n * 1.3) : n);

    const [link, setLink] = useState(undefined);   // undefined = loading, null = none
    const [copied, setCopied] = useState(false);
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const r = await axios.get(`${apiBase}/job-cards/${jobCardId}/stream-link`);
            setLink(r.data || null);
        } catch { setLink(null); }
    }, [apiBase, jobCardId]);

    useEffect(() => { load(); }, [load]);

    if (link === undefined || link === null) return null;

    // The server returns a path, not a full address: it cannot know which of
    // the workshop's addresses the customer reached it on. The browser can.
    const full = `${window.location.origin}${link.path}`;

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(full);
            setCopied(true);
            setTimeout(() => setCopied(false), 2500);
        } catch {
            // Clipboard is blocked on insecure origins; the text is on screen
            // and selectable, so this is a convenience, not the only way.
        }
    };

    const revoke = async () => {
        if (!window.confirm('Stop this link working? Anyone holding it loses access, and it cannot be undone.')) return;
        setBusy(true);
        try { await axios.post(`${apiBase}/job-cards/${jobCardId}/stream-link/revoke`, {}); await load(); }
        finally { setBusy(false); }
    };

    return (
        <div style={{ border: '1px solid #c8d4e4', borderRadius: 6, background: '#f7fafc',
                      padding: big ? 14 : 10, marginTop: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <Video size={f(15)} color="#1a3a6a" />
                <span style={{ fontSize: f(12), fontWeight: 700, color: '#1a3a6a' }}>Bay camera link</span>
                <span style={{ fontSize: f(11), color: '#a16207' }}>
                    not streaming yet — the camera is not connected to this link
                </span>
                <span style={{ marginLeft: 'auto', fontSize: f(11), color: '#64748b' }}>
                    {link.BayName ? `${link.BayName} · ` : ''}opened {when(link.CreatedAt)} · expires {when(link.ExpiresAt)}
                </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <code style={{ flex: '1 1 260px', minWidth: 0, fontSize: f(11.5), color: '#0f172a',
                               background: '#fff', border: '1px solid #dbe3ec', borderRadius: 4,
                               padding: '6px 9px', overflowWrap: 'anywhere' }}>
                    {full}
                </code>
                <button type="button" onClick={copy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: f(12),
                                 minHeight: big ? 48 : 30, padding: '0 12px', background: '#fff',
                                 border: '1px solid #1a3a6a', color: '#1a3a6a', borderRadius: 5, cursor: 'pointer' }}>
                    {copied ? <><Check size={f(13)} /> Copied</> : <><Copy size={f(13)} /> Copy</>}
                </button>
                <button type="button" onClick={revoke} disabled={busy}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: f(12),
                                 minHeight: big ? 48 : 30, padding: '0 12px', background: '#fff',
                                 border: '1px solid #fca5a5', color: '#dc2626', borderRadius: 5, cursor: 'pointer' }}>
                    {busy ? <Loader2 size={f(13)} className="animate-spin" /> : <ShieldOff size={f(13)} />} Stop it
                </button>
            </div>
        </div>
    );
}
