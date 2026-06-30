import { Search } from 'lucide-react';

export function PageHeader({ icon: Icon, eyebrow, title, subtitle, actions, meta }) {
    return (
        <div className="ux-page-header">
            <div className="ux-page-title-block">
                {eyebrow && <p className="eyebrow">{eyebrow}</p>}
                <div className="ux-page-title-row">
                    {Icon && <span className="ux-page-icon"><Icon size={24} /></span>}
                    <h1 className="page-title">{title}</h1>
                </div>
                {subtitle && <p className="page-subtitle">{subtitle}</p>}
                {meta && <div className="ux-page-meta">{meta}</div>}
            </div>
            {actions && <div className="ux-page-actions">{actions}</div>}
        </div>
    );
}

export function FilterBar({ children, resultLabel }) {
    return (
        <div className="ux-filter-bar">
            <div className="ux-filter-controls">{children}</div>
            {resultLabel && <div className="ux-result-count">{resultLabel}</div>}
        </div>
    );
}

export function SearchField({ value, onChange, placeholder = 'Search...', width = 300 }) {
    return (
        <label className="ux-search-field" style={{ '--search-width': `${width}px` }}>
            <Search size={16} />
            <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
        </label>
    );
}

export function EmptyState({ icon: Icon, title, message, action }) {
    return (
        <div className="empty-state">
            {Icon && <Icon size={30} />}
            <strong>{title}</strong>
            {message && <span>{message}</span>}
            {action && <div className="empty-action">{action}</div>}
        </div>
    );
}

export function StatusPill({ children, tone = 'slate' }) {
    return <span className={`status-pill tone-${tone}`}>{children}</span>;
}

export function DataCard({ children, className = '' }) {
    return <div className={`data-card ${className}`}>{children}</div>;
}
