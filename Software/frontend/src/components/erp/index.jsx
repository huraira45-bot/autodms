/**
 * ERP primitives — Odoo-inspired desktop ERP components.
 * Owner ask 2026-07-03: dense desktop shell (target 1366×768).
 * Every component is style-agnostic — visual language lives in
 * index.css under the .erp-* classes.
 */
import React, { useState, useMemo, useCallback } from 'react';
import {
    Search, X, ChevronDown, Filter, Layers, Star, LayoutList, LayoutGrid,
    Loader2, Inbox, MessageSquare,
} from 'lucide-react';

/* -----------------------------------------------------------
   Control panel — the toolbar at the top of every list/report.
   Composes a title, search bar, chip filters, action buttons.
   ----------------------------------------------------------- */
export function ErpControlPanel({
    title, subtitle, children, actions,
}) {
    return (
        <div className="erp-control-panel">
            {title && (
                <div>
                    <div className="title">{title}</div>
                    {subtitle && <div className="subtitle">{subtitle}</div>}
                </div>
            )}
            <div className="row" style={{ marginLeft: 'auto', flex: title ? undefined : 1 }}>{children}</div>
            {actions && <div className="row">{actions}</div>}
        </div>
    );
}

/* -----------------------------------------------------------
   Search bar (uncontrolled input inside .erp-search-input)
   ----------------------------------------------------------- */
export function ErpSearchBar({ value, onChange, placeholder = 'Search…', autoFocus = false, width }) {
    return (
        <div className="erp-search-input" style={width ? { minWidth: width } : undefined}>
            <Search size={14} />
            <input
                type="text"
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                placeholder={placeholder}
                autoFocus={autoFocus}
            />
            {value && (
                <X size={14} style={{ cursor: 'pointer', color: '#9aa1ab' }}
                   onClick={() => onChange('')} />
            )}
        </div>
    );
}

/* -----------------------------------------------------------
   Filter chip — click to toggle a filter; shows count if active.
   ----------------------------------------------------------- */
export function ErpFilterChip({ active, label, count, onClick, onClear }) {
    return (
        <button type="button" className={`erp-chip${active ? ' active' : ''}`} onClick={onClick}>
            {label}
            {count != null && <span style={{ opacity: 0.7 }}>({count})</span>}
            {active && onClear && (
                <span className="x" onClick={(e) => { e.stopPropagation(); onClear(); }}>
                    <X size={12} />
                </span>
            )}
        </button>
    );
}

/* -----------------------------------------------------------
   Filter dropdown — click to open a menu of exclusive options.
   items: [{ id, label }]. value=id (or null).
   ----------------------------------------------------------- */
export function ErpFilterDropdown({ label, icon: Icon = Filter, items, value, onChange }) {
    const [open, setOpen] = useState(false);
    const selected = items.find(i => String(i.id) === String(value));
    return (
        <div style={{ position: 'relative' }}>
            <button type="button" className={`erp-chip${value ? ' active' : ''}`}
                onClick={() => setOpen(o => !o)}>
                <Icon size={12} />
                {selected ? selected.label : label}
                <ChevronDown size={12} />
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 41,
                        background: 'white', border: '1px solid var(--erp-border)',
                        borderRadius: 'var(--erp-radius)', boxShadow: 'var(--erp-shadow-lg)',
                        minWidth: 200, padding: 4, maxHeight: 320, overflowY: 'auto',
                    }}>
                        <MenuItem selected={value === ''} label={`All ${label}`} onClick={() => { onChange(''); setOpen(false); }} />
                        {items.map(i => (
                            <MenuItem key={i.id} selected={String(i.id) === String(value)} label={i.label}
                                onClick={() => { onChange(i.id); setOpen(false); }} />
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

/* Group-By dropdown — identical UX but semantically different label. */
export function ErpGroupByDropdown({ items, value, onChange }) {
    return <ErpFilterDropdown icon={Layers} label="Group By" items={items} value={value} onChange={onChange} />;
}

/* Favourites — for now a stub that lets the user save the current filters. */
export function ErpFavoritesDropdown({ items = [], onPick, onSave }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <button type="button" className="erp-chip" onClick={() => setOpen(o => !o)}>
                <Star size={12} /> Favorites <ChevronDown size={12} />
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 41,
                        background: 'white', border: '1px solid var(--erp-border)',
                        borderRadius: 'var(--erp-radius)', boxShadow: 'var(--erp-shadow-lg)',
                        minWidth: 220, padding: 4,
                    }}>
                        {items.length === 0 && (
                            <div style={{ padding: '8px 10px', fontSize: 12, color: 'var(--erp-text-muted)', fontStyle: 'italic' }}>
                                No saved favorites yet.
                            </div>
                        )}
                        {items.map((f, i) => (
                            <MenuItem key={i} label={f.label} onClick={() => { onPick?.(f); setOpen(false); }} />
                        ))}
                        {onSave && (
                            <>
                                <div style={{ borderTop: '1px solid var(--erp-border)', margin: '4px 0' }} />
                                <MenuItem label="Save current filters…" onClick={() => { onSave(); setOpen(false); }} />
                            </>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function MenuItem({ label, selected, onClick }) {
    return (
        <div onClick={onClick} style={{
            padding: '6px 10px', fontSize: 12.5, borderRadius: 4,
            cursor: 'pointer',
            background: selected ? 'var(--erp-brand-soft)' : 'transparent',
            color: selected ? 'var(--erp-brand)' : 'var(--erp-text)',
            fontWeight: selected ? 600 : 500,
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--erp-surface-hover)'; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}>
            {label}
        </div>
    );
}

/* -----------------------------------------------------------
   View switcher — List | Kanban toggle.
   ----------------------------------------------------------- */
export function ErpViewSwitcher({ value, onChange, views = [
    { id: 'list',   icon: LayoutList },
    { id: 'kanban', icon: LayoutGrid },
] }) {
    return (
        <div style={{ display: 'inline-flex', border: '1px solid var(--erp-border-strong)', borderRadius: 'var(--erp-radius)', overflow: 'hidden' }}>
            {views.map(v => {
                const Icon = v.icon;
                const active = value === v.id;
                return (
                    <button key={v.id} type="button" onClick={() => onChange(v.id)}
                        style={{
                            padding: '4px 8px', height: 28,
                            background: active ? 'var(--erp-brand)' : 'var(--erp-surface)',
                            color: active ? 'white' : 'var(--erp-text-muted)',
                            border: 'none', cursor: 'pointer',
                            display: 'inline-flex', alignItems: 'center',
                        }}>
                        <Icon size={14} />
                    </button>
                );
            })}
        </div>
    );
}

/* -----------------------------------------------------------
   List view — Odoo-style dense table with header + footer.
   columns: [{ key, label, align, width, render(row) }]
   ----------------------------------------------------------- */
export function ErpListView({
    columns, rows, onRowClick, emptyLabel = 'No records', selectedId, rowKey = 'id',
    pageSize, footerLeft, footerRight,
}) {
    return (
        <div className="erp-list">
            <div style={{ overflowX: 'auto' }}>
                <table>
                    <thead>
                        <tr>
                            {columns.map(c => (
                                <th key={c.key} className={c.align === 'right' ? 'num' : ''} style={c.width ? { width: c.width } : undefined}>
                                    {c.label}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {rows.length === 0 ? (
                            <tr><td colSpan={columns.length}><div className="list-empty"><Inbox size={22} style={{ marginBottom: 6, opacity: 0.4 }} /><div>{emptyLabel}</div></div></td></tr>
                        ) : rows.map(r => (
                            <tr key={r[rowKey]}
                                className={selectedId != null && String(r[rowKey]) === String(selectedId) ? 'selected' : ''}
                                onClick={onRowClick ? () => onRowClick(r) : undefined}>
                                {columns.map(c => (
                                    <td key={c.key} className={c.align === 'right' ? 'num' : ''}>
                                        {c.render ? c.render(r) : r[c.key]}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            {(footerLeft || footerRight || pageSize != null) && (
                <div className="erp-list-footer">
                    <div>{footerLeft ?? `${rows.length} record${rows.length === 1 ? '' : 's'}`}</div>
                    <div>{footerRight}</div>
                </div>
            )}
        </div>
    );
}

/* -----------------------------------------------------------
   Form sheet — record surface with title, actions, body.
   ----------------------------------------------------------- */
export function ErpFormSheet({ title, subtitle, statusBar, smartButtons, actions, children }) {
    return (
        <div className="erp-form-sheet">
            {statusBar}
            {smartButtons && <div className="erp-smart-buttons">{smartButtons}</div>}
            <div className="erp-form-sheet-header">
                <div style={{ flex: 1 }}>
                    <div className="fs-title">{title}</div>
                    {subtitle && <div className="fs-subtitle">{subtitle}</div>}
                </div>
                {actions && <div className="erp-form-sheet-actions">{actions}</div>}
            </div>
            <div className="erp-form-sheet-body">{children}</div>
        </div>
    );
}

/* -----------------------------------------------------------
   Status Bar — Draft → Posted flow arrows.
   steps: [{ id, label }]; current is the id.
   ----------------------------------------------------------- */
export function ErpStatusBar({ steps, current }) {
    const idx = steps.findIndex(s => s.id === current);
    return (
        <div className="erp-status-bar">
            {steps.map((s, i) => {
                const cls = i < idx ? 'done' : i === idx ? 'active' : '';
                return <span key={s.id} className={`erp-status-step ${cls}`}>{s.label}</span>;
            })}
        </div>
    );
}

/* -----------------------------------------------------------
   Smart Button — Odoo-style stat button on top of a record.
   ----------------------------------------------------------- */
export function ErpSmartButton({ icon: Icon, value, label, onClick, disabled }) {
    return (
        <button type="button" className="erp-smart-btn"
            onClick={onClick} disabled={disabled}
            style={disabled ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}>
            <span className="val">{value}</span>
            <span className="lbl">{Icon && <Icon size={11} />}{label}</span>
        </button>
    );
}

/* -----------------------------------------------------------
   Notebook Tabs — bottom of a form sheet, per-tab body.
   tabs: [{ id, label, count?, icon?, content: ReactNode }]
   ----------------------------------------------------------- */
export function ErpNotebookTabs({ tabs, initial }) {
    const [active, setActive] = useState(initial ?? tabs[0]?.id);
    const cur = tabs.find(t => t.id === active) || tabs[0];
    if (!cur) return null;
    return (
        <div className="erp-notebook">
            <div className="erp-notebook-tabs">
                {tabs.map(t => {
                    const Ic = t.icon;
                    return (
                        <button key={t.id} type="button"
                            className={`erp-notebook-tab${t.id === active ? ' active' : ''}`}
                            onClick={() => setActive(t.id)}>
                            {Ic && <Ic size={13} />}
                            {t.label}
                            {t.count != null && <span className="count">{t.count}</span>}
                        </button>
                    );
                })}
            </div>
            <div className="erp-notebook-body">{cur.content}</div>
        </div>
    );
}

/* -----------------------------------------------------------
   Chatter Panel — right-side timeline of a record.
   messages: [{ id, kind, author, at, body }]
   ----------------------------------------------------------- */
export function ErpChatterPanel({ messages = [], onSend, canSend = false }) {
    const [draft, setDraft] = useState('');
    return (
        <div className="erp-panel" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div className="erp-panel-title">
                <MessageSquare size={14} /> Activity
                <span className="count">{messages.length}</span>
            </div>
            {canSend && (
                <div style={{ display: 'flex', gap: 6 }}>
                    <input value={draft} onChange={e => setDraft(e.target.value)}
                        placeholder="Log a note…"
                        style={{ flex: 1, border: '1px solid var(--erp-border)', borderRadius: 4, padding: '4px 8px', fontSize: 12.5 }} />
                    <button type="button" className="erp-btn erp-btn-sm erp-btn-primary"
                        onClick={() => { if (draft.trim()) { onSend?.(draft); setDraft(''); } }}>
                        Log
                    </button>
                </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 340, overflowY: 'auto' }}>
                {messages.length === 0 && (
                    <div style={{ fontSize: 12, color: 'var(--erp-text-muted)', fontStyle: 'italic' }}>
                        No activity logged yet.
                    </div>
                )}
                {messages.map(m => (
                    <div key={m.id} style={{ borderLeft: '2px solid var(--erp-border)', paddingLeft: 8, fontSize: 12 }}>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
                            <strong style={{ color: 'var(--erp-text)' }}>{m.author || 'System'}</strong>
                            <span style={{ color: 'var(--erp-text-soft)', fontSize: 11 }}>{m.at || ''}</span>
                            {m.kind && <span className="erp-pill muted">{m.kind}</span>}
                        </div>
                        <div style={{ color: 'var(--erp-text)', marginTop: 2 }}>{m.body}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}

/* -----------------------------------------------------------
   Action Menu — three-dots menu on records.
   ----------------------------------------------------------- */
export function ErpActionMenu({ items }) {
    const [open, setOpen] = useState(false);
    return (
        <div style={{ position: 'relative' }}>
            <button type="button" className="erp-btn-ghost erp-btn erp-btn-sm" onClick={() => setOpen(o => !o)}>
                ⋯
            </button>
            {open && (
                <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setOpen(false)} />
                    <div style={{
                        position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 41,
                        background: 'white', border: '1px solid var(--erp-border)',
                        borderRadius: 'var(--erp-radius)', boxShadow: 'var(--erp-shadow-lg)',
                        minWidth: 180, padding: 4,
                    }}>
                        {items.map((it, i) => it.divider
                            ? <div key={i} style={{ borderTop: '1px solid var(--erp-border)', margin: '4px 0' }} />
                            : (
                                <MenuItem key={i} label={it.label} onClick={() => { it.onClick?.(); setOpen(false); }} />
                            )
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

/* -----------------------------------------------------------
   Empty state
   ----------------------------------------------------------- */
export function ErpEmptyState({ icon: Icon = Inbox, title, message, action }) {
    return (
        <div className="erp-empty">
            <div className="em-icon"><Icon size={32} strokeWidth={1.2} /></div>
            {title && <div className="em-title">{title}</div>}
            {message && <div>{message}</div>}
            {action && <div style={{ marginTop: 12 }}>{action}</div>}
        </div>
    );
}

/* -----------------------------------------------------------
   Loading state
   ----------------------------------------------------------- */
export function ErpLoadingState({ message = 'Loading…' }) {
    return (
        <div className="erp-empty">
            <Loader2 size={22} className="animate-spin" style={{ marginBottom: 6, color: 'var(--erp-brand)' }} />
            <div>{message}</div>
        </div>
    );
}

/* -----------------------------------------------------------
   Status pill — small colored badge.
   ----------------------------------------------------------- */
export function ErpStatusPill({ tone = 'muted', icon: Icon, children }) {
    return (
        <span className={`erp-pill ${tone}`}>
            {Icon && <Icon size={11} />}
            {children}
        </span>
    );
}

/* -----------------------------------------------------------
   Field row — used inside erp-form-sheet-body.
   ----------------------------------------------------------- */
export function ErpField({ label, children, width }) {
    return (
        <div className="erp-field" style={width ? { gridColumn: `span ${width}` } : undefined}>
            <div className="erp-field-label">{label}</div>
            <div className="erp-field-value">{children}</div>
        </div>
    );
}

/* Panel primitive — plain card with a title bar. */
export function ErpPanel({ title, action, children, style }) {
    return (
        <div className="erp-panel" style={style}>
            {title && (
                <div className="erp-panel-title">
                    {title}
                    {action && <span style={{ marginLeft: 'auto' }}>{action}</span>}
                </div>
            )}
            {children}
        </div>
    );
}
