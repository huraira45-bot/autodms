import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const STORAGE_KEY = 'dms_recent_commands';

const COMMANDS = [
    { label: 'Dashboard', path: '/', section: 'Home', keywords: ['home', 'overview'], priority: true },

    { label: 'Workshop Customers', path: '/workshop/customers', section: 'Workshop', moduleKey: 'workshop_customers', keywords: ['customer', 'vehicle', 'profile'] },
    { label: 'Create Job Card', path: '/workshop/jobs/new', section: 'Workshop', moduleKey: 'workshop_jobs', keywords: ['new ro', 'service', 'repair'], priority: true },
    { label: 'Search Job Cards', path: '/workshop/jobs', section: 'Workshop', moduleKey: 'workshop_jobs', keywords: ['ro', 'job', 'history'], priority: true },
    { label: 'Labour & Services', path: '/workshop/services', section: 'Workshop', moduleKey: 'workshop_labour', keywords: ['service master', 'labour'] },
    { label: 'Sublet Repairs', path: '/workshop/sublet', section: 'Workshop', moduleKey: 'workshop_sublet', keywords: ['vendor', 'outside work'] },
    { label: 'Workshop Settings', path: '/workshop/settings', section: 'Workshop', moduleKey: 'workshop_settings', keywords: ['job type', 'order type', 'bay'] },
    { label: 'Service Campaigns', path: '/workshop/campaigns', section: 'Workshop', moduleKey: 'workshop_settings', keywords: ['recall', 'campaign'] },
    { label: 'Care-Off Management', path: '/workshop/care-off', section: 'Workshop', moduleKey: 'workshop_careoff', keywords: ['discount', 'approval'] },
    { label: 'Accessories', path: '/workshop/accessories', section: 'Workshop', moduleKey: 'workshop_accessories', keywords: ['checklist'] },
    { label: 'Job Controller', path: '/workshop/controller', section: 'Workshop', moduleKey: 'workshop_controller', keywords: ['bay', 'technician', 'status'], priority: true },

    { label: 'Spare Parts', path: '/parts', section: 'Parts & Inventory', moduleKey: 'parts_spare', keywords: ['item', 'stock', 'inventory'], priority: true },
    { label: 'Inventory On-Hand', path: '/reports/inventory-valuation', section: 'Parts & Inventory', anyModules: ['parts_spare', 'inventory_settings', 'reports'], keywords: ['stock report', 'valuation'] },
    { label: 'Stock Movement', path: '/reports/parts/stock-movement', section: 'Parts & Inventory', anyModules: ['parts_spare', 'inventory_settings', 'reports'], keywords: ['in out', 'movement'] },
    { label: 'Reorder Alert', path: '/reports/parts/reorder-alert', section: 'Parts & Inventory', anyModules: ['parts_spare', 'inventory_settings', 'reports'], keywords: ['low stock'] },
    { label: 'Parts Sales Register', path: '/reports/parts/sales-register', section: 'Parts & Inventory', anyModules: ['parts_spare', 'inventory_settings', 'reports'], keywords: ['parts sales'] },
    { label: 'Parts Purchase Summary', path: '/reports/parts/purchase-summary', section: 'Parts & Inventory', anyModules: ['parts_spare', 'inventory_settings', 'reports'], keywords: ['parts purchase'] },
    { label: 'Receiving (GRN)', path: '/grn', section: 'Parts & Inventory', moduleKey: 'procurement_grn', keywords: ['purchase', 'goods received'], priority: true },
    { label: 'Returns (GRTN)', path: '/grtn', section: 'Parts & Inventory', moduleKey: 'procurement_grtn', keywords: ['purchase return'] },
    { label: 'Store Sale', path: '/store-sale', section: 'Parts & Inventory', moduleKey: 'sales_store', keywords: ['counter sale'] },
    { label: 'Sale Returns (SSR)', path: '/ssr', section: 'Parts & Inventory', moduleKey: 'sales_ssr', keywords: ['sale return'] },
    { label: 'Parts Issue', path: '/parts-issue', section: 'Parts & Inventory', moduleKey: 'workshop_parts_issue', keywords: ['job card parts'], priority: true },
    { label: 'Parts Config', path: '/inventory-settings', section: 'Parts & Inventory', moduleKey: 'inventory_settings', keywords: ['brand', 'category', 'warehouse'] },

    { label: 'Chart of Accounts', path: '/coa', section: 'Finance', moduleKey: 'finance_coa', keywords: ['coa', 'ledger'] },
    { label: 'Cash Payment Voucher', path: '/vouchers/cpv', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['cpv', 'voucher'] },
    { label: 'Cash Receipt Voucher', path: '/vouchers/crv', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['crv', 'voucher'] },
    { label: 'Bank Payment Voucher', path: '/vouchers/bpv', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['bpv', 'voucher'] },
    { label: 'Bank Receipt Voucher', path: '/vouchers/brv', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['brv', 'voucher'] },
    { label: 'Journal Voucher', path: '/vouchers/jv', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['jv', 'voucher'] },
    { label: 'Voucher Browser', path: '/vouchers/browse', section: 'Finance', moduleKey: 'finance_vouchers', keywords: ['posted', 'draft'] },
    { label: 'Receive Payment', path: '/payments/receive', section: 'Finance', moduleKey: 'payments', keywords: ['cashier', 'customer'], priority: true },
    { label: 'Make Payment', path: '/payments/make', section: 'Finance', moduleKey: 'payments', keywords: ['supplier', 'payable'] },
    { label: 'POS Settlement', path: '/payments/pos-settlement', section: 'Finance', moduleKey: 'payments', keywords: ['card', 'bank'] },
    { label: 'Accounting Setup', path: '/accounting/setup', section: 'Finance', moduleKey: 'accounting_setup', keywords: ['system accounts'] },
    { label: 'Tax Rates', path: '/accounting/tax-rates', section: 'Finance', moduleKey: 'accounting_setup', keywords: ['gst', 'pst'] },
    { label: 'Bank Accounts', path: '/accounting/bank-accounts', section: 'Finance', moduleKey: 'accounting_setup', keywords: ['bank', 'pos'] },
    { label: 'Trial Balance', path: '/reports/trial-balance', section: 'Finance Reports', moduleKey: 'reports', keywords: ['report'] },
    { label: 'GL Detail', path: '/reports/gl-detail', section: 'Finance Reports', moduleKey: 'reports', keywords: ['ledger detail'] },
    { label: 'Profit & Loss', path: '/reports/pnl', section: 'Finance Reports', moduleKey: 'reports', keywords: ['income statement'] },
    { label: 'Balance Sheet', path: '/reports/balance-sheet', section: 'Finance Reports', moduleKey: 'reports', keywords: ['assets liabilities'] },
    { label: 'Daily Cash Book', path: '/reports/daily-cash-book', section: 'Finance Reports', moduleKey: 'reports', keywords: ['cash'] },
    { label: 'Tax Summary', path: '/reports/tax-summary', section: 'Finance Reports', moduleKey: 'reports', keywords: ['gst pst'] },

    { label: 'Customers & Parties', path: '/customers', section: 'Parties', moduleKey: 'crm_parties', keywords: ['supplier', 'party', 'customer'], priority: true },

    { label: 'CRD Follow-Ups', path: '/crd/follow-ups', section: 'Customer Relation', moduleKey: 'crd_followups', keywords: ['call', 'follow up'], priority: true },
    { label: 'CRO Workspace', path: '/cro/workspace', section: 'Customer Relation', moduleKey: 'cro_workspace', keywords: ['complaint', 'support'], priority: true },
    { label: 'Surveys', path: '/cro/surveys', section: 'Customer Relation', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'], keywords: ['rating', 'feedback'] },
    { label: 'Survey Templates', path: '/cro/survey-templates', section: 'Customer Relation', moduleKey: 'cro_admin', keywords: ['template'] },
    { label: 'Reminders', path: '/cro/reminders', section: 'Customer Relation', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'], keywords: ['service due'] },
    { label: 'KYC Flags', path: '/cro/kyc-flags', section: 'Customer Relation', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'], keywords: ['warning', 'customer'] },
    { label: 'Inquiries', path: '/cro/inquiries', section: 'Customer Relation', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'], keywords: ['lead'] },
    { label: 'Campaigns', path: '/cro/campaigns', section: 'Customer Relation', anyModules: ['cro_workspace', 'cro_admin', 'cro_reports'], keywords: ['whatsapp', 'message'] },
    { label: 'CRO Reports', path: '/cro/reports', section: 'Customer Relation', moduleKey: 'cro_reports', keywords: ['sla', 'survey', 'complaint report'] },

    { label: 'Vehicle Models', path: '/sales/models', section: 'Vehicle Sales', anyModules: ['sales_admin_settings', 'sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['model'] },
    { label: 'Vehicle Variants', path: '/sales/variants', section: 'Vehicle Sales', anyModules: ['sales_admin_settings', 'sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['variant'] },
    { label: 'Vehicle Inventory', path: '/sales/inventory', section: 'Vehicle Sales', anyModules: ['sales_admin_settings', 'sales_master_settlement', 'sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['chassis', 'stock'] },
    { label: 'Bookings', path: '/sales/bookings', section: 'Vehicle Sales', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['booking', 'customer'], priority: true },
    { label: 'New Booking', path: '/sales/bookings/new', section: 'Vehicle Sales', anyModules: ['sales_executive', 'sales_agm', 'sales_gm'], keywords: ['booking create'], priority: true },
    { label: 'Sales Inquiries', path: '/sales/inquiries', section: 'Vehicle Sales', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_admin_settings', 'sales_reports'], keywords: ['lead', 'product info'] },
    { label: 'Negotiation Queue', path: '/sales/negotiations', section: 'Vehicle Sales', moduleKey: 'sales_admin_pricing', keywords: ['discount', 'approval'] },
    { label: 'Cancellation Queue', path: '/sales/cancellations', section: 'Vehicle Sales', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'am_approve', 'admin_unfinalize', 'sales_admin_settings'], keywords: ['cancel'] },
    { label: 'Incentive Policies', path: '/sales/incentive-policies', section: 'Vehicle Sales', anyModules: ['sales_admin_settings', 'sales_gm', 'sales_reports'], keywords: ['commission'] },
    { label: 'Incentive Disbursement', path: '/sales/incentive-disbursement', section: 'Vehicle Sales', anyModules: ['sales_admin_settings', 'sales_gm', 'sales_reports'], keywords: ['commission payment'] },
    { label: 'Booking Register', path: '/reports/sales/booking-register', section: 'Vehicle Sales Reports', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['report'] },
    { label: 'Sales Vehicle Inventory Report', path: '/reports/sales/vehicle-inventory', section: 'Vehicle Sales Reports', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['report'] },
    { label: 'Executive Performance', path: '/reports/sales/executive-performance', section: 'Vehicle Sales Reports', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['target', 'report'] },
    { label: 'Customer Advances Aging', path: '/reports/sales/customer-advances-aging', section: 'Vehicle Sales Reports', anyModules: ['sales_executive', 'sales_agm', 'sales_gm', 'sales_reports'], keywords: ['advance', 'aging'] },

    { label: 'Employees', path: '/employees', section: 'Admin & HR', moduleKey: 'hr_employees', keywords: ['staff'] },
    { label: 'HR Settings', path: '/hr-settings', section: 'Admin & HR', moduleKey: 'hr_settings', keywords: ['department', 'designation'] },
    { label: 'Users', path: '/admin/users', section: 'Administration', moduleKey: 'admin_users', keywords: ['login', 'password'] },
    { label: 'Role Permissions', path: '/admin/permissions', section: 'Administration', moduleKey: 'admin_permissions', keywords: ['module', 'access'] },
    { label: 'Unfinalize Requests', path: '/unfinalize-requests', section: 'Workflow', anyModules: ['am_approve', 'admin_unfinalize'], keywords: ['approval', 'reverse'], priority: true },
];

function canUseCommand(item, hasModule) {
    if (item.moduleKey && !hasModule(item.moduleKey)) return false;
    if (item.anyModules && !item.anyModules.some(hasModule)) return false;
    return true;
}

function normalize(value) {
    return String(value || '').toLowerCase().trim();
}

function getRecentCommands() {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
        return [];
    }
}

function setRecentCommand(path) {
    try {
        const next = [path, ...getRecentCommands().filter(item => item !== path)].slice(0, 6);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
        // Ignore storage failures; navigation should never depend on localStorage.
    }
}

export default function CommandPalette({ open, onOpen, onClose }) {
    const navigate = useNavigate();
    const { hasModule } = useAuth();
    const inputRef = useRef(null);
    const [query, setQuery] = useState('');
    const [activeIndex, setActiveIndex] = useState(0);
    const [recentPaths, setRecentPaths] = useState([]);

    const visibleCommands = useMemo(
        () => COMMANDS.filter(item => canUseCommand(item, hasModule)),
        [hasModule]
    );

    const commandsByPath = useMemo(() => {
        const map = new Map();
        visibleCommands.forEach(item => map.set(item.path, item));
        return map;
    }, [visibleCommands]);

    const recentCommands = useMemo(
        () => recentPaths.map(path => commandsByPath.get(path)).filter(Boolean),
        [commandsByPath, recentPaths]
    );

    const filteredCommands = useMemo(() => {
        const needle = normalize(query);
        if (!needle) {
            const recentSet = new Set(recentCommands.map(item => item.path));
            const priority = visibleCommands.filter(item => item.priority && !recentSet.has(item.path));
            return [...recentCommands, ...priority].slice(0, 12);
        }

        return visibleCommands
            .map(item => {
                const haystack = normalize([item.label, item.section, item.path, ...(item.keywords || [])].join(' '));
                const label = normalize(item.label);
                let score = 0;
                if (label === needle) score += 60;
                if (label.startsWith(needle)) score += 40;
                if (haystack.includes(needle)) score += 20;
                if (item.priority) score += 4;
                return { item, score };
            })
            .filter(row => row.score > 0)
            .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
            .map(row => row.item)
            .slice(0, 20);
    }, [query, recentCommands, visibleCommands]);

    const goTo = useCallback((item) => {
        setRecentCommand(item.path);
        setRecentPaths(getRecentCommands());
        navigate(item.path);
        setQuery('');
        onClose?.();
    }, [navigate, onClose]);

    useEffect(() => {
        const onKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
                event.preventDefault();
                if (open) {
                    onClose?.();
                    return;
                }
                onOpen?.();
                if (!open) {
                    setRecentPaths(getRecentCommands());
                    setQuery('');
                    setActiveIndex(0);
                    requestAnimationFrame(() => inputRef.current?.focus());
                }
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [onClose, onOpen, open]);

    useEffect(() => {
        if (!open) return;
        requestAnimationFrame(() => {
            setRecentPaths(getRecentCommands());
            setActiveIndex(0);
            inputRef.current?.focus();
        });
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                onClose?.();
            }
            if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex(index => Math.min(index + 1, Math.max(filteredCommands.length - 1, 0)));
            }
            if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex(index => Math.max(index - 1, 0));
            }
            if (event.key === 'Enter' && filteredCommands[activeIndex]) {
                event.preventDefault();
                goTo(filteredCommands[activeIndex]);
            }
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [activeIndex, filteredCommands, goTo, onClose, open]);

    if (!open) return null;

    return (
        <div className="command-backdrop" role="presentation" onMouseDown={onClose}>
            <div className="command-dialog" role="dialog" aria-modal="true" aria-label="Search" onMouseDown={e => e.stopPropagation()}>
                <div className="command-search">
                    <Search size={18} />
                    <input
                        ref={inputRef}
                        value={query}
                        onChange={e => {
                            setQuery(e.target.value);
                            setActiveIndex(0);
                        }}
                        placeholder="Search pages, reports, records"
                        aria-label="Search pages, reports, records"
                    />
                    <button type="button" className="icon-button" onClick={onClose} aria-label="Close search">
                        <X size={18} />
                    </button>
                </div>

                <div className="command-list">
                    {filteredCommands.length === 0 ? (
                        <div className="command-empty">
                            <strong>No matches</strong>
                            <span>Try a customer, job card, voucher, report, or module name.</span>
                        </div>
                    ) : (
                        filteredCommands.map((item, index) => (
                            <button
                                key={`${item.path}-${item.label}`}
                                type="button"
                                className={`command-item ${index === activeIndex ? 'active' : ''}`}
                                onMouseEnter={() => setActiveIndex(index)}
                                onClick={() => goTo(item)}
                            >
                                <span>
                                    <strong>{item.label}</strong>
                                    <small>{item.section}</small>
                                </span>
                                <ArrowRight size={16} />
                            </button>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}
