import React, { useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CalendarDays, Search } from 'lucide-react';

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

export default function WorkspaceTopBar({ onOpenCommand }) {
    const location = useLocation();

    const breadcrumbs = useMemo(() => buildBreadcrumbs(location.pathname), [location.pathname]);
    const title = useMemo(() => titleFromPath(location.pathname), [location.pathname]);

    return (
        <header className="workspace-topbar">
            <div className="workspace-context">
                <nav className="breadcrumbs" aria-label="Breadcrumb">
                    {breadcrumbs.map((crumb, index) => {
                        const isLast = index === breadcrumbs.length - 1;
                        return (
                            <React.Fragment key={`${crumb.to}-${index}`}>
                                {index > 0 && <span className="breadcrumb-separator">/</span>}
                                {isLast ? (
                                    <span aria-current="page">{crumb.label}</span>
                                ) : (
                                    <Link to={crumb.to}>{crumb.label}</Link>
                                )}
                            </React.Fragment>
                        );
                    })}
                </nav>
                <h1>{title}</h1>
            </div>

            <div className="workspace-actions">
                <button type="button" className="command-trigger" onClick={onOpenCommand}>
                    <Search size={17} />
                    <span>Search</span>
                </button>
                <div className="work-date">
                    <CalendarDays size={16} />
                    <span>{todayLabel()}</span>
                </div>
            </div>
        </header>
    );
}
