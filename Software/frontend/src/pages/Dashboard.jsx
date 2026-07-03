/**
 * Dashboard — Odoo-style ERP app launcher + daily work queue.
 * Owner ask 2026-07-03: dense desktop dashboard, no hero sections.
 *
 * Layout (1366×768 optimised):
 *   Row 1  Control panel (greeting + quick-nav search + counters)
 *   Row 2  App tiles grid (RBAC-filtered)
 *   Row 3  Two-column work queue (Service desk / Cash & stock / CRO)
 *   Row 4  Right column: Birthdays + Report shortcuts
 */
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
    Wrench, ClipboardList, Activity, Package, ShoppingCart, Receipt, CreditCard,
    Headphones, ShieldCheck, Car, FileBarChart, Landmark, Cake, Users, ArrowRight,
    Bell, Layers, Truck, TrendingUp,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { ErpControlPanel, ErpPanel, ErpEmptyState, ErpStatusPill } from '../components/erp';

const API = '/api/workshop';

// App tiles — RBAC-filtered launcher grid.
const APP_TILES = [
    { name: 'Job Cards',       desc: 'Open + finalize workshop jobs', icon: Wrench,        tone: 'plum',  to: '/workshop/jobs',              moduleKey: 'workshop_jobs' },
    { name: 'New Job Card',    desc: 'Start a new RO',               icon: ClipboardList, tone: 'plum',  to: '/workshop/jobs/new',          moduleKey: 'workshop_jobs' },
    { name: 'Parts Issue',     desc: 'Consume parts on a JC',        icon: Package,       tone: 'amber', to: '/parts-issue',                moduleKey: 'workshop_parts_issue' },
    { name: 'Spare Parts',     desc: 'Catalog + stock levels',       icon: Layers,        tone: 'amber', to: '/parts',                      moduleKey: 'parts_spare' },
    { name: 'GRN',             desc: 'Supplier receiving',           icon: Truck,         tone: 'teal',  to: '/grn',                        moduleKey: 'procurement_grn' },
    { name: 'Store Sale',      desc: 'Counter parts sale',           icon: ShoppingCart,  tone: 'teal',  to: '/store-sale',                 moduleKey: 'sales_store' },
    { name: 'Receive Payment', desc: 'Customer receipt',             icon: Receipt,       tone: 'green', to: '/payments/receive',           moduleKey: 'payments' },
    { name: 'Make Payment',    desc: 'Supplier/staff payment',       icon: CreditCard,    tone: 'green', to: '/payments/make',              moduleKey: 'payments' },
    { name: 'Chart of Accts',  desc: 'GL accounts + hierarchy',      icon: Landmark,      tone: 'steel', to: '/coa',                        moduleKey: 'finance_coa' },
    { name: 'Vouchers',        desc: 'CPV / CRV / BPV / BRV / JV',   icon: FileBarChart,  tone: 'steel', to: '/vouchers/browse',            moduleKey: 'finance_vouchers' },
    { name: 'Customers',       desc: 'Parties + statements',         icon: Users,         tone: 'plum',  to: '/customers',                  moduleKey: 'crm_parties' },
    { name: 'CRO Desk',        desc: 'Complaints + follow-ups',      icon: Headphones,    tone: 'red',   to: '/cro/workspace',              moduleKey: 'cro_workspace' },
    { name: 'Bookings',        desc: 'New vehicle sales',            icon: Car,           tone: 'plum',  to: '/sales/bookings',             anyModules: ['sales_executive','sales_agm','sales_gm','sales_reports'] },
    { name: 'Bay Controller',  desc: 'Workshop bay board',           icon: Activity,      tone: 'teal',  to: '/workshop/controller',        moduleKey: 'workshop_controller' },
    { name: 'Reports',         desc: 'Trial Balance, revenue…',      icon: TrendingUp,    tone: 'steel', to: '/reports/trial-balance',      moduleKey: 'reports' },
    { name: 'Unfinalize',      desc: 'Approval workflow',            icon: ShieldCheck,   tone: 'amber', to: '/unfinalize-requests',        anyModules: ['am_approve','admin_unfinalize'] },
];

const WORK_AREAS = [
    {
        title: 'Service Desk', icon: Wrench,
        items: [
            { label: 'Open job cards',    to: '/workshop/jobs',              moduleKey: 'workshop_jobs' },
            { label: 'Bay controller',    to: '/workshop/controller',        moduleKey: 'workshop_controller' },
            { label: 'Vehicle history',   to: '/workshop/vehicle-history',   moduleKey: 'workshop_jobs' },
            { label: 'Service campaigns', to: '/workshop/campaigns',         moduleKey: 'workshop_settings' },
        ],
    },
    {
        title: 'Cash & Stock', icon: Layers,
        items: [
            { label: 'Receive payments',  to: '/payments/receive',                                            moduleKey: 'payments' },
            { label: 'GRN receiving',     to: '/grn',                                                         moduleKey: 'procurement_grn' },
            { label: 'Store sale',        to: '/store-sale',                                                  moduleKey: 'sales_store' },
            { label: 'Stock movement',    to: '/reports/parts/stock-movement', anyModules: ['parts_spare','inventory_settings','reports'] },
        ],
    },
    {
        title: 'Customer Follow-Up', icon: Headphones,
        items: [
            { label: 'CRD follow-ups',    to: '/crd/follow-ups',   moduleKey: 'crd_followups' },
            { label: 'CRO complaints',    to: '/cro/workspace',    moduleKey: 'cro_workspace' },
            { label: 'Service reminders', to: '/cro/reminders',    anyModules: ['cro_workspace','cro_admin','cro_reports'] },
            { label: 'Sales inquiries',   to: '/cro/inquiries',    moduleKey: 'cro_admin' },
        ],
    },
];

const REPORT_SHORTCUTS = [
    { label: 'Trial Balance',     to: '/reports/trial-balance',                moduleKey: 'reports' },
    { label: 'Job Card Register', to: '/reports/service/job-card-register',    anyModules: ['workshop_jobs','reports'] },
    { label: 'Inventory On-Hand', to: '/reports/inventory-valuation',          anyModules: ['parts_spare','inventory_settings','reports'] },
    { label: 'Parts Issued to JC',to: '/reports/parts/issued-to-jc',           anyModules: ['workshop_parts_issue','reports'] },
    { label: 'Booking Register',  to: '/reports/sales/booking-register',      anyModules: ['sales_executive','sales_agm','sales_gm','sales_reports'] },
];

function canUse(item, hasModule) {
    if (item.moduleKey && !hasModule(item.moduleKey)) return false;
    if (item.anyModules && !item.anyModules.some(hasModule)) return false;
    return true;
}

export default function Dashboard() {
    const { user, hasModule } = useAuth();
    const [birthdays, setBirthdays] = useState([]);
    const [birthdayError, setBirthdayError] = useState('');

    useEffect(() => {
        axios.get(`${API}/birthdays`)
            .then(r => { setBirthdays(Array.isArray(r.data) ? r.data : []); setBirthdayError(''); })
            .catch(() => setBirthdayError('Birthdays could not be loaded.'));
    }, []);

    const visibleTiles = useMemo(
        () => APP_TILES.filter(t => canUse(t, hasModule)),
        [hasModule]
    );

    const todayLabel = new Intl.DateTimeFormat('en-PK', {
        weekday: 'long', day: '2-digit', month: 'short', year: 'numeric',
    }).format(new Date());

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <ErpControlPanel
                title={`Welcome${user?.userName ? `, ${user.userName}` : ''}`}
                subtitle={`${todayLabel} · ${user?.groupTitle || 'User'}`}
                actions={
                    <>
                        <Link to="/workshop/jobs/new" className="erp-btn erp-btn-primary">
                            <Wrench size={14} /> New Job Card
                        </Link>
                        <Link to="/store-sale" className="erp-btn">
                            <ShoppingCart size={14} /> Counter Sale
                        </Link>
                    </>
                }
            />

            {visibleTiles.length === 0 ? (
                <ErpEmptyState
                    icon={ShieldCheck}
                    title="No modules assigned"
                    message="Ask an administrator to assign the modules for your daily work."
                />
            ) : (
                <ErpPanel title={<><Layers size={13} /> Applications <span className="count">{visibleTiles.length}</span></>}>
                    <div className="erp-tile-grid">
                        {visibleTiles.map(t => {
                            const Icon = t.icon;
                            return (
                                <Link key={t.to} to={t.to} className="erp-tile">
                                    <div className={`icon tone-${t.tone}`}><Icon size={18} /></div>
                                    <div className="name">{t.name}</div>
                                    <div className="desc">{t.desc}</div>
                                </Link>
                            );
                        })}
                    </div>
                </ErpPanel>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                    {WORK_AREAS.map(area => (
                        <WorkArea key={area.title} area={area} hasModule={hasModule} />
                    ))}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <ErpPanel title={<><Cake size={13} /> Customer Birthdays <span className="count">{birthdays.length}</span></>}>
                        {birthdayError ? (
                            <div className="erp-alert danger">{birthdayError}</div>
                        ) : (
                            <BirthdayList birthdays={birthdays} />
                        )}
                    </ErpPanel>

                    <ErpPanel title={<><FileBarChart size={13} /> Reports</>}>
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            {REPORT_SHORTCUTS.filter(r => canUse(r, hasModule)).map(r => (
                                <Link key={r.to} to={r.to}
                                    style={{
                                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                        padding: '6px 4px', borderBottom: '1px solid var(--erp-border)',
                                        color: 'var(--erp-text)', textDecoration: 'none', fontSize: 12.5,
                                    }}>
                                    {r.label}
                                    <ArrowRight size={13} style={{ color: 'var(--erp-text-muted)' }} />
                                </Link>
                            ))}
                        </div>
                    </ErpPanel>
                </div>
            </div>
        </div>
    );
}

function WorkArea({ area, hasModule }) {
    const items = area.items.filter(item => canUse(item, hasModule));
    if (!items.length) return null;
    const Icon = area.icon;

    return (
        <ErpPanel title={<><Icon size={13} /> {area.title} <span className="count">{items.length}</span></>}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {items.map(item => (
                    <Link key={item.to} to={item.to}
                        style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '6px 4px', borderBottom: '1px solid var(--erp-border)',
                            color: 'var(--erp-text)', textDecoration: 'none', fontSize: 12.5,
                        }}>
                        <span>{item.label}</span>
                        <ArrowRight size={13} style={{ color: 'var(--erp-text-muted)' }} />
                    </Link>
                ))}
            </div>
        </ErpPanel>
    );
}

function BirthdayList({ birthdays }) {
    const today = birthdays.filter(b => b.IsToday);
    const upcoming = birthdays.filter(b => !b.IsToday);

    if (!birthdays.length) {
        return (
            <div style={{ padding: '12px 4px', fontSize: 12, color: 'var(--erp-text-muted)', textAlign: 'center' }}>
                No customer birthdays this week.
            </div>
        );
    }

    const row = (b, highlight = false) => {
        const dobDate = new Date(b.DOB);
        const label = Number.isNaN(dobDate.getTime())
            ? ''
            : `${dobDate.toLocaleString('default', { month: 'short' })} ${dobDate.getDate()}`;
        return (
            <div key={b.ProfileID} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '6px 4px', borderBottom: '1px solid var(--erp-border)',
            }}>
                <span style={{
                    width: 24, height: 24, borderRadius: '50%',
                    background: highlight ? 'var(--erp-brand)' : 'var(--erp-surface-alt)',
                    color: highlight ? 'white' : 'var(--erp-text-muted)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 11, fontWeight: 600, flexShrink: 0,
                }}>{(b.CustomerName || '?').charAt(0).toUpperCase()}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--erp-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{b.CustomerName}</div>
                    <div style={{ fontSize: 11, color: 'var(--erp-text-muted)' }}>{b.PhoneNo || 'No phone'}</div>
                </div>
                {highlight
                    ? <ErpStatusPill tone="plum">Today</ErpStatusPill>
                    : <span style={{ fontSize: 11, color: 'var(--erp-text-muted)' }}>{label}</span>}
            </div>
        );
    };

    return (
        <div>
            {today.length > 0 && (
                <>
                    <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--erp-brand)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '4px 0 2px' }}>Today</div>
                    {today.map(b => row(b, true))}
                </>
            )}
            {upcoming.length > 0 && (
                <>
                    {today.length > 0 && (
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--erp-text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, margin: '6px 0 2px' }}>Upcoming</div>
                    )}
                    {upcoming.map(b => row(b))}
                </>
            )}
        </div>
    );
}
