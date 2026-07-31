/**
 * Central navigation config for the ERP-style module launcher.
 * Owner ask 2026-07-05: replace the endless scrolling sidebar with 10 top-
 * level module groups; each group opens a landing page listing only the
 * screens the logged-in user has permission for.
 *
 * Design rules:
 *   - Frontend-only. Real security stays on the backend ProtectedRoute.
 *   - Each item declares either `moduleKey` (checked via hasModule) or
 *     `permission` (report key checked via hasPermission('report:slug')).
 *   - `moduleGroup` maps items to top-level groups in the sidebar +
 *     module launcher.
 *   - The dashboard tiles use the same `MODULE_GROUPS` list, so hidden
 *     modules automatically drop off both the sidebar and dashboard.
 *
 * DO NOT hard-code visibility rules elsewhere. Add items here and the
 * whole nav layer picks them up.
 */
import {
    LayoutDashboard, Wrench, Package, Paintbrush, Wallet, HeartHandshake,
    Car, Users, ShieldCheck, FileBarChart, Workflow,
    Truck, Undo2, Store, RotateCcw, Award, Ticket, Boxes, Settings as SettingsIcon,
    SlidersHorizontal, Landmark, CreditCard, Receipt, ListChecks, UserCog,
    ClipboardList, ClipboardCheck, MessageSquare, Bell, Percent, LineChart,
    Handshake, Palette, TrendingUp, PieChart, Fingerprint, KeyRound, DollarSign,
    Gauge, ScrollText, Monitor,
} from 'lucide-react';

// Top-level module groups (order = sidebar order). Each has an id / label /
// icon / description. `path` is the module landing route.
export const MODULE_GROUPS = [
    { id: 'dashboard',  label: 'Dashboard',        icon: LayoutDashboard, path: '/',                 description: 'Home overview' },
    { id: 'workshop',   label: 'Workshop',         icon: Wrench,          path: '/module/workshop',  description: 'Job cards, service, labour, gate pass' },
    { id: 'parts',      label: 'Parts & Inventory',icon: Package,         path: '/module/parts',     description: 'Spare parts, GRN, GRTN, store sale' },
    { id: 'paint-lab',  label: 'Paint Lab',        icon: Paintbrush,      path: '/module/paint-lab', description: 'Paint stock, receiving, issue' },
    { id: 'finance',    label: 'Finance',          icon: Wallet,          path: '/module/finance',   description: 'Vouchers, payments, cheques, setup' },
    { id: 'crm',        label: 'CRM / CRO',        icon: HeartHandshake,  path: '/module/crm',       description: 'Follow-ups, complaints, surveys, KYC' },
    { id: 'sales',      label: 'Vehicle Sales',    icon: Car,             path: '/module/sales',     description: 'Bookings, inventory, incentives' },
    { id: 'hr',         label: 'HR',               icon: Users,           path: '/module/hr',        description: 'Employees, departments' },
    { id: 'admin',      label: 'Admin',            icon: ShieldCheck,     path: '/module/admin',     description: 'Users, permissions' },
    { id: 'reports',    label: 'Reports',          icon: FileBarChart,    path: '/module/reports',   description: 'Financial + operational reports' },
    { id: 'workflow',   label: 'Workflow',         icon: Workflow,        path: '/module/workflow',  description: 'Unfinalize approvals' },
];

// Individual actions. Every item picks its group via `moduleGroup`.
// Guard rule (`canAccess`):
//   - If `moduleKey` is present → hasModule(moduleKey) must be true.
//   - If `permission` is present → hasPermission(permission) must be true.
//   - If both are present, EITHER passes.
// `keywords` help future command-palette search.
export const NAV_ITEMS = [
    // ── Workshop ─────────────────────────────────────────────
    // `priority` promotes an item into the dashboard's "My Workspace" strip
    // (higher = more prominent). `isQueue` flags items that represent an
    // inbox / worklist for the "My Queues" section.
    { id: 'w-customers', moduleGroup: 'workshop', label: 'Workshop Customers',   path: '/workshop/customers',       icon: Users,          moduleKey: 'workshop_customers', description: 'Customer master used by Job Cards.', keywords: 'customer end-user' },
    { id: 'w-jc-new',    moduleGroup: 'workshop', label: 'Create Job Card',      path: '/workshop/jobs/new',        icon: ClipboardList,  moduleKey: 'workshop_jobs',      description: 'Open a new RO.', keywords: 'new ro repair', priority: 10 },
    { id: 'w-jc-search', moduleGroup: 'workshop', label: 'Search Job Cards',     path: '/workshop/jobs',            icon: ClipboardList,  moduleKey: 'workshop_jobs',      description: 'Open, active, finalized RO search.', keywords: 'ro job card search', priority: 9 },
    { id: 'w-veh-hist',  moduleGroup: 'workshop', label: 'Vehicle History',      path: '/workshop/vehicle-history', icon: Car,            moduleKey: 'workshop_jobs',      description: 'Every RO ever run on a vehicle.', keywords: 'chassis reg' },
    { id: 'w-labour',    moduleGroup: 'workshop', label: 'Labour & Services',   path: '/workshop/services',        icon: Wrench,         moduleKey: 'workshop_labour',    description: 'Labour catalogue master.', keywords: 'services' },
    { id: 'w-sublet',    moduleGroup: 'workshop', label: 'Sublet Repairs',       path: '/workshop/sublet',          icon: Handshake,      moduleKey: 'workshop_sublet',    description: 'Sublet vendors + jobs.', keywords: 'sublet outsource' },
    { id: 'w-settings',  moduleGroup: 'workshop', label: 'Workshop Settings',    path: '/workshop/settings',        icon: SettingsIcon,   moduleKey: 'workshop_settings',  description: 'Job types, departments, care-off.', keywords: 'setup config' },
    { id: 'w-campaigns', moduleGroup: 'workshop', label: 'Campaigns',            path: '/workshop/campaigns',       icon: Ticket,         moduleKey: 'workshop_settings',  description: 'Free-service / MCML campaign master.', keywords: 'ffs sfs pds ppm' },
    { id: 'w-careoff',   moduleGroup: 'workshop', label: 'Care-Off Discounts',   path: '/workshop/care-off',        icon: Percent,        moduleKey: 'workshop_careoff',   description: 'Discount authorization caps.', keywords: 'discount' },
    { id: 'w-careoff-elev', moduleGroup: 'workshop', label: 'Cap Elevation Requests', path: '/workshop/careoff-elevations', icon: Percent, anyPermissions: ['careoff_request_elevation', 'careoff_approve_elevation'], description: 'Request/approve raising a care-off discount cap for one JC.', keywords: 'discount elevation approval' },
    { id: 'w-access',    moduleGroup: 'workshop', label: 'Accessories',          path: '/workshop/accessories',     icon: Boxes,          moduleKey: 'workshop_accessories', description: 'JC accessory checklist master.', keywords: 'accessory' },
    { id: 'w-ctrl',      moduleGroup: 'workshop', label: 'Job Controller',       path: '/workshop/controller',      icon: Gauge,          moduleKey: 'workshop_controller', description: 'Real-time RO status board.', keywords: 'status bay', isQueue: true },
    { id: 'w-gatepass',  moduleGroup: 'workshop', label: 'Gate Pass',            path: '/gatepass',                 icon: ClipboardCheck, moduleKey: 'workshop_gatepass',  description: 'Issue and audit vehicle gate passes.', keywords: 'gate exit' },
    { id: 'w-kiosk',     moduleGroup: 'workshop', label: 'Lobby Job Kiosk',      path: '/kiosk/jobs',               icon: Monitor,        moduleKey: 'workshop_jobs',      description: 'Big-screen public job status board (opens in a new tab).', keywords: 'kiosk tv lobby big-screen', newTab: true },

    // ── Parts & Inventory ────────────────────────────────────
    { id: 'p-spare',     moduleGroup: 'parts', label: 'Spare Parts',              path: '/parts',        icon: Package, moduleKey: 'parts_spare',           description: 'Parts master + stock.', keywords: 'inventory items', priority: 6 },
    { id: 'p-grn',       moduleGroup: 'parts', label: 'GRN (Receiving)',          path: '/grn',          icon: Truck,   moduleKey: 'procurement_grn',       description: 'Receive parts from suppliers.', keywords: 'purchase receive', priority: 8 },
    { id: 'p-grtn',      moduleGroup: 'parts', label: 'GRTN (Returns)',           path: '/grtn',         icon: Undo2,   moduleKey: 'procurement_grtn',      description: 'Return parts to supplier.', keywords: 'return supplier' },
    { id: 'p-store',     moduleGroup: 'parts', label: 'Store Sale',               path: '/store-sale',   icon: Store,   moduleKey: 'sales_store',           description: 'Counter parts sale (SS invoice).', keywords: 'counter sale', priority: 7 },
    { id: 'p-ssr',       moduleGroup: 'parts', label: 'Store Sale Returns (SSR)', path: '/ssr',          icon: RotateCcw, moduleKey: 'sales_ssr',           description: 'Customer returns from Store Sale.', keywords: 'return customer' },
    { id: 'p-issue',     moduleGroup: 'parts', label: 'Parts Issue to JC',        path: '/parts-issue', icon: Package, moduleKey: 'workshop_parts_issue', description: 'Issue parts against a Job Card.', keywords: 'sir', priority: 8 },
    { id: 'p-settings',  moduleGroup: 'parts', label: 'Inventory Settings',       path: '/inventory-settings', icon: SlidersHorizontal, moduleKey: 'inventory_settings', description: 'Tax rates, warehouses, brands.', keywords: 'config setup' },

    // ── Paint Lab ────────────────────────────────────────────
    { id: 'pl-dash',     moduleGroup: 'paint-lab', label: 'Paint Dashboard',      path: '/paint/dashboard', icon: PieChart,    moduleKey: 'paint_lab_dashboard', description: 'Stock KPIs + recent activity.', keywords: 'kpi' },
    { id: 'pl-items',    moduleGroup: 'paint-lab', label: 'Paint Items',          path: '/paint/items',     icon: Palette,     moduleKey: 'paint_lab_items',     description: 'Paint master.', keywords: 'inventory' },
    { id: 'pl-grn',      moduleGroup: 'paint-lab', label: 'Paint GRN',            path: '/paint/grn',       icon: Truck,       moduleKey: 'paint_lab_grn',       description: 'Receive paint from supplier.', keywords: 'purchase', priority: 7, isQueue: true },
    { id: 'pl-grtn',     moduleGroup: 'paint-lab', label: 'Paint GRTN',           path: '/paint/grtn',      icon: Undo2,       moduleKey: 'paint_lab_grtn',      description: 'Return paint to supplier.', keywords: 'return' },
    { id: 'pl-issue',    moduleGroup: 'paint-lab', label: 'Paint Issue',          path: '/paint/issue',     icon: Wrench,      moduleKey: 'paint_lab_issue',     description: 'Issue paint to Job Card.', keywords: 'consume', priority: 8 },
    { id: 'pl-reports',  moduleGroup: 'paint-lab', label: 'Paint Reports',        path: '/paint/reports',   icon: FileBarChart,moduleKey: 'paint_lab_reports',   description: 'Stock ledger, purchase, consumption.', keywords: 'reports' },
    { id: 'pl-settings', moduleGroup: 'paint-lab', label: 'Paint Settings',       path: '/paint/settings',  icon: SettingsIcon,moduleKey: 'paint_lab_settings',  description: 'UOM, categories, warehouses.', keywords: 'config' },

    // ── Finance ──────────────────────────────────────────────
    { id: 'f-coa',       moduleGroup: 'finance', label: 'Chart of Accounts',      path: '/coa',                     icon: Landmark,    moduleKey: 'finance_coa',       description: 'COA hierarchy master.', keywords: 'gl accounts' },
    { id: 'f-cpv',       moduleGroup: 'finance', label: 'Cash Payment (CPV)',     path: '/vouchers/cpv',            icon: Wallet,      moduleKey: 'finance_vouchers',  description: 'Cash-out voucher.', keywords: 'voucher' },
    { id: 'f-crv',       moduleGroup: 'finance', label: 'Cash Receipt (CRV)',     path: '/vouchers/crv',            icon: Receipt,     moduleKey: 'finance_vouchers',  description: 'Cash-in voucher.', keywords: 'voucher' },
    { id: 'f-bpv',       moduleGroup: 'finance', label: 'Bank Payment (BPV)',     path: '/vouchers/bpv',            icon: CreditCard,  moduleKey: 'finance_vouchers',  description: 'Bank payment voucher.', keywords: 'voucher' },
    { id: 'f-brv',       moduleGroup: 'finance', label: 'Bank Receipt (BRV)',     path: '/vouchers/brv',            icon: Landmark,    moduleKey: 'finance_vouchers',  description: 'Bank receipt voucher.', keywords: 'voucher' },
    { id: 'f-jv',        moduleGroup: 'finance', label: 'Journal Voucher (JV)',   path: '/vouchers/jv',             icon: ScrollText,  moduleKey: 'finance_vouchers',  description: 'General journal voucher.', keywords: 'voucher' },
    { id: 'f-vsearch',   moduleGroup: 'finance', label: 'Voucher Search',         path: '/vouchers',                icon: ListChecks,  moduleKey: 'finance_vouchers',  description: 'Find any posted voucher.', keywords: 'search', priority: 8 },
    { id: 'f-rcv',       moduleGroup: 'finance', label: 'Receive Payment',        path: '/payments/receive',        icon: Receipt,     moduleKey: 'payments',          description: 'Customer receipts with allocation.', keywords: 'payment', priority: 10 },
    { id: 'f-mkp',       moduleGroup: 'finance', label: 'Make Payment',           path: '/payments/make',           icon: Wallet,      moduleKey: 'payments',          description: 'Supplier / vendor payments.', keywords: 'payment', priority: 9 },
    { id: 'f-pos',       moduleGroup: 'finance', label: 'POS Settlement',         path: '/payments/pos-settlement', icon: CreditCard,  moduleKey: 'payments',          description: 'POS clearance to bank.', keywords: 'card', isQueue: true },
    { id: 'f-cheques',   moduleGroup: 'finance', label: 'Cheque Clearance',       path: '/payments/cheques',        icon: Receipt,     moduleKey: 'finance_cheques',   description: 'Move cheques from holding to bank.', keywords: 'cheque', isQueue: true },
    { id: 'f-acc-setup', moduleGroup: 'finance', label: 'Accounting Setup',       path: '/accounting/setup',        icon: SettingsIcon,moduleKey: 'accounting_setup',  description: 'System-account GL role mapping.', keywords: 'setup' },
    { id: 'f-tax-rates', moduleGroup: 'finance', label: 'Tax Rates',              path: '/accounting/tax-rates',    icon: SlidersHorizontal, moduleKey: 'accounting_setup', description: 'GST + PST rate config.', keywords: 'gst pst' },
    { id: 'f-banks',     moduleGroup: 'finance', label: 'Bank Accounts',          path: '/accounting/bank-accounts',icon: Landmark,    moduleKey: 'accounting_setup',  description: 'Registered bank accounts.', keywords: 'bank' },
    { id: 'f-biz-prof',  moduleGroup: 'finance', label: 'Business Profile',       path: '/settings/business-profile', icon: SettingsIcon, moduleKey: 'settings_business_profile', description: 'Legal name, NTN, letterhead.', keywords: 'company' },

    // ── CRM / CRO ────────────────────────────────────────────
    { id: 'crm-fu',      moduleGroup: 'crm', label: 'CRD Follow-Ups',           path: '/crd/follow-ups',       icon: Bell,           moduleKey: 'crd_followups',    description: 'Post-JC customer follow-up queue.', keywords: 'callback', priority: 8, isQueue: true },
    { id: 'crm-ws',      moduleGroup: 'crm', label: 'CRO Workspace',            path: '/cro/workspace',        icon: MessageSquare,  moduleKey: 'cro_workspace',    description: 'Complaint intake + assignment.', keywords: 'complaint', priority: 9, isQueue: true },
    { id: 'crm-ws-r',    moduleGroup: 'crm', label: 'My Complaints (Advisor)',  path: '/cro/workspace',        icon: MessageSquare,  moduleKey: 'cro_dept_responder', description: 'My assigned complaints.', keywords: 'complaint', priority: 10, isQueue: true },
    { id: 'crm-srv',     moduleGroup: 'crm', label: 'Post-Service Surveys',     path: '/cro/surveys',          icon: ClipboardCheck, moduleKey: 'cro_surveys',      description: 'Survey results.', keywords: 'nps' },
    { id: 'crm-srv-t',   moduleGroup: 'crm', label: 'Survey Templates',         path: '/cro/survey-templates', icon: SettingsIcon,   moduleKey: 'cro_admin',        description: 'Question set master.', keywords: 'template' },
    { id: 'crm-rem',     moduleGroup: 'crm', label: 'Service Reminders',        path: '/cro/reminders',        icon: Bell,           moduleKey: 'cro_reminders',    description: 'Upcoming service reminders.', keywords: 'reminder' },
    { id: 'crm-kyc',     moduleGroup: 'crm', label: 'KYC Flags',                path: '/cro/kyc-flags',        icon: Fingerprint,    moduleKey: 'cro_kyc',          description: 'Customer KYC anomalies.', keywords: 'kyc' },
    { id: 'crm-inq',     moduleGroup: 'crm', label: 'CRO Inquiries',            path: '/cro/inquiries',        icon: MessageSquare,  moduleKey: 'cro_inquiries',    description: 'General customer inquiries.', keywords: 'inquiry' },
    { id: 'crm-camp',    moduleGroup: 'crm', label: 'CRO Campaigns',            path: '/cro/campaigns',        icon: Ticket,         moduleKey: 'cro_admin',        description: 'Campaign broadcast manager.', keywords: 'campaign' },

    // ── Vehicle Sales ────────────────────────────────────────
    { id: 's-models',    moduleGroup: 'sales', label: 'Models',                path: '/sales/models',            icon: Car,          moduleKey: 'sales_models',        description: 'Model master.', keywords: 'car' },
    { id: 's-variants',  moduleGroup: 'sales', label: 'Variants',              path: '/sales/variants',          icon: Car,          moduleKey: 'sales_variants',      description: 'Variant + pricing.', keywords: 'trim' },
    { id: 's-inv',       moduleGroup: 'sales', label: 'Vehicle Inventory',     path: '/sales/inventory',         icon: Package,      moduleKey: 'sales_inventory',     description: 'On-hand chassis.', keywords: 'chassis' },
    { id: 's-book',      moduleGroup: 'sales', label: 'Bookings',              path: '/sales/bookings',          icon: ClipboardList,moduleKey: 'sales_bookings',      description: 'Customer bookings.', keywords: 'sales', priority: 9 },
    { id: 's-inq',       moduleGroup: 'sales', label: 'Sales Inquiries',       path: '/sales/inquiries',         icon: MessageSquare,moduleKey: 'sales_inquiries',     description: 'Pre-booking inquiries.', keywords: 'lead' },
    { id: 's-neg',       moduleGroup: 'sales', label: 'Negotiations',          path: '/sales/negotiations',      icon: Handshake,    moduleKey: 'sales_negotiations',  description: 'Price + discount approvals.', keywords: 'discount', isQueue: true },
    { id: 's-cancel',    moduleGroup: 'sales', label: 'Cancellations',         path: '/sales/cancellations',     icon: Undo2,        moduleKey: 'sales_cancellations', description: 'Booking cancellations.', keywords: 'cancel' },
    { id: 's-inc-pol',   moduleGroup: 'sales', label: 'Incentive Policies',    path: '/sales/incentive-policies',icon: SlidersHorizontal, moduleKey: 'sales_incentive_policies', description: 'Sales-staff incentive rules.', keywords: 'incentive' },
    { id: 's-inc-disb',  moduleGroup: 'sales', label: 'Incentive Disbursement',path: '/sales/incentive-disbursement', icon: DollarSign, moduleKey: 'sales_incentive_disbursement', description: 'Pay incentives to staff.', keywords: 'incentive' },
    { id: 's-mst-inc',   moduleGroup: 'sales', label: 'Master Incentive',      path: '/sales/master-incentive',  icon: Award,        moduleKey: 'sales_master_incentive', description: 'Master-Changan incentive tracking.', keywords: 'master' },
    { id: 's-recov',     moduleGroup: 'sales', label: 'Sales Recovery',        path: '/sales/recovery',          icon: TrendingUp,   moduleKey: 'sales_recovery',      description: 'Payment recovery queue.', keywords: 'recovery' },
    { id: 's-targets',   moduleGroup: 'sales', label: 'Hierarchy & Targets',   path: '/sales/hierarchy-targets', icon: TrendingUp,   moduleKey: 'sales_targets',       description: 'Sales-staff structure + monthly targets.', keywords: 'target' },
    { id: 's-reports',   moduleGroup: 'sales', label: 'Sales Reports',         path: '/sales/reports',           icon: LineChart,    moduleKey: 'sales_reports',       description: 'Booking, inventory, executive-performance.', keywords: 'reports' },
    { id: 's-cro-rep',   moduleGroup: 'sales', label: 'CRO Reports',           path: '/cro/reports',             icon: LineChart,    moduleKey: 'cro_admin',           description: 'Customer-relations reports.', keywords: 'cro' },

    // ── HR ───────────────────────────────────────────────────
    { id: 'hr-emp',      moduleGroup: 'hr', label: 'Employees',                 path: '/employees',              icon: Users,        moduleKey: 'hr_employees',  description: 'Employee master.', keywords: 'staff' },
    { id: 'hr-esalary',  moduleGroup: 'hr', label: 'Employee Salary Settings',  path: '/hr/employees-salary',    icon: Users,        moduleKey: 'hr_employees',  description: 'Per-employee salary / allowances / bank.', keywords: 'salary employee' },
    { id: 'hr-att',      moduleGroup: 'hr', label: 'Attendance',                path: '/hr/attendance',          icon: Users,        moduleKey: 'hr_attendance', description: 'Monthly absents / late / leave / working days.', keywords: 'attendance late absent' },
    { id: 'hr-sheet',    moduleGroup: 'hr', label: 'Salary Sheet',              path: '/hr/salary-sheet',        icon: Users,        moduleKey: 'hr_salary',     description: 'Monthly salary sheet + voucher posting.', keywords: 'salary payroll' },
    { id: 'hr-fine',     moduleGroup: 'hr', label: 'Fine Settings',             path: '/hr/fine-settings',       icon: SettingsIcon, moduleKey: 'hr_settings',   description: 'Late-fine and absent-fine rates (global + monthly).', keywords: 'fine' },
    { id: 'hr-dept-acct',moduleGroup: 'hr', label: 'Dept Salary Accounts',      path: '/hr/dept-accounts',       icon: SettingsIcon, moduleKey: 'hr_settings',   description: 'Per-department GLs for salary / fuel / fine / mess / EOBI.', keywords: 'gl account salary dept' },
    { id: 'hr-cfg',      moduleGroup: 'hr', label: 'HR Config',                 path: '/hr-settings',            icon: SettingsIcon, moduleKey: 'hr_settings',   description: 'Departments, designations.', keywords: 'setup' },

    // ── Admin ────────────────────────────────────────────────
    { id: 'a-users',     moduleGroup: 'admin', label: 'User Management',      path: '/admin/users',       icon: UserCog,     moduleKey: 'admin_users',       description: 'Create / edit users.', keywords: 'user' },
    { id: 'a-perms',     moduleGroup: 'admin', label: 'Role Permissions',      path: '/admin/permissions', icon: KeyRound,    moduleKey: 'admin_permissions', description: 'Group ⇢ permission matrix.', keywords: 'rbac' },

    // ── Parties (grouped under Admin section for compactness) ─
    { id: 'a-parties',   moduleGroup: 'admin', label: 'Credit Parties',        path: '/customers',            icon: Users, moduleKey: 'crm_parties',    description: 'Named customer / supplier master.', keywords: 'party' },
    { id: 'a-pba',       moduleGroup: 'admin', label: 'Party Business Access', path: '/party-business-access', icon: ShieldCheck, moduleKey: 'crm_parties', description: 'Which business each party belongs to.', keywords: 'access' },

    // ── Reports ──────────────────────────────────────────────
    // Owner ask 2026-07-17: each report tagged with a `section` label so the
    // Reports launcher tiles render under section headings instead of one
    // flat grid. Section order below drives display order on the launcher.
    { id: 'r-tb',        moduleGroup: 'reports', section: 'Financial Statements',  label: 'Trial Balance',       path: '/reports/trial-balance',       icon: FileBarChart, permission: 'report:trial_balance' },
    { id: 'r-tbx',       moduleGroup: 'reports', section: 'Financial Statements',  label: 'TB Extract',          path: '/reports/trial-balance-extract',icon: FileBarChart, permission: 'report:trial_balance_extract' },
    { id: 'r-gl',        moduleGroup: 'reports', section: 'Financial Statements',  label: 'GL Detail',           path: '/reports/gl-detail',           icon: ListChecks,   permission: 'report:gl_detail' },
    { id: 'r-pnl',       moduleGroup: 'reports', section: 'Financial Statements',  label: 'Profit & Loss',       path: '/reports/pnl',                 icon: ListChecks,   permission: 'report:pnl' },
    { id: 'r-pnl-dept',  moduleGroup: 'reports', section: 'Financial Statements',  label: 'P&L by Department',   path: '/reports/pnl-department',      icon: ListChecks,   permission: 'report:pnl_department', description: 'Sales / Service / Parts revenue vs cost, Admin (non-revenue) last.' },
    { id: 'r-bs',        moduleGroup: 'reports', section: 'Financial Statements',  label: 'Balance Sheet',       path: '/reports/balance-sheet',       icon: ListChecks,   permission: 'report:balance_sheet' },
    { id: 'r-daybook',   moduleGroup: 'reports', section: 'Financial Statements',  label: 'Day Book',            path: '/reports/day-book',            icon: ListChecks,   permission: 'report:day_book' },
    { id: 'r-cust-stmt', moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Customer Statement',  path: '/reports/customer-statement',  icon: UserCog,      permission: 'report:customer_statement' },
    { id: 'r-sup-stmt',  moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Supplier Statement',  path: '/reports/supplier-statement',  icon: Truck,        permission: 'report:supplier_statement' },
    { id: 'r-p-open',    moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Party Open Invoices', path: '/reports/party-open-invoices', icon: ListChecks,   permission: 'report:party_open_invoices' },
    { id: 'r-p-ssr',     moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Store Sale Receivables', path: '/reports/store-sale-receivables', icon: ListChecks, permission: 'report:store_sale_receivables' },
    { id: 'r-ra',        moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Receivables Aging',   path: '/reports/receivables-aging',   icon: ListChecks,   permission: 'report:receivables_aging' },
    { id: 'r-pa',        moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Payables Aging',      path: '/reports/payables-aging',      icon: ListChecks,   permission: 'report:payables_aging' },
    { id: 'r-ia',        moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Insurance Aging',     path: '/reports/insurance-aging',     icon: ListChecks,   permission: 'report:insurance_aging' },
    { id: 'r-walk',      moduleGroup: 'reports', section: 'Party Ledgers & Aging', label: 'Walk-in JC Pending',  path: '/reports/walkin-outstanding',  icon: ListChecks,   permission: 'report:walkin_outstanding' },
    { id: 'r-cash',      moduleGroup: 'reports', section: 'Cash & Bank',           label: 'Daily Cash Book',     path: '/reports/daily-cash-book',     icon: Wallet,       permission: 'report:daily_cash_book' },
    { id: 'r-bank',      moduleGroup: 'reports', section: 'Cash & Bank',           label: 'Bank Balances',       path: '/reports/bank-balances',       icon: Landmark,     permission: 'report:bank_balances' },
    { id: 'r-pos-p',     moduleGroup: 'reports', section: 'Cash & Bank',           label: 'POS Pending',         path: '/reports/pos-pending',         icon: CreditCard,   permission: 'report:pos_pending' },
    { id: 'r-chq',       moduleGroup: 'reports', section: 'Cash & Bank',           label: 'Cheques on Hand',     path: '/reports/cheques-on-hand',     icon: Receipt,      permission: 'report:cheques_on_hand' },
    { id: 'r-tax-s',     moduleGroup: 'reports', section: 'Tax',                   label: 'Tax Summary',         path: '/reports/tax-summary',         icon: Percent,      permission: 'report:tax_summary' },
    { id: 'r-tax-h',     moduleGroup: 'reports', section: 'Tax',                   label: 'Tax Rate History',    path: '/reports/tax-rate-history',    icon: Percent,      permission: 'report:tax_rate_history' },
    { id: 'r-sales',     moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Sales Register',      path: '/reports/sales-register',      icon: ListChecks,   permission: 'report:sales_register' },
    { id: 'r-gm',        moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Gross Margin',        path: '/reports/gross-margin',        icon: ListChecks,   permission: 'report:gross_margin' },
    { id: 'r-disc',      moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Discount Given',      path: '/reports/discount-given',      icon: ListChecks,   permission: 'report:discount_given' },
    { id: 'r-gcr',       moduleGroup: 'reports', section: 'Audit',                 label: 'Gen-Customer Recon',  path: '/reports/gencust-reconciliation', icon: ListChecks,permission: 'report:gencust_reconciliation' },
    { id: 'r-va',        moduleGroup: 'reports', section: 'Audit',                 label: 'Voucher Audit Trail', path: '/reports/voucher-audit',       icon: ListChecks,   permission: 'report:voucher_audit' },
    { id: 'r-saa',       moduleGroup: 'reports', section: 'Audit',                 label: 'System Account Audit',path: '/reports/system-account-audit',icon: ShieldCheck,  permission: 'report:system_account_audit' },
    { id: 'r-charity',   moduleGroup: 'reports', section: 'Audit',                 label: 'Charity Tracker',     path: '/reports/charity',              icon: HeartHandshake, permission: 'charity_view', description: 'Every 1% charity accrual with voucher detail.' },
    { id: 'r-unfin',     moduleGroup: 'reports', section: 'Audit',                 label: 'Unfinalize Log (JC)', path: '/reports/unfinalize-log',       icon: Undo2,        anyPermissions: ['report:unfinalize_log', 'am_approve', 'admin_unfinalize'], description: 'JC unfinalize requests: pending, approved, executed, rejected.' },
    { id: 'r-revsplit',  moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Revenue Split',       path: '/reports/revenue-split',        icon: ListChecks,   permission: 'report:revenue_split', description: 'All revenue split into Cash (walk-in) vs Credit (named party).' },
    { id: 'r-bu-pnl',    moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Business Unit P&L',   path: '/reports/bu-pnl',               icon: ListChecks,   permission: 'report:bu_pnl', description: 'Per-BU revenue (labour + parts) vs direct expenses (spares, paint, sublet), Cash/Credit split.' },
    { id: 'r-ss-pnl',    moduleGroup: 'reports', section: 'Sales Analytics',       label: 'Store Sale P&L',      path: '/reports/store-sale-pnl',       icon: ListChecks,   permission: 'report:store_sale_pnl', description: 'Store Sale revenue vs cost per finalized invoice, rolled up by party.' },
    { id: 'r-jcr',       moduleGroup: 'reports', section: 'Workshop',              label: 'Job Card Register',   path: '/reports/service/job-card-register',   icon: ListChecks, permission: 'report:job_card_register' },
    { id: 'r-jc-tax',    moduleGroup: 'reports', section: 'Workshop',              label: 'Tax Invoice Tracker', path: '/reports/service/tax-invoice-tracker', icon: ListChecks, permission: 'report:tax_invoice_tracker' },
    { id: 'r-adv',       moduleGroup: 'reports', section: 'Workshop',              label: 'Advisor Performance', path: '/reports/service/advisor-performance', icon: ListChecks, permission: 'report:advisor_performance' },
    { id: 'r-rev',       moduleGroup: 'reports', section: 'Workshop',              label: 'Revenue Summary',     path: '/reports/service/revenue-summary',     icon: ListChecks, permission: 'report:revenue_summary' },
    { id: 'r-ins',       moduleGroup: 'reports', section: 'Workshop',              label: 'Insurance Claims',    path: '/reports/service/insurance-claims',    icon: ListChecks, permission: 'report:insurance_claims' },
    { id: 'r-mech',      moduleGroup: 'reports', section: 'Workshop',              label: 'Mechanic Productivity',path: '/reports/service/mechanic-productivity', icon: ListChecks, permission: 'report:mechanic_productivity' },
    { id: 'r-inv-val',   moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Inventory Valuation', path: '/reports/inventory-valuation', icon: ListChecks,   permission: 'report:inventory_valuation' },
    { id: 'r-stk-mvt',   moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Stock Movement',      path: '/reports/parts/stock-movement',icon: ListChecks,   permission: 'report:stock_movement' },
    { id: 'r-reord',     moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Reorder Alert',       path: '/reports/parts/reorder-alert', icon: ListChecks,   permission: 'report:reorder_alert' },
    { id: 'r-p-sales',   moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Parts Sales Register',path: '/reports/parts/sales-register',icon: ListChecks,   permission: 'report:parts_sales_register' },
    { id: 'r-p-purch',   moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Purchase Summary',    path: '/reports/parts/purchase-summary',icon: ListChecks,  permission: 'report:purchase_summary' },
    { id: 'r-p-issued',  moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Parts Issued to JC',  path: '/reports/parts/issued-to-jc',  icon: ListChecks,   permission: 'report:parts_issued_to_jc' },
    { id: 'r-p-sold',    moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Parts Sold (Finalized)', path: '/reports/parts/sold-finalized', icon: ListChecks, permission: 'report:parts_sold_finalized', description: 'Parts sold via finalized JCs + optional Store Sales, split by BU and Cash/Credit.' },
    { id: 'r-p-led',     moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Item Ledger',         path: '/reports/parts/item-ledger',   icon: ListChecks,   permission: 'report:item_ledger' },
    { id: 'r-ss-tax',    moduleGroup: 'reports', section: 'Parts & Inventory',     label: 'Store Sale Tax Invoice Tracker', path: '/reports/parts/tax-invoice-tracker', icon: ListChecks, permission: 'report:store_sale_tax_invoice_tracker' },
    { id: 'r-s-book',    moduleGroup: 'reports', section: 'Vehicle Sales',         label: 'Booking Register',    path: '/reports/sales/booking-register',    icon: ListChecks, permission: 'report:booking_register' },
    { id: 'r-s-inv',     moduleGroup: 'reports', section: 'Vehicle Sales',         label: 'Vehicle Inventory',   path: '/reports/sales/vehicle-inventory',   icon: ListChecks, permission: 'report:vehicle_inventory' },
    { id: 'r-s-exec',    moduleGroup: 'reports', section: 'Vehicle Sales',         label: 'Executive Performance',path: '/reports/sales/executive-performance',icon: ListChecks,permission: 'report:executive_performance' },
    { id: 'r-s-adv',     moduleGroup: 'reports', section: 'Vehicle Sales',         label: 'Customer Advances Aging', path: '/reports/sales/customer-advances-aging', icon: ListChecks, permission: 'report:customer_advances_aging' },

    // ── Workflow ─────────────────────────────────────────────
    { id: 'wf-unfin',    moduleGroup: 'workflow', label: 'Unfinalize Requests', path: '/unfinalize-requests', icon: Workflow, moduleKey: 'am_approve', description: 'Approve reversal requests.', keywords: 'reverse approve', priority: 8, isQueue: true },
];

// ────────────────────────────────────────────────────────────
// Access helpers
// ────────────────────────────────────────────────────────────

/**
 * True if the given nav item's guard passes for the current user.
 * `hasModule` and `hasPermission` come from useAuth().
 */
export function canAccessNavItem(item, hasModule, hasPermission) {
    if (!item) return false;
    const okModule = item.moduleKey ? !!hasModule(item.moduleKey) : false;
    const okPerm   = item.permission
        ? !!(hasPermission && hasPermission(item.permission))
        : false;
    // Optional list-form guard for items reachable via multiple roles
    // (e.g. an Unfinalize report visible to AMs, admins, or dedicated
    // report-viewers). Item is visible if the user matches ANY entry.
    const okAny = Array.isArray(item.anyPermissions) && item.anyPermissions.length
        ? item.anyPermissions.some(k => hasModule(k) || (hasPermission && hasPermission(k)))
        : false;
    if (item.anyPermissions) return okAny;
    if (item.moduleKey && item.permission) return okModule || okPerm;
    if (item.moduleKey) return okModule;
    if (item.permission) return okPerm;
    return true;   // no guards → public
}

/** All nav items the current user can access. */
export function getVisibleNavItems(hasModule, hasPermission) {
    return NAV_ITEMS.filter(it => canAccessNavItem(it, hasModule, hasPermission));
}

/** Module groups (with items) that have at least one visible item. */
export function getVisibleModuleGroups(hasModule, hasPermission) {
    const visible = getVisibleNavItems(hasModule, hasPermission);
    const groupsInUse = new Set(visible.map(v => v.moduleGroup));
    // Always include the Dashboard group so `/` never disappears.
    groupsInUse.add('dashboard');
    return MODULE_GROUPS.filter(g => groupsInUse.has(g.id));
}

/** Items belonging to one group, filtered by access. */
export function getModuleActions(groupId, hasModule, hasPermission) {
    return NAV_ITEMS
        .filter(it => it.moduleGroup === groupId)
        .filter(it => canAccessNavItem(it, hasModule, hasPermission));
}

/** Look up a group's metadata by id. */
export function getGroup(groupId) {
    return MODULE_GROUPS.find(g => g.id === groupId) || null;
}

/**
 * Top-priority actions the user can access, ranked by `priority` descending.
 * Used by the dashboard's "My Workspace" strip. Pass `limit` (default 8) to
 * cap the returned list.
 */
export function getWorkspaceActions(hasModule, hasPermission, limit = 8) {
    return getVisibleNavItems(hasModule, hasPermission)
        .filter(it => Number(it.priority) > 0)
        .sort((a, b) => (Number(b.priority) || 0) - (Number(a.priority) || 0))
        .slice(0, limit);
}

/** Queue/worklist items the user can access (My Queues section). */
export function getQueueActions(hasModule, hasPermission) {
    return getVisibleNavItems(hasModule, hasPermission)
        .filter(it => it.isQueue);
}

/** Report items the user can access (My Reports section). */
export function getVisibleReports(hasModule, hasPermission) {
    return getVisibleNavItems(hasModule, hasPermission)
        .filter(it => it.moduleGroup === 'reports');
}

/** All content the dashboard needs, computed in one pass for a given auth. */
export function getDashboardForUser(hasModule, hasPermission) {
    const groups     = getVisibleModuleGroups(hasModule, hasPermission);
    const workspace  = getWorkspaceActions(hasModule, hasPermission);
    const queues     = getQueueActions(hasModule, hasPermission);
    const reports    = getVisibleReports(hasModule, hasPermission);
    // Non-Dashboard, non-Reports groups — used by "My Modules".
    const moduleCards = groups.filter(g => g.id !== 'dashboard' && g.id !== 'reports');
    const hasAnything = groups.some(g => g.id !== 'dashboard');
    return { groups, workspace, queues, reports, moduleCards, hasAnything };
}
