/**
 * ModuleLauncher — landing page for one top-level module group.
 * Renders a dense grid of ERP-style tiles, each linking to an accessible
 * child screen. Items are filtered against the current user's modules /
 * report permissions via getModuleActions(...).
 *
 * Empty-state: if the user has NO actions in the group at all, show a
 * short "no access" message instead of a blank grid.
 */
import React from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { getGroup, getModuleActions } from '../navigationConfig';
import { ErpControlPanel, ErpEmptyState } from '../components/erp';

export default function ModuleLauncher() {
    const { groupId } = useParams();
    const { hasModule, hasPermission } = useAuth();
    const navigate = useNavigate();
    const group = getGroup(groupId);

    if (!group) {
        return (
            <ErpEmptyState
                icon={Lock}
                title="Unknown module"
                message={`No module group with id "${groupId}".`}
                action={<Link to="/" className="btn">Back to Dashboard</Link>}
            />
        );
    }
    const Icon = group.icon;
    const items = getModuleActions(groupId, hasModule, hasPermission);

    if (items.length === 0) {
        return (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <ErpControlPanel title={group.label} subtitle={group.description}
                    actions={
                        <button className="btn" onClick={() => navigate('/')}>
                            <ChevronLeft size={14} /> Dashboard
                        </button>
                    } />
                <ErpEmptyState icon={Lock}
                    title="No access to this module"
                    message="Your role has no screens enabled in this module. Ask an admin to grant permissions under Admin → Role Permissions."
                />
            </div>
        );
    }

    // Group items by their `section` label so the launcher can render
    // sub-headings between clusters of related tiles (owner ask 2026-07-17).
    // Items without a section fall into "General" so nothing is dropped.
    // Preserves the order items appear in navigationConfig — first-seen wins.
    const sections = [];
    const sectionMap = new Map();
    for (const it of items) {
        const key = it.section || 'General';
        if (!sectionMap.has(key)) {
            const bucket = { name: key, items: [] };
            sectionMap.set(key, bucket);
            sections.push(bucket);
        }
        sectionMap.get(key).items.push(it);
    }
    const hasSections = sections.length > 1 || (sections.length === 1 && sections[0].name !== 'General');

    const renderTile = (it) => {
        const T = it.icon;
        // `newTab: true` on the nav entry opens the tile in a fresh window —
        // used for the public kiosk / big-screen displays where the operator
        // wants to keep their current session tab open. Falls back to a
        // regular in-app Link for everything else.
        if (it.newTab) {
            return (
                <a key={it.id} href={it.path} target="_blank" rel="noreferrer" className="module-tile">
                    <div className="module-tile-icn"><T size={18} /></div>
                    <div className="module-tile-body">
                        <div className="module-tile-title">{it.label}</div>
                        {it.description && (
                            <div className="module-tile-desc">{it.description}</div>
                        )}
                    </div>
                </a>
            );
        }
        return (
            <Link key={it.id} to={it.path} className="module-tile">
                <div className="module-tile-icn"><T size={18} /></div>
                <div className="module-tile-body">
                    <div className="module-tile-title">{it.label}</div>
                    {it.description && (
                        <div className="module-tile-desc">{it.description}</div>
                    )}
                </div>
            </Link>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <ErpControlPanel
                title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={16} color="var(--erp-brand)" /> {group.label}
                </span>}
                subtitle={group.description}
                actions={
                    <button className="btn" onClick={() => navigate('/')}>
                        <ChevronLeft size={14} /> Dashboard
                    </button>
                }
            />

            {hasSections
                ? sections.map(s => (
                    <div key={s.name} className="module-section">
                        <div className="module-section-title">{s.name}</div>
                        <div className="module-tile-grid">
                            {s.items.map(renderTile)}
                        </div>
                    </div>
                ))
                : (
                    <div className="module-tile-grid">
                        {items.map(renderTile)}
                    </div>
                )
            }

            <div className="hint" style={{ fontSize: 11, color: 'var(--erp-text-muted)' }}>
                {items.length} action{items.length === 1 ? '' : 's'} available
                {hasSections && ` across ${sections.length} section${sections.length === 1 ? '' : 's'}`}.
            </div>

            <style>{`
                .module-section {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }
                .module-section-title {
                    font-size: 11px;
                    font-weight: 700;
                    letter-spacing: 0.05em;
                    text-transform: uppercase;
                    color: var(--erp-text-muted);
                    padding: 8px 4px 2px 4px;
                    border-bottom: 1px solid var(--erp-border);
                    margin-bottom: 2px;
                }
                .module-tile-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 8px;
                    min-width: 0;
                }
                .module-tile {
                    display: flex;
                    gap: 10px;
                    align-items: flex-start;
                    padding: 10px 12px;
                    background: var(--erp-surface);
                    border: 1px solid var(--erp-border);
                    border-radius: 4px;
                    color: var(--erp-text);
                    text-decoration: none;
                    min-height: 62px;
                    box-shadow: var(--erp-shadow-sm);
                    transition: background 0.12s, border-color 0.12s;
                }
                .module-tile:hover {
                    background: #fafbfc;
                    border-color: var(--erp-brand);
                }
                .module-tile-icn {
                    width: 32px; height: 32px;
                    border-radius: 4px;
                    background: var(--erp-brand-soft);
                    color: var(--erp-brand);
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .module-tile-body { min-width: 0; }
                .module-tile-title {
                    font-size: 13px;
                    font-weight: 600;
                    color: var(--erp-text);
                    line-height: 1.2;
                }
                .module-tile-desc {
                    font-size: 11px;
                    color: var(--erp-text-muted);
                    line-height: 1.3;
                    margin-top: 2px;
                }
            `}</style>
        </div>
    );
}
