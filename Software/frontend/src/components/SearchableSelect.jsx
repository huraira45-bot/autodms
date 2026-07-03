/**
 * SearchableSelect — click to open a centered modal picker for large
 * dynamic lists (parts, parties, GL accounts, employees, etc.).
 *
 * Owner ask 2026-07-03: dropdown-style pickers were cramped once lists
 * exceeded a few dozen rows. Replaced the inline popover with a
 * full-screen modal so the search input + result list get real estate.
 *
 * Public API is unchanged — every existing call site keeps working.
 *
 * Props:
 *   value       — currently-selected id (or '' for none)
 *   onChange    — (id) => void, called with the picked option's id ('' to clear)
 *   options     — array of { id, label, group?, sub? }
 *                   label  = main text
 *                   group  = section header shown above rows
 *                   sub    = small monospace prefix (part code / GL code)
 *   placeholder — text shown when no value selected
 *   disabled
 *   title       — optional heading for the modal (defaults to placeholder)
 *
 * Behaviour:
 *   - Closed: renders a button with the selected label (or placeholder).
 *   - Click / Enter / Space opens the modal.
 *   - Auto-focuses the search input; Esc, backdrop click, or ✕ closes.
 *   - Enter picks the top match; ↑/↓ move highlight; Enter picks.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

export default function SearchableSelect({
    value, onChange, options = [], placeholder = '— Pick one —', disabled = false, title,
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [hi, setHi] = useState(0);
    const inputRef = useRef(null);
    const listRef = useRef(null);

    const selected = useMemo(
        () => options.find(o => String(o.id) === String(value)) || null,
        [options, value]
    );

    const openModal = useCallback(() => {
        if (disabled) return;
        setQuery('');
        setHi(0);
        setOpen(true);
    }, [disabled]);

    const closeModal = useCallback(() => {
        setOpen(false);
    }, []);

    // ── Filter + section ─────────────────────────────────────────────
    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return options;
        return options.filter(o =>
            (o.label || '').toLowerCase().includes(q) ||
            (o.sub   || '').toLowerCase().includes(q) ||
            (o.group || '').toLowerCase().includes(q)
        );
    }, [query, options]);

    const sections = useMemo(() => {
        const map = new Map();
        for (const o of filtered) {
            const k = o.group || '';
            if (!map.has(k)) map.set(k, []);
            map.get(k).push(o);
        }
        return Array.from(map.entries());
    }, [filtered]);

    // ── Modal lifecycle: focus, Esc, backdrop click, body scroll lock ──
    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        const t = setTimeout(() => inputRef.current?.focus(), 20);
        const onKey = (e) => {
            if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
            else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHi(h => Math.min(h + 1, filtered.length - 1));
            }
            else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHi(h => Math.max(h - 1, 0));
            }
            else if (e.key === 'Enter') {
                e.preventDefault();
                const pick = filtered[hi];
                if (pick) {
                    onChange(pick.id);
                    closeModal();
                }
            }
        };
        document.addEventListener('keydown', onKey);
        return () => {
            document.body.style.overflow = prevOverflow;
            document.removeEventListener('keydown', onKey);
            clearTimeout(t);
        };
    }, [open, filtered, hi, onChange, closeModal]);

    // Reset highlight when filtered list shrinks below current highlight
    useEffect(() => {
        if (hi >= filtered.length) setHi(0);
    }, [filtered.length, hi]);

    // Keep the highlighted row in view as user arrows through the list.
    useEffect(() => {
        if (!open) return;
        const node = listRef.current?.querySelector(`[data-hi="${hi}"]`);
        node?.scrollIntoView({ block: 'nearest' });
    }, [hi, open]);

    // ── Trigger button (closed state) ────────────────────────────────
    const trigger = (
        <button type="button" disabled={disabled}
            onClick={openModal}
            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(); } }}
            style={{
                width: '100%', padding: '8px 10px', border: '1px solid #cbd5e1',
                borderRadius: 6, background: disabled ? '#f1f5f9' : 'white',
                fontSize: '0.875rem', textAlign: 'left',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                cursor: disabled ? 'not-allowed' : 'pointer',
                minHeight: 38,
            }}>
            <span style={{
                flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                color: selected ? '#0f172a' : '#94a3b8',
            }}>
                {selected ? (
                    <>
                        {selected.sub && <span style={{ fontFamily: 'monospace', color: '#64748b', marginRight: 6 }}>{selected.sub}</span>}
                        {selected.label}
                    </>
                ) : placeholder}
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {selected && !disabled && (
                    <X size={14} color="#94a3b8" role="button" title="Clear"
                       onClick={e => { e.stopPropagation(); onChange(''); }} />
                )}
                <ChevronDown size={16} color="#94a3b8" />
            </span>
        </button>
    );

    if (!open) return trigger;

    // ── Modal (open state) ───────────────────────────────────────────
    let rowIdx = -1;   // running index so hi/arrow keys line up with rendered rows
    return (
        <>
            {trigger}
            <div style={styles.backdrop} onMouseDown={closeModal}>
                <div style={styles.dialog} onMouseDown={e => e.stopPropagation()} role="dialog" aria-modal="true">
                    <div style={styles.header}>
                        <div style={{ fontWeight: 700, fontSize: '0.95rem', color: '#0f172a' }}>
                            {title || placeholder}
                        </div>
                        <button type="button" onClick={closeModal}
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 6, color: '#64748b' }}
                            aria-label="Close">
                            <X size={18} />
                        </button>
                    </div>

                    <div style={styles.searchRow}>
                        <Search size={16} color="#94a3b8" />
                        <input ref={inputRef} value={query}
                            onChange={e => { setQuery(e.target.value); setHi(0); }}
                            placeholder="Type to search…"
                            style={styles.searchInput} />
                        <span style={{ fontSize: 11, color: '#94a3b8', whiteSpace: 'nowrap' }}>
                            {filtered.length} of {options.length}
                        </span>
                    </div>

                    <div ref={listRef} style={styles.list}>
                        {filtered.length === 0 && (
                            <div style={{ padding: 24, fontSize: '0.9rem', color: '#94a3b8', fontStyle: 'italic', textAlign: 'center' }}>
                                No matches.
                            </div>
                        )}

                        {sections.map(([groupName, opts]) => (
                            <div key={groupName || '_'}>
                                {groupName && (
                                    <div style={styles.groupHead}>{groupName}</div>
                                )}
                                {opts.map((o) => {
                                    rowIdx += 1;
                                    const isSel = String(o.id) === String(value);
                                    const isHi  = rowIdx === hi;
                                    return (
                                        <div key={o.id}
                                            data-hi={rowIdx}
                                            onMouseEnter={() => setHi(rowIdx)}
                                            onClick={() => { onChange(o.id); closeModal(); }}
                                            style={{
                                                ...styles.row,
                                                background: isSel ? '#eff6ff' : (isHi ? '#f1f5f9' : 'white'),
                                                fontWeight: isSel ? 600 : 400,
                                            }}>
                                            {o.sub && <code style={{ color: '#64748b', fontSize: '0.8rem' }}>{o.sub}</code>}
                                            <span style={{ flex: 1 }}>{o.label}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div style={styles.footer}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>↑ ↓ move · Enter pick · Esc close</span>
                        {selected && (
                            <button type="button" onClick={() => { onChange(''); closeModal(); }}
                                style={{ background: 'transparent', border: '1px solid #cbd5e1', borderRadius: 6, padding: '6px 12px', fontSize: 12, cursor: 'pointer', color: '#475569' }}>
                                Clear selection
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </>
    );
}

const styles = {
    backdrop: {
        position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1200, padding: 20,
    },
    dialog: {
        background: '#fff', width: '100%', maxWidth: 640, maxHeight: '85vh',
        borderRadius: 12, boxShadow: '0 25px 60px rgba(0,0,0,0.3)',
        display: 'flex', flexDirection: 'column', overflow: 'hidden',
    },
    header: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 18px', borderBottom: '1px solid #e2e8f0',
    },
    searchRow: {
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: '#f8fafc',
    },
    searchInput: {
        flex: 1, border: 'none', outline: 'none', fontSize: '0.95rem', background: 'transparent',
    },
    list: {
        flex: 1, overflowY: 'auto', minHeight: 0,
    },
    groupHead: {
        padding: '6px 14px', background: '#eff6ff', color: '#1e40af',
        fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase',
        position: 'sticky', top: 0,
    },
    row: {
        padding: '10px 14px', cursor: 'pointer',
        borderBottom: '1px solid #f1f5f9',
        fontSize: '0.9rem', color: '#0f172a',
        display: 'flex', alignItems: 'center', gap: 8,
    },
    footer: {
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc',
    },
};
