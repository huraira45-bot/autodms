/**
 * SearchableSelect — type-ahead dropdown for picking from long lists
 * (GL accounts, items, parties, etc.).
 *
 * Props:
 *   value      — currently-selected id (or '' for none)
 *   onChange   — (id) => void, called with the picked option's id (or '' when cleared)
 *   options    — array of { id, label, group?, sub? }
 *                 label   = main text shown
 *                 group   = optgroup label, for visual sectioning
 *                 sub     = small grey text below label (e.g. "(group)" / GL code)
 *   placeholder — text shown when no value selected
 *   disabled
 *
 * Behaviour:
 *   - Closed state shows the currently selected label (or placeholder).
 *   - Click → opens a popover with a search box + filtered options.
 *   - Typing filters across `label`, `sub`, and `group`.
 *   - Picking an option fires onChange(id) and closes.
 *   - Click outside or Escape closes without changing.
 */
import { useState, useRef, useEffect, useMemo } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableSelect({
    value, onChange, options = [], placeholder = '— Pick one —', disabled = false,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const wrapRef = useRef(null);
    const inputRef = useRef(null);

    const selected = useMemo(
        () => options.find(o => String(o.id) === String(value)) || null,
        [options, value]
    );

    // Close when clicking outside or pressing Escape
    useEffect(() => {
        if (!open) return;
        const onDocClick = (e) => {
            if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
        };
        const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Focus the search box when opening
    useEffect(() => { if (open) setTimeout(() => inputRef.current?.focus(), 10); }, [open]);

    const filtered = useMemo(() => {
        if (!query.trim()) return options;
        const q = query.toLowerCase();
        return options.filter(o =>
            (o.label || '').toLowerCase().includes(q) ||
            (o.sub   || '').toLowerCase().includes(q) ||
            (o.group || '').toLowerCase().includes(q)
        );
    }, [query, options]);

    // Group filtered options by `group` for sectioned display
    const sections = useMemo(() => {
        const map = new Map();
        for (const o of filtered) {
            const k = o.group || '';
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(o);
        }
        return Array.from(map.entries());
    }, [filtered]);

    return (
        <div ref={wrapRef} style={{ position: 'relative' }}>
            <button type="button" disabled={disabled}
                onClick={() => !disabled && setOpen(o => !o)}
                style={{
                    width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
                    borderRadius: 6, background: disabled ? '#f1f5f9' : 'white',
                    fontSize: '0.875rem', textAlign: 'left',
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    cursor: disabled ? 'not-allowed' : 'pointer',
                }}>
                <span style={{
                    flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    color: selected ? '#0f172a' : '#94a3b8',
                }}>
                    {selected ? (
                        <>
                            <span style={{ fontFamily: 'monospace', color: '#64748b', marginRight: 6 }}>{selected.sub}</span>
                            {selected.label}
                        </>
                    ) : placeholder}
                </span>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    {selected && !disabled && (
                        <X size={14} color="#94a3b8"
                           onClick={e => { e.stopPropagation(); onChange(''); }} />
                    )}
                    <ChevronDown size={16} color="#94a3b8" />
                </div>
            </button>

            {open && (
                <div style={{
                    position: 'absolute', top: 'calc(100% + 4px)', left: 0, right: 0, zIndex: 1100,
                    background: 'white', border: '1px solid #cbd5e1', borderRadius: 6,
                    boxShadow: '0 10px 30px rgba(0,0,0,0.12)', maxHeight: 320, overflowY: 'auto',
                }}>
                    <div style={{
                        position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '1px solid #e2e8f0',
                        padding: 6, display: 'flex', alignItems: 'center', gap: 6,
                    }}>
                        <Search size={14} color="#94a3b8" />
                        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
                            placeholder="Type to filter…"
                            style={{ flex: 1, border: 'none', outline: 'none', fontSize: '0.85rem', background: 'transparent' }} />
                    </div>

                    {filtered.length === 0 && (
                        <div style={{ padding: 14, fontSize: '0.85rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                            No matches.
                        </div>
                    )}

                    {sections.map(([groupName, opts]) => (
                        <div key={groupName || 'none'}>
                            {groupName && (
                                <div style={{
                                    padding: '4px 10px', background: '#eff6ff', color: '#1e40af',
                                    fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
                                }}>{groupName}</div>
                            )}
                            {opts.map(o => {
                                const isSel = String(o.id) === String(value);
                                return (
                                    <div key={o.id}
                                        onClick={() => { onChange(o.id); setOpen(false); setQuery(''); }}
                                        style={{
                                            padding: '6px 10px', cursor: 'pointer',
                                            background: isSel ? '#eff6ff' : 'white',
                                            borderBottom: '1px solid #f1f5f9',
                                            fontSize: '0.85rem',
                                            display: 'flex', alignItems: 'center', gap: 6,
                                        }}
                                        onMouseEnter={e => e.currentTarget.style.background = isSel ? '#dbeafe' : '#f8fafc'}
                                        onMouseLeave={e => e.currentTarget.style.background = isSel ? '#eff6ff' : 'white'}>
                                        {o.sub && <code style={{ color: '#64748b', fontSize: '0.78rem' }}>{o.sub}</code>}
                                        <span style={{ flex: 1 }}>{o.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
