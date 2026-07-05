import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Search, Menu, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import NotificationBell from './NotificationBell';

const EXACT_TITLES = {
    '/': 'Dashboard',
    '/workshop/customers': 'Workshop Customers',
    '/workshop/jobs': 'Job Cards',
    '/workshop/jobs/new': 'Create Job Card',
    '/workshop/services': 'Labour & Services',
    '/workshop/sublet': 'Sublet Repairs',
    '/workshop/settings': 'Workshop Settings',
    '/workshop/campaigns': 'Service Campaigns',
    '/workshop/care-off': 'Care-Off Management',
    '/workshop/accessories': 'Accessories',
    '/workshop/controller': 'Job Controller',
    '/parts': 'Spare Parts',
    '/parts-issue': 'Parts Issue',
    '/grn': 'Receiving (GRN)',
    '/grtn': 'Returns (GRTN)',
    '/store-sale': 'Store Sale',
    '/ssr': 'Sale Returns (SSR)',
    '/inventory-settings': 'Parts Config',
    '/coa': 'Chart of Accounts',
    '/vouchers/cpv': 'Cash Payment Voucher',
    '/vouchers/crv': 'Cash Receipt Voucher',
    '/vouchers/bpv': 'Bank Payment Voucher',
    '/vouchers/brv': 'Bank Receipt Voucher',
    '/vouchers/jv': 'Journal Voucher',
    '/vouchers/browse': 'Voucher Browser',
    '/accounting/setup': 'Accounting Setup',
    '/accounting/tax-rates': 'Tax Rates',
    '/accounting/bank-accounts': 'Bank Accounts',
    '/payments/receive': 'Receive Payment',
    '/payments/make': 'Make Payment',
    '/payments/pos-settlement': 'POS Settlement',
    '/customers': 'Customers & Parties',
    '/crd/follow-ups': 'CRD Follow-Ups',
    '/cro/workspace': 'CRO Workspace',
    '/cro/surveys': 'Surveys',
    '/cro/survey-templates': 'Survey Templates',
    '/cro/reminders': 'Reminders',
    '/cro/kyc-flags': 'KYC Flags',
    '/cro/inquiries': 'Inquiries',
    '/cro/campaigns': 'Campaigns',
    '/cro/reports': 'CRO Reports',
    '/sales/models': 'Vehicle Models',
    '/sales/variants': 'Vehicle Variants',
    '/sales/inventory': 'Vehicle Inventory',
    '/sales/bookings': 'Bookings',
    '/sales/bookings/new': 'New Booking',
    '/sales/inquiries': 'Sales Inquiries',
    '/sales/negotiations': 'Negotiation Queue',
    '/sales/cancellations': 'Cancellation Queue',
    '/sales/incentive-policies': 'Incentive Policies',
    '/sales/incentive-disbursement': 'Incentive Disbursement',
    '/employees': 'Employees',
    '/hr-settings': 'HR Settings',
    '/admin/users': 'Users',
    '/admin/permissions': 'Role Permissions',
    '/unfinalize-requests': 'Unfinalize Requests',
};

const SEGMENT_LABELS = {
    accounting: 'Accounting',
    admin: 'Admin',
    bank: 'Bank',
    bookings: 'Bookings',
    campaigns: 'Campaigns',
    cancellations: 'Cancellations',
    care: 'Care',
    coa: 'Chart of Accounts',
    complaints: 'Complaints',
    crd: 'CRD',
    cro: 'CRO',
    customers: 'Customers',
    employees: 'Employees',
    finance: 'Finance',
    follow: 'Follow',
    grn: 'GRN',
    grtn: 'GRTN',
    hr: 'HR',
    inquiries: 'Inquiries',
    inventory: 'Inventory',
    jobs: 'Job Cards',
    kyc: 'KYC',
    make: 'Make',
    models: 'Models',
    parts: 'Parts',
    payments: 'Payments',
    pos: 'POS',
    receive: 'Receive',
    reminders: 'Reminders',
    reports: 'Reports',
    sales: 'Sales',
    services: 'Services',
    settings: 'Settings',
    settlement: 'Settlement',
    store: 'Store',
    sublet: 'Sublet',
    surveys: 'Surveys',
    tax: 'Tax',
    unfinalize: 'Unfinalize',
    variants: 'Variants',
    vehicles: 'Vehicles',
    vouchers: 'Vouchers',
    workshop: 'Workshop',
};

function titleFromPath(pathname) {
    if (EXACT_TITLES[pathname]) return EXACT_TITLES[pathname];
    if (/^\/workshop\/jobs\/[^/]+$/.test(pathname)) return 'Job Card Detail';
    if (/^\/cro\/complaints\/[^/]+$/.test(pathname)) return 'Complaint Detail';
    if (/^\/sales\/bookings\/[^/]+$/.test(pathname)) return 'Booking Detail';
    if (pathname.startsWith('/reports/')) return 'Report';

    const last = pathname.split('/').filter(Boolean).at(-1) || 'Dashboard';
    return formatSegment(last);
}

function formatSegment(segment) {
    if (/^\d+$/.test(segment)) return `#${segment}`;
    return segment
        .split('-')
        .filter(Boolean)
        .map(part => SEGMENT_LABELS[part] || part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
}

function buildBreadcrumbs(pathname) {
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length === 0) return [{ label: 'Dashboard', to: '/' }];

    return [
        { label: 'Dashboard', to: '/' },
        ...segments.map((segment, index) => ({
            label: formatSegment(segment),
            to: `/${segments.slice(0, index + 1).join('/')}`,
        })),
    ];
}

function todayLabel() {
    return new Intl.DateTimeFormat('en-PK', {
        weekday: 'short',
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date());
}

function shortTodayLabel() {
    return new Intl.DateTimeFormat('en-PK', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    }).format(new Date());
}

export default function WorkspaceTopBar({ onOpenCommand, onToggleSidebar }) {
    const location = useLocation();
    const { user, logout } = useAuth();

    const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);
    const initials = useMemo(() => {
        const n = user?.userName || '';
        return n.slice(0, 2).toUpperCase() || 'U';
    }, [user]);

    return (
        <header className="erp-topbar">
            {onToggleSidebar && (
                <button type="button" className="erp-topbar-toggle" onClick={onToggleSidebar}
                        title="Toggle sidebar">
                    <Menu size={16} />
                </button>
            )}

            <nav className="erp-crumbs" aria-label="Breadcrumb">
                {breadcrumbs.map((crumb, index) => {
                    const isLast = index === breadcrumbs.length - 1;
                    return (
                        <React.Fragment key={`${crumb.to}-${index}`}>
                            {index > 0 && <span className="sep">/</span>}
                            {isLast ? (
                                <span className="cur" aria-current="page">{crumb.label}</span>
                            ) : (
                                <Link to={crumb.to}>{crumb.label}</Link>
                            )}
                        </React.Fragment>
                    );
                })}
            </nav>

            <div className="erp-topbar-spacer" />

            <button type="button" className="erp-topbar-search" onClick={onOpenCommand}
                title="Open command palette (Ctrl+K)">
                <Search size={13} />
                <span className="erp-topbar-search-label">Search anything…</span>
                <span className="kbd">Ctrl K</span>
            </button>

            <div className="erp-topbar-right">
                <div className="erp-topbar-date" title={todayLabel()}>
                    <span className="erp-topbar-date-full">{todayLabel()}</span>
                    <span className="erp-topbar-date-short">{shortTodayLabel()}</span>
                </div>

                <NotificationBell />

                <div className="erp-topbar-user" title={user?.groupTitle || ''}>
                    <span className="avatar">{initials}</span>
                    <span className="erp-topbar-user-name">{user?.userName || 'User'}</span>
                </div>

                <button type="button" onClick={logout}
                    className="erp-topbar-icon erp-topbar-icon-wide"
                    title="Sign out">
                    <LogOut size={14} />
                    <span className="erp-topbar-signout-label">Sign out</span>
                </button>
            </div>
        </header>
    );
}
