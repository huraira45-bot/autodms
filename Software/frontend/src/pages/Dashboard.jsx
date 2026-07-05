/**
 * DealerDesk Dashboard — permission-personalized.
 * Owner ask 2026-07-06: what the user sees on the dashboard is derived
 * ENTIRELY from their permissions via navigationConfig.js. Adding a new
 * module or action to the config surfaces it automatically for any user
 * who can access it — no changes here needed.
 *
 * Sections (each hides if its list is empty):
 *   1. Greeting header  — Welcome + role + date
 *   2. My Workspace     — top-priority quick actions
 *   3. My Modules       — module cards to open the launcher for each
 *   4. My Reports       — reports the user has access to
 *   5. My Queues        — inbox / worklist items
 *   6. Empty state      — if the user has ZERO modules assigned
 *
 * Existing side-content (Birthdays panel) is preserved and access-gated.
 */
import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
    Layers, FileBarChart, ArrowRight, ShieldCheck, Wrench,
    ShoppingCart, Inbox,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErpControlPanel, ErpPanel, ErpEmptyState } from '../components/erp';
import { getDashboardForUser } from '../navigationConfig';

export default function Dashboard() {
    const { user, hasModule, hasPermission } = useAuth();
    const todayLabel = new Date().toLocaleDateString('en-PK', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });

    // Compute the whole dashboard shape from the user's auth in one pass —
    // avoids scanning the config 5 different times per render.
    const {
        workspace, moduleCards, reports, queues, hasAnything,
    } = useMemo(
        () => getDashboardForUser(hasModule, hasPermission),
        [hasModule, hasPermission]
    );

    // Quick-action buttons in the greeting header — only shown when the
    // user can actually reach the target.
    const canCreateJC = hasModule('workshop_jobs');
    const canStoreSale = hasModule('sales_store');

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* ── 1. Greeting header ────────────────────────────── */}
            <ErpControlPanel
                title={`Welcome${user?.userName ? `, ${user.userName}` : ''}`}
                subtitle={`${todayLabel} · ${user?.groupTitle || 'User'}`}
                actions={
                    <>
                        {canCreateJC && (
                            <Link to="/workshop/jobs/new" className="erp-btn erp-btn-primary">
                                <Wrench size={14} /> New Job Card
                            </Link>
                        )}
                        {canStoreSale && (
                            <Link to="/store-sale" className="erp-btn">
                                <ShoppingCart size={14} /> Counter Sale
                            </Link>
                        )}
                    </>
                }
            />

            {/* ── Empty state — no modules at all ───────────────── */}
            {!hasAnything ? (
                <ErpEmptyState
                    icon={ShieldCheck}
                    title="No modules assigned"
                    message="Contact administrator."
                />
            ) : (
                <>
                    {/* ── 2. My Workspace — top-priority quick actions ── */}
                    {workspace.length > 0 && (
                        <ErpPanel title={<><Layers size={13} /> My Workspace <span className="count">{workspace.length}</span></>}>
                            <div className="dd-quick-grid">
                                {workspace.map(w => {
                                    const Icon = w.icon;
                                    return (
                                        <Link key={w.id} to={w.path} className="dd-quick" title={w.description}>
                                            <div className="dd-quick-icn"><Icon size={16} /></div>
                                            <div className="dd-quick-body">
                                                <div className="dd-quick-title">{w.label}</div>
                                                <div className="dd-quick-desc">{w.description}</div>
                                            </div>
                                            <ArrowRight size={12} className="dd-quick-arrow" />
                                        </Link>
                                    );
                                })}
                            </div>
                        </ErpPanel>
                    )}

                    {/* ── 3. My Modules — module launcher cards ─────── */}
                    {moduleCards.length > 0 && (
                        <ErpPanel title={<><Layers size={13} /> My Modules <span className="count">{moduleCards.length}</span></>}>
                            <div className="dd-module-grid">
                                {moduleCards.map(g => {
                                    const Icon = g.icon;
                                    return (
                                        <Link key={g.id} to={g.path} className="dd-mod-card" title={g.description}>
                                            <div className="dd-mod-icn"><Icon size={18} /></div>
                                            <div className="dd-mod-body">
                                                <div className="dd-mod-title">{g.label}</div>
                                                <div className="dd-mod-desc">{g.description}</div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        </ErpPanel>
                    )}

                    {/* ── 5. My Queues ─────────────────────────── */}
                    {queues.length > 0 && (
                        <ErpPanel title={<><Inbox size={13} /> My Queues <span className="count">{queues.length}</span></>}>
                            <ul className="dd-queue-list">
                                {queues.map(q => {
                                    const Icon = q.icon;
                                    return (
                                        <li key={q.id + '-' + q.path}>
                                            <Link to={q.path} className="dd-queue-row" title={q.description}>
                                                <Icon size={14} />
                                                <span className="dd-queue-lbl">{q.label}</span>
                                                <span className="dd-queue-desc">{q.description}</span>
                                                <ArrowRight size={12} />
                                            </Link>
                                        </li>
                                    );
                                })}
                            </ul>
                        </ErpPanel>
                    )}

                    {/* ── 4. My Reports ────────────────────────────── */}
                    {reports.length > 0 && (
                        <ErpPanel title={<><FileBarChart size={13} /> My Reports <span className="count">{reports.length}</span></>}>
                            <div className="dd-report-grid">
                                {reports.map(r => {
                                    const Icon = r.icon;
                                    return (
                                        <Link key={r.id} to={r.path} className="dd-report-row" title={r.description}>
                                            <Icon size={13} /> {r.label}
                                        </Link>
                                    );
                                })}
                            </div>
                        </ErpPanel>
                    )}
                </>
            )}

            <style>{`
                .dd-quick-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
                    gap: 8px;
                }
                .dd-quick {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    padding: 10px 12px;
                    background: var(--erp-surface);
                    border: 1px solid var(--erp-border);
                    border-radius: 4px;
                    color: var(--erp-text);
                    text-decoration: none;
                    transition: background 0.12s, border-color 0.12s;
                }
                .dd-quick:hover { background: #fafbfc; border-color: var(--erp-brand); }
                .dd-quick-icn {
                    width: 32px; height: 32px;
                    border-radius: 4px;
                    background: var(--erp-brand-soft);
                    color: var(--erp-brand);
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .dd-quick-body { flex: 1; min-width: 0; }
                .dd-quick-title { font-size: 12.5px; font-weight: 600; }
                .dd-quick-desc {
                    font-size: 10.5px;
                    color: var(--erp-text-muted);
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    margin-top: 1px;
                }
                .dd-quick-arrow { color: var(--erp-text-muted); }

                .dd-module-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 8px;
                }
                .dd-mod-card {
                    display: flex;
                    align-items: flex-start;
                    gap: 10px;
                    padding: 10px 12px;
                    background: var(--erp-surface);
                    border: 1px solid var(--erp-border);
                    border-radius: 4px;
                    color: var(--erp-text);
                    text-decoration: none;
                    min-height: 60px;
                }
                .dd-mod-card:hover { background: #fafbfc; border-color: var(--erp-brand); }
                .dd-mod-icn {
                    width: 32px; height: 32px;
                    border-radius: 4px;
                    background: var(--erp-brand-soft);
                    color: var(--erp-brand);
                    display: flex; align-items: center; justify-content: center;
                    flex-shrink: 0;
                }
                .dd-mod-body { min-width: 0; }
                .dd-mod-title { font-size: 13px; font-weight: 600; }
                .dd-mod-desc { font-size: 11px; color: var(--erp-text-muted); margin-top: 2px; line-height: 1.3; }

                .dd-queue-list { list-style: none; margin: 0; padding: 0; }
                .dd-queue-row {
                    display: grid;
                    grid-template-columns: 16px 1fr auto 12px;
                    align-items: center;
                    gap: 8px;
                    padding: 6px 4px;
                    color: var(--erp-text);
                    text-decoration: none;
                    border-bottom: 1px solid #eef0f3;
                }
                .dd-queue-row:hover { background: #fafbfc; }
                .dd-queue-lbl { font-size: 12.5px; font-weight: 600; }
                .dd-queue-desc {
                    font-size: 11px;
                    color: var(--erp-text-muted);
                    text-align: right;
                    overflow: hidden;
                    text-overflow: ellipsis;
                    white-space: nowrap;
                    max-width: 260px;
                }

                .dd-report-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
                    gap: 4px;
                }
                .dd-report-row {
                    display: inline-flex;
                    align-items: center;
                    gap: 6px;
                    padding: 6px 8px;
                    font-size: 12px;
                    color: var(--erp-text);
                    text-decoration: none;
                    border: 1px solid var(--erp-border);
                    border-radius: 3px;
                    background: var(--erp-surface);
                }
                .dd-report-row:hover { background: #fafbfc; border-color: var(--erp-brand); }
            `}</style>
        </div>
    );
}

