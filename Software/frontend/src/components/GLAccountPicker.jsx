/**
 * Searchable GL-account picker.
 *
 * Replaces the manual "type the GLCAID number" anti-pattern. Hits
 * /api/accounts/coa with parentCode + search params and shows a dropdown
 * of matching leaves. On select, calls onChange(GLCAID, account).
 *
 * Props:
 *   value       — currently-selected GLCAID (number) or '' / null
 *   onChange    — (glcaid, accountRow) => void; glcaid is null when cleared
 *   parentCode  — restrict to leaves under this GLCode prefix (e.g. '102004')
 *   placeholder — input placeholder text
 *   disabled    — readonly
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { Search, X, ChevronDown } from 'lucide-react';

export default function GLAccountPicker({ value, onChange, parentCode, placeholder = 'Search account by code or name…', disabled = false }) {
    const [open, setOpen]         = useState(false);
    const [query, setQuery]       = useState('');
    const [results, setResults]   = useState([]);
    const [picked, setPicked]     = useState(null);   // { GLCAID, GLCode, GLTitle }
    const [loading, setLoading]   = useState(false);
    const boxRef = useRef(null);

    // Resolve the currently-selected GLCAID into a display row whenever value changes
    useEffect(() => {
        if (!value) { setPicked(null); return; }
        if (picked?.GLCAID === Number(value)) return;
        axios.get('/api/accounts/coa', { params: { parentCode } })
            .then(r => {
                const hit = (r.data || []).find(a => a.GLCAID === Number(value));
                if (hit) setPicked(hit);
            })
            .catch(() => {});
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value, parentCode]);

    // Debounced search whenever query changes (only while dropdown is open)
    useEffect(() => {
        if (!open) return;
        const t = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await axios.get('/api/accounts/coa', {
                    params: { parentCode, search: query || undefined },
                });
                // Only leaves (not parent nodes)
                setResults((r.data || []).filter(a => !a.isParent).slice(0, 50));
            } catch { setResults([]); }
            setLoading(false);
        }, 200);
        return () => clearTimeout(t);
    }, [query, open, parentCode]);

    // Click outside → close
    useEffect(() => {
        const handler = (e) => {
            if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const select = (a) => {
        setPicked(a);
        onChange?.(a.GLCAID, a);
        setOpen(false);
        setQuery('');
    };

    const clear = (e) => {
        e.stopPropagation();
        setPicked(null);
        onChange?.(null, null);
        setQuery('');
    };

    return (
        <div ref={boxRef} style={{ position: 'relative', width: '100%' }}>
            <div
                onClick={() => !disabled && setOpen(v => !v)}
                style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: 4,
                    background: disabled ? '#f1f5f9' : 'white',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                    minHeight: 30,
                }}>
                <Search size={13} color="#94a3b8" />
                {picked ? (
                    <>
                        <span style={{ fontFamily: 'monospace', color: '#1e40af', fontSize: '0.78rem' }}>{picked.GLCode}</span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked.GLTitle}</span>
                        {!disabled && <button type="button" onClick={clear} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 0 }}>
                            <X size={13} />
                        </button>}
                    </>
                ) : (
                    <span style={{ flex: 1, color: '#94a3b8', fontSize: '0.82rem' }}>{placeholder}</span>
                )}
                <ChevronDown size={13} color="#94a3b8" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </div>

            {open && !disabled && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 4,
                    boxShadow: '0 8px 20px rgba(15,23,42,0.12)', zIndex: 1000,
                    maxHeight: 280, overflowY: 'auto',
                }}>
                    <div style={{ padding: 6, borderBottom: '1px solid #e2e8f0', position: 'sticky', top: 0, background: 'white' }}>
                        <input
                            autoFocus
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Type code or name…"
                            style={{ width: '100%', padding: '4px 6px', border: '1px solid #cbd5e1', borderRadius: 3, fontSize: '0.82rem' }}
                        />
                    </div>
                    {loading && <div style={{ padding: 10, color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>Searching…</div>}
                    {!loading && results.length === 0 && (
                        <div style={{ padding: 10, color: '#94a3b8', fontSize: '0.78rem', textAlign: 'center' }}>
                            No accounts found{parentCode ? ` under ${parentCode}` : ''}.
                        </div>
                    )}
                    {results.map(a => (
                        <div key={a.GLCAID} onClick={() => select(a)}
                            style={{
                                padding: '6px 10px', cursor: 'pointer',
                                borderBottom: '1px solid #f1f5f9', fontSize: '0.82rem',
                                display: 'flex', alignItems: 'center', gap: 8,
                            }}
                            onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                            onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                            <span style={{ fontFamily: 'monospace', color: '#1e40af', minWidth: 75 }}>{a.GLCode}</span>
                            <span style={{ flex: 1 }}>{a.GLTitle}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
